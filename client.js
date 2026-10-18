// dsh-improved-inline-edit — client 半部。
//
// 行为：在 composer 上方（conversation.input.dock）注册一条「修改要求」输入条。
//   - 仅在 agent 运行中（session.running）渲染；运行结束自动消失；
//   - 左侧 100 条 Deep 短语池轮换（洗牌袋抽取 + 节流轮换 + 点击切中英），
//     文字为深海蓝→紫→青的流动渐变；
//   - 中间输入框为 textarea，随内容自动换行扩展高度；
//   - 支持拖拽/粘贴图片与文本文件：图片走 host 的官方附件管线，随同一条
//     agent.steer 消息发出；文本/代码文件以引用形式随消息发出；
//   - 输入内容实时写入 localStorage（按 sessionId 分键），权限弹窗/重渲染/
//     任务结束都不会丢稿；
//   - 右侧 ➤ 旋转 90° 的圆形发送按钮，√ ✗ 状态显示在按钮右侧；
//   - 发送后消息进入 agent 的待处理队列，气泡旁出现「撤回 · Ns」按钮；
//     未被读取时可撤回，被读取后自动变灰；撤回成功把原文回填输入框；
//   - ⚡ 打开「常用短语 / 短语池」面板：短语一键插入、短语池可编辑/导入/导出；
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

      // ---- 默认 Deep 短语池（英/中各 100 条，索引一一对应）----
      var DEFAULT_EN = [
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
      var DEFAULT_ZH = [
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
      var LS_POOL = 'dsh-improved-inline-edit:pool'
      var LS_PHRASES = 'dsh-improved-inline-edit:phrases'

      var MAX_ATTACHMENTS = 8
      var MAX_IMAGES = 6
      var MAX_FILE_BYTES = 8 * 1024 * 1024
      var MAX_TOTAL_BYTES = 24 * 1024 * 1024
      var DEFAULT_LIMITS = {
        maxImageBytes: 20 * 1024 * 1024,
        maxImagesPerMessage: 20,
        maxMessageImageBytes: 20 * 1024 * 1024,
        mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        maxFileBytes: 8 * 1024 * 1024,
        maxFilesBytes: 16 * 1024 * 1024
      }
      var IMAGE_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
      var TEXT_EXT = {}
      ;('txt md markdown json jsonl ndjson csv tsv log yaml yml toml ini cfg conf xml html htm css scss less ' +
        'js mjs cjs jsx ts tsx vue svelte py rb php go rs java kt c h cpp hpp cc cs sh bash zsh fish ps1 bat cmd ' +
        'sql gd lua r swift dart tex srt vtt diff patch env gitignore dockerfile makefile cmake gradle properties')
        .split(' ')
        .forEach(function (ext) { TEXT_EXT[ext] = true })

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

      /** 读取短语池：格式错了就回退默认，保证输入条永远能渲染。 */
      function loadPool() {
        var fallback = { en: DEFAULT_EN.slice(), zh: DEFAULT_ZH.slice() }
        var raw = lsGet(LS_POOL)
        if (!raw) return fallback
        try {
          var parsed = JSON.parse(raw)
          if (!parsed || !Array.isArray(parsed.en) || !Array.isArray(parsed.zh)) return fallback
          var en = parsed.en.filter(function (s) { return typeof s === 'string' && s.trim() }).map(function (s) { return s.trim() })
          var zh = parsed.zh.filter(function (s) { return typeof s === 'string' && s.trim() }).map(function (s) { return s.trim() })
          if (!en.length || en.length !== zh.length) return fallback
          return { en: en, zh: zh }
        } catch (e) {
          return fallback
        }
      }

      function loadPhrases() {
        var raw = lsGet(LS_PHRASES)
        if (!raw) return []
        try {
          var parsed = JSON.parse(raw)
          if (!Array.isArray(parsed)) return []
          return parsed.filter(function (s) { return typeof s === 'string' && s.trim() }).slice(0, 20)
        } catch (e) {
          return []
        }
      }

      function formatBytes(n) {
        var v = Number(n) || 0
        if (v < 1024) return v + ' B'
        if (v < 1024 * 1024) return (v / 1024).toFixed(1) + ' KB'
        return (v / (1024 * 1024)).toFixed(1) + ' MB'
      }

      function normalizeText(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').trim()
      }

      function extOf(name) {
        var s = String(name || '')
        var i = s.lastIndexOf('.')
        return i === -1 ? '' : s.slice(i + 1).toLowerCase()
      }

      function imageTypeOf(name) {
        return IMAGE_EXT[extOf(name)] || ''
      }

      /** 判断一个文件走「图片」还是「文本文件」；不认识的返回空串。 */
      function classifyFile(file) {
        var type = String((file && file.type) || '').toLowerCase()
        if (DEFAULT_LIMITS.mediaTypes.indexOf(type) !== -1) return 'image'
        if (type.indexOf('image/') === 0) return imageTypeOf(file && file.name) ? 'image' : ''
        if (type.indexOf('text/') === 0) return 'file'
        if (type === 'application/json' || type === 'application/xml' || type === 'application/x-yaml') return 'file'
        if (TEXT_EXT[extOf(file && file.name)]) return 'file'
        return ''
      }

      function readAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
          var reader = new FileReader()
          reader.onload = function () { resolve(String(reader.result || '')) }
          reader.onerror = function () { reject(reader.error || new Error('read-failed')) }
          reader.readAsDataURL(file)
        })
      }

      function countLines(text) {
        var lines = String(text || '').split('\n').map(function (s) { return s.trim() }).filter(Boolean)
        return lines.length
      }

      function splitLines(text) {
        return String(text || '').split('\n').map(function (s) { return s.trim() }).filter(Boolean)
      }

      function downloadJson(filename, data) {
        try {
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
          var url = URL.createObjectURL(blob)
          var a = document.createElement('a')
          a.href = url
          a.download = filename
          a.click()
          setTimeout(function () { URL.revokeObjectURL(url) }, 1000)
        } catch (e) { /* 忽略 */ }
      }

      function sendErrorText(res, status) {
        var err = res && res.error ? String(res.error) : 'http-' + status
        var map = {
          'model-does-not-support-images': '当前模型不支持图片：换一个支持视觉的模型再发',
          'image-too-large': '图片太大（上限 ' + formatBytes(res && res.limit) + '）',
          'images-too-large': '图片总大小超限（上限 ' + formatBytes(res && res.limit) + '）',
          'too-many-images': '图片张数超限（最多 ' + ((res && res.limit) || '') + ' 张）',
          'file-too-large': '文件太大（上限 ' + formatBytes(res && res.limit) + '）',
          'files-too-large': '文件总大小超限（上限 ' + formatBytes(res && res.limit) + '）',
          'too-many-files': '文件个数超限（最多 ' + ((res && res.limit) || '') + ' 个）',
          'unsupported-image-type': '不支持的图片格式（只收 png / jpg / webp / gif）',
          'payload-too-large': '附件太大，超过单次发送上限',
          'attachments-service-unavailable': '附件服务不可用，需要重启 DSH',
          'attachment-invalid': '附件被拒绝：' + ((res && (res.code || res.message)) || ''),
          'agent-not-found': '会话已失联，刷新页面再试',
          'agents-service-unavailable': 'agent 服务不可用，重启 DSH 再试',
          'invalid-input': '内容为空或会话已失联'
        }
        return map[err] || ('发送失败：' + err)
      }

      var CSS = [
        '.ms-wrap{position:relative;box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width,780px);margin:0 auto;}',
        '.ms-row{display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);font-size:13px;}',
        '.ms-row.drag{border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));}',
        '.ms-label{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;font-size:12px;user-select:none;flex:none;max-width:46%;overflow:hidden;}',
        '.ms-bolt{cursor:pointer;line-height:1;padding:1px 2px;border-radius:4px;flex:none;}',
        '.ms-bolt:hover{background:var(--dsw-alias-interactive-bg-hover,transparent);}',
        '.ms-glow{display:inline-block;font-weight:600;letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;background-image:linear-gradient(100deg,#1e40af 0%,#2563eb 20%,#7c3aed 38%,#22d3ee 50%,#7c3aed 62%,#2563eb 80%,#1e40af 100%);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:ms-flow 4s linear infinite;will-change:background-position;}',
        '.ms-glow:hover{filter:brightness(1.08);}',
        '@keyframes ms-flow{0%{background-position:0% 50%;}100%{background-position:300% 50%;}}',
        '.ms-input{flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;resize:none;overflow-y:auto;line-height:1.5;padding:0 2px 0 0;max-height:140px;scrollbar-width:thin;}',
        '.ms-input::-webkit-scrollbar{width:6px;}',
        '.ms-input::-webkit-scrollbar-track{background:transparent;}',
        '.ms-input::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l1);border-radius:3px;}',
        '.ms-input::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-label-secondary);}',
        '.ms-input::placeholder{color:var(--dsw-alias-label-secondary);}',
        '.ms-btn{flex:none;width:26px;height:26px;border:none;margin-left:auto;background:var(--dsw-alias-brand-primary);cursor:pointer;color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-label-primary));font-size:14px;line-height:1;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,opacity .12s;}',
        '.ms-btn:hover:not(:disabled){filter:brightness(1.12);}',
        '.ms-btn:disabled{opacity:.5;cursor:default;}',
        '.ms-arrow{display:inline-flex;transform:rotate(-90deg);transform-origin:center;color:inherit;}',
        '.ms-status{flex:none;width:0;opacity:0;overflow:hidden;text-align:center;font-size:14px;line-height:1;transition:width .28s ease,opacity .2s ease;}',
        '.ms-status.ok{width:16px;opacity:1;color:var(--dsw-alias-state-success-primary);}',
        '.ms-status.error{width:16px;opacity:1;color:var(--dsw-alias-state-error-primary);}',
        '.ms-prefix{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:5px;background:transparent;cursor:pointer;transition:background .12s,border-color .12s;position:relative;}',
        '.ms-prefix:hover{border-color:var(--dsw-alias-brand-primary);}',
        '.ms-prefix input{position:absolute;opacity:0;width:0;height:0;margin:0;}',
        '.ms-prefix::after{content:"";display:block;width:9px;height:5px;border-left:2px solid transparent;border-bottom:2px solid transparent;transform:rotate(-45deg) translate(1px,-1px);}',
        '.ms-prefix.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);}',
        '.ms-prefix.on::after{border-left-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-label-primary));border-bottom-color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-label-primary));}',
        '.ms-attach{display:flex;flex-wrap:wrap;gap:6px;padding:0 4px 6px;}',
        '.ms-thumb{position:relative;width:46px;height:46px;border-radius:8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:none;}',
        '.ms-thumb img{width:100%;height:100%;object-fit:cover;display:block;}',
        '.ms-thumb-x{position:absolute;top:0;right:0;width:17px;height:17px;border:none;border-radius:0 0 0 6px;background:rgba(0,0,0,.62);color:#fff;font-size:11px;line-height:1;cursor:pointer;padding:0;display:flex;align-items:center;justify-content:center;}',
        '.ms-thumb-x:hover{background:rgba(0,0,0,.82);}',
        '.ms-file{display:inline-flex;align-items:center;gap:6px;max-width:240px;padding:4px 4px 4px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);font-size:12px;height:26px;box-sizing:border-box;}',
        '.ms-file-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;}',
        '.ms-file-size{color:var(--dsw-alias-label-secondary);flex:none;}',
        '.ms-x{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;line-height:1;padding:2px 4px;border-radius:4px;}',
        '.ms-x:hover{background:var(--dsw-alias-interactive-bg-hover,transparent);color:var(--dsw-alias-label-primary);}',
        '.ms-drop{position:absolute;inset:-4px;z-index:20;display:flex;align-items:center;justify-content:center;border:1.5px dashed var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));border-radius:14px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;pointer-events:none;}',
        '.ms-notice{margin:4px 2px 0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);}',
        '.ms-notice.error{color:var(--dsw-alias-state-error-primary);}',
        '.ms-panel{position:fixed;z-index:2147483000;box-sizing:border-box;max-height:60vh;overflow:auto;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 40px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary);font-size:12px;line-height:1.5;text-align:left;}',
        '.ms-h{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0 0 6px;}',
        '.ms-hint{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.5;}',
        '.ms-sep{height:1px;background:var(--dsw-alias-border-l1);margin:12px 0;}',
        '.ms-row2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
        '.ms-btn2{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;line-height:1.4;font-family:inherit;}',
        '.ms-btn2:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,transparent);}',
        '.ms-btn2:disabled{opacity:.5;cursor:default;}',
        '.ms-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0;}',
        '.ms-chip{display:inline-flex;align-items:center;max-width:100%;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;overflow:hidden;background:var(--dsw-alias-bg-layer-2,transparent);}',
        '.ms-chip-text{border:none;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;padding:3px 8px;cursor:pointer;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:inherit;}',
        '.ms-chip-text:hover{background:var(--dsw-alias-interactive-bg-hover,transparent);}',
        '.ms-chip-x{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;padding:2px 6px;}',
        '.ms-pool{display:flex;gap:8px;align-items:stretch;}',
        '.ms-pool-col{flex:1;min-width:0;}',
        '.ms-ta{width:100%;box-sizing:border-box;height:120px;resize:vertical;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2,transparent);color:var(--dsw-alias-label-primary);font:12px/1.5 inherit;padding:6px 8px;outline:none;}',
        '.ms-err{color:var(--dsw-alias-state-error-primary);margin-top:6px;font-size:11px;}',
        '.ms-recall-btn{flex:none;border:1px solid var(--dsw-alias-brand-primary);background:transparent;color:var(--dsw-alias-brand-primary);cursor:pointer;font-size:12px;padding:3px 10px;border-radius:999px;line-height:1.6;white-space:nowrap;transition:background .12s,color .12s,border-color .12s;}',
        '.ms-recall-btn:hover:not(:disabled){background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-layer-2,var(--dsw-alias-label-primary));}',
        '.ms-recall-btn:active:not(:disabled){transform:scale(.96);}',
        '.ms-recall-btn:disabled{color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l1);background:transparent;cursor:default;opacity:.6;}'
      ].join('')

      // ---- 洗牌袋抽取：一袋抽完才重洗，短期不重复 ----
      function makeDrawer(size) {
        var bag = []
        var last = -1
        return function draw() {
          if (bag.length === 0) {
            var arr = []
            for (var i = 0; i < size; i++) arr.push(i)
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
        var sessionId = (session && session.sessionId) || props.sessionId || ''
        var running = !!(session && session.running)

        var wrapRef = React.useRef(null)
        var inputRef = React.useRef(null)
        var sendingRef = React.useRef(false)
        var drawerRef = React.useRef(null)
        var runningRef = React.useRef(running)
        var lastSwapRef = React.useRef(0)
        var attachRef = React.useRef([])

        // ---- 草稿：localStorage 持久化（权限弹窗/重渲染/任务结束都不丢）----
        var draftState = React.useState(function () {
          if (!sessionId) return ''
          return lsGet(LS_DRAFT + sessionId) || ''
        })
        var draft = draftState[0]
        var setDraft = draftState[1]

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

        // ---- 短语池（可被用户改写）----
        var poolState = React.useState(loadPool)
        var pool = poolState[0]
        var setPool = poolState[1]

        var phraseState = React.useState(function () {
          return Math.floor(Math.random() * (loadPool().en.length || 1))
        })
        var phraseIdx = phraseState[0]
        var setPhraseIdx = phraseState[1]

        var limitState = React.useState(DEFAULT_LIMITS)
        var limits = limitState[0]
        var setLimits = limitState[1]

        var capsState = React.useState({ attachments: false })
        var caps = capsState[0]
        var setCaps = capsState[1]

        // ---- 附件 ----
        var attachState = React.useState([])
        var attachments = attachState[0]
        var setAttachments = attachState[1]
        attachRef.current = attachments

        var noticeState = React.useState('')
        var notice = noticeState[0]
        var setNotice = noticeState[1]

        var noticeErrorState = React.useState(false)
        var noticeError = noticeErrorState[0]
        var setNoticeError = noticeErrorState[1]

        var dragState = React.useState(false)
        var dragOver = dragState[0]
        var setDragOver = dragState[1]

        // ---- 常用短语 / 短语池面板 ----
        var panelState = React.useState(false)
        var panelOpen = panelState[0]
        var setPanelOpen = panelState[1]

        var panelPosState = React.useState(null)
        var panelPos = panelPosState[0]
        var setPanelPos = panelPosState[1]

        var phrasesState = React.useState(loadPhrases)
        var phrases = phrasesState[0]
        var setPhrases = phrasesState[1]

        var enTextState = React.useState('')
        var enText = enTextState[0]
        var setEnText = enTextState[1]

        var zhTextState = React.useState('')
        var zhText = zhTextState[0]
        var setZhText = zhTextState[1]

        var poolErrorState = React.useState('')
        var poolError = poolErrorState[0]
        var setPoolError = poolErrorState[1]

        // 状态 2s 后自动消失
        React.useEffect(function () {
          if (status === 'ok' || status === 'error') {
            var t = setTimeout(function () { setStatus(null) }, 2000)
            return function () { clearTimeout(t) }
          }
        }, [status])

        React.useEffect(function () {
          if (!notice) return
          var t = setTimeout(function () { setNotice(''); setNoticeError(false) }, 6000)
          return function () { clearTimeout(t) }
        }, [notice])

        // 当前 session 暴露给 DOM 增强的撤回按钮观察器（兜底；优先读 DOM 上的 data-conversation-session）
        React.useEffect(function () {
          try { window.__dshImprovedSessionId = sessionId || '' } catch (e) { /* 忽略 */ }
        }, [sessionId])

        // 撤回成功 → 把原文回填输入框
        React.useEffect(function () {
          if (typeof window === 'undefined') return
          var onRecalled = function (e) {
            var text = e && e.detail && typeof e.detail.text === 'string' ? e.detail.text : ''
            if (!text) return
            setDraft(function (prev) {
              var cur = prev && prev.trim() ? prev.replace(/\s+$/, '') + '\n' : ''
              return cur + text
            })
            setNotice('已把撤回的内容放回输入框')
            setNoticeError(false)
            try { if (inputRef.current) inputRef.current.focus() } catch (err) { /* 忽略 */ }
          }
          window.addEventListener('dsh-improved-inline-edit:recalled', onRecalled)
          return function () { window.removeEventListener('dsh-improved-inline-edit:recalled', onRecalled) }
        }, [])

        // sessionId 变化时切换草稿
        React.useEffect(function () {
          if (!sessionId) return
          setDraft(lsGet(LS_DRAFT + sessionId) || '')
        }, [sessionId])

        // 换会话时清掉上一会话的附件，避免串到别的会话
        React.useEffect(function () {
          clearAttachments()
        }, [sessionId])

        // 草稿变化时持久化
        React.useEffect(function () {
          if (!sessionId) return
          if (draft) lsSet(LS_DRAFT + sessionId, draft)
          else lsDel(LS_DRAFT + sessionId)
        }, [draft, sessionId])

        // 附件上限（host 是权威；拿不到就按默认值，附件入口保持关闭）
        React.useEffect(function () {
          var alive = true
          fetch(API_PATH + '/limits')
            .then(function (r) { return r.json() })
            .then(function (res) {
              if (!alive || !res || !res.ok) return
              if (res.images) {
                setLimits({
                  maxImageBytes: res.images.maxImageBytes || DEFAULT_LIMITS.maxImageBytes,
                  maxImagesPerMessage: res.images.maxImagesPerMessage || DEFAULT_LIMITS.maxImagesPerMessage,
                  maxMessageImageBytes: res.images.maxMessageImageBytes || DEFAULT_LIMITS.maxMessageImageBytes,
                  mediaTypes: Array.isArray(res.images.mediaTypes) && res.images.mediaTypes.length ? res.images.mediaTypes : DEFAULT_LIMITS.mediaTypes,
                  maxFileBytes: (res.files && res.files.maxFileBytes) || DEFAULT_LIMITS.maxFileBytes,
                  maxFilesBytes: (res.files && res.files.maxFilesBytes) || DEFAULT_LIMITS.maxFilesBytes
                })
              }
              setCaps({ attachments: !!res.attachments })
            })
            .catch(function () { /* 旧 host：附件入口保持关闭 */ })
          return function () { alive = false }
        }, [])

        // 洗牌袋 + 节流轮换：运行开始立即换一条，运行期间按 >=5s 节流
        React.useEffect(function () {
          if (!drawerRef.current || drawerRef.current.size !== pool.en.length) {
            var d = makeDrawer(pool.en.length)
            d.size = pool.en.length
            drawerRef.current = d
          }
          var nowRunning = running
          var wasRunning = runningRef.current
          runningRef.current = nowRunning
          if (!nowRunning) return
          var now = Date.now()
          if (wasRunning && lastSwapRef.current && now - lastSwapRef.current < 5000) return
          lastSwapRef.current = now
          setPhraseIdx(drawerRef.current())
        }, [running, session, pool])

        // 面板位置：贴住输入条上方（fixed，避免被 composer 的容器裁切）
        React.useEffect(function () {
          if (!panelOpen) { setPanelPos(null); return }
          var update = function () {
            var el = wrapRef.current
            if (!el) return
            var rect = el.getBoundingClientRect()
            setPanelPos({
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
              width: Math.max(280, Math.min(rect.width, window.innerWidth - 16)),
              bottom: Math.max(8, window.innerHeight - rect.top + 8)
            })
          }
          update()
          window.addEventListener('resize', update)
          window.addEventListener('scroll', update, true)
          return function () {
            window.removeEventListener('resize', update)
            window.removeEventListener('scroll', update, true)
          }
        }, [panelOpen])

        // 打开面板时同步短语池文本
        React.useEffect(function () {
          if (!panelOpen) return
          setEnText(pool.en.join('\n'))
          setZhText(pool.zh.join('\n'))
          setPoolError('')
        }, [panelOpen, pool])

        // 点面板外面 / Esc 关闭
        React.useEffect(function () {
          if (!panelOpen || typeof document === 'undefined') return
          var onDown = function (e) {
            var panel = document.querySelector('.ms-panel')
            if (panel && panel.contains(e.target)) return
            var wrap = wrapRef.current
            if (wrap && wrap.contains(e.target)) return
            setPanelOpen(false)
          }
          var onKey = function (e) { if (e.key === 'Escape') setPanelOpen(false) }
          document.addEventListener('mousedown', onDown, true)
          document.addEventListener('keydown', onKey, true)
          return function () {
            document.removeEventListener('mousedown', onDown, true)
            document.removeEventListener('keydown', onKey, true)
          }
        }, [panelOpen])

        // 卸载时释放图片预览 URL
        React.useEffect(function () {
          return function () {
            var list = attachRef.current || []
            for (var i = 0; i < list.length; i++) {
              if (list[i].previewUrl) {
                try { URL.revokeObjectURL(list[i].previewUrl) } catch (e) { /* 忽略 */ }
              }
            }
          }
        }, [])

        var toggleLang = function () {
          setLang(function (prev) {
            var next = prev === 'zh' ? 'en' : 'zh'
            lsSet(LS_LANG, next)
            return next
          })
        }

        var readInto = function (item, file) {
          readAsDataUrl(file)
            .then(function (url) {
              var s = String(url || '')
              var comma = s.indexOf(',')
              item.data = comma === -1 ? '' : s.slice(comma + 1)
              if (!item.data) throw new Error('empty')
              setAttachments(function (cur) { return cur.slice() })
            })
            .catch(function () {
              setAttachments(function (cur) {
                for (var i = 0; i < cur.length; i++) {
                  if (cur[i].id === item.id) {
                    if (cur[i].previewUrl) {
                      try { URL.revokeObjectURL(cur[i].previewUrl) } catch (e) { /* 忽略 */ }
                    }
                    break
                  }
                }
                return cur.filter(function (a) { return a.id !== item.id })
              })
              setNotice('读取失败：' + item.name)
              setNoticeError(true)
            })
        }

        var addFiles = function (fileList) {
          if (!caps.attachments) {
            setNotice('附件功能要重启一次 DSH 才会生效（当前 host 还是旧版）')
            setNoticeError(true)
            return
          }
          var files = Array.prototype.slice.call(fileList || [])
          if (!files.length) return
          var next = attachments.slice()
          var errors = []
          var total = 0
          var fileTotal = 0
          for (var t = 0; t < next.length; t++) {
            total += next[t].size || 0
            if (next[t].type === 'file') fileTotal += next[t].size || 0
          }
          for (var i = 0; i < files.length; i++) {
            var file = files[i]
            var kind = classifyFile(file)
            if (!kind) { errors.push('不支持：' + (file.name || '文件')); continue }
            if (next.length >= MAX_ATTACHMENTS) { errors.push('最多 ' + MAX_ATTACHMENTS + ' 个附件'); break }
            if (total + (file.size || 0) > MAX_TOTAL_BYTES) { errors.push('附件总大小超过 ' + formatBytes(MAX_TOTAL_BYTES)); continue }
            if (kind === 'image') {
              var imageCount = 0
              for (var j = 0; j < next.length; j++) if (next[j].type === 'image') imageCount++
              var maxImages = Math.min(MAX_IMAGES, limits.maxImagesPerMessage || DEFAULT_LIMITS.maxImagesPerMessage)
              if (imageCount >= maxImages) { errors.push('最多 ' + maxImages + ' 张图片'); continue }
              if (file.size > limits.maxImageBytes) { errors.push((file.name || '图片') + ' 超过 ' + formatBytes(limits.maxImageBytes)); continue }
            } else if (file.size > (limits.maxFileBytes || MAX_FILE_BYTES)) {
              errors.push((file.name || '文件') + ' 超过 ' + formatBytes(limits.maxFileBytes || MAX_FILE_BYTES))
              continue
            } else if (fileTotal + (file.size || 0) > (limits.maxFilesBytes || DEFAULT_LIMITS.maxFilesBytes)) {
              errors.push('文件总大小超过 ' + formatBytes(limits.maxFilesBytes || DEFAULT_LIMITS.maxFilesBytes))
              continue
            }
            total += file.size || 0
            if (kind === 'file') fileTotal += file.size || 0
            var item = {
              id: 'att-' + Date.now() + '-' + i,
              type: kind,
              name: file.name || (kind === 'image' ? 'image' : 'file'),
              mediaType: kind === 'image' ? (file.type || imageTypeOf(file.name)) : '',
              size: file.size || 0,
              data: '',
              previewUrl: kind === 'image' ? URL.createObjectURL(file) : ''
            }
            next.push(item)
            readInto(item, file)
          }
          setAttachments(next)
          if (errors.length) {
            setNotice(errors.join('；'))
            setNoticeError(true)
          }
        }

        var removeAttachment = function (id) {
          setAttachments(function (cur) {
            for (var i = 0; i < cur.length; i++) {
              if (cur[i].id === id && cur[i].previewUrl) {
                try { URL.revokeObjectURL(cur[i].previewUrl) } catch (e) { /* 忽略 */ }
                break
              }
            }
            return cur.filter(function (a) { return a.id !== id })
          })
        }

        var clearAttachments = function () {
          setAttachments(function (cur) {
            for (var i = 0; i < cur.length; i++) {
              if (cur[i].previewUrl) {
                try { URL.revokeObjectURL(cur[i].previewUrl) } catch (e) { /* 忽略 */ }
              }
            }
            return []
          })
        }

        // ---- 发送 ----
        var send = function () {
          var text = draft.trim()
          if ((!text && attachments.length === 0) || !sessionId) return
          if (sendingRef.current || status === 'sending') return
          for (var i = 0; i < attachments.length; i++) {
            if (!attachments[i].data) {
              setNotice('附件还在读取中，稍等一下')
              setNoticeError(false)
              return
            }
          }
          sendingRef.current = true
          setStatus('sending')
          var controller = typeof AbortController !== 'undefined' ? new AbortController() : null
          var timer = controller ? setTimeout(function () { controller.abort() }, 120000) : null
          var body = {
            sessionId: sessionId,
            text: text,
            prefix: prefixEnabled,
            attachments: attachments.map(function (a) {
              return { type: a.type, mediaType: a.mediaType, name: a.name, data: a.data }
            })
          }
          fetch(API_PATH + '/send', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller ? controller.signal : undefined
          })
            .then(function (r) {
              return r.json().catch(function () { return null }).then(function (res) {
                return { status: r.status, res: res }
              })
            })
            .then(function (out) {
              var res = out.res
              if (res && res.ok) {
                setDraft('')
                clearAttachments()
                setStatus('ok')
              } else {
                setStatus('error')
                setNotice(sendErrorText(res, out.status))
                setNoticeError(true)
              }
            })
            .catch(function (err) {
              setStatus('error')
              setNotice(err && err.name === 'AbortError' ? '发送超时（附件太大或网络卡住）' : '发送失败，请重试')
              setNoticeError(true)
            })
            .then(function () {
              sendingRef.current = false
              if (timer) clearTimeout(timer)
            })
        }

        var onKeyDown = function (e) {
          if (e.key !== 'Enter') return
          if (e.shiftKey) return
          var composing = !!(e.nativeEvent && (e.nativeEvent.isComposing || e.keyCode === 229))
          if (composing) return
          e.preventDefault()
          send()
        }

        var onDragOver = function (e) {
          e.preventDefault()
          try { e.dataTransfer.dropEffect = 'copy' } catch (err) { /* 忽略 */ }
          if (!dragOver) setDragOver(true)
        }
        var onDragLeave = function (e) {
          if (e.currentTarget && e.currentTarget.contains(e.relatedTarget)) return
          setDragOver(false)
        }
        var onDrop = function (e) {
          e.preventDefault()
          setDragOver(false)
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
        }
        var onPaste = function (e) {
          var files = e.clipboardData && e.clipboardData.files
          if (files && files.length) {
            e.preventDefault()
            addFiles(files)
          }
        }

        // ---- 常用短语 ----
        var saveCurrentPhrase = function () {
          var text = draft.trim()
          if (!text) return
          if (phrases.indexOf(text) !== -1) {
            setNotice('这条短语已经在库里了')
            setNoticeError(false)
            return
          }
          var next = phrases.concat([text]).slice(0, 20)
          setPhrases(next)
          lsSet(LS_PHRASES, JSON.stringify(next))
          setNotice('已保存为常用短语')
          setNoticeError(false)
        }

        var insertPhrase = function (text) {
          setDraft(function (prev) {
            var cur = prev && prev.trim() ? prev.replace(/\s+$/, '') + '\n' : ''
            return cur + text
          })
          setPanelOpen(false)
          try { if (inputRef.current) inputRef.current.focus() } catch (e) { /* 忽略 */ }
        }

        var removePhrase = function (index) {
          var next = phrases.filter(function (_, i) { return i !== index })
          setPhrases(next)
          lsSet(LS_PHRASES, JSON.stringify(next))
        }

        // ---- 短语池 ----
        var applyPool = function (next) {
          setPool(next)
          lsSet(LS_POOL, JSON.stringify(next))
          drawerRef.current = null
          setPhraseIdx(function (i) { return i % next.en.length })
        }

        var savePoolFromText = function () {
          var en = splitLines(enText)
          var zh = splitLines(zhText)
          if (!en.length || !zh.length) {
            setPoolError('英文和中文都不能为空')
            return
          }
          if (en.length !== zh.length) {
            setPoolError('中英条数要一致：英文 ' + en.length + ' 条 / 中文 ' + zh.length + ' 条')
            return
          }
          if (en.length < 2) {
            setPoolError('至少保留 2 条')
            return
          }
          applyPool({ en: en, zh: zh })
          setPoolError('')
          setNotice('短语池已保存（' + en.length + ' 条）')
          setNoticeError(false)
        }

        var resetPool = function () {
          lsDel(LS_POOL)
          setPool({ en: DEFAULT_EN.slice(), zh: DEFAULT_ZH.slice() })
          drawerRef.current = null
          setPhraseIdx(0)
          setPoolError('')
          setNotice('已恢复默认短语池')
          setNoticeError(false)
        }

        var exportPool = function () {
          downloadJson('deep-phrases.json', { en: pool.en, zh: pool.zh })
        }

        var importPool = function (e) {
          var file = e.target && e.target.files && e.target.files[0]
          if (!file) return
          var reader = new FileReader()
          reader.onload = function () {
            try {
              var parsed = JSON.parse(String(reader.result || ''))
              if (!parsed || !Array.isArray(parsed.en) || !Array.isArray(parsed.zh)) throw new Error('shape')
              var en = parsed.en.filter(function (s) { return typeof s === 'string' && s.trim() }).map(function (s) { return s.trim() })
              var zh = parsed.zh.filter(function (s) { return typeof s === 'string' && s.trim() }).map(function (s) { return s.trim() })
              if (!en.length || en.length !== zh.length) throw new Error('count')
              applyPool({ en: en, zh: zh })
              setPoolError('')
              setNotice('已导入 ' + en.length + ' 条短语')
              setNoticeError(false)
            } catch (err) {
              setPoolError('导入失败：需要一个 { en: [...], zh: [...] } 且中英条数一致的 JSON')
            }
          }
          reader.readAsText(file)
          e.target.value = ''
        }

        var phraseLabel = (function () {
          var size = pool.en.length || 1
          var idx = phraseIdx % size
          var zh = pool.zh[idx] || pool.zh[0] || '思考中'
          var en = pool.en[idx] || pool.en[0] || 'deep thinking'
          return lang === 'zh' ? zh + '…' : en.charAt(0).toUpperCase() + en.slice(1) + '...'
        })()

        // 渲染条件：运行中、有草稿、有附件、或面板打开
        if (!running && !draft.trim() && attachments.length === 0 && !panelOpen) return null

        var statusGlyph = status === 'ok' ? '✓' : status === 'error' ? '✗' : ''
        var statusClass = status === 'ok' ? ' ok' : status === 'error' ? ' error' : ''
        var notReady = false
        for (var ai = 0; ai < attachments.length; ai++) if (!attachments[ai].data) notReady = true

        var rail = attachments.length === 0 ? null : React.createElement('div', { className: 'ms-attach' },
          attachments.map(function (a) {
            if (a.type === 'image') {
              return React.createElement('div', { key: a.id, className: 'ms-thumb', title: a.name + (a.data ? '' : '（读取中）') },
                React.createElement('img', { src: a.previewUrl, alt: a.name }),
                React.createElement('button', {
                  type: 'button', className: 'ms-thumb-x', title: '移除', 'aria-label': '移除',
                  onClick: function () { removeAttachment(a.id) }
                }, '×')
              )
            }
            return React.createElement('div', { key: a.id, className: 'ms-file', title: a.name },
              React.createElement('span', { className: 'ms-file-name' }, a.name),
              React.createElement('span', { className: 'ms-file-size' }, formatBytes(a.size)),
              React.createElement('button', {
                type: 'button', className: 'ms-x', title: '移除', 'aria-label': '移除',
                onClick: function () { removeAttachment(a.id) }
              }, '×')
            )
          })
        )

        var panelStyle = panelPos
          ? { left: panelPos.left + 'px', width: panelPos.width + 'px', bottom: panelPos.bottom + 'px' }
          : { left: '-9999px', width: '320px', bottom: '0px', visibility: 'hidden' }

        var panel = !panelOpen ? null : React.createElement('div', { className: 'ms-panel', style: panelStyle, role: 'dialog', 'aria-label': '短语库' },
          React.createElement('div', { className: 'ms-h' }, '常用短语'),
          React.createElement('div', { className: 'ms-row2' },
            React.createElement('button', { className: 'ms-btn2', disabled: !draft.trim(), onClick: saveCurrentPhrase }, '把当前草稿存为短语'),
            React.createElement('span', { className: 'ms-hint' }, '点一下插入，× 删除（最多 20 条）')
          ),
          phrases.length === 0
            ? React.createElement('div', { className: 'ms-hint', style: { marginTop: '6px' } }, '还没有保存的短语。')
            : React.createElement('div', { className: 'ms-chips' },
              phrases.map(function (p, i) {
                return React.createElement('span', { key: 'p-' + i, className: 'ms-chip' },
                  React.createElement('button', { className: 'ms-chip-text', title: p, onClick: function () { insertPhrase(p) } }, p),
                  React.createElement('button', { className: 'ms-chip-x', title: '删除', 'aria-label': '删除', onClick: function () { removePhrase(i) } }, '×')
                )
              })
            ),
          React.createElement('div', { className: 'ms-sep' }),
          React.createElement('div', { className: 'ms-h' }, '短语池（每行一条，中英条数要一致）'),
          React.createElement('div', { className: 'ms-pool' },
            React.createElement('div', { className: 'ms-pool-col' },
              React.createElement('div', { className: 'ms-hint' }, '英文 · ' + countLines(enText) + ' 条'),
              React.createElement('textarea', {
                className: 'ms-ta', value: enText, spellCheck: false,
                onChange: function (e) { setEnText(e.target.value) }
              })
            ),
            React.createElement('div', { className: 'ms-pool-col' },
              React.createElement('div', { className: 'ms-hint' }, '中文 · ' + countLines(zhText) + ' 条'),
              React.createElement('textarea', {
                className: 'ms-ta', value: zhText, spellCheck: false,
                onChange: function (e) { setZhText(e.target.value) }
              })
            )
          ),
          poolError ? React.createElement('div', { className: 'ms-err' }, poolError) : null,
          React.createElement('div', { className: 'ms-row2', style: { marginTop: '8px' } },
            React.createElement('button', { className: 'ms-btn2', onClick: savePoolFromText }, '保存短语池'),
            React.createElement('button', { className: 'ms-btn2', onClick: resetPool }, '恢复默认'),
            React.createElement('button', { className: 'ms-btn2', onClick: exportPool }, '导出 JSON'),
            React.createElement('label', { className: 'ms-btn2', style: { display: 'inline-block' } }, '导入 JSON',
              React.createElement('input', {
                type: 'file', accept: '.json,application/json', style: { display: 'none' },
                onChange: importPool
              })
            )
          )
        )

        return React.createElement('div', {
          className: 'ms-wrap',
          ref: wrapRef,
          onDragOver: onDragOver,
          onDragLeave: onDragLeave,
          onDrop: onDrop
        },
          dragOver ? React.createElement('div', { className: 'ms-drop' }, '松手就能加入附件') : null,
          rail,
          React.createElement('div', { className: 'ms-row' + (running ? ' running' : '') + (dragOver ? ' drag' : '') },
            React.createElement('span', { className: 'ms-label' },
              React.createElement('span', {
                className: 'ms-bolt',
                onClick: function () { setPanelOpen(function (v) { return !v }) },
                title: '常用短语 / 短语池',
                role: 'button',
                'aria-label': '常用短语 / 短语池'
              }, '⚡'),
              React.createElement('span', {
                className: 'ms-glow',
                onClick: toggleLang,
                title: lang === 'zh' ? '点击切换为英文' : 'Click to switch to Chinese'
              }, phraseLabel)
            ),
            React.createElement('textarea', {
              className: 'ms-input',
              value: draft,
              rows: 1,
              ref: function (node) {
                inputRef.current = node
                if (node) {
                  node.style.height = 'auto'
                  node.style.height = node.scrollHeight + 'px'
                }
              },
              onChange: function (e) { setDraft(e.target.value) },
              onKeyDown: onKeyDown,
              onPaste: onPaste,
              placeholder: '输入修改要求，立即注入当前任务…（可拖入图片/文件）'
            }),
            // ---- 前缀开关：发送按钮左边的小方块（开=勾选）----
            React.createElement('label', {
              className: 'ms-prefix' + (prefixEnabled ? ' on' : ''),
              title: '是否选择加入前缀修改要求：请基于当前任务继续执行，不要改变任务目标'
            },
              React.createElement('input', {
                type: 'checkbox',
                checked: prefixEnabled,
                'aria-label': '注入引导前缀',
                onChange: function (e) {
                  var v = e.target.checked
                  setPrefixEnabled(v)
                  lsSet(LS_PREFIX, v ? '1' : '0')
                }
              })
            ),
            React.createElement('button', {
              className: 'ms-btn',
              disabled: (!draft.trim() && attachments.length === 0) || status === 'sending' || notReady,
              onClick: send,
              title: notReady ? '附件还在读取中' : '发送修改要求',
              'aria-label': '发送修改要求'
            },
              React.createElement('span', { className: 'ms-arrow' }, '➤')
            ),
            React.createElement('span', {
              className: 'ms-status' + statusClass,
              style: { visibility: statusGlyph ? 'visible' : 'hidden' }
            }, statusGlyph)
          ),
          notice ? React.createElement('div', { className: 'ms-notice' + (noticeError ? ' error' : '') }, notice) : null,
          panel
        )
      }

      var inject = ['slots']

      function apply(ctx) {
        var slots = ctx.slots

        // 注入样式（先去重，HMR/重复 apply 不叠加）
        if (typeof document !== 'undefined') {
          var tag = document.querySelector('style[data-plugin="dsh-improved-inline-edit"]')
          if (!tag) {
            tag = document.createElement('style')
            tag.dataset.plugin = 'dsh-improved-inline-edit'
            document.head.appendChild(tag)
          }
          tag.textContent = CSS
        }

        ctx.effect(function () {
          return slots.inject('conversation.input.dock', function () {
            return slots.register(
              { name: 'conversation.input.dock', id: 'improved-inline-edit', order: 40 },
              function (props) { return React.createElement(SteerDock, props) }
            )
          })
        }, 'dsh-improved-inline-edit: input dock')

        // 撤回按钮采用 DOM 增强：DSH 官方把待处理的 steering 消息渲染为
        // [data-pending-steering] 气泡（带复制按钮）。keyed 槽位禁止跨插件
        // 注册已占用 key（实测报错），所以监听气泡出现后在操作区插入「撤回」。
        // 观察范围限定在当前会话容器内；messageId 先按气泡文本匹配，再按顺序兜底。
        ctx.effect(function () {
          if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
          var seenAt = Object.create(null)
          var inFlight = false
          var scheduled = 0

          var scopeEl = function () {
            var wrap = document.querySelector('.ms-wrap')
            if (wrap && wrap.closest) {
              var host = wrap.closest('[data-conversation-content]')
              if (host) return host
            }
            return document
          }

          var sessionIdFor = function (scope) {
            var sid = ''
            try {
              if (scope && scope.getAttribute) sid = scope.getAttribute('data-conversation-session') || ''
            } catch (e) { /* 忽略 */ }
            if (!sid) {
              try { sid = window.__dshImprovedSessionId || '' } catch (e) { /* 忽略 */ }
            }
            return sid
          }

          var pickItem = function (bubble, items, used, index) {
            var text = normalizeText(bubble.textContent || '')
            for (var i = 0; i < items.length; i++) {
              var it = items[i]
              if (used[it.id] || !it.text) continue
              if (text.indexOf(normalizeText(it.text)) !== -1) return it
            }
            var at = items[index]
            if (at && !used[at.id]) return at
            return null
          }

          var attach = function (scope, items) {
            var bubbles = scope.querySelectorAll('[data-pending-steering]')
            var used = Object.create(null)
            for (var i = 0; i < bubbles.length; i++) {
              var bubble = bubbles[i]
              var btn = bubble.querySelector('.ms-recall-btn')
              var item = null
              if (btn && btn.dataset.messageId) {
                for (var k = 0; k < items.length; k++) {
                  if (items[k].id === btn.dataset.messageId) { item = items[k]; break }
                }
              }
              if (!item) item = pickItem(bubble, items, used, i)
              if (!item) continue
              used[item.id] = true
              if (!btn) {
                btn = document.createElement('button')
                btn.type = 'button'
                btn.className = 'ms-recall-btn'
                btn.addEventListener('click', onRecallClick)
                var actions = bubble.querySelector('[class*="actions"]') || bubble
                actions.appendChild(btn)
              }
              btn.dataset.messageId = item.id
              if (btn.dataset.done === '1') continue
              if (!seenAt[item.id]) seenAt[item.id] = Date.now()
              var secs = Math.max(0, Math.floor((Date.now() - seenAt[item.id]) / 1000))
              var label = '撤回 · ' + secs + 's'
              if (btn.textContent !== label) btn.textContent = label
              btn.title = '撤回（agent 尚未读取；已等待 ' + secs + ' 秒）'
            }
            // 已从待处理队列消失 = 被读取
            var all = scope.querySelectorAll('[data-pending-steering] .ms-recall-btn')
            for (var m = 0; m < all.length; m++) {
              var b = all[m]
              if (b.dataset.done === '1') continue
              var alive = false
              for (var n = 0; n < items.length; n++) {
                if (items[n].id === b.dataset.messageId) { alive = true; break }
              }
              if (!alive) {
                b.dataset.done = '1'
                b.disabled = true
                b.textContent = '已读取'
                b.title = '已被 agent 读取，无法撤回'
              }
            }
          }

          var onRecallClick = function (ev) {
            var btn = ev.currentTarget
            var messageId = btn.dataset.messageId
            var scope = scopeEl()
            var sid = sessionIdFor(scope)
            if (!messageId || !sid) return
            btn.disabled = true
            fetch(API_PATH + '/recall', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ sessionId: sid, messageId: messageId })
            })
              .then(function (r) { return r.json() })
              .then(function (res) {
                if (res && res.ok && res.recalled) {
                  btn.dataset.done = '1'
                  btn.textContent = '已撤回'
                  btn.title = '已从等待队列撤回'
                  if (res.text) {
                    try {
                      window.dispatchEvent(new CustomEvent('dsh-improved-inline-edit:recalled', { detail: { text: res.text } }))
                    } catch (e) { /* 忽略 */ }
                  }
                } else {
                  btn.dataset.done = '1'
                  btn.textContent = '已读取'
                  btn.title = '已被 agent 读取，无法撤回'
                }
              })
              .catch(function () { btn.disabled = false })
          }

          var tick = function () {
            if (!document.querySelector('.ms-wrap')) return
            var scope = scopeEl()
            var sid = sessionIdFor(scope)
            if (!sid || inFlight) return
            inFlight = true
            fetch(API_PATH + '/pending?sessionId=' + encodeURIComponent(sid))
              .then(function (r) { return r.json() })
              .then(function (res) {
                inFlight = false
                if (!res || !res.ok) return
                var items = Array.isArray(res.items) ? res.items : []
                if (!items.length && Array.isArray(res.pending)) {
                  items = res.pending.map(function (id) { return { id: id, text: '' } })
                }
                attach(scope, items)
              })
              .catch(function () { inFlight = false })
          }

          var schedule = function () {
            if (scheduled) return
            scheduled = setTimeout(function () {
              scheduled = 0
              tick()
            }, 250)
          }

          // 只对「会话区域」的变动做防抖刷新；我们自己写按钮文字不算
          var mo = new MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
              var target = records[i].target
              var el = target && target.nodeType === 3 ? target.parentElement : target
              if (el && el.closest && (el.closest('.ms-wrap') || el.closest('.ms-panel') || el.closest('.ms-recall-btn'))) continue
              schedule()
              return
            }
          })
          if (document.body) mo.observe(document.body, { childList: true, subtree: true })
          var tid = setInterval(tick, 2000)
          tick()
          return function () {
            if (mo) mo.disconnect()
            if (scheduled) clearTimeout(scheduled)
            clearInterval(tid)
          }
        }, 'dsh-improved-inline-edit: recall buttons')
      }

      exports.steerDock = SteerDock
      exports.inject = inject
      exports.apply = apply

      return module.exports
    }
  })
}
