// dsh-improved-inline-edit — host 半部。
//
// 职责：面向浏览器 client 暴露一个 HTTP API，接收「注入修改要求」请求，
// 并把消息通过 agent.steer() 注入到正在运行的 agent 的 next-step inbox。
// 采用与 dsh-super-injector 相同的同源 fetch → webServer 模式（独立插件
// 跨端通信不走 harness.handle，那是动态 Cordis 插件专用通道）。
//
// 不改任何 @deepseek-ai/dsh-* 源码。

const API_PATH = '/dsh-improved-inline-edit/api'

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

          if (req.method === 'POST' && path === '/steer') {
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
            const message = {
              id: `steer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              role: 'user',
              content: [{ type: 'text', text }],
              source: { kind: 'user' },
            }
            agent.steer(message)
            return send(200, { ok: true, id: message.id })
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
