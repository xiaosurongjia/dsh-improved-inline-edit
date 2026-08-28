# ⚡ dsh-improved-inline-edit

> **Your agent is halfway through a task — and you just had a thought. Don't stop it. Just talk.**

Ever been watching DSH (DeepSeek Harness) grind through a long task and thought: *"Wait, wrong direction!"* *"Skip that, check this first!"* *"Change this part, then continue!"* — and then had to either wait it out, or kill the conversation and lose all progress?

**dsh-improved-inline-edit** exists for exactly that moment. It makes **"interrupt"** and **"continue"** compatible: while the agent is running, a **steer strip** appears above the composer. Type your request, hit send, and the message is **seamlessly injected into the agent's next decision step** via the official `agent.steer()` mechanism — the conversation keeps going, the task keeps running, nothing is lost.

---

## ✨ Feature Highlights

| Feature | What it does |
| --- | --- |
| 🎯 **True mid-run steering** | Not a new message that derails the flow — injected straight into the **running agent's next decision** (official `agent.steer()`), so it continues *with your request in mind* |
| 👻 **Visible only while running** | The strip appears only while the agent is working; it **auto-disappears** when the run ends — zero UI clutter when idle |
| 📝 **Auto-growing input** | A textarea that **wraps and grows with your content** (capped at 140px) — long requests are never truncated to one line, typing feels natural |
| 🐋 **100-phrase Deep pool** | Status copy rotates as the agent works (dsh-deep-verbs style): *Deep diving… Deep fermenting…* — click to **toggle EN/ZH**. Even busywork can be playful |
| 📐 **Pixel-aligned with the composer** | The strip is the **exact same width as the bottom composer**, left-aligned — three clean layers: status / steer / main input |
| 🔘 **A send button that makes room** | Theme-brand solid round button + white ➤ (rotated 90° up). After sending it **slides left smoothly** to make room for the ✓, then glides back 2 s later |
| 🪶 **Zero intrusion** | Touches no `@deepseek-ai/dsh-*` source; assembled via standard bundle patch + slot injection, clean to remove |

---

## 🖥 What it looks like

```
[⚡ Deep diving...] [─────────────────────────────] [➤]
        ↑ status copy         ↑ steer input           ↑ theme-brand round button
   (click to toggle EN/ZH)  (grows with content)   (slides left after send)
```

- **Left**: rotating deep-status phrase — click to switch language
- **Middle**: a textarea that wraps and auto-grows with multi-line content
- **Right**: the send button — after sending, a ✓ (green) / ✗ (red) appears to its right as the button slides left, then returns

---

## 🚀 Install

```powershell
# Run inside the plugin directory (auto-detects the profile)
.\install.ps1

# Or specify manually
.\install.ps1 -PluginSource <plugin dir> -ProfileDir <profile dir>
```

The installer:
1. **Junction-links** the package into the profile's `node_modules` (same convention as other dsh plugins — saves disk space)
2. Registers one `insert` row in the profile's `cordis.patch.yml`
3. Verifies `exports['./client']` resolves through the DSH client module system

> ⚠️ After installing, **fully restart DSH** (end the process, not close the window), then refresh the page.

## 🕹 Usage

1. Let an agent run (send a message)
2. The steer strip appears above the composer
3. Type your request (multi-line supported), press **Enter** or click **➤**
4. The agent continues on your request — the conversation never stopped

---

## ⚙️ How it works

```
┌───────────────── Browser (client) ─────────────────┐
│  conversation.input.dock slot                     │
│  ┌────────────────────────────────────────────┐   │
│  │ ⚡ Deep diving…  [input]  [➤] [√]          │   │
│  └────────────────────────────────────────────┘   │
│        │ same-origin fetch POST /dsh-improved-inline-edit/api/steer
└────────▼───────────────────────────────────────────┘
┌────────────── Host (Node) ─────────────────────────┐
│  ctx.webServer route → ctx.agents.get(sessionId)   │
│       → agent.steer(userMessage)                   │
│  (injects into the running agent's next-step inbox)│
└────────────────────────────────────────────────────┘
```

- **Host half** (`index.js`): registers `POST /dsh-improved-inline-edit/api/steer`, builds a standard user message, and calls `agent.steer()`.
- **Client half** (`client.js`): registers the strip on the `conversation.input.dock` slot and calls the host API via same-origin `fetch`.

---

## 📊 Honest take: strengths & limitations

### ✅ Strengths
- **No interruption, no lost progress**: the fundamental difference from "stop and start over" — invaluable for long-running tasks
- **Takes effect immediately**: `steer()` drops the message into the agent's decision queue, so it's seen on the very next step
- **Zero learning curve**: it's just an input box — if you can type, you can steer
- **Lightweight & auditable**: pure JS, no build deps, no official-source edits; `index.js` + `client.js` together are under 400 lines

### ⚠️ Limitations (be aware)
- **Requires a running agent**: the strip only appears while `session.running` — no entry point when idle (a deliberate design choice for zero UI clutter; if you'd like an always-visible mode, open an issue!)
- **Depends on `steer()` semantics**: what's injected is a *user message*; whether the agent adopts it depends on the model and the current task context — it provides **steering/interruption**, not a hard override
- **Targets DSH Web**: the client uses the Web slot system (`dsh.client.platform: web`)
- **Browser API dependency**: client uses browser globals (`fetch`, `localStorage`, …); no non-browser host support

---

## 🤝 Why it deserves a ⭐

- **Solves a real pain**: anyone running long tasks on DSH has hit the "want to interrupt but can't stop" wall
- **Obsessed with detail**: silky button animation, auto-growing input, 100 playful phrases — small plugin, polished feel
- **Clean & auditable**: clear two-half structure, readable and reviewable
- **Actively maintained**: issues & PRs welcome — roadmap includes an always-visible mode, customizable phrase pools, and multi-session support

If you find it useful, **a ⭐ is the best encouragement** 🚀

## License

[MIT](./LICENSE)
