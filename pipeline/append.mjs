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
import { generateDeepReports } from '../scripts/deepgen.mjs'

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

  console.log(`\n▶ K!B0 增量出品 · ${args.weeklyOnly ? '仅周报' : date} · 在库 ${all.length} 期`)

  if (!args.weeklyOnly) {
    if (!date) throw new Error('找不到当日抓取快照，先写 content/raw/{日期}.json')
    const briefPath = path.join(CONTENT, 'briefs', `${date}.json`)
    if (!fs.existsSync(briefPath)) throw new Error(`缺少 ${briefPath}`)

    const assets = await buildAssets({ force: false })
    const brief = readJson(briefPath)
    const source = await loadSnapshot(date)
    const { articles, merged } = normalize(source.articles)
    const events = cluster(articles)
    const verified = verify(events, {
      pinnedIds: [brief.lead?.eventId, brief.analysis?.eventId],
    })
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

    // 深挖专题：出刊时真调模型，为当期所有可深挖条目（速览 + 属地）写完整专题。
    // 浏览器端实时调用受发布域名凭据 Origin 校验限制（403），所以把「调用模型」
    // 放在这一步：模型产物落 content/deep/{id}.json，读者点「深挖」直接看到。
    // 单条失败/超时自动降级保留已有稿，不影响整期出刊。
    await generateDeepReports({ date, concurrency: 3 })

    // 事件报告：buildReports 会整体覆盖，调用后把历史报告合并回来
    const oldReports = readJson(path.join(ROOT, 'src', 'data', 'reports.json'), { reports: [] }).reports ?? []
    const todayReports = buildReports({ dates: [date] })
    // 防降级：同 id 时保留更优版本——当天深读版覆盖旧稿，但当天若因模型失败
    // 只产出 outline 兜底版，而历史留有完整深读稿，则保留旧深读稿，
    // 避免「重出刊一次、质量掉一档」。
    const deepQuality = (r) => {
      const secs = (r?.sections ?? []).reduce((n, s) => n + (s?.paragraphs ?? []).join('').length, 0)
      return (r?.level === 'deep' ? 1000 : 0) + secs
    }
    const kept = todayReports.map((r) => {
      const old = oldReports.find((o) => o.id === r.id && o.date === date)
      if (old && deepQuality(old) > deepQuality(r)) {
        console.log(`  [报告] 保留历史更优稿：${r.id}（旧 deep ${deepQuality(old)} > 今 ${deepQuality(r)}）`)
        return old
      }
      return r
    })
    writeJson(path.join(ROOT, 'src', 'data', 'reports.json'), {
      promptId: 'deep-story',
      promptVersion: 'v1',
      promptPath: 'content/prompts/deep-story.md',
      generatedAt: new Date().toISOString(),
      reports: [...kept, ...oldReports.filter((r) => r.date !== date && !kept.some((k) => k.id === r.id))],
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
