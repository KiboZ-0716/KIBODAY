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
 *
 * 2026-11-13 修「追踪不更新」：编辑每天按「英文短键-日期」给重点新开一个
 * storylineId，同一事件（英伟达 / 阿布扎比会谈 / 霍尔木兹）跨天会被拆成
 * 好几个 id。旧 id 在后续期次里不再被 cards[].to / lead.storylineId 引用，
 * collectRefs 就只认它诞生那一天 —— updatedAt 永远停在那天、节点只有 2 个，
 * 追踪订阅等于盯着一条死链。现在额外按主体专名把全部期次里同一事件链的
 * 后续报道串进来，推进 updatedAt、补齐每日节点，旧订阅 id 一律保留不失效。
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
const grams = (s, n = 2) => {
  const t = norm(s)
  const out = new Set()
  for (let i = 0; i < t.length - n + 1; i += 1) out.add(t.slice(i, i + n))
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

/**
 * 跨期续报：判断两条标题是不是同一条事件链。
 *
 * 只认「主体专名」——英伟达 / 黄仁勋 / 阿布扎比 / 格什姆岛 / 进博会。
 * 机构名、国家名、通用财经词（公安部、最高法、商务部、西班牙、CPI、
 * 同比增…）一律不算锚点：否则「公安部挂牌督办甲醛白菜」会被串到
 * 「公安部推交管便民措施」，「西班牙高铁事故」串到「西班牙大罢工」。
 * 三层判据：≥2 个强锚点 / 1 个锚点且整句相似度 ≥0.25 / 标题开头出现
 * 3 字以上纯中文主体专名（英伟达这类只共享一个专名、句子却大改的续报）。
 */
const WEAK_ANCHOR = new Set([
  '西班牙', '中国空', '国空间', '空间站', '公安部', '最高法', '最高检', '商务部',
  '国央行', '央行加息', '英国央', '中国央', '发改委', '证监会', '统计局', '国务院',
  '外交部', '交易所', '乘联分', 'CPI', 'GDP', '同比增', '环比增', '亿美元', '万亿元',
  '人民币', '元每吨', '百分点', '今日重', '本期速', '记者从', '记者获', '表示将',
  '宣布将', '公布了', '市场预', '公司称', '公司发', '价格上', '价格下', '指数涨',
  '指数跌', '增长至', '下降至', '创历史', '创新高', '创新低', '首次突', '再度下',
  '连续第', '相关部', '有关部', '进行了', '实施细', '召开会', '举行会', '通报称',
  '数据显', '情况通', '问题上', '工作面', '方面看', '以及其', '分之一', '同比下',
  '同比上', '成交额', '博会', '闭幕', '开幕', '全国性', '乘用车',
])
function isFollowUp(keyword, title) {
  const A = grams(keyword, 3)
  const B = grams(title, 3)
  const head = norm(title).slice(0, 14)
  const strong = []
  for (const g of A) {
    if (!B.has(g) || WEAK_ANCHOR.has(g) || /\d/.test(g)) continue
    if (head.includes(g)) strong.push(g)
  }
  if (strong.length >= 2) return true
  if (strong.length >= 1 && sim(keyword, title) >= 0.25) return true
  if (strong.length >= 1) {
    const g = strong[0]
    if (/^[\u4e00-\u9fa5]{3,}$/.test(g) && head.indexOf(g) <= 5) return true
  }
  return false
}

/** 从全部期次里找出同一事件链的后续报道：速览 + 头条 + 三张卡都要扫。
 *  只扫 collectRefs 是根因——英伟达每天是头条，根本不在速览池里。 */
function collectFollowUps(keyword, issues) {
  const hits = []
  for (const issue of issues) {
    const cands = [
      ...(issue.briefs ?? []).map((b) => ({ kind: 'brief', title: b.title, body: b.summary })),
      ...(issue.lead ? [{ kind: 'lead', title: issue.lead.title, body: issue.lead.dek }] : []),
      ...(issue.cards ?? []).map((c) => ({
        kind: 'card',
        title: c.title,
        body: [c.body, c.footnote].filter(Boolean).join('；'),
      })),
    ]
    for (const c of cands) {
      if (isFollowUp(keyword, c.title)) hits.push({ date: issue.date, ...c })
    }
  }
  const seen = new Set()
  return hits.filter((h) => {
    const k = `${h.date}|${flat(h.title)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
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
  // 历史遗留专题（本期已无 lead/card 引用）没有 ref.issues，用最新期兜底，
  // 关键词直接取它已有的标题，保证续报匹配仍以原始主体专名为准。
  const newest = ref.issues[ref.issues.length - 1] ?? issues[issues.length - 1]
  const firstCard = ref.cards.find((c) => c.date === newest.date)?.card
  const firstLead = ref.leads.find((l) => l.date === newest.date)?.lead
  const keyword = ref.seedTitle ?? firstCard?.title ?? firstLead?.title ?? ref.id

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

  // 跨期续报：把同一主体在其它日期的头条 / 卡片 / 速览一起收进来。
  // 相关日期 = 该 id 被引用过的期次 ∪ 续报命中的期次，升序。
  const cross = collectFollowUps(keyword, issues)
  const dates = uniq([
    ...ref.issues.map((i) => i.date),
    ...(ref.seedDates ?? []),
    ...cross.map((h) => h.date),
  ]).sort()

  return { newest, firstCard, firstLead, keyword, briefs, rpts, cross, dates }
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

/** 跨期事实脉络：每个相关日期一个节点，只摆事实，不拼分析段落。
 *  旧版只遍历 ref.issues（同 id 被引用过的期次），所以旧 id 永远只有一天。 */
function baseNodes(ref, m, issues) {
  const nodes = []
  for (const date of [...m.dates].reverse().slice(0, 8)) {
    const issue = issues.find((i) => i.date === date)
    const card = ref.cards.find((c) => c.date === date)?.card
    const lead = ref.leads.find((l) => l.date === date)?.lead
    const dayHits = m.cross.filter((h) => h.date === date).slice(0, 4)
    const title = card?.title ?? lead?.title ?? dayHits[0]?.title ?? m.keyword
    const parts = [
      card?.body,
      lead?.dek,
      ...dayHits.map((h) => `${flat(h.title)}：${flat(h.body)}`),
      ...(issue?.sources ?? []).map((s) => `${s.name}：${s.stance}`),
    ].filter((x) => x && !isSynthesis(x, issue) && !TEMPLATE_HEADING.test(flat(x)))
    nodes.push({
      time: `${date.slice(5).replace('-', '.')} · ${issue?.generatedAt || '出刊'}`,
      title: flat(title).replace(/\n/g, ' '),
      body: clip(uniq(parts).join(' '), 620) || clip(m.keyword, 120),
    })
  }
  return nodes
}

/** 当日进展节点：让「追踪」每天都有可核对的新内容。
 *  today 必须是「全库最新一期」，不是该 id 最后被引用的日期——后者正是
 *  旧 id 停在 11.12、把 11.13 黄仁勋辞任漏掉的直接原因。 */
function progressNode(m, latestDate) {
  const hits = m.cross.filter((h) => h.date === latestDate).slice(0, 4)
  const parts = uniq(
    hits
      .map((h) => `${flat(h.title)}：${flat(h.body)}`)
      .filter((x) => x && !isSynthesis(x, m.newest) && !TEMPLATE_HEADING.test(flat(x))),
  )
  if (parts.length) {
    return {
      time: `${latestDate.slice(5).replace('-', '.')} · 今日进展`,
      title: '今天新增了什么',
      body: clip(parts.join(' '), 700),
    }
  }
  return {
    time: `${latestDate.slice(5).replace('-', '.')} · 今日进展`,
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

function buildStoryline(ref, m, issues, latestDate) {
  const deep = readDeep(ref.id)
  const fb = fallbackDeep(ref, m)
  const nodes = [progressNode(m, latestDate), ...baseNodes(ref, m, issues)]
  const updatedAt = m.dates[m.dates.length - 1] ?? m.newest.date
  const latestIssue = issues.find((i) => i.date === updatedAt)
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
    updatedAt,
    relatedDates: m.dates,
    // 追踪列表按这个期号取当期节点；旧版缺失导致它永远显示最老的一个节点。
    latestNo: latestIssue?.no ?? m.newest.no,
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
  const latestDate = issues[issues.length - 1].date
  const reports = readJson(join(DATA, 'reports.json'), { reports: [] }).reports ?? []
  const base = readJson(join(ROOT, 'content', 'storylines.json'), { storylines: [] }).storylines ?? []
  const existing = readJson(join(DATA, 'storylines.json'), { storylines: [] }).storylines ?? []

  const byId = new Map()
  for (const s of [...base, ...existing]) if (s?.id) byId.set(s.id, s)

  const refs = collectRefs(issues)

  // 历史遗留 / 本期未被任何头条或卡片引用的专题：订阅关系还在浏览器里，
  // 一样要逐日汇总进展，否则用户点过的旧事件永远停在那天。
  // 这类只推进「追踪相关」字段，不重算标题、配图与分析稿，避免改动旧专题版式。
  for (const [id, s] of byId) {
    if (refs.has(id) || !s.updatedAt) continue
    refs.set(id, {
      id,
      issues: [],
      cards: [],
      leads: [],
      seedTitle: s.title,
      seedDates: s.relatedDates ?? [s.updatedAt],
      virtual: true,
    })
  }

  let added = 0
  let modelled = 0
  let continued = 0
  for (const [id, ref] of refs) {
    const m = relatedMaterial(ref, reports, issues)
    const generated = buildStoryline(ref, m, issues, latestDate)
    const prev = byId.get(id)
    if (!prev) added += 1
    if (generated.authoredBy === 'model') modelled += 1
    if (m.dates.length > 1) continued += 1
    if (ref.virtual) {
      byId.set(id, {
        ...(prev ?? {}),
        nodes: generated.nodes,
        updatedAt: generated.updatedAt,
        relatedDates: generated.relatedDates,
        latestNo: generated.latestNo,
      })
    } else {
      // 每天重新生成：节点随当期素材更新，追踪里的「更新至」才会跟着走。
      // 用 {...prev, ...generated} 保留旧 id 与历史模型稿字段，订阅关系不失效。
      byId.set(id, prev ? { ...prev, ...generated } : generated)
    }
  }

  const list = [...byId.values()].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
  if (write) {
    writeFileSync(join(DATA, 'storylines.json'), JSON.stringify({ storylines: list }, null, 1), 'utf8')
  }
  console.log(
    `[专题补齐] 引用 ${refs.size} 个 · 新增 ${added} 个 · 跨期续报 ${continued} 个 · 模型撰稿 ${modelled} 个 · 共 ${list.length} 个专题（最新期 ${latestDate}）`,
  )
  return list
}

if (import.meta.url === `file://${process.argv[1]}`) enrichStorylines()
