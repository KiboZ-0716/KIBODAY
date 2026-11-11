/**
 * 专题自动补齐（根治「点三卡提示没有这个专题」）。
 *
 * 站点里所有会跳 /storyline/:id 的入口（头条、三张重要卡片）都会在这里
 * 被扫描出来；只要 storylines.json 里没有这个 id，就用当期真实素材
 * （briefs / analysis / reports / sources / trends）合成一份带前因后果、
 * 关键数字、概念口径、各方说法、影响与后续节点的深度专题，写回磁盘。
 *
 * 这样生成端无论起什么新 id，上传前都一定存在对应专题，永远不会死链。
 * 同一 id 被多期引用时，节点按日期累积 —— 「追踪」因此会随每天更新。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DATA = join(ROOT, 'src', 'data')
const ISSUE_DIR = join(DATA, 'issues')

const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}

const norm = (s) => String(s ?? '').replace(/[\s\p{P}\p{S}]/gu, '')
const grams = (s) => {
  const t = norm(s)
  const out = new Set()
  for (let i = 0; i < t.length - 1; i += 1) out.add(t.slice(i, i + 2))
  return out
}
const sim = (a, b) => {
  const A = grams(a)
  const B = grams(b)
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const g of A) if (B.has(g)) hit += 1
  return hit / Math.min(A.size, B.size)
}
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const clip = (s, n = 420) => {
  const t = flat(s)
  return t.length > n ? `${t.slice(0, n)}…` : t
}
const uniq = (arr) => [...new Set(arr.filter((x) => x && flat(x)))]

function collectIssues() {
  if (!existsSync(ISSUE_DIR)) return []
  return readdirSync(ISSUE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(join(ISSUE_DIR, f), null))
    .filter((i) => i && i.date && Array.isArray(i.briefs))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
}

function collectRefs(issues) {
  const refs = new Map()
  const put = (rawId, issue, extra = {}) => {
    if (!rawId) return
    const id = String(rawId).replace(/^\/storyline\//, '').split('?')[0].trim()
    if (!id || id.startsWith('/issue')) return
    if (!refs.has(id)) refs.set(id, { id, issues: [], cards: [], leads: [] })
    const ref = refs.get(id)
    if (!ref.issues.some((i) => i.date === issue.date)) ref.issues.push(issue)
    if (extra.card) ref.cards.push({ date: issue.date, issue, card: extra.card })
    if (extra.lead) ref.leads.push({ date: issue.date, issue, lead: extra.lead })
  }
  for (const issue of issues) {
    put(issue.lead?.storylineId, issue, { lead: issue.lead })
    put(issue.storylineId, issue)
    for (const card of issue.cards ?? []) put(card.to, issue, { card })
  }
  return refs
}

function relatedMaterial(ref, reports, issues) {
  const newest = ref.issues[ref.issues.length - 1]
  const firstCard = ref.cards.find((c) => c.date === newest.date)?.card
  const firstLead = ref.leads.find((l) => l.date === newest.date)?.lead
  const keyword = firstCard?.title ?? firstLead?.title ?? ref.id

  const briefs = []
  for (const issue of issues) {
    for (const b of issue.briefs ?? []) {
      const score = sim(keyword, b.title)
      if (score >= 0.22 || norm(b.title).includes(norm(keyword).slice(0, 6))) {
        briefs.push({ ...b, date: issue.date, score })
      }
    }
  }
  briefs.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))

  const rpts = reports
    .map((r) => ({ ...r, score: sim(keyword, r.title) }))
    .filter((r) => r.score >= 0.2 || norm(r.title).includes(norm(keyword).slice(0, 6)))
    .sort((a, b) => (a.level === 'deep' ? 0 : 1) - (b.level === 'deep' ? 0 : 1) || b.score - a.score)
    .slice(0, 6)

  const analysisCandidates = ref.issues
    .map((i) => ({ issue: i, score: sim(keyword, i.analysis?.title ?? '') + sim(keyword, i.analysis?.body ?? '') * 0.5 }))
    .sort((a, b) => b.score - a.score)
  const analysis = (analysisCandidates[0]?.score ?? 0) >= 0.06 ? analysisCandidates[0].issue.analysis : null
  const analysisIssue = analysisCandidates[0]?.issue ?? newest

  return { newest, firstCard, firstLead, keyword, briefs, rpts, analysis, analysisIssue }
}

function buildNodes(ref, m) {
  const nodes = []
  const datesDesc = [...ref.issues].reverse()

  // 一、跨期事件脉络：每一期一个节点，追踪页因此会随每天新增
  for (const issue of datesDesc.slice(0, 8)) {
    const card = ref.cards.find((c) => c.date === issue.date)?.card
    const lead = ref.leads.find((l) => l.date === issue.date)?.lead
    const title = card?.title ?? lead?.title ?? m.keyword
    const sameDayBriefs = m.briefs.filter((b) => b.date === issue.date).slice(0, 3)
    const sameDayReports = m.rpts.filter((r) => r.date === issue.date).slice(0, 2)
    const parts = [
      card?.body,
      lead?.dek,
      ...sameDayBriefs.map((b) => `${b.title}：${b.summary}`),
      ...sameDayReports.map((r) => `${r.title}：${flat(r.summary)}`),
      ...(issue.sources ?? []).map((s) => `${s.name}：${s.stance}`),
    ]
    nodes.push({
      time: `${issue.date.slice(5).replace('-', '.')} · ${issue.generatedAt || '出刊'}`,
      title: flat(title).replace(/\n/g, ' '),
      body: clip(uniq(parts).join(' '), 520) || clip(m.keyword, 120),
    })
  }

  const a = m.analysis
  const paragraphsOf = (section) => uniq((section?.paragraphs ?? []).map(flat)).join(' ')
  const sections = a?.sections ?? []
  const reportSections = m.rpts.flatMap((r) => r.sections ?? []).filter((s) => s.heading && !/基础版/.test(s.heading))

  // 二、前因：为什么是现在
  const bg = [
    sections.length ? `${sections[0].heading}：${paragraphsOf(sections[0])}` : '',
    reportSections.length ? `${reportSections[0].heading}：${paragraphsOf(reportSections[0])}` : '',
    a?.body,
  ]
  nodes.push({
    time: '前因 · 背景',
    title: '为什么偏偏是现在',
    body: clip(uniq(bg).join(' '), 620) || `来自 ${m.newest.date} 一期的公开报道：${clip(m.briefs[0]?.summary ?? m.keyword, 200)}`,
  })

  // 三、关键数字
  const numbers = [
    ...(a?.metrics ?? []).map((x) => `${x.value} · ${x.label}`),
    ...(m.rpts.slice(0, 3).flatMap((r) => r.facts ?? [])).slice(0, 6),
    m.firstCard?.big ? `${m.firstCard.big}${m.firstCard.unit ?? ''} · ${m.firstCard.caption ?? ''}` : '',
  ]
  nodes.push({
    time: '关键数字',
    title: '把这件事换算成可核对的数',
    body: clip(uniq(numbers).join('；'), 620) || '本期未披露具体数值，以下判断以公开报道口径为准。',
  })

  // 四、概念与口径
  const concepts = sections.slice(1).concat(reportSections.slice(1)).slice(0, 4)
  nodes.push({
    time: '概念 · 口径',
    title: '读懂这条新闻需要知道的几个词',
    body: clip(
      uniq(concepts.map((s) => `${s.heading}：${paragraphsOf(s)}`)).join(' ') ||
        `${m.keyword}：${clip(m.briefs[0]?.summary ?? a?.body ?? '', 260)}`,
      620,
    ),
  })

  // 五、各方说法
  const stances = [
    ...(m.analysisIssue?.sources ?? []).map((s) => `${s.name}（${s.time}）：${s.stance}`),
    ...m.rpts.slice(0, 3).flatMap((r) => (r.stances ?? []).map((s) => `${s.source}：${s.point}`)),
    ...m.rpts.slice(0, 3).flatMap((r) => (r.sources ?? []).map((s) => `${s.name} · ${s.time}`)),
  ]
  nodes.push({
    time: '各方说法',
    title: '谁在说、各自站在什么位置',
    body: clip(uniq(stances).join('；'), 620) || clip(m.newest.analysis?.body ?? '', 300),
  })

  // 六、影响
  const impact = [
    a?.takeaway?.body,
    ...(a?.takeaway?.points ?? []),
    ...(m.newest.trends ?? []).slice(0, 2).map((t) => `${t.title}：${t.body}`),
    ...m.rpts.slice(0, 2).flatMap((r) => r.bottomLine ?? []),
  ]
  nodes.push({
    time: '影响',
    title: '对谁、多少钱、什么选择会变',
    body: clip(uniq(impact).join(' '), 620) || clip(a?.body ?? '', 300),
  })

  // 七、后续
  const next = [
    sections.length ? paragraphsOf(sections[sections.length - 1]) : '',
    ...m.rpts.slice(0, 3).flatMap((r) => r.openQuestions ?? []),
    a?.takeaway?.title,
  ]
  nodes.push({
    time: '下一节点',
    title: '接下来盯什么',
    body: clip(uniq(next).join(' '), 520) || '关注下一期同一事件的通报口径与官方数据更新。',
  })

  return nodes
}

function buildStoryline(ref, m) {
  const nodes = buildNodes(ref, m)
  const a = m.analysis
  const topic =
    m.firstCard?.label?.split(/[·｜|]/)[0]?.trim() ||
    m.briefs[0]?.tag ||
    m.firstLead?.kicker?.[1] ||
    '今日重点'

  return {
    id: ref.id,
    topic: flat(topic).slice(0, 20) || '今日重点',
    title: flat(m.firstCard?.title ?? m.firstLead?.title ?? m.keyword).replace(/\n/g, ' '),
    summary: clip(
      uniq([
        m.firstCard?.body,
        m.firstLead?.dek,
        a?.body,
        m.briefs[0]?.summary,
      ]).join(' '),
      320,
    ),
    image: m.firstCard?.image ?? m.firstLead?.image ?? null,
    credit: m.firstCard?.credit ?? m.firstLead?.credit ?? 'K!B0 编辑部',
    nodes,
    // 以下扩展字段供新版专题页排版，旧版页面会忽略，正文已全部写进 nodes
    background: clip(nodes.find((n) => n.time === '前因 · 背景')?.body ?? '', 900),
    concepts: (a?.sections ?? []).slice(0, 4).map((s) => ({ term: s.heading, explain: clip((s.paragraphs ?? []).join(' '), 420) })),
    keyNumbers: (a?.metrics ?? []).map((x) => ({ value: x.value, label: x.label })),
    impact: clip(nodes.find((n) => n.time === '影响')?.body ?? '', 900),
    whatNext: clip(nodes.find((n) => n.time === '下一节点')?.body ?? '', 600),
    sources: uniq([
      ...(m.analysisIssue?.sources ?? []).map((s) => s.name),
      ...m.rpts.slice(0, 3).flatMap((r) => (r.sources ?? []).map((s) => s.name)),
    ]).slice(0, 8),
    updatedAt: m.newest.date,
    relatedDates: ref.issues.map((i) => i.date),
  }
}

/** 返回补齐后的专题数组，并写回 src/data/storylines.json */
export function enrichStorylines({ write = true } = {}) {
  const issues = collectIssues()
  if (!issues.length) return []
  const reports = readJson(join(DATA, 'reports.json'), { reports: [] }).reports ?? []
  const base = readJson(join(ROOT, 'content', 'storylines.json'), { storylines: [] }).storylines ?? []
  const existing = readJson(join(DATA, 'storylines.json'), { storylines: [] }).storylines ?? []

  const byId = new Map()
  for (const s of [...base, ...existing]) if (s?.id) byId.set(s.id, s)

  const refs = collectRefs(issues)
  let added = 0
  for (const [id, ref] of refs) {
    const m = relatedMaterial(ref, reports, issues)
    const generated = buildStoryline(ref, m)
    const prev = byId.get(id)
    if (prev && (prev.updatedAt ?? '') >= generated.updatedAt && (prev.nodes?.length ?? 0) >= generated.nodes.length - 1) {
      // 已是最新，只补扩展字段
      byId.set(id, { ...generated, ...prev, nodes: prev.nodes?.length ? prev.nodes : generated.nodes })
      continue
    }
    byId.set(id, prev ? { ...prev, ...generated } : generated)
    if (!prev) added += 1
  }

  const list = [...byId.values()].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  if (write) {
    writeFileSync(join(DATA, 'storylines.json'), JSON.stringify({ storylines: list }, null, 1), 'utf8')
  }
  console.log(`[专题补齐] 引用 ${refs.size} 个 · 新增 ${added} 个 · 共 ${list.length} 个专题`)
  return list
}

if (import.meta.url === `file://${process.argv[1]}`) enrichStorylines()
