// dsh-improved-inline-edit — host 半部。
//
// 职责：面向浏览器 client 暴露 HTTP API：
//   POST /api/send    — 注入修改要求到运行中 agent（可选加引导前缀），返回消息 id
//   POST /api/recall  — 撤回尚未被 agent 读取的消息（agent.inbox.remove）
//   GET  /api/pending — 查询消息是否仍在待处理队列（决定能否撤回）
//   GET  /api/health  — 健康检查
//
// 撤回窗口说明：消息进入 inbox 的 next-step/next-turn 队列后，在 agent 走到
// 下一个 step 边界被 claim() 之前都可以撤回；一旦被 claim 并写入会话历史，
// DSH 无官方 API 可删除，撤回请求会返回 recalled:false，由前端如实展示。
//
// 采用同源 fetch → webServer 模式（独立插件跨端通信）。

const API_PATH = '/dsh-improved-inline-edit/api'

// 注入引导前缀：提示模型在继续原任务的前提下执行修改要求（前端可关闭）。
const STEER_PREFIX = '【修改要求｜请基于当前任务继续执行，不要改变任务目标】'

/** 读取请求体（JSON）。 */
async function readBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export const name = 'dsh-improved-inline-edit'

/** 声明依赖服务：webServer（HTTP 注册）+ agents（会话访问）。 */
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
          res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(obj))
        }
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const path = url.pathname.replace(/^\/dsh-improved-inline-edit\/api/, '') || '/'
          const agents = ctx.get('agents')

          if (req.method === 'POST' && path === '/send') {
            const body = await readBody(req)
            const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
            const text = typeof body?.text === 'string' ? body.text.trim() : ''
            if (!sessionId || !text) {
              return send(400, { ok: false, error: 'invalid-input' })
            }
            if (!agents) {
              return send(503, { ok: false, error: 'agents-service-unavailable' })
            }
            const agent = agents.get(sessionId)
            if (!agent) {
              return send(404, { ok: false, error: 'agent-not-found' })
            }
            // 可选引导前缀（前端开关控制），避免模型把修改要求当成新任务
            const prefixEnabled = body.prefix !== false
            const finalText = prefixEnabled ? STEER_PREFIX + ' ' + text : text
            const message = {
              id: `steer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              role: 'user',
              content: [{ type: 'text', text: finalText }],
              source: { kind: 'user' },
            }
            agent.steer(message)
            return send(200, { ok: true, id: message.id })
          }

          if (req.method === 'POST' && path === '/recall') {
            const body = await readBody(req)
            const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
            const messageId = typeof body?.messageId === 'string' ? body.messageId.trim() : ''
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
            // remove 只对仍在 next-step/next-turn 队列里的消息有效
            const recalled = inbox.remove(messageId)
            return send(200, { ok: true, recalled })
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
            // 汇总仍在等待队列里的消息 id（可撤回集合）
            const pending = []
            const seen = new Set()
            for (const m of inbox.nextStep || []) {
              if (m && m.id && !seen.has(m.id)) {
                seen.add(m.id)
                pending.push(m.id)
              }
            }
            for (const m of inbox.nextTurn || []) {
              if (m && m.id && !seen.has(m.id)) {
                seen.add(m.id)
                pending.push(m.id)
              }
            }
            return send(200, { ok: true, pending })
          }

          if (req.method === 'GET' && path === '/health') {
            return send(200, { ok: true, agents: !!agents })
          }

          return send(404, { ok: false, error: 'not-found: ' + path })
        } catch (e) {
          return send(500, { ok: false, error: String(e instanceof Error ? e.message : e) })
        }
      },
    }),
    'dsh-improved-inline-edit: steer api',
  )
}
