/**
 * 专题补齐：站点里所有会跳 /storyline/:id 的入口都一定有对应专题，永不死链。
 *
 * 深度解读优先取 content/deep/{id}.json —— 出刊时由模型按
 * content/prompts/deep-story.md 撰写的完整专题分析（前因、机制、带口径的
 * 关键数字、概念、影响、下一步、各方说法、待解问题）。
 *
 * 脚本只负责装配：跨期事实脉络 + 当日进展节点 + 配图 + 引用关系。
 * 模型稿缺失时才退回「仅事实脉络」的存档版，且绝不把报告模板小标题、
 * 日报研判摘要、凑数统计、别的事件的数据拼进分析字段。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DATA = join(ROOT, 'src', 'data')
const ISSUE_DIR = join(DATA, 'issues')
const DEEP_DIR = join(ROOT, 'content', 'deep')
const IMAGE_POOL = ['city', 'climate', 'energy', 'port', 'transit']

const readJson = (p, fallback) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const clip = (s, n = 620) => {
  const t = flat(s)
  return t.length > n ? `${t.slice(0, n)}…` : t
}
const uniq = (arr) => [...new Set(arr.filter((x) => x && flat(x)))]
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

/** 任何报告模板 / 章节流水标题都不许进入分析正文或概念区 */
const TEMPLATE_HEADING =
  /目前已知的|为什么这里是基础版|这条事件还没有|需要完整版|同期共有|时间跨度|^发生了什么$|数字的口径与边界|为什么是现在|影响到谁|^接下来盯什么$|基础版|这件事到底发生了什么|为什么会这样|谁会受到影响|目前还不清楚/
/** 日报研判摘要不是任何一条专题的前因 */
const isSynthesis = (text, issue) => {
  const t = flat(text)
  const s = flat(issue?.synthesis)
  return (s && t === s) || /全篇\s*\d+\s*条原始素材|今天少看|剔除通稿后留下/.test(t)
}

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
    .slice(0, 8)

  return { newest, firstCard, firstLead, keyword, briefs, rpts }
}

function readDeep(id) {
  const d = readJson(join(DEEP_DIR, `${id}.json`), null)
  if (!d) return null
  // 必须真的有模型写的分析正文，否则视为缺失
  if (!flat(d.background) && !Array.isArray(d.sections)) return null
  return d
}

function imageOf(deep, ref, current) {
  if (deep?.imageKey && IMAGE_POOL.includes(deep.imageKey)) {
    return `images/media/${deep.imageKey}-lg.webp`
  }
  if (current) return current
  let h = 0
  for (const c of ref.id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return `images/media/${IMAGE_POOL[h % IMAGE_POOL.length]}-lg.webp`
}

/** 跨期事实脉络：每一期一个节点，只摆事实，不拼分析段落 */
function baseNodes(ref, m) {
  const nodes = []
  for (const issue of [...ref.issues].reverse().slice(0, 8)) {
    const card = ref.cards.find((c) => c.date === issue.date)?.card
    const lead = ref.leads.find((l) => l.date === issue.date)?.lead
    const title = card?.title ?? lead?.title ?? m.keyword
    const sameDayBriefs = m.briefs.filter((b) => b.date === issue.date).slice(0, 4)
    const parts = [
      card?.body,
      lead?.dek,
      ...sameDayBriefs.map((b) => `${b.title}：${flat(b.summary)}`),
      ...(issue.sources ?? []).map((s) => `${s.name}：${s.stance}`),
    ].filter((x) => x && !isSynthesis(x, issue) && !TEMPLATE_HEADING.test(flat(x)))
    nodes.push({
      time: `${issue.date.slice(5).replace('-', '.')} · ${issue.generatedAt || '出刊'}`,
      title: flat(title).replace(/\n/g, ' '),
      body: clip(uniq(parts).join(' '), 620) || clip(m.keyword, 120),
    })
  }
  return nodes
}

/** 当日进展节点：让「追踪」每天都有可核对的新内容。
 *  头条与重点卡当天本身就在这一期里，即使它不在速览池，也要算作今日进展。 */
function progressNode(m, ref) {
  const today = m.newest.date
  const todayCard = ref.cards.find((c) => c.date === today)?.card
  const todayLead = ref.leads.find((l) => l.date === today)?.lead
  const hits = m.briefs.filter((b) => b.date === today).slice(0, 4)
  // 数据卡没有 body 字段，用标题 + 脚注兜底，保证四个重点当天都有进展节点
  const cardText = todayCard
    ? [todayCard.body, todayCard.title, todayCard.footnote].filter(Boolean).join('；')
    : ''
  const parts = uniq(
    [
      cardText,
      todayLead?.dek,
      ...hits.map((b) => `${b.title}：${flat(b.summary)}`),
    ].filter((x) => x && !isSynthesis(x, m.newest) && !TEMPLATE_HEADING.test(flat(x))),
  )
  if (parts.length) {
    return {
      time: `${today.slice(5).replace('-', '.')} · 今日进展`,
      title: '今天新增了什么',
      body: clip(parts.join(' '), 700),
    }
  }
  return {
    time: `${today.slice(5).replace('-', '.')} · 今日进展`,
    title: '今日没有新的可核对进展',
    body: '本期没有出现与这条事件直接相关的新披露，继续按「接下来盯什么」里的时间点观察；已有判断不因此改变。',
  }
}

/** 存档兜底：只保留事实脉络与可由编辑稿核对的数字/概念，不生成分析文字 */
function fallbackDeep(ref, m) {
  const metrics = (m.newest.analysis?.metrics ?? []).map((x) => ({
    value: String(x.value),
    label: String(x.label),
    note: '当期编辑稿口径',
  }))
  const concepts = (m.newest.analysis?.sections ?? [])
    .filter((s) => s.heading && !TEMPLATE_HEADING.test(s.heading))
    .slice(0, 3)
    .map((s) => ({ term: s.heading, explain: clip((s.paragraphs ?? []).join(' '), 430) }))
  return { keyNumbers: metrics, concepts }
}

function buildStoryline(ref, m) {
  const deep = readDeep(ref.id)
  const fb = fallbackDeep(ref, m)
  const nodes = [progressNode(m, ref), ...baseNodes(ref, m)]
  const topic =
    deep?.kicker ??
    flat(m.firstCard?.label?.split(/[·｜|]/)[0] ?? '') ??
    m.briefs[0]?.tag ??
    m.firstLead?.kicker?.[1] ??
    '今日重点'
  const title = flat(deep?.title ?? m.firstCard?.title ?? m.firstLead?.title ?? m.keyword).replace(/\n/g, ' ')

  const common = {
    id: ref.id,
    topic: flat(topic).slice(0, 20) || '今日重点',
    title,
    summary: clip(
      deep?.summary ?? uniq([m.firstCard?.body, m.firstLead?.dek, m.briefs[0]?.summary]).join(' '),
      340,
    ),
    image: imageOf(deep, ref, m.firstCard?.image ?? m.firstLead?.image ?? null),
    credit: m.firstCard?.credit ?? m.firstLead?.credit ?? 'K!B0 编辑部',
    nodes,
    sources: uniq([
      ...(deep?.sources ?? []),
      ...(m.newest.sources ?? []).map((s) => s.name),
      ...m.briefs.slice(0, 4).map((b) => b.source),
    ]).slice(0, 10),
    updatedAt: m.newest.date,
    relatedDates: ref.issues.map((i) => i.date),
  }

  if (!deep) {
    return { ...common, ...fb, authoredBy: 'archive', sources: common.sources }
  }

  return {
    ...common,
    bottomLine: deep.bottomLine ?? [],
    background: flat(deep.background),
    mechanism: flat(deep.mechanism),
    keyNumbers: deep.keyNumbers ?? [],
    concepts: deep.concepts ?? [],
    impact: flat(deep.impact),
    whatNext: flat(deep.whatNext),
    stances: deep.stances ?? [],
    openQuestions: deep.openQuestions ?? [],
    authoredBy: 'model',
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
  let modelled = 0
  for (const [id, ref] of refs) {
    const m = relatedMaterial(ref, reports, issues)
    const generated = buildStoryline(ref, m)
    const prev = byId.get(id)
    if (!prev) added += 1
    if (generated.authoredBy === 'model') modelled += 1
    // 每天重新生成：节点随当期素材更新，追踪里的「更新至」才会跟着走
    byId.set(id, prev ? { ...prev, ...generated } : generated)
  }

  const list = [...byId.values()].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  if (write) {
    writeFileSync(join(DATA, 'storylines.json'), JSON.stringify({ storylines: list }, null, 1), 'utf8')
  }
  console.log(
    `[专题补齐] 引用 ${refs.size} 个 · 新增 ${added} 个 · 模型撰稿 ${modelled} 个 · 共 ${list.length} 个专题`,
  )
  return list
}

if (import.meta.url === `file://${process.argv[1]}`) enrichStorylines()
