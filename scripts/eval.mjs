// 在页面上下文里执行一段 JS 并打印结果，顺带打印页面内的错误
// 用法: node scripts/eval.mjs <url> '<js 表达式（可 async）>'
const url = process.argv[2]
const expr = process.argv[3] || 'document.title'
const port = 9338

const { spawn } = await import('node:child_process')
const chrome =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const child = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${port}`,
    '--user-data-dir=' + process.cwd() + '/.chrome-eval',
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
const logs = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
    return
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    logs.push('EXCEPTION ' + String(d?.exception?.description || d?.text || '').slice(0, 500))
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    logs.push(
      'CONSOLE ' +
        (m.params.args || []).map((a) => a.value ?? a.description).join(' ').slice(0, 500),
    )
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
await send('Page.navigate', { url })
await sleep(6000)

const r = await send('Runtime.evaluate', {
  expression: `(async () => { ${expr} })()`,
  awaitPromise: true,
  returnByValue: true,
})
console.log(r.result.result?.value ?? JSON.stringify(r.result))
if (logs.length) console.log('--- 页面错误 ---\n' + logs.join('\n'))
ws.close()
child.kill()
