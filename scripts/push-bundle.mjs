/**
 * 把 src/data 打成一份「实时内容包」推到 GitHub 仓库根目录的 live-bundle.json。
 *
 * raw.githubusercontent.com 对任意域名开放 CORS（access-control-allow-origin: *），
 * 所以站点启动时可以直接 fetch 这份文件，不需要云服务凭据、不需要每天重新发布。
 * 日报/周报任务在 push:content（写云端数据库，供旧站）之后执行本脚本，
 * 两个站点就都能「打开即最新」。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DATA = join(ROOT, 'src', 'data')
const REPO = 'KiboZ-0716/KIBODAY'
const PATH = 'live-bundle.json'
const RAW = `https://raw.githubusercontent.com/${REPO}/main/${PATH}`
const API = `https://api.github.com/repos/${REPO}/contents/${PATH}`

let fileToken = ''
try {
  fileToken = readFileSync(join(ROOT, '.gh_token'), 'utf8').trim()
} catch {
  /* 没有本地 token 文件，用参数或环境变量 */
}
const token =
  process.env.GITHUB_TOKEN ||
  (process.argv.find((a) => a.startsWith('--token=')) ?? '').slice('--token='.length) ||
  fileToken
if (!token) {
  console.error('缺少 GitHub token：用 --token=xxx 或环境变量 GITHUB_TOKEN')
  process.exit(1)
}

const read = (name, fallback) => {
  try {
    return JSON.parse(readFileSync(join(DATA, name), 'utf8'))
  } catch {
    return fallback
  }
}
const issues = readdirSync(join(DATA, 'issues'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => read(`issues/${f}`, null))
  .filter(Boolean)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)))
if (!issues.length) {
  console.error('src/data/issues 为空，拒绝推送空包')
  process.exit(1)
}

const bundle = {
  version: 2,
  generatedAt: new Date().toISOString(),
  issues,
  storylines: read('storylines.json', { storylines: [] }).storylines ?? [],
  topics: read('topics.json', { topics: [] }).topics ?? [],
  weekly: read('weekly.json', null),
  reports: read('reports.json', { reports: [] }).reports ?? [],
}

const body = JSON.stringify(bundle)
writeFileSync(join(ROOT, 'live-bundle.json'), body, 'utf8')

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'User-Agent': 'kib0-publisher',
}

let sha
const current = await fetch(API, { headers })
if (current.ok) {
  const j = await current.json()
  sha = j.sha
} else if (current.status !== 404) {
  console.error(`查询 ${PATH} 失败 HTTP ${current.status}: ${(await current.text()).slice(0, 200)}`)
  process.exit(1)
}

const res = await fetch(API, {
  method: 'PUT',
  headers,
  body: JSON.stringify({
    message: `chore: 内容包 ${issues[0].date}（${issues.length} 期）`,
    content: Buffer.from(body).toString('base64'),
    ...(sha ? { sha } : {}),
    branch: 'main',
  }),
})
const text = await res.text()
if (!res.ok) {
  console.error(`推送内容包失败 HTTP ${res.status}: ${text.slice(0, 300)}`)
  process.exit(1)
}
console.log(`已推送实时内容包：${issues.length} 期（最新 ${issues[0].date}）、${bundle.storylines.length} 个专题、${Math.round(body.length / 1024)} KB`)
console.log(`读取地址：${RAW}`)
