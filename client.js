// dsh-improved-inline-edit — client 半部。
//
// 行为：在 composer 上方（conversation.input.dock）注册一条「修改要求」输入条。
//   - 仅在 agent 运行中（session.running）渲染；运行结束自动消失；
//   - 左侧 100 条 Deep 短语池轮换（洗牌袋抽取 + 事件驱动 + 点击切中英）；
//   - 中间输入框为 textarea，随内容自动换行扩展高度（不挤占行内空间）；
//   - 输入内容实时写入 localStorage（按 sessionId 分键），权限弹窗/重渲染/
//     任务结束都不会丢稿；
//   - 右侧 ➤ 旋转 90° 的黄色实心圆形发送按钮，√ ✗ 状态显示在按钮右侧；
//   - 发送后消息进入「已发送」列表（localStorage 持久，跨运行保留），每条带
//     复制/撤回按钮；撤回走 host /api/recall（agent.inbox.remove），仅对未被
//     agent 读取的消息有效——列表轮询 /api/pending 如实标注「可撤回/已读取」；
//   - 注入前缀开关（默认开）：发送时带前缀提示模型继续原任务。
//
// Bundle 格式遵循 DSH client 模块系统：window.__ModuleLoader__.load({id, factory})。
if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({
    id: 'dsh-improved-inline-edit',
    factory: (require) => {
      'use strict'
      var module = { exports: {} }
      var exports = module.exports
      Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

      var React = require('react')

      // ---- Deep 短语池（英/中各 100 条，索引一一对应）----
      var PHRASES_EN = [
        'deep diving','deep seeking','deep delving','deep surfacing','deep breaching',
        'deep bubbling','deep singing','deep fishing','deep sinking','deep sleeping',
        'deep napping','deep dreaming','deep cooking','deep baking','deep brewing',
        'deep caramelizing','deep fermenting','deep flambéing','deep frosting','deep garnishing',
        'deep julienning','deep kneading','deep leavening','deep marinating','deep proofing',
        'deep sautéing','deep seasoning','deep simmering','deep stewing','deep tempering',
        'deep whisking','deep zesting','deep spelunking','deep burrowing','deep ruminating',
        'deep incubating','deep percolating','deep honking','deep noodling','deep doodling',
        'deep waddling','deep frolicking','deep moseying','deep moonwalking','deep photosynthesizing',
        'deep precipitating','deep combobulating','deep recombobulating','deep levitating','deep metamorphosing',
        'deep zigzagging','deep boondoggling','deep gallivanting','deep crafting','deep forging',
        'deep deliberating','deep inferring','deep puzzling','deep reticulating','deep wandering',
        'deep meandering','deep orbiting','deep cascading','deep churning','deep billowing',
        'deep swirling','deep undulating','deep fluttering','deep swooping','deep shimmying',
        'deep grooving','deep lollygagging','deep sprouting',
        'deep floating','deep drifting','deep soaring','deep cruising','deep excavating',
        'deep mapping','deep decoding','deep encoding','deep compiling','deep bundling',
        'deep testing','deep refactoring','deep calculating','deep sketching','deep outlining',
        'deep jamming','deep riffing','deep brainstorming','deep hypothesizing','deep probing',
        'deep scanning','deep synthesizing','deep prioritizing','deep optimizing','deep streamlining',
        'deep hardening','deep shipping'
      ]
      var PHRASES_ZH = [
        '深潜中','深度求索中','刨根问底中','喷涂彩虹中','跃出海面中',
        '海底冒泡中','引吭高歌中','摸鱼中','沉底中','呼呼大睡中',
        '偷偷打盹中','白日做梦中','小火慢炖中','烘焙中','酿造中',
        '熬糖色中','发酵中','喷火炙烤中','抹奶油中','摆盘中',
        '切丝中','揉面中','发面中','腌制入味中','醒面中',
        '爆炒中','调味中','咕嘟咕嘟中','文火炖煮中','回火中',
        '打发中','削皮中','洞窟探秘中','挖洞中','反刍中',
        '孵化中','渗滤中','哔哔鸣笛中','瞎鼓捣中','涂鸦中',
        '摇摇晃晃中','撒欢中','溜达中','太空步中','光合作用中',
        '沉淀中','拼拼凑凑中','重组中','悬空冥想中','蜕变中',
        '蛇皮走位中','瞎忙活中','到处浪中','打磨中','锻造中',
        '斟酌中','推演中','解谜中','编织中','游弋中',
        '漫步中','绕飞中','飞瀑中','翻腾中','鼓涌中',
        '回旋中','起伏中','扑棱中','俯冲中','扭摆中',
        '踩点中','磨洋工中','冒芽中',
        '漂浮中','漂移中','翱翔中','巡航中','挖掘中',
        '测绘中','解码中','编码中','编译中','打包中',
        '测试中','重构中','心算中','起草中','列大纲中',
        '即兴演奏中','炫技中','头脑风暴中','假想中','探测中',
        '扫描中','综合提炼中','排优先级中','优化中','精简中',
        '加固中','发货中'
      ]

      var API_PATH = '/dsh-improved-inline-edit/api'
      var LS_DRAFT = 'dsh-improved-inline-edit:draft:'
      var LS_PREFIX = 'dsh-improved-inline-edit:prefix'
      var LS_LANG = 'dsh-improved-inline-edit:lang'

      // ---- 本地存储安全封装 ----
      function lsGet(key) {
        try { return localStorage.getItem(key) } catch (e) { return null }
      }
      function lsSet(key, value) {
        try { localStorage.setItem(key, value) } catch (e) { /* 忽略配额错误 */ }
      }
      function lsDel(key) {
        try { localStorage.removeItem(key) } catch (e) { /* 忽略 */ }
      }

      var CSS = [
        '.ms-wrap{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width,780px);margin:0 auto;}',
        '.ms-row{display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);font-size:13px;}',
        '.ms-row.running{border-color:var(--dsw-alias-brand-primary);}',
        '.ms-label{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:12px;cursor:pointer;user-select:none;}',
        '.ms-label:hover{color:var(--dsw-alias-label-primary);}',
        '.ms-input{flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;resize:none;overflow-y:auto;line-height:1.5;padding:0 2px 0 0;max-height:140px;scrollbar-width:thin;}',
        '.ms-input::-webkit-scrollbar{width:6px;}',
        '.ms-input::-webkit-scrollbar-track{background:transparent;}',
        '.ms-input::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l1);border-radius:3px;}',
        '.ms-input::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary);}',
        '.ms-input::placeholder{color:var(--dsw-alias-label-secondary);}',
        '.ms-btn{flex:none;width:26px;height:26px;border:none;margin-left:auto;background:var(--dsw-alias-brand-primary);cursor:pointer;color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-label-primary));font-size:14px;line-height:1;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,opacity .12s;}',
        '.ms-btn:hover:not(:disabled){background:var(--dsw-alias-brand-primary);filter:brightness(1.12);}',
        '.ms-btn:disabled{opacity:.5;cursor:default;}',
        '.ms-arrow{display:inline-flex;transform:rotate(-90deg);transform-origin:center;color:inherit;}',
        '.ms-status{flex:none;width:0;opacity:0;overflow:hidden;text-align:center;font-size:14px;line-height:1;transition:width .28s ease,opacity .2s ease;}',
        '.ms-status.ok{width:16px;opacity:1;color:var(--dsw-alias-state-success-primary);}',
        '.ms-status.error{width:16px;opacity:1;color:var(--dsw-alias-state-error-primary);}',
        // ---- 前缀开关（发送按钮左边的小方块）----
        '.ms-prefix{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:transparent;cursor:pointer;transition:background .12s,border-color .12s;position:relative;}',
        '.ms-prefix:hover{border-color:var(--dsw-alias-brand-primary);}',
        '.ms-prefix input{position:absolute;opacity:0;width:0;height:0;margin:0;}',
        '.ms-prefix::after{content:"";display:block;width:9px;height:5px;border-left:2px solid transparent;border-bottom:2px solid transparent;transform:rotate(-45deg) translate(1px,-1px);}',
        '.ms-prefix.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
        '.ms-prefix.on::after{border-left-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-label-primary));border-bottom-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-label-primary));}',
        // ---- DOM 增强的撤回按钮（官方 pending steering 气泡旁）→ 带外框胶囊按钮 ----
        '.ms-recall-btn{flex:none;border:1px solid var(--dsw-alias-brand-primary);background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:12px;padding:3px 10px;border-radius:999px;line-height:1.6;white-space:nowrap;transition:background .12s,color .12s,border-color .12s;box-shadow:0 0 0 0 transparent;}',
        '.ms-recall-btn:hover:not(:disabled){background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-label-primary));}',
        '.ms-recall-btn:active:not(:disabled){transform:scale(.96);}',
        '.ms-recall-btn:disabled{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l1);background:transparent;cursor:default;opacity:.6;}',
      ].join('')

      // ---- 洗牌袋抽取：一袋抽完才重洗，短期不重复 ----
      function makeDrawer() {
        var bag = []
        var last = -1
        return function draw() {
          if (bag.length === 0) {
            var arr = []
            for (var i = 0; i < PHRASES_EN.length; i++) arr.push(i)
            for (var k = arr.length - 1; k > 0; k--) {
              var j = Math.floor(Math.random() * (k + 1))
              var t = arr[k]; arr[k] = arr[j]; arr[j] = t
            }
            bag = arr
          }
          var idx = bag.pop()
          if (idx === last && bag.length > 0) {
            bag.unshift(idx)
            idx = bag.pop()
          }
          last = idx
          return idx
        }
      }

      function SteerDock(props) {
        var session = props.session
        var sessionId = props.sessionId || (session && session.sessionId)
        var running = !!(session && session.running)

        // 把当前 sessionId 暴露给 DOM 增强的撤回按钮观察器读取
        React.useEffect(function () {
          try {
            window.__dshImprovedSessionId = sessionId || ''
          } catch (e) { /* 忽略 */ }
        }, [sessionId])

        // ---- 草稿：localStorage 持久化（权限弹窗/重渲染/任务结束都不丢）----
        var draftState = React.useState(function () {
          if (!sessionId) return ''
          return lsGet(LS_DRAFT + sessionId) || ''
        })
        var draft = draftState[0]
        var setDraft = draftState[1]

        // sessionId 变化时切换草稿
        React.useEffect(function () {
          if (!sessionId) return
          setDraft(lsGet(LS_DRAFT + sessionId) || '')
        }, [sessionId])

        // 草稿变化时持久化
        React.useEffect(function () {
          if (!sessionId) return
          if (draft) lsSet(LS_DRAFT + sessionId, draft)
          else lsDel(LS_DRAFT + sessionId)
        }, [draft, sessionId])

        var statusState = React.useState(null) // null | sending | ok | error
        var status = statusState[0]
        var setStatus = statusState[1]

        var langState = React.useState(function () {
          return lsGet(LS_LANG) === 'zh' ? 'zh' : 'en'
        })
        var lang = langState[0]
        var setLang = langState[1]

        // ---- 注入前缀开关（默认开）----
        var prefixState = React.useState(function () {
          return lsGet(LS_PREFIX) !== '0'
        })
        var prefixEnabled = prefixState[0]
        var setPrefixEnabled = prefixState[1]

        var phraseState = React.useState(function () { return Math.floor(Math.random() * PHRASES_EN.length) })
        var phraseIdx = phraseState[0]
        var setPhraseIdx = phraseState[1]

        // 状态 2s 后自动消失
        React.useEffect(function () {
          if (status === 'ok' || status === 'error') {
            var t = setTimeout(function () { setStatus(null) }, 2000)
            return function () { clearTimeout(t) }
          }
        }, [status])

        // 洗牌袋 + 节流轮换（适配 dsh 0.1.2+ 的 SessionSnapshot：
        // 该对象不再提供 runningCalls / partial，原"事件驱动"逻辑读 session.runningCalls.length，
        // 会在 agent 运行时抛 TypeError 导致输入条渲染崩溃。
        // 现改为：运行开始立即换一条，运行期间按 >=5s 节流轮换，不依赖任何已删除字段）
        var drawerRef = React.useRef(null)
        var runningRef = React.useRef(running)
        var lastSwapRef = React.useRef(0)
        React.useEffect(function () {
          if (!drawerRef.current) drawerRef.current = makeDrawer()
          var nowRunning = running
          var wasRunning = runningRef.current
          runningRef.current = nowRunning
          if (!nowRunning) return
          var now = Date.now()
          if (wasRunning && lastSwapRef.current && now - lastSwapRef.current < 5000) return
          lastSwapRef.current = now
          setPhraseIdx(drawerRef.current())
        }, [running, session])

        var toggleLang = function () {
          setLang(function (prev) {
            var next = prev === 'zh' ? 'en' : 'zh'
            lsSet(LS_LANG, next)
            return next
          })
        }

        var phraseLabel = lang === 'zh'
          ? PHRASES_ZH[phraseIdx] + '…'
          : PHRASES_EN[phraseIdx].charAt(0).toUpperCase() + PHRASES_EN[phraseIdx].slice(1) + '...'

        // ---- 发送 ----
        var send = function () {
          var text = draft.trim()
          if (!text || !sessionId || status === 'sending') return
          setStatus('sending')
          fetch(API_PATH + '/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId, text: text, prefix: prefixEnabled }),
          })
            .then(function (r) { return r.json() })
            .then(function (res) {
              if (res && res.ok) {
                setDraft('')
                setStatus('ok')
              } else {
                setStatus('error')
              }
            })
            .catch(function () { setStatus('error') })
        }
        var onKeyDown = function (e) { if (e.key === 'Enter') send() }

        // 渲染条件：运行中、或有草稿（任务结束时保留，发送/清空后消失）
        // 任务结束时 deep 短语状态栏保留最后一条文案，不轮换新文案
        if (!running && !draft.trim()) return null

        var statusGlyph = status === 'ok' ? '✓' : status === 'error' ? '✗' : ''
        var statusClass = status === 'ok' ? ' ok' : status === 'error' ? ' error' : ''

        return React.createElement('div', { className: 'ms-wrap' },
          React.createElement('div', { className: 'ms-row' + (running ? ' running' : '') },
            React.createElement('span', {
              className: 'ms-label',
              onClick: toggleLang,
              title: lang === 'zh' ? '点击切换为英文' : 'Click to switch to Chinese',
            }, '⚡ ' + phraseLabel),
            React.createElement('textarea', {
              className: 'ms-input',
              value: draft,
              rows: 1,
              ref: function (node) {
                // 随内容自动换行增高：先把高度清零再按 scrollHeight 撑开
                if (node) {
                  node.style.height = 'auto'
                  node.style.height = node.scrollHeight + 'px'
                }
              },
              onChange: function (e) { setDraft(e.target.value) },
              onKeyDown: onKeyDown,
              placeholder: '输入修改要求，立即注入当前任务…',
            }),
            // ---- 前缀开关：发送按钮左边的小方块（开=勾选）----
            React.createElement('label', {
              className: 'ms-prefix' + (prefixEnabled ? ' on' : ''),
              title: '是否选择加入前缀修改要求：请基于当前任务继续执行，不要改变任务目标',
            },
              React.createElement('input', {
                type: 'checkbox',
                checked: prefixEnabled,
                onChange: function (e) {
                  var v = e.target.checked
                  setPrefixEnabled(v)
                  lsSet(LS_PREFIX, v ? '1' : '0')
                },
              }),
            ),
            React.createElement('button', {
              className: 'ms-btn',
              disabled: !draft.trim() || status === 'sending',
              onClick: send,
              title: '发送修改要求',
            },
              React.createElement('span', { className: 'ms-arrow' }, '➤'),
            ),
            React.createElement('span', {
              className: 'ms-status' + statusClass,
              style: { visibility: statusGlyph ? 'visible' : 'hidden' },
            }, statusGlyph),
          ),
        )
      }

      var inject = ['slots']

      function apply(ctx) {
        var slots = ctx.slots

        // 注入样式
        if (typeof document !== 'undefined') {
          var tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-improved-inline-edit'
          tag.textContent = CSS
          document.head.appendChild(tag)
        }

        ctx.effect(function () {
          return slots.inject('conversation.input.dock', function () {
            return slots.register(
              { name: 'conversation.input.dock', id: 'improved-inline-edit', order: 40 },
              function (props) { return React.createElement(SteerDock, props) },
            )
          })
        }, 'dsh-improved-inline-edit: input dock')

        // 撤回按钮采用 DOM 增强：DSH 官方把待处理的 steering 消息渲染为
        // [data-pending-steering] 气泡（带复制按钮）。keyed 槽位禁止跨插件
        // 注册已占用 key（实测报错），所以监听气泡出现后在操作区插入「撤回」。
        // messageId 通过轮询 /api/pending 与 DOM 气泡顺序关联（官方按 inbox
        // 顺序渲染，pending 也按顺序返回）。
        ctx.effect(function () {
          if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
          var currentSessionId = ''
          var activeIds = []
          var attach = function () {
            var bubbles = document.querySelectorAll('[data-pending-steering]')
            for (var i = 0; i < bubbles.length; i++) {
              var bubble = bubbles[i]
              if (bubble.querySelector('.ms-recall-btn')) continue
              var btn = document.createElement('button')
              btn.className = 'ms-recall-btn'
              btn.type = 'button'
              btn.textContent = '撤回'
              btn.title = '撤回（agent 尚未读取）'
              btn.addEventListener('click', function () {
                var parent = btn.closest('[data-pending-steering]')
                if (!parent) return
                var all = document.querySelectorAll('[data-pending-steering]')
                var idx = Array.prototype.indexOf.call(all, parent)
                var messageId = activeIds[idx]
                if (!messageId || !currentSessionId) return
                fetch(API_PATH + '/recall', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ sessionId: currentSessionId, messageId: messageId }),
                })
                  .then(function (r) { return r.json() })
                  .then(function (res) {
                    if (!(res && res.ok && res.recalled)) {
                      btn.textContent = '已读取'
                      btn.disabled = true
                      btn.title = '已被 agent 读取，无法撤回'
                    }
                  })
                  .catch(function () {
                    btn.textContent = '已读取'
                    btn.disabled = true
                    btn.title = '撤回失败'
                  })
              })
              var actions = bubble.querySelector('[class*="actions"]') || bubble
              actions.appendChild(btn)
            }
          }
          // 从 input.dock 组件拿到当前 sessionId：通过 MutationObserver 观察页面
          // 上出现的会话切换元素，或简化——从 URL/全局 store 读。
          // 这里用折中方案：观察任意元素上的 session 数据变化太脆弱，
          // 改为由 SteerDock 在挂载时把 sessionId 写入 window 供本观察器读取。
          var tick = function () {
            var sid = window.__dshImprovedSessionId || ''
            currentSessionId = sid
            if (!sid) return
            fetch(API_PATH + '/pending?sessionId=' + encodeURIComponent(sid))
              .then(function (r) { return r.json() })
              .then(function (res) {
                if (!res || !res.ok || !Array.isArray(res.pending)) return
                activeIds = res.pending
                attach()
              })
              .catch(function () {})
          }
          var mo = new MutationObserver(function () { tick() })
          if (document.body) mo.observe(document.body, { childList: true, subtree: true })
          var tid = setInterval(tick, 1000)
          tick()
          return function () {
            if (mo) mo.disconnect()
            clearInterval(tid)
          }
        }, 'dsh-improved-inline-edit: recall buttons')
      }

      exports.steerDock = SteerDock
      exports.inject = inject
      exports.apply = apply

      return module.exports
    },
  })
}
