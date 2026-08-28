// dsh-improved-inline-edit -- client 半部，基础版。
// 输入条：静态标签 + 单行输入框 + 发送按钮，fetch 走 host API。
if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({
    id: 'dsh-improved-inline-edit',
    factory: function (require) {
      'use strict'
      var module = { exports: {} }
      var exports = module.exports
      Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

      var React = require('react')
      var API_PATH = '/dsh-improved-inline-edit/api'

      var CSS = [
        '.ms-wrap{box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width,780px);margin:0 auto;}',
        '.ms-row{display:flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);font-size:13px;}',
        '.ms-label{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:12px;}',
        '.ms-input{flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;line-height:1.5;padding:0;}',
        '.ms-input::placeholder{color:var(--dsw-alias-label-secondary);}',
        '.ms-btn{flex:none;width:26px;height:26px;border:none;background:var(--dsw-alias-state-warn-primary);cursor:pointer;color:#fff;font-size:14px;line-height:1;padding:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;}',
        '.ms-btn:hover:not(:disabled){filter:brightness(1.15);}',
        '.ms-btn:disabled{opacity:.5;cursor:default;}',
        '.ms-arrow{display:inline-flex;color:#fff;}',
      ].join('')

      function SteerDock(props) {
        var session = props.session
        var sessionId = props.sessionId || (session && session.sessionId)

        var draftState = React.useState('')
        var draft = draftState[0]
        var setDraft = draftState[1]

        var send = function () {
          var text = draft.trim()
          if (!text || !sessionId) return
          fetch(API_PATH + '/steer', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId, text: text }),
          }).then(function () { setDraft('') })
        }
        var onKeyDown = function (e) { if (e.key === 'Enter') send() }

        return React.createElement('div', { className: 'ms-wrap' },
          React.createElement('div', { className: 'ms-row' },
            React.createElement('span', { className: 'ms-label' }, '⚡ 修改要求'),
            React.createElement('input', {
              className: 'ms-input',
              value: draft,
              onChange: function (e) { setDraft(e.target.value) },
              onKeyDown: onKeyDown,
              placeholder: '输入修改要求，按 Enter 或点 ➤ 发送…',
            }),
            React.createElement('button', {
              className: 'ms-btn',
              disabled: !draft.trim(),
              onClick: send,
              title: '发送修改要求',
            }, React.createElement('span', { className: 'ms-arrow' }, '➤')),
          ),
        )
      }

      exports.steerDock = SteerDock
      exports.inject = ['slots']

      function apply(ctx) {
        var slots = ctx.slots
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
      }

      exports.apply = apply
      return module.exports
    },
  })
}