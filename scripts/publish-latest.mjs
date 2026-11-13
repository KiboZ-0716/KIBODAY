/**
 * 一体化发布：拉最新内容包 → 对齐 src/data → 构建 → 发布站点 → 校验线上期次。
 *
 * 与定时任务几点跑完全解耦：这条命令拿到的永远是「当下仓库里的最新包」。
 * 过去站点同步 09:00 先跑、内容包 09:57 才推上去，发布出去的必然是隔夜一期；
 * 现在任何时刻执行，都会先把包拉下来再构建，且结尾校验线上同源包期次，
 * 校验不过直接失败，不允许「发布成功但读者看到旧内容」。
 *
 * 用法：
 *   node scripts/publish-latest.mjs                # 立即发布当下最新包
 *   node scripts/publish-latest.mjs --wait=15      # 若包还不是今天，最多等 15 分钟
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = process.cwd()
const REPO = 'KiboZ-0716/KIBODAY'
// 按「内容包最后一次提交」锁定，源码推送不会扰动这条地址
const BUNDLE_COMMIT_API = `https://api.github.com/repos/${REPO}/commits?path=live-bundle.json&per_page=1`
const HOST = 'a564b245be247abf2.app.workbuddy.host'
const SHARECODE = '2UZTFZ4OPU'
const PUBLISH_JS = '/root/.codebuddy/skills/sites/scripts/publish.js'

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const eq = a.indexOf('=')
    return eq > 0 ? [a.slice(2, eq), a.slice(eq + 1)] : [a.slice(2), true]
  }),
)
const waitMinutes = Number(argv.wait ?? 0)
const token =
  typeof argv.token === 'string' ? argv.token : process.env.GITHUB_TOKEN || ''
const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

async function getJson(url, timeoutMs, extraHeaders = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    // Node fetch 默认 UA 会被 GitHub API 判 403，必须显式带
    headers: { 'User-Agent': 'kib0-publisher', ...extraHeaders },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return res.json()
}

function githubJson(url, timeoutMs) {
  return getJson(url, timeoutMs, {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  })
}

async function latestBundle() {
  const head = await githubJson(BUNDLE_COMMIT_API, 20000)
  const sha = Array.isArray(head) ? head[0]?.sha : head?.sha
  if (!sha) throw new Error('拿不到内容包的最后一次 commit sha')

  // 两条通道互为备用：CDN 偶尔抖动/超时时，GitHub API（带 token）仍能拿到同一份包。
  const fetchers = [
    async () => {
      // @main 有 12 小时 CDN 缓存会串期；@commit 永久缓存且随每次推包换地址
      const url = `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/live-bundle.json`
      const res = await fetch(url, {
        signal: AbortSignal.timeout(45000),
        headers: { 'User-Agent': 'kib0-publisher' },
      })
      if (!res.ok) throw new Error(`CDN HTTP ${res.status}`)
      return { bundle: await res.json(), from: 'cdn' }
    },
    async () => {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/contents/live-bundle.json?ref=main`,
        {
          headers: {
            Accept: 'application/vnd.github.raw+json',
            'User-Agent': 'kib0-publisher',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: AbortSignal.timeout(90000),
        },
      )
      if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
      return { bundle: await res.json(), from: 'api' }
    },
  ]

  for (const run of fetchers) {
    try {
      const { bundle, from } = await run()
      if (Array.isArray(bundle?.issues) && bundle.issues.length > 0) {
        console.log(`[发布] 内容包来源=${from} · 最新一期 ${bundle.issues[0].date}`)
        return bundle
      }
    } catch (error) {
      console.log(`[发布] 通道失败，换下一条：${error.message}`)
    }
  }
  throw new Error('所有内容包通道都取不到包')
}

const stamp = (b) => `${b.issues?.[0]?.date ?? ''}|${b.generatedAt ?? ''}`

let bundle = await latestBundle()
console.log(`[发布] 远端内容包：最新一期 ${bundle.issues[0].date}（${bundle.generatedAt ?? '无时间'}）`)

if (waitMinutes > 0) {
  const deadline = Date.now() + waitMinutes * 60000
  while (bundle.issues[0].date < today && Date.now() < deadline) {
    console.log(`[发布] 今日 ${today} 的包尚未就绪，2 分钟后重试…`)
    await new Promise((r) => setTimeout(r, 120000))
    bundle = await latestBundle()
  }
  if (bundle.issues[0].date < today) {
    console.log(`[发布] 等待结束仍无今日包，按现有最新一期 ${bundle.issues[0].date} 发布（不虚构内容）`)
  }
}

// 只允许前进，绝不让旧包覆盖本地较新的包
const localPath = join(ROOT, 'live-bundle.json')
let local = null
try {
  local = JSON.parse(readFileSync(localPath, 'utf8'))
} catch {
  // 本地缺失或损坏，直接用远端包
}
if (!local || stamp(bundle) > stamp(local)) {
  writeFileSync(localPath, JSON.stringify(bundle), 'utf8')
  console.log(`[发布] 已用远端包更新 live-bundle.json · ${bundle.issues[0].date}`)
} else {
  console.log(`[发布] 本地包不比远端旧，沿用本地 · ${local.issues[0].date}`)
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' })

run('node', ['scripts/sync-live.mjs'])
run('npm', ['run', 'build'])

const publishOut = execFileSync(
  'node',
  [PUBLISH_JS, '--dir', join(ROOT, 'dist'), '--language', 'static', '--install-cmd', ''],
  { cwd: ROOT, encoding: 'utf8' },
)
const lines = publishOut.trim().split('\n').filter(Boolean)
let result
try {
  result = JSON.parse(lines[lines.length - 1])
} catch {
  throw new Error(`发布输出无法解析：${publishOut.slice(-500)}`)
}
if (result.verified !== true) throw new Error(`发布未验证：${publishOut.slice(-500)}`)

// 结尾硬校验：线上同源包必须就是刚发布的这一期，否则等于没修好
const checkUrl = `https://${HOST}/live-bundle.json?sharecode=${SHARECODE}&t=${Date.now()}`
const online = await getJson(checkUrl, 40000)
const onlineDate = online?.issues?.[0]?.date
if (onlineDate !== bundle.issues[0].date) {
  throw new Error(`线上同源包 ${onlineDate} != 内容包 ${bundle.issues[0].date}，发布链路异常`)
}

console.log(
  `[发布完成] 线上同源包 ${onlineDate} == 内容包 ${bundle.issues[0].date} · ` +
    `shareLink=${result.shareLink} · verified=true`,
)
