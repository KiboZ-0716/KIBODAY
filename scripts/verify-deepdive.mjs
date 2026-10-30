// 验证报告页是否真的调用模型并产出内容
// 用法: node scripts/verify-deepdive.mjs <reportId>
const id = process.argv[2] || 'r1030-qh-1'
const base =
  process.env.SITE_BASE ||
  'https://a564b245be247abf2.app.workbuddy.host/?sharecode=2UZTFZ4OPU'
const port = 9335

const { spawn } = await import('node:child_process')
const chrome =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + process.cwd() + '/.chrome-verify',
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
if (!target) {
  child.kill()
  throw new Error('chrome 未就绪')
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
await send('Page.navigate', { url: `${base}#/report/${id}` })

const probe = `(() => {
  const t = document.body.innerText
  const sections = [...document.querySelectorAll('.deep-section h2')].map(h => h.textContent)
  const bottom = [...document.querySelectorAll('.bottom-line li')].map(l => l.textContent)
  const state = document.querySelector('.report-gen b')?.textContent || ''
  const meta = document.querySelector('.report-gen > span')?.textContent || ''
  const err = document.querySelector('.generating-state.is-error p')?.textContent || ''
  return JSON.stringify({ state, meta, err, sections, bottom })
})()`

let last = null
for (let i = 0; i < 60; i++) {
  await sleep(2500)
  const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true })
  last = JSON.parse(r.result.result.value)
  process.stdout.write(`[${i * 2.5}s] ${last.state} | ${last.meta.slice(0, 60)}\n`)
  if (last.sections.length > 0 || last.err) break
}

console.log('\n===== 结果 =====')
console.log('状态:', last.state)
console.log('说明:', last.meta)
if (last.err) console.log('错误:', last.err)
console.log('三句话结论:', last.bottom)
console.log('小节:', last.sections)
ws.close()
child.kill()
