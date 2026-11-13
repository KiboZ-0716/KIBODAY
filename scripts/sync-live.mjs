/**
 * 把根目录的实时内容包反向展开回 src/data。
 *
 * 事故根因之一（2026-11-13）：站点重新构建时 src/data/issues 还停在昨天，
 * 于是 JS 里内嵌的「构建期数据」就是旧一期 —— 首屏先渲染旧内容，
 * 读者一打开就看到隔夜报纸，哪怕远端内容包已经是最新的。
 *
 * 这份脚本保证「构建期数据」与「实时内容包」永远同一份，三处（构建期、
 * 同源 dist/live-bundle.json、远端仓库）不可能再互相倒退。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BUNDLE = join(ROOT, 'live-bundle.json')
const DATA = join(ROOT, 'src', 'data')
const ISSUES = join(DATA, 'issues')
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')

if (!existsSync(BUNDLE)) {
  console.error('[同步] 缺少 live-bundle.json：先拉取实时内容包')
  process.exit(1)
}

let bundle
try {
  bundle = JSON.parse(readFileSync(BUNDLE, 'utf8'))
} catch (error) {
  console.error('[同步] live-bundle.json 不是合法 JSON：', error.message)
  process.exit(1)
}

if (!Array.isArray(bundle.issues) || bundle.issues.length === 0) {
  console.error('[同步] 内容包里没有任何一期，拒绝展开')
  process.exit(1)
}

const sorted = [...bundle.issues].sort((a, b) => String(b.date).localeCompare(String(a.date)))
const latest = sorted[0].date
if (!/^\d{4}-\d{2}-\d{2}$/.test(latest)) {
  console.error(`[同步] 最新一期日期不合法：${latest}`)
  process.exit(1)
}
if (!Array.isArray(sorted[0].briefs) || sorted[0].briefs.length === 0) {
  console.error(`[同步] 最新一期 ${latest} 没有速览，拒绝用空壳覆盖 src/data`)
  process.exit(1)
}

mkdirSync(ISSUES, { recursive: true })
// 严格对齐滚动窗口：内容包里没有的旧期次文件删掉，避免构建期多出一期、
// 也避免 push:content 上传一份和内容包不一致的包
const keep = new Set(sorted.map((issue) => `${issue.date}.json`))
for (const file of readdirSync(ISSUES)) {
  if (file.endsWith('.json') && !keep.has(file)) unlinkSync(join(ISSUES, file))
}
for (const issue of sorted) {
  write(join(ISSUES, `${issue.date}.json`), issue)
}

write(join(DATA, 'storylines.json'), { storylines: bundle.storylines ?? [] })
write(join(DATA, 'topics.json'), { topics: bundle.topics ?? [] })
if (bundle.weekly && typeof bundle.weekly === 'object' && Object.keys(bundle.weekly).length) {
  write(join(DATA, 'weekly.json'), bundle.weekly)
}

const reportsPath = join(DATA, 'reports.json')
let meta = { promptId: '', promptVersion: '', promptPath: '', generatedAt: bundle.generatedAt ?? '' }
if (existsSync(reportsPath)) {
  try {
    const old = JSON.parse(readFileSync(reportsPath, 'utf8'))
    meta = {
      promptId: old.promptId ?? '',
      promptVersion: old.promptVersion ?? '',
      promptPath: old.promptPath ?? '',
      generatedAt: bundle.generatedAt ?? old.generatedAt ?? '',
    }
  } catch {
    // 旧文件损坏也不影响出刊，用默认元信息
  }
}
write(reportsPath, { ...meta, reports: bundle.reports ?? [] })

console.log(
  `[同步] src/data 已对齐实时内容包 · 最新一期 ${latest} · ${sorted.length} 期 · ` +
    `${bundle.storylines?.length ?? 0} 专题 · ${bundle.topics?.length ?? 0} 深挖索引`,
)
