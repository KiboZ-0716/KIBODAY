import path from 'node:path'
import { ROOT, readJson, writeJson, listJson } from '../lib.mjs'

/**
 * AI 周报阶段：把 content/weekly/<ISO周>.json 编成站点数据。
 *
 * 周报是独立刊物（News 日报之外的第二本），定位为「给产品经理和项目经理的 AI 行业周报」。
 * 内容来源与日报一致：只采信公开报道，事实、分析、观点分栏标注，每条深读都给出可核对的来源链接。
 * 管线不做创作，只做校验、排序与派生统计——缺字段直接报错，绝不静默填充。
 */

const REQUIRED = [
  'id',
  'no',
  'label',
  'period',
  'publishedAt',
  'headline',
  'thesis',
  'overview',
  'deepDives',
  'shipList',
  'trends',
  'checklists',
  'method',
  'sources',
]

function assertIssue(issue, file) {
  const missing = REQUIRED.filter((key) => issue[key] === undefined || issue[key] === null)
  if (missing.length) {
    throw new Error(`周报 ${file} 缺少字段：${missing.join('、')}`)
  }
  for (const key of ['copy', 'chips', 'takeaway', 'numbers']) {
    if (!issue.overview[key]) throw new Error(`周报 ${issue.id} 的 overview 缺少 ${key}`)
  }
  if (!issue.deepDives.length) throw new Error(`周报 ${issue.id} 没有深读条目`)
  for (const item of issue.deepDives) {
    for (const key of ['no', 'category', 'title', 'fact', 'analysis', 'pm', 'project', 'action']) {
      if (!item[key]) throw new Error(`周报 ${issue.id} 的深读 ${item.no ?? '?'} 缺少 ${key}`)
    }
    if (!item.sources?.length) throw new Error(`周报 ${issue.id} 的深读 ${item.no} 没有来源`)
  }
  for (const item of issue.shipList) {
    if (!item.name || !item.meaning) throw new Error(`周报 ${issue.id} 的速览条目字段不完整`)
  }
  for (const item of issue.trends) {
    if (!item.title || !item.body) throw new Error(`周报 ${issue.id} 的趋势判断字段不完整`)
  }
  if (!issue.checklists.pm?.length || !issue.checklists.project?.length) {
    throw new Error(`周报 ${issue.id} 的行动清单不完整`)
  }
}

export function buildWeekly() {
  const DIR = path.join(ROOT, 'content', 'weekly')
  const files = listJson(DIR)
  if (!files.length) {
    console.log('  AI 周报：content/weekly 为空，跳过')
    return null
  }

  const issues = files.map((file) => {
    const issue = readJson(file)
    assertIssue(issue, path.basename(file))
    return {
      ...issue,
      stats: {
        deepDives: issue.deepDives.length,
        ships: issue.shipList.length,
        trends: issue.trends.length,
        sources: issue.sources.length,
      },
    }
  })

  issues.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))

  const current = issues[0]
  const archive = issues.map((issue) => ({
    id: issue.id,
    no: issue.no,
    label: issue.label,
    period: issue.period,
    headline: issue.headline,
    publishedAt: issue.publishedAt,
    isCurrent: issue.id === current.id,
    to: issue.id === current.id ? '/ai-weekly' : `/ai-weekly/${issue.id}`,
  }))

  writeJson(path.join(ROOT, 'src', 'data', 'weekly.json'), {
    title: 'K!B0 AI 周报',
    tagline: '把一周的 AI 行业变化，转成产品经理与项目经理的下一步行动。',
    cadence: '每周五 08:30 更新',
    promptPath: 'content/prompts/weekly-brief.md',
    generatedAt: new Date().toISOString(),
    current,
    archive,
    issues,
  })

  console.log(`  AI 周报 ${issues.length} 期 · 本期 ${current.id}（${current.period}）· 深读 ${current.deepDives.length} 条 · 速览 ${current.shipList.length} 项`)
  return { current, archive, issues }
}
