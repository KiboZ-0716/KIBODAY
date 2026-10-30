// 用 CDP 检查页面横向溢出元素
// 用法: node scripts/audit-overflow.mjs <url> [viewportWidth]
const url = process.argv[2] || 'http://127.0.0.1:4173/'
const width = Number(process.argv[3] || 390)
const port = 9333

const { spawn } = await import('node:child_process')
const chrome = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe'

const child = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--window-size=${width},900`,
  '--user-data-dir=' + process.cwd() + '/.chrome-audit',
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let target
for (let i = 0; i < 40; i++) {
  await sleep(250)
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    target = list.find((t) => t.type === 'page')
    if (target) break
  } catch {}
}
if (!target) { child.kill(); throw new Error('chrome 未就绪') }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width, height: 900, deviceScaleFactor: 1, mobile: true,
})
await send('Page.navigate', { url })
await sleep(3500)

const expr = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.right > vw + 1 || r.left < -1) {
      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className || '').toString().slice(0, 60),
        left: Math.round(r.left),
        right: Math.round(r.right),
        w: Math.round(r.width),
        text: (el.textContent || '').trim().slice(0, 30),
      });
    }
  });
  return JSON.stringify({
    vw,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollW: document.body.scrollWidth,
    count: out.length,
    items: out.slice(0, 25),
  });
})()`

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
console.log(r.result?.result?.value || JSON.stringify(r))
ws.close()
child.kill()
