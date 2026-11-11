#!/usr/bin/env node
/**
 * 增量出品：只生成「今天这一期」，其余历史期次从 bootstrap 恢复的状态原样保留。
 *
 * 定时任务每次都在全新沙箱里执行，旧版 --all 会把所有期重编号、把周报和专题
 * 覆盖回仓库里的旧版本，导致「周报永远不更新」「点三卡没有专题」。
 * 本脚本改为：恢复 → 追加一期 → 合并索引/报告/周报/专题 → 裁剪最近 7 期。
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, writeJson, listJson } from './lib.mjs'
import { loadSnapshot, listSnapshotDates } from './sources/snapshot.mjs'
import { normalize } from './stages/normalize.mjs'
import { cluster } from './stages/cluster.mjs'
import { verify } from './stages/verify.mjs'
import { compose } from './stages/compose.mjs'
import { buildAssets } from './stages/assets.mjs'
import { buildReports } from './stages/report.mjs'
import { buildTopics } from './stages/topics.mjs'
import { buildWeekly } from './stages/weekly.mjs'
import { enrichStorylines } from '../scripts/enrich.mjs'

const CONTENT = path.join(ROOT, 'content')
const ISSUE_DIR = path.join(ROOT, 'src', 'data', 'issues')
const KEEP = 7

function parseArgs(argv) {
  const out = { date: null, weeklyOnly: false }
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--date') out.date = argv[++i]
    else if (argv[i] === '--weekly-only') out.weeklyOnly = true
  }
  return out
}

function existingIssues() {
  return listJson(ISSUE_DIR)
    .map((f) => readJson(f))
    .filter((i) => i && i.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const all = existingIssues()
  const maxNo = Math.max(0, ...all.map((i) => Number(i.no) || 0))
  const date =
    args.date ??
    (fs.existsSync(path.join(CONTENT, 'raw', `${new Date().toISOString().slice(0, 10)}.json`))
      ? new Date().toISOString().slice(0, 10)
      : listSnapshotDates().pop())

  console.log(`\n▶ K!B0 增量出品 · ${date} · 在库 ${all.length} 期`)

  if (!args.weeklyOnly) {
    if (!date) throw new Error('找不到当日抓取快照，先写 content/raw/{日期}.json')
    const briefPath = path.join(CONTENT, 'briefs', `${date}.json`)
    if (!fs.existsSync(briefPath)) throw new Error(`缺少 ${briefPath}`)

    const assets = await buildAssets({ force: false })
    const brief = readJson(briefPath)
    const source = await loadSnapshot(date)
    const { articles, merged } = normalize(source.articles)
    const events = cluster(articles)
    const verified = verify(events)
    const prev = all.find((i) => i.date === date)
    const no = prev?.no ?? maxNo + 1

    const issue = compose({ source: { ...source, merged, verified }, brief, assets, no })
    writeJson(path.join(ISSUE_DIR, `${date}.json`), issue)
    console.log(`  写入第 ${no} 期 ${date} · 可信度 ${issue.quality.score}`)

    // 深挖索引：保留历史，替换当天
    const oldTopics = readJson(path.join(ROOT, 'src', 'data', 'topics.json'), { topics: [] }).topics ?? []
    const newTopics = buildTopics({ issue, articles })
    writeJson(path.join(ROOT, 'src', 'data', 'topics.json'), {
      topics: [...newTopics, ...oldTopics.filter((t) => t.date !== date)],
    })

    // 事件报告：buildReports 会整体覆盖，调用后把历史报告合并回来
    const oldReports = readJson(path.join(ROOT, 'src', 'data', 'reports.json'), { reports: [] }).reports ?? []
    const todayReports = buildReports({ dates: [date] })
    writeJson(path.join(ROOT, 'src', 'data', 'reports.json'), {
      promptId: 'event-report',
      promptVersion: 'v1.2',
      promptPath: 'content/prompts/event-report.md',
      generatedAt: new Date().toISOString(),
      reports: [...todayReports, ...oldReports.filter((r) => r.date !== date)],
    })
  }

  // 周报与专题都基于恢复后的完整状态重新编排
  buildWeekly()
  enrichStorylines()

  // 只保留最近 KEEP 期，避免内容包无限膨胀
  const current = listJson(ISSUE_DIR)
    .map((f) => ({ file: f, data: readJson(f) }))
    .filter((x) => x.data?.date)
    .sort((a, b) => String(b.data.date).localeCompare(String(a.data.date)))
  for (const old of current.slice(KEEP)) fs.rmSync(old.file)
  console.log(`\n✔ 完成：${Math.min(current.length, KEEP)} 期在库，最新一期 NO.${current[0]?.data?.no ?? '-'} ${current[0]?.data?.date ?? ''}`)
}

main().catch((err) => {
  console.error(`\n✖ 增量出品失败：${err.message}`)
  process.exit(1)
})
