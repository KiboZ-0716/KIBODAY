// 诊断：监听页面发出的云服务请求与控制台错误
const id = process.argv[2] || 'r1030-qh-1'
const base = process.env.SITE_BASE || 'https://daily-hotspot-brief-88193.app.workbuddy.host/?sharecode=WCAFAHKWMG'
const port = 9336

const { spawn } = await import('node:child_process')
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + process.cwd() + '/.chrome-diag',
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
if (!target) { child.kill(); throw new Error('chrome 未就绪') }

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let seq = 0
const pending = new Map()
const requests = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  if (m.method === 'Network.requestWillBeSent') {
    requests.set(m.params.requestId, { url: m.params.request.url, method: m.params.request.method })
  }
  if (m.method === 'Network.responseReceived') {
    const r = requests.get(m.params.requestId)
    if (r) r.status = m.params.response.status
  }
  if (m.method === 'Network.loadingFinished') {
    const r = requests.get(m.params.requestId)
    if (r) r.done = true
  }
  if (m.method === 'Network.loadingFailed') {
    const r = requests.get(m.params.requestId)
    if (r) { r.failed = m.params.errorText; r.done = true }
  }
  if (m.method === 'Runtime.consoleAPICalled' || m.method === 'Runtime.exceptionThrown') {
    const text = m.method === 'Runtime.exceptionThrown'
      ? m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text
      : m.params.args?.map((a) => a.value ?? a.description).join(' ')
    if (text) console.log('[console]', String(text).slice(0, 300))
  }
}
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++seq; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })

await send('Network.enable')
await send('Runtime.enable')
await send('Page.enable')

// 直接在页面上下文里跑一次 SDK 调用，绕过 React 状态，便于定位
await send('Page.navigate', { url: `${base}#/issue/2` })
await sleep(4000)

console.log('--- 页面已加载，开始直接调用云服务 ---')
const probe = `(async () => {
  try {
    const mod = await import('/assets/' + [...document.querySelectorAll('script[type=module]')].map(s=>s.src.split('/assets/')[1])[0]);
    return JSON.stringify({ ok: false, note: 'module 方式不可用于直接调用' });
  } catch (e) { return JSON.stringify({ ok:false, err: String(e) }) }
})()`
const r0 = await send('Runtime.evaluate', { expression: probe, awaitPromise: true, returnByValue: true })
console.log('探针:', r0.result.result.value)

// 用 fetch 直接打模型列表接口，验证通道与 Origin 校验
const fetchProbe = `(async () => {
  const url = '/.cloud/llm/models';
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    const text = await res.text();
    return JSON.stringify({ status: res.status, body: text.slice(0, 400) });
  } catch (e) { return JSON.stringify({ err: String(e) }) }
})()`
const r1 = await send('Runtime.evaluate', { expression: fetchProbe, awaitPromise: true, returnByValue: true })
console.log('模型列表:', r1.result.result.value)

await send('Page.navigate', { url: `${base}#/report/${id}` })
await sleep(20000)

console.log('\n--- 请求清单 ---')
for (const r of requests.values()) {
  if (/\.cloud|llm|models/.test(r.url)) {
    console.log(`${r.method} ${r.status ?? 'pending'} ${r.failed ?? ''} ${r.url.slice(0, 120)} done=${!!r.done}`)
  }
}
ws.close()
child.kill()
