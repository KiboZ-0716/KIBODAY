/**
 * 专题自动补齐（根治「点三卡提示没有这个专题」）。
 *
 * 站点里所有会跳 /storyline/:id 的入口（头条、三张重要卡片）都会在这里
 * 被扫描出来；只要 storylines.json 里没有这个 id，就用当期真实素材
 * （briefs / analysis / reports / sources / trends）合成一份带前因后果、
 * 关键数字、概念口径、各方说法、影响与后续节点的深度专题，写回磁盘。
 *
 * 生成端无论起什么新 id，上传前都一定存在对应专题，永远不会死链。
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
const clip = (s, n = 620) => {
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
      if (score >= 0.18 || norm(b.title).includes(norm(keyword).slice(0, 6))) {
        briefs.push({ ...b, date: issue.date, score })
      }
    }
  }
  briefs.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))

  const rpts = reports
    .map((r) => ({ ...r, score: sim(keyword, r.title) }))
    .filter((r) => r.score >= 0.18 || norm(r.title).includes(norm(keyword).slice(0, 6)))
    .sort((a, b) => (a.level === 'deep' ? 0 : 1) - (b.level === 'deep' ? 0 : 1) || b.score - a.score)
    .slice(0, 8)

  const analysisCandidates = ref.issues
    .map((i) => ({ issue: i, score: sim(keyword, i.analysis?.title ?? '') + sim(keyword, i.analysis?.body ?? '') * 0.5 }))
    .sort((a, b) => b.score - a.score)
  const analysis = (analysisCandidates[0]?.score ?? 0) >= 0.06 ? analysisCandidates[0].issue.analysis : null
  const analysisIssue = analysisCandidates[0]?.issue ?? newest

  return { newest, firstCard, firstLead, keyword, briefs, rpts, analysis, analysisIssue }
}

const NUMBER_RE = /(\d+(?:\.\d+)?\s*(?:%|个百分点|基点|bp|万亿|亿美元|万元|亿元|亿|万|美元|元|个|条|家|架|枚|辆|吨|人次|毫秒|小时|天|周|年|平方米|平米|吨\/年)?)/g

function extractNumbers(text, label) {
  const t = flat(text)
  const found = t.match(NUMBER_RE) ?? []
  return found.slice(0, 2).map((value) => ({ value: value.trim(), label: clip(label, 34) }))
}

/** 纯日期、无单位的个位数不算「关键数字」 */
function meaningfulNumber(value) {
  const v = value.replace(/\s/g, '')
  if (!/\d/.test(v)) return false
  if (/^\d{1,2}$/.test(v)) return false
  if (/^(?:19|20)\d{2}$/.test(v)) return false
  return /[.%亿万元基点毫秒吨辆架枚条家天周月年人次平米平方米]|\d{3,}/.test(v)
}

function pickNumbers(m) {
  const a = m.analysis
  const priority = []
  const extra = []
  for (const x of a?.metrics ?? []) priority.push({ value: String(x.value), label: String(x.label) })
  if (m.firstCard?.big) {
    priority.push({
      value: `${m.firstCard.big}${m.firstCard.unit ?? ''}`,
      label: m.firstCard.caption ?? m.firstCard.footnote ?? '本期关键数值',
    })
  }
  for (const b of m.briefs.slice(0, 8)) extra.push(...extractNumbers(`${b.summary} ${b.title}`, b.title))
  for (const r of m.rpts.slice(0, 6)) {
    for (const f of r.facts ?? []) extra.push(...extractNumbers(f, r.title))
    extra.push(...extractNumbers(r.summary ?? '', r.title))
  }
  const seen = new Set()
  const keep = (x) => {
    const k = x.value.replace(/\s/g, '')
    if (!k || seen.has(k) || !meaningfulNumber(x.value)) return false
    seen.add(k)
    return true
  }
  const out = [...priority.filter(keep), ...extra.filter(keep)].slice(0, 5)
  if (!out.length && m.briefs.length) {
    out.push({ value: String(m.briefs.length), label: '本期相关报道条数' })
  }
  return out
}

const TEMPLATE_HEADING = /目前已知的|为什么这里是基础版|这条事件还没有|需要完整版|同期共有|时间跨度/

function pickConcepts(m) {
  const a = m.analysis
  const out = []
  for (const s of (a?.sections ?? []).slice(0, 4)) {
    if (s.heading && !TEMPLATE_HEADING.test(s.heading)) {
      out.push({ term: s.heading, explain: (s.paragraphs ?? []).join(' ') })
    }
  }
  for (const r of m.rpts.slice(0, 4)) {
    for (const s of r.sections ?? []) {
      if (s.heading && !TEMPLATE_HEADING.test(s.heading)) {
        out.push({ term: s.heading, explain: (s.paragraphs ?? []).join(' ') })
      }
    }
  }
  for (const b of m.briefs.slice(0, 5)) {
    out.push({ term: flat(b.title).slice(0, 22), explain: `${b.source}：${b.summary}` })
  }
  const seen = new Set()
  return out
    .filter((x) => {
      if (!x.term || seen.has(x.term)) return false
      seen.add(x.term)
      return true
    })
    .slice(0, 4)
    .map((x) => ({ term: x.term, explain: clip(x.explain, 430) }))
}

function buildNodes(ref, m) {
  const nodes = []
  const datesDesc = [...ref.issues].reverse()
  const a = m.analysis
  const paragraphsOf = (section) => uniq((section?.paragraphs ?? []).map(flat)).join(' ')
  const sections = a?.sections ?? []
  const reportSections = m.rpts.flatMap((r) => r.sections ?? []).filter((s) => s.heading && !/基础版|为什么这里是/.test(s.heading))
  const numbers = pickNumbers(m)
  const concepts = pickConcepts(m)

  // 一、跨期事件脉络：每一期一个节点，追踪页因此会随每天新增
  for (const issue of datesDesc.slice(0, 8)) {
    const card = ref.cards.find((c) => c.date === issue.date)?.card
    const lead = ref.leads.find((l) => l.date === issue.date)?.lead
    const title = card?.title ?? lead?.title ?? m.keyword
    const sameDayBriefs = m.briefs.filter((b) => b.date === issue.date).slice(0, 4)
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
      body: clip(uniq(parts).join(' '), 620) || clip(m.keyword, 120),
    })
  }

  // 二、前因：为什么偏偏是现在
  const bg = [
    sections.length ? `${sections[0].heading}：${paragraphsOf(sections[0])}` : '',
    ...reportSections.slice(0, 3).map((s) => `${s.heading}：${paragraphsOf(s)}`),
    a?.body,
    m.newest.synthesis,
    ...m.briefs.slice(0, 6).map((b) => `${b.title}：${b.summary}`),
    ...m.rpts.slice(0, 4).map((r) => `${r.title}：${flat(r.summary)}`),
    ...(m.newest.trends ?? []).slice(0, 2).map((t) => `${t.title}：${t.body}`),
  ]
  nodes.push({ time: '前因 · 背景', title: '为什么偏偏是现在', body: clip(uniq(bg).join(' '), 950) })

  // 三、关键数字
  nodes.push({
    time: '关键数字',
    title: '把这件事换算成可核对的数',
    body: clip(numbers.map((x) => `${x.value} · ${x.label}`).join('；') || m.briefs[0]?.summary || '', 700),
  })

  // 四、概念与口径：逐条解释相关报道里的关键说法
  nodes.push({
    time: '概念 · 口径',
    title: '读懂这条新闻需要知道的几个说法',
    body: clip(concepts.map((c) => `${c.term}：${c.explain}`).join(' ') || paragraphsOf(sections[0]) || m.briefs[0]?.summary || '', 760),
  })

  // 五、各方说法
  const stances = [
    ...(m.analysisIssue?.sources ?? []).map((s) => `${s.name}（${s.time}）：${s.stance}`),
    ...m.rpts.slice(0, 4).flatMap((r) => (r.stances ?? []).map((s) => `${s.source}：${s.point}`)),
    ...m.rpts.slice(0, 4).flatMap((r) => (r.sources ?? []).map((s) => `${s.name} · ${s.time}`)),
    ...m.briefs.slice(0, 4).map((b) => `${b.source}（${b.time}）：${b.title}`),
  ]
  nodes.push({ time: '各方说法', title: '谁在说、各自站在什么位置', body: clip(uniq(stances).join('；'), 700) })

  // 六、影响
  const impact = [
    a?.takeaway?.body,
    ...(a?.takeaway?.points ?? []),
    ...(m.newest.trends ?? []).slice(0, 3).map((t) => `${t.title}：${t.body}`),
    ...m.rpts.slice(0, 3).flatMap((r) => r.bottomLine ?? []),
    ...m.briefs.slice(0, 3).map((b) => b.summary),
  ]
  nodes.push({ time: '影响', title: '对谁、多少钱、什么选择会变', body: clip(uniq(impact).join(' '), 700) })

  // 七、后续
  const next = [
    sections.length ? paragraphsOf(sections[sections.length - 1]) : '',
    ...m.rpts.slice(0, 4).flatMap((r) => r.openQuestions ?? []),
    a?.takeaway?.title,
  ]
  nodes.push({
    time: '下一节点',
    title: '接下来盯什么',
    body: clip(uniq(next).join(' '), 620) || '关注下一期同一事件的通报口径与官方数据更新。',
  })

  return { nodes, numbers, concepts }
}

function buildStoryline(ref, m) {
  const { nodes, numbers, concepts } = buildNodes(ref, m)
  const topic =
    m.firstCard?.label?.split(/[·｜|]/)[0]?.trim() ||
    m.briefs[0]?.tag ||
    m.firstLead?.kicker?.[1] ||
    '今日重点'
  const find = (t) => nodes.find((n) => n.time === t)?.body ?? ''

  return {
    id: ref.id,
    topic: flat(topic).slice(0, 20) || '今日重点',
    title: flat(m.firstCard?.title ?? m.firstLead?.title ?? m.keyword).replace(/\n/g, ' '),
    summary: clip(
      uniq([m.firstCard?.body, m.firstLead?.dek, m.analysis?.body, m.briefs[0]?.summary]).join(' '),
      340,
    ),
    image: m.firstCard?.image ?? m.firstLead?.image ?? null,
    credit: m.firstCard?.credit ?? m.firstLead?.credit ?? 'K!B0 编辑部',
    nodes,
    // 扩展字段供新版专题页排版，旧版页面会忽略，正文已全部写进 nodes
    background: clip(find('前因 · 背景'), 1100),
    concepts,
    keyNumbers: numbers,
    impact: clip(find('影响'), 1100),
    whatNext: clip(find('下一节点'), 800),
    sources: uniq([
      ...(m.analysisIssue?.sources ?? []).map((s) => s.name),
      ...m.rpts.slice(0, 4).flatMap((r) => (r.sources ?? []).map((s) => s.name)),
      ...m.briefs.slice(0, 4).map((b) => b.source),
    ]).slice(0, 10),
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
    if (!prev) added += 1
    // 每天重新生成：节点随当期素材更新，追踪里的「更新至」才会跟着走
    byId.set(id, prev ? { ...prev, ...generated } : generated)
  }

  const list = [...byId.values()].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  if (write) {
    writeFileSync(join(DATA, 'storylines.json'), JSON.stringify({ storylines: list }, null, 1), 'utf8')
  }
  const withNumbers = list.filter((s) => s.keyNumbers?.length).length
  const withConcepts = list.filter((s) => s.concepts?.length).length
  console.log(
    `[专题补齐] 引用 ${refs.size} 个 · 新增 ${added} 个 · 共 ${list.length} 个专题（含关键数字 ${withNumbers}、概念解释 ${withConcepts}）`,
  )
  return list
}

if (import.meta.url === `file://${process.argv[1]}`) enrichStorylines()
