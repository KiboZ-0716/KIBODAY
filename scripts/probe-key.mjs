// 探测：同一把 publishableKey 在新域名自己的 /.cloud 上是否被识别
// 用法: node scripts/probe-key.mjs <pageBase>
const base = process.argv[2]
const KEY =
  'wbpk_U6IarWrMqRm6vY3hw9TgUI_yJz5JfbIEEXxjgiuI57Rducv50rno1EQ'
const port = 9337

const { spawn } = await import('node:child_process')
const chrome =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + process.cwd() + '/.chrome-probe',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

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
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let seq = 0
const pending = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++seq
    pending.set(i, res)
    ws.send(JSON.stringify({ id: i, method, params }))
  })

await send('Page.enable')
await send('Runtime.enable')
await send('Page.navigate', { url: base })
await sleep(4000)

const expr = `(async () => {
  const out = {};
  try {
    const r1 = await fetch('/.cloud/llm/models', { headers: { 'x-wb-webapp-access-key': '${KEY}', 'Content-Type': 'application/json' } });
    out.withKey = { status: r1.status, body: (await r1.text()).slice(0, 240) };
  } catch (e) { out.withKey = { err: String(e) }; }
  try {
    const r2 = await fetch('/.cloud/llm/models', { headers: { 'Content-Type': 'application/json' } });
    out.noKey = { status: r2.status, body: (await r2.text()).slice(0, 200) };
  } catch (e) { out.noKey = { err: String(e) }; }
  out.origin = location.origin;
  return JSON.stringify(out);
})()`
const r = await send('Runtime.evaluate', {
  expression: expr,
  awaitPromise: true,
  returnByValue: true,
})
console.log(r.result.result.value)
ws.close()
child.kill()
