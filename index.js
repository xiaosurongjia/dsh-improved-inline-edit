// dsh-improved-inline-edit — host 半部。
//
// 职责：面向浏览器 client 暴露 HTTP API：
//   POST /api/send    — 注入修改要求到运行中 agent（可带图片/文件），返回消息 id
//   POST /api/recall  — 撤回尚未被 agent 读取的消息（agent.inbox.remove），并回传原文
//   GET  /api/pending — 查询消息是否仍在待处理队列（决定能否撤回）
//   GET  /api/limits  — 附件上限（供前端预校验，避免大包白传）
//   GET  /api/health  — 健康检查
//
// 附件说明：图片走 DSH 官方附件管线（ctx.attachments.admitPromptContent），由
// host 把 base64 换成 durable 引用后再塞进同一条 agent.steer 消息；文本/代码
// 文件走 admitEncodedFile，模型侧拿到的是文件名、字节数和只读路径。
//
// 撤回窗口说明：消息进入 inbox 的 next-step/next-turn 队列后，在 agent 走到
// 下一个 step 边界被 claim() 之前都可以撤回；一旦被 claim 并写入会话历史，
// DSH 无官方 API 可删除，撤回请求会返回 recalled:false，由前端如实展示。
//
// 采用同源 fetch → webServer 模式（独立插件跨端通信）。

const API_PATH = '/dsh-improved-inline-edit/api'

// 注入引导前缀：提示模型在继续原任务的前提下执行修改要求（前端可关闭）。
const STEER_PREFIX = '【修改要求｜请基于当前任务继续执行，不要改变任务目标】'

// 请求体 / 附件上限（前端也会挡一遍，这里是最后一道闸）。
const MAX_BODY_BYTES = 40 * 1024 * 1024
const MAX_FILES = 8
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_FILES_BYTES = 16 * 1024 * 1024
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/
const FALLBACK_LIMITS = {
  maxImageBytes: 20 * 1024 * 1024,
  maxImagesPerMessage: 20,
  maxMessageImageBytes: 20 * 1024 * 1024,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

/** 带业务错误码的异常。 */
function httpError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

/** 读取请求体（JSON）。先收 Buffer 再一次性解码，避免多字节字符跨 chunk 被截断。 */
async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buf.length
    if (size > MAX_BODY_BYTES) throw httpError('payload-too-large', '请求体超过上限')
    chunks.push(buf)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/** 取一条消息里的纯文本（忽略图片/文件块）。 */
function textOf(message) {
  if (!message || !Array.isArray(message.content)) return ''
  const parts = []
  for (const block of message.content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n').trim()
}

/** 去掉自动加的前缀，撤回时把用户原话回填输入框。 */
function stripPrefix(text) {
  if (text.startsWith(STEER_PREFIX)) return text.slice(STEER_PREFIX.length).trimStart()
  return text
}

/** 规整前端传来的附件数组；缺字段/坏 base64 直接拒绝。 */
function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const type = item.type === 'image' ? 'image' : item.type === 'file' ? 'file' : ''
    if (!type) throw httpError('invalid-attachment', '附件类型只支持 image / file')
    let data = typeof item.data === 'string' ? item.data : ''
    const comma = data.indexOf(',')
    if (data.startsWith('data:') && comma !== -1) data = data.slice(comma + 1)
    if (!data || !BASE64_RE.test(data)) throw httpError('invalid-attachment-data', '附件数据不是合法 base64')
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 200) : undefined
    const mediaType = typeof item.mediaType === 'string' ? item.mediaType : ''
    out.push({ type, data, name, mediaType })
  }
  return out
}

function imageLimitsOf(ctx) {
  const attachments = ctx.get('attachments')
  const limits = attachments && attachments.imageLimits
  return limits || FALLBACK_LIMITS
}

/** 当前会话模型是否吃图片（与官方 prompt 准入保持一致）。 */
async function imageCapability(ctx, agents, agent) {
  try {
    const llm = ctx.get('llm')
    if (!llm || typeof agents.selectionFor !== 'function') return { supported: true }
    const selection = agents.selectionFor(agent)
    const current = selection && selection.current
    if (!current) return { supported: true }
    const info = await llm.resolveModelInfo(current.provider, current.model)
    if (info && Array.isArray(info.inputModalities) && !info.inputModalities.includes('image')) {
      return { supported: false, model: current.model }
    }
    return { supported: true, model: current.model }
  } catch {
    return { supported: true }
  }
}

export const name = 'dsh-improved-inline-edit'

/** 声明依赖服务：webServer（HTTP 注册）+ agents（会话访问）。附件/LLM 用 ctx.get 兜底，旧版 DSH 也能起。 */
export const inject = ['webServer', 'agents']

/**
 * host 插件入口。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  // webServer 可能在 apply 时刻尚未就绪（启动顺序），先取一次引用
  const webServer = ctx.webServer ?? ctx.get('webServer')
  ctx.effect(() =>
    webServer.register({
      kind: 'prefix',
      path: API_PATH,
      handler: async (req, res) => {
        const send = (code, obj) => {
          if (res.writableEnded) return
          res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(obj))
        }
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const path = url.pathname.replace(/^\/dsh-improved-inline-edit\/api/, '') || '/'
          const agents = ctx.get('agents')

          if (req.method === 'POST' && path === '/send') {
            const body = await readBody(req)
            const sessionId = asText(body?.sessionId)
            const text = asText(body?.text)
            const attachments = normalizeAttachments(body?.attachments)
            if (!sessionId || (!text && attachments.length === 0)) {
              return send(400, { ok: false, error: 'invalid-input' })
            }
            if (!agents) {
              return send(503, { ok: false, error: 'agents-service-unavailable' })
            }
            const agent = agents.get(sessionId)
            if (!agent) {
              return send(404, { ok: false, error: 'agent-not-found' })
            }

            const images = attachments.filter((a) => a.type === 'image')
            const files = attachments.filter((a) => a.type === 'file')

            // ---- 图片：条数 / 类型 / 体积 / 模型视觉能力，先挡在入库之前 ----
            if (images.length > 0) {
              const limits = imageLimitsOf(ctx)
              const mediaTypes = limits.mediaTypes || FALLBACK_LIMITS.mediaTypes
              if (images.length > (limits.maxImagesPerMessage || FALLBACK_LIMITS.maxImagesPerMessage)) {
                return send(413, { ok: false, error: 'too-many-images', limit: limits.maxImagesPerMessage })
              }
              let imageBytes = 0
              for (const img of images) {
                if (!img.mediaType || mediaTypes.indexOf(img.mediaType) === -1) {
                  return send(415, { ok: false, error: 'unsupported-image-type', mediaType: img.mediaType })
                }
                const bytes = Buffer.byteLength(img.data, 'base64')
                if (bytes > limits.maxImageBytes) {
                  return send(413, { ok: false, error: 'image-too-large', limit: limits.maxImageBytes })
                }
                imageBytes += bytes
              }
              if (imageBytes > limits.maxMessageImageBytes) {
                return send(413, { ok: false, error: 'images-too-large', limit: limits.maxMessageImageBytes })
              }
              const capability = await imageCapability(ctx, agents, agent)
              if (!capability.supported) {
                return send(400, { ok: false, error: 'model-does-not-support-images', model: capability.model })
              }
            }

            // ---- 文件：条数 / 体积 ----
            if (files.length > MAX_FILES) {
              return send(413, { ok: false, error: 'too-many-files', limit: MAX_FILES })
            }
            let fileBytes = 0
            for (const file of files) {
              const bytes = Buffer.byteLength(file.data, 'base64')
              if (bytes > MAX_FILE_BYTES) {
                return send(413, { ok: false, error: 'file-too-large', limit: MAX_FILE_BYTES })
              }
              fileBytes += bytes
            }
            if (fileBytes > MAX_FILES_BYTES) {
              return send(413, { ok: false, error: 'files-too-large', limit: MAX_FILES_BYTES })
            }

            // 可选引导前缀（前端开关控制），避免模型把修改要求当成新任务
            const prefixEnabled = body.prefix !== false
            const finalText = text ? (prefixEnabled ? STEER_PREFIX + ' ' + text : text) : ''

            const attachmentService = ctx.get('attachments')
            if (attachments.length > 0 && !attachmentService) {
              return send(503, { ok: false, error: 'attachments-service-unavailable' })
            }

            let content = []
            if (finalText) content.push({ type: 'text', text: finalText })
            for (const img of images) {
              content.push({ type: 'image', mediaType: img.mediaType, data: img.data, name: img.name })
            }
            // 图片经官方准入换成 durable 引用；纯文本原样通过
            if (content.length > 0 && attachmentService) {
              content = await attachmentService.admitPromptContent(content)
            }
            // 文件逐条入库，消息里只放引用
            for (const file of files) {
              const ref = await attachmentService.admitEncodedFile({ data: file.data, name: file.name })
              content.push({ type: 'file', attachment: ref })
            }

            const message = {
              id: `steer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              role: 'user',
              content,
              source: { kind: 'user' },
            }
            agent.steer(message)
            return send(200, { ok: true, id: message.id, attachments: images.length + files.length })
          }

          if (req.method === 'POST' && path === '/recall') {
            const body = await readBody(req)
            const sessionId = asText(body?.sessionId)
            const messageId = asText(body?.messageId)
            if (!sessionId || !messageId) {
              return send(400, { ok: false, error: 'invalid-input' })
            }
            if (!agents) {
              return send(503, { ok: false, error: 'agents-service-unavailable' })
            }
            const agent = agents.get(sessionId)
            if (!agent) {
              return send(404, { ok: false, error: 'agent-not-found' })
            }
            const inbox = agent.inbox
            if (!inbox || typeof inbox.remove !== 'function') {
              return send(503, { ok: false, error: 'inbox-unavailable' })
            }
            // 先把原文取出来（remove 之后对象就没了），成功撤回时前端回填输入框
            let text = ''
            const pending = []
            for (const m of inbox.nextStep || []) pending.push(m)
            for (const m of inbox.nextTurn || []) pending.push(m)
            for (const m of pending) {
              if (m && m.id === messageId) {
                text = stripPrefix(textOf(m))
                break
              }
            }
            // remove 只对仍在 next-step/next-turn 队列里的消息有效
            const recalled = inbox.remove(messageId)
            return send(200, { ok: true, recalled, text: recalled ? text : '' })
          }

          if (req.method === 'GET' && path === '/pending') {
            const sessionId = (url.searchParams.get('sessionId') ?? '').trim()
            if (!sessionId) {
              return send(400, { ok: false, error: 'invalid-input' })
            }
            if (!agents) {
              return send(503, { ok: false, error: 'agents-service-unavailable' })
            }
            const agent = agents.get(sessionId)
            if (!agent) {
              return send(404, { ok: false, error: 'agent-not-found' })
            }
            const inbox = agent.inbox
            if (!inbox) {
              return send(503, { ok: false, error: 'inbox-unavailable' })
            }
            // 汇总仍在等待队列里的消息（可撤回集合）；next-step 才是聊天里那排气泡
            const items = []
            const seen = new Set()
            const push = (m) => {
              if (!m || !m.id || seen.has(m.id)) return
              seen.add(m.id)
              items.push({ id: m.id, text: stripPrefix(textOf(m)) })
            }
            for (const m of inbox.nextStep || []) push(m)
            for (const m of inbox.nextTurn || []) push(m)
            return send(200, { ok: true, pending: items.map((i) => i.id), items })
          }

          if (req.method === 'GET' && path === '/limits') {
            const limits = imageLimitsOf(ctx)
            return send(200, {
              ok: true,
              attachments: !!ctx.get('attachments'),
              images: {
                maxImageBytes: limits.maxImageBytes,
                maxImagesPerMessage: limits.maxImagesPerMessage,
                maxMessageImageBytes: limits.maxMessageImageBytes,
                mediaTypes: limits.mediaTypes,
              },
              files: {
                maxFiles: MAX_FILES,
                maxFileBytes: MAX_FILE_BYTES,
                maxFilesBytes: MAX_FILES_BYTES,
              },
            })
          }

          if (req.method === 'GET' && path === '/health') {
            return send(200, { ok: true, agents: !!agents, attachments: !!ctx.get('attachments') })
          }

          return send(404, { ok: false, error: 'not-found: ' + path })
        } catch (e) {
          const code = e && e.code
          if (code === 'payload-too-large') {
            return send(413, { ok: false, error: code })
          }
          if (code === 'invalid-attachment' || code === 'invalid-attachment-data') {
            return send(400, { ok: false, error: code, message: String(e && e.message ? e.message : '') })
          }
          const attachmentService = ctx.get('attachments')
          if (
            attachmentService &&
            typeof attachmentService.isAttachmentError === 'function' &&
            attachmentService.isAttachmentError(e)
          ) {
            return send(400, {
              ok: false,
              error: 'attachment-invalid',
              code: e.code,
              message: String(e.message || ''),
            })
          }
          return send(500, { ok: false, error: String(e instanceof Error ? e.message : e) })
        }
      },
    }),
    'dsh-improved-inline-edit: steer api',
  )
}
