// CDP 全页截图（支持设备模拟）
// 用法: node scripts/shot.mjs <url> <width> <out.png> [scale]
const url = process.argv[2]
const width = Number(process.argv[3] || 1440)
const out = process.argv[4]
const scale = Number(process.argv[5] || 1)
const port = 9334
const mobile = width < 760

const fs = await import('node:fs')
const { spawn } = await import('node:child_process')
const chrome = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe'

const child = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  '--user-data-dir=' + process.cwd() + '/.chrome-shot',
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
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width, height: 900, deviceScaleFactor: scale, mobile,
})
await send('Page.navigate', { url })
await sleep(3200)

const r = await send('Runtime.evaluate', {
  expression: 'JSON.stringify({h: Math.min(document.documentElement.scrollHeight, 20000)})',
  returnByValue: true,
})
const h = JSON.parse(r.result.result.value).h

const shot = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  clip: { x: 0, y: 0, width, height: h, scale: 1 },
})
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'))
console.log(`${out} ${width}x${h}`)
ws.close()
child.kill()
