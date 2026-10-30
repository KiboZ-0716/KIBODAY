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
      no: index + 1,
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

main().catch((err) => {
  console.error(`\n✖ 出品失败：${err.message}`)
  process.exit(1)
})
