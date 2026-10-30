import type {
  Issue,
  Storyline,
  StorylineWithIssues,
  Brief,
  SideCard,
  Report,
  Topic,
  GeneratedReport,
  WeeklyData,
  WeeklyIssue,
  ContentBundle,
} from './types'
import storylinesJson from './storylines.json'
import reportsJson from './reports.json'
import topicsJson from './topics.json'
import weeklyJson from './weekly.json'

const modules = import.meta.glob<{ default: Issue }>('./issues/*.json', { eager: true })

/**
 * 数据集是「活绑定」：启动时若从云端拉到更新的内容包，会整体替换这里的数组。
 * 这样页面不用重新部署就能显示最新一期，构建期打进去的数据只作为兜底。
 */
export let issues: Issue[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => b.date.localeCompare(a.date))

export let latestIssue: Issue = issues[0]

const rawStorylines = (storylinesJson as { storylines: Storyline[] }).storylines

/* ---------- AI 周报 ---------- */

export let weekly: WeeklyData = weeklyJson as WeeklyData

/** 用云端内容包整体替换本地数据集（issues 必须已按日期倒序） */
export function applyBundle(bundle: ContentBundle) {
  if (!bundle?.issues?.length) return
  issues = bundle.issues
  latestIssue = issues[0]
  if (bundle.weekly) weekly = bundle.weekly
  if (bundle.topics?.length) topics = bundle.topics
  if (bundle.reports) reports = bundle.reports
  storylines = (bundle.storylines ?? []).map((storyline) => {
    const related = issues.filter((i) => i.storylineId === storyline.id)
    return {
      ...storyline,
      issueNos: related.map((i) => i.no),
      latestNo: related[0]?.no ?? latestIssue.no,
    }
  })
}

export function getWeekly(id?: string): WeeklyIssue {
  if (!id) return weekly.current
  return weekly.issues.find((i) => i.id === id) ?? weekly.current
}

export function getIssue(no: string | number): Issue | undefined {
  return issues.find((i) => i.no === Number(no))
}

export function getIssueNeighbours(no: number): { prev?: Issue; next?: Issue } {
  const index = issues.findIndex((i) => i.no === no)
  return {
    prev: issues[index + 1],
    next: issues[index - 1],
  }
}

export let storylines: StorylineWithIssues[] = rawStorylines.map((storyline) => {
  const related = issues.filter((i) => i.storylineId === storyline.id)
  return {
    ...storyline,
    issueNos: related.map((i) => i.no),
    latestNo: related[0]?.no ?? latestIssue.no,
  }
})

export function getStoryline(id: string): StorylineWithIssues | undefined {
  return storylines.find((s) => s.id === id)
}

export function storylineOf(issue: Issue): StorylineWithIssues | undefined {
  return issue.storylineId ? getStoryline(issue.storylineId) : undefined
}

/** 在某一期里，时间线只截取当前节点前后各两格，避免节点变多后版面崩掉 */
export function timelineWindow(storyline: Storyline, currentNode: number, size = 4) {
  const start = Math.max(0, Math.min(currentNode - 2, storyline.nodes.length - size))
  return storyline.nodes.slice(start, start + size).map((node, offset) => {
    const index = start + offset
    return {
      ...node,
      state: index < currentNode ? 'past' : index === currentNode ? 'current' : 'future',
    } as const
  })
}

export type SearchHit = {
  id: string
  kind: '事件' | '速览' | '期次' | '周报'
  title: string
  meta: string
  to: string
}


function snippet(text: string, q: string, radius = 22) {
  const flat = text.replace(/\s+/g, ' ').trim()
  const index = flat.toLowerCase().indexOf(q)
  if (index < 0) return flat.slice(0, radius * 2)
  const start = Math.max(0, index - radius)
  const end = Math.min(flat.length, index + q.length + radius)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

export function search(query: string, limit = 24): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  // 打分检索：标题 / 题材命中权重高于正文命中，同分按日期新者优先
  const scored: { hit: SearchHit; score: number; date: string; order: number }[] = []
  let order = 0

  const push = (
    hit: SearchHit,
    strong: string,
    weak: string,
    date: string,
    weakScore = 1,
  ) => {
    const inStrong = strong.toLowerCase().includes(q)
    const inWeak = !inStrong && weak.toLowerCase().includes(q)
    if (!inStrong && !inWeak) return
    // 只在正文命中时，把命中片段放进结果说明，避免用户点进去找不到相关内容
    const merged = inStrong
      ? hit
      : { ...hit, meta: `命中正文 · ${snippet(weak, q)}` }
    scored.push({ hit: merged, score: inStrong ? 3 : weakScore, date, order: order++ })
  }

  for (const issue of issues) {
    push(
      {
        id: `${issue.date}-lead`,
        kind: '事件',
        title: issue.lead.title.replace(/\n/g, ''),
        meta: `NO.${pad(issue.no)} · ${issue.date} · ${issue.lead.kicker.join(' / ')}`,
        to: `/issue/${issue.no}`,
      },
      `${issue.lead.title} ${issue.lead.kicker.join(' ')}`,
      `${issue.synthesis} ${issue.analysis.title} ${issue.analysis.body} ${issue.analysis.takeaway}`,
      issue.date,
    )

    for (const brief of issue.briefs) {
      push(
        {
          id: `${issue.date}-${brief.time}-${brief.title.slice(0, 8)}`,
          kind: '速览',
          title: brief.title,
          meta: `NO.${pad(issue.no)} · ${brief.time} · ${brief.tag} · ${brief.source}`,
          to: `/issue/${issue.no}/briefs?q=${encodeURIComponent(query)}`,
        },
        `${brief.title} ${brief.tag}`,
        `${brief.summary} ${brief.source}`,
        issue.date,
        2,
      )
    }
  }

  for (const issue of weekly.issues) {
    for (const item of issue.deepDives) {
      push(
        {
          id: `${issue.id}-${item.no}`,
          kind: '周报',
          title: item.title,
          meta: `AI 周报 ${issue.label} · ${issue.period} · ${item.category}`,
          to: issue.id === weekly.current.id ? '/ai-weekly' : `/ai-weekly/${issue.id}`,
        },
        `${item.title} ${item.category}`,
        `${item.fact} ${item.analysis} ${item.action}`,
        issue.publishedAt.slice(0, 10),
        2,
      )
    }
  }

  for (const storyline of storylines) {
    push(
      {
        id: storyline.id,
        kind: '事件',
        title: storyline.title,
        meta: `专题 · ${storyline.topic} · ${storyline.nodes.length} 个节点`,
        to: `/storyline/${storyline.id}`,
      },
      `${storyline.title} ${storyline.topic}`,
      `${storyline.summary} ${storyline.nodes.map((n) => `${n.title} ${n.body}`).join(' ')}`,
      issues.find((i) => i.storylineId === storyline.id)?.date ?? '0000-00-00',
      2,
    )
  }

  return scored
    .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date) || a.order - b.order)
    .slice(0, limit)
    .map((s) => s.hit)
}

export function pad(no: number) {
  return String(no).padStart(3, '0')
}

/* ---------- 事件报告（深挖） ---------- */

export let reports: Report[] = (reportsJson as { reports: Report[] }).reports

export const reportMetaInfo = {
  promptId: (reportsJson as { promptId: string }).promptId,
  promptVersion: (reportsJson as { promptVersion: string }).promptVersion,
  promptPath: (reportsJson as { promptPath: string }).promptPath,
  generatedAt: (reportsJson as { generatedAt: string }).generatedAt,
}

export function getReport(id: string): Report | undefined {
  return reports.find((r) => r.id === id)
}

export function reportsOfIssue(no: number): Report[] {
  return reports.filter((r) => r.issueNo === no)
}

/* ---------- 可深挖条目 ---------- */

export let topics: Topic[] = (topicsJson as { topics: Topic[] }).topics

export function getTopic(id: string): Topic | undefined {
  return topics.find((t) => t.id === id)
}

/** 构建期预生成的报告，作为首次打开时的现成内容；随时可以调模型重新深挖 */
export function presetReport(id: string): GeneratedReport | undefined {
  const preset = getReport(id)
  if (!preset || preset.level !== 'deep') return undefined
  return {
    body: {
      bottomLine: preset.bottomLine,
      sections: preset.sections,
      facts: preset.facts,
      stances: preset.stances,
      openQuestions: preset.openQuestions,
    },
    model: preset.generatedWith.model,
    generatedAt: preset.generatedWith.generatedAt,
    from: 'preset',
  }
}

export function issueStats(issue: Issue) {
  return {
    events: issue.stats.events,
    sources: issue.stats.fetched - issue.stats.merged,
    articles: issue.stats.fetched,
  }
}

export type {
  Issue,
  Storyline,
  StorylineWithIssues,
  Brief,
  SideCard,
  Report,
  Topic,
  GeneratedReport,
  WeeklyData,
  WeeklyIssue,
}
