#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, writeJson, listJson } from './lib.mjs'
import { loadSnapshot, listSnapshotDates } from './sources/snapshot.mjs'
import { loadFeeds } from './sources/rss.mjs'
import { normalize } from './stages/normalize.mjs'
import { cluster } from './stages/cluster.mjs'
import { verify } from './stages/verify.mjs'
import { compose } from './stages/compose.mjs'
import { buildAssets } from './stages/assets.mjs'
import { buildReports } from './stages/report.mjs'
import { buildTopics } from './stages/topics.mjs'
import { buildWeekly } from './stages/weekly.mjs'

const args = parseArgs(process.argv.slice(2))
const CONTENT = path.join(ROOT, 'content')
const ISSUE_DIR = path.join(ROOT, 'src', 'data', 'issues')

async function main() {
  const assets = await buildAssets({ force: args.force })
  const storylines = readJson(path.join(CONTENT, 'storylines.json'))
  const dates = args.all ? listSnapshotDates() : [args.date]
  if (!dates[0]) throw new Error('用法：node pipeline/run.mjs --all 或 --date 2026-10-30')
  dates.sort()

  const allTopics = []

  console.log(`\n▶ K!B0 出品管线 · ${dates.length} 期 · 数据源=${args.source}`)

  for (const [index, date] of dates.entries()) {
    const brief = readJson(path.join(CONTENT, 'briefs', `${date}.json`))
    const source = await load(args.source, date)

    const { articles, merged } = normalize(source.articles)
    const events = cluster(articles)
    const verified = verify(events)

    console.log(
      `\n· ${date}  抓取 ${source.articles.length} → 去重 ${articles.length}（合并 ${merged}）→ 事件 ${events.length}（隐藏 ${verified.hiddenCount}）`,
    )

    const issue = compose({
      source: { ...source, merged, verified },
      brief,
      assets,
      no: issueNo(date),
    })

    writeJson(path.join(ISSUE_DIR, `${date}.json`), issue)
    console.log(`  写入 src/data/issues/${date}.json  可信度 ${issue.quality.score}`)

    if (args.all) {
      allTopics.push(...buildTopics({ issue, articles }))
    }
  }

  if (args.all) {
    writeJson(path.join(ROOT, 'src', 'data', 'topics.json'), { topics: allTopics })
    console.log(`  写入 src/data/topics.json  可深挖条目 ${allTopics.length} 条`)
  }

  writeJson(path.join(ROOT, 'src', 'data', 'storylines.json'), storylines)
  buildReports({ dates })
  buildWeekly()
  retain(path.join(CONTENT, 'raw'))
  retain(path.join(CONTENT, 'briefs'))
  const all = listJson(ISSUE_DIR).map((f) => readJson(f))
  console.log(`\n✔ 完成：${all.length} 期在库，最新一期 NO.${String(all.length).padStart(3, '0')}`)
}

async function load(kind, date) {
  if (kind === 'rss') {
    return loadFeeds({ date, windowStart: '00:00', windowEnd: '09:30' })
  }
  return loadSnapshot(date)
}

function parseArgs(argv) {
  const out = { source: 'snapshot', all: false, force: false, date: null }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--all') out.all = true
    else if (token === '--force') out.force = true
    else if (token === '--date') out.date = argv[++i]
    else if (token === '--source') out.source = argv[++i]
  }
  if (!out.all && !out.date) {
    const today = new Date().toISOString().slice(0, 10)
    out.date = fs.existsSync(path.join(CONTENT, 'raw', `${today}.json`))
      ? today
      : listSnapshotDates().pop()
  }
  return out
}

// 期号一旦发布就不许变：快照按保留策略归档后，若按文件序号重新编号，
// 会导致 /issue/N 链接与历史报告的 issueNo 全部漂移。这里用持久化索引固定期号。
const INDEX_FILE = path.join(ROOT, 'content', 'issue-index.json')

function issueNo(date) {
  const index = fs.existsSync(INDEX_FILE) ? readJson(INDEX_FILE) : {}
  if (!index[date]) {
    const max = Object.values(index).reduce((a, b) => Math.max(a, b), 0)
    const pending = [date, ...Object.keys(index)]
      .filter((d) => !index[d])
      .sort()
    for (const d of pending) index[d] = max + 1
    writeJson(INDEX_FILE, index)
  }
  return index[date]
}

// 保留策略：content/raw 与 content/briefs 只保留最近 7 期，更早的移入各自目录的 _archive/
function retain(dir, keep = 7) {
  const files = listJson(dir)
  if (files.length <= keep) return
  const archive = path.join(path.dirname(dir), '_archive')
  fs.mkdirSync(archive, { recursive: true })
  for (const f of files.slice(0, files.length - keep)) {
    fs.renameSync(f, path.join(archive, path.basename(f)))
    console.log(`  · 归档 ${path.relative(ROOT, f)}`)
  }
}

main().catch((err) => {
  console.error(`\n✖ 出品失败：${err.message}`)
  process.exit(1)
})
