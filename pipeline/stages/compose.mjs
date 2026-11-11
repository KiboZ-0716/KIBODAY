import { clamp, weekdayCn } from '../lib.mjs'

/**
 * 编排成刊：把核验后的事件 + 编辑意图（brief）拼成站点消费的 Issue。
 * 所有数字都由这里算出来，编辑侧只提供文字判断，不填任何统计值。
 */
export function compose({ source, brief, assets, no }) {
  const { events, hiddenCount } = source.verified
  if (!events.length) throw new Error('[compose] 没有通过核验的事件，本期不出刊')

  const findEvent = (articleId, fallbackIndex = 0) => {
    const hit = events.find((e) => e.articles.some((a) => a.id === articleId))
    return hit ?? events[fallbackIndex] ?? events[0]
  }

  const leadEvent = findEvent(brief.lead.eventId, 0)
  const analysisEvent = findEvent(brief.analysis.eventId, 1)

  const leadSources = leadEvent.articles
    .filter((a, i, arr) => arr.findIndex((b) => b.source === a.source) === i)
    .slice(0, 3)
    .map((a) => ({ initial: initialOf(a.source), name: a.source }))

  const briefPool = events.filter((e) => e.id !== leadEvent.id && e.id !== analysisEvent.id)

  // 本期速览按「重要程度」排序，不按时间。
  // 重要度优先取编辑（模型出稿时标注）的 importance，其次按可核对信号打分。
  const scored = briefPool.map((event) => ({
    event,
    importance: importanceOf(event, brief),
  }))
  scored.sort((a, b) => b.importance - a.importance || String(b.event.time).localeCompare(String(a.event.time)))

  const allBriefs = scored.map(({ event, importance }) => ({
    id: event.articles[0].id,
    time: event.time,
    tag: event.tag,
    title: event.title,
    source: event.sources[0],
    sources: event.sourceCount,
    importance,
    // 摘要是读者真正读到的正文（首页速览直接渲染），不再砍到 64 字。
    // 规范见 content/prompts/source-guide.md 第五条：含增量事实 / 为什么是现在 / 所以呢 / 下一步。
    summary: trim(event.summary, 200),
    url: event.articles[0].url,
  }))

  // 「本期速览」同时与「今日重点」「属地新闻」去重，任何一条消息只出现一次。
  // 今日重点用编辑化标题、速览用原始事实标题，措辞差异极大（实测 bigram 最低仅 0.16），
  // 只比相似度抓不全，因此用「稀有数字锚点 + 核心专名子串 + 标题相似度」三重判定：
  // 同一事件无论怎么改写，关键数字（144.7 / 4700 / 84.7）与核心专名（新能源乘用车出口 / 分拆平头哥）稳定不变。
  const topAnchors = buildTopAnchors(brief)
  const regionalTitles = (brief.regional?.cities ?? []).flatMap((c) =>
    (c.items ?? []).map((i) => normalizeTitle(i.title)),
  ).filter(Boolean)
  const briefs = allBriefs.filter((b) => {
    const t = normalizeTitle(b.title)
    return !coveredByTopStory(b.title, topAnchors) && !regionalTitles.some((r) => titleDuplicate(r, t))
  })

  // 今日重点配图：按「日期 + 标题」确定性从免版权图池里选 4 张互不相同的图。
  // 每期日期不同 → 选图不同；同一期 4 条也不同。图池随源码入库，运行时零外链。
  const coverKeys = pickCoverKeys(assets, source.date, [
    brief.lead.title,
    ...(brief.cards ?? []).map((c) => c.title ?? ''),
  ], 1 + (brief.cards ?? []).length)

  const cards = (brief.cards ?? []).map((card, i) => {
    const image = mediaPath(assets, coverKeys ? coverKeys[i + 1] : card.imageKey, 'lg')
    return card.kind === 'image'
      ? {
          kind: 'image',
          image,
          credit: card.credit ?? leadEvent.imageCredit ?? 'K!B0 图库',
          label: card.label,
          title: card.title,
          body: card.body,
          readMin: card.readMin ?? 3,
          to: card.to ?? `/issue/${no}/briefs`,
        }
      : { ...card, image }
  })

  const sourceMatrix = leadEvent.articles
    .filter((a, i, arr) => arr.findIndex((b) => b.source === a.source) === i)
    .slice(0, 3)
    .map((a) => ({
      name: a.source,
      stance: brief.sourceStances?.[a.source] ?? trim(a.summary, 18),
      time: a.publishedAt,
      verified: true,
    }))

  const stats = {
    fetched: source.articles.length,
    events: events.length,
    merged: source.merged,
    hidden: hiddenCount,
  }

  const verifiedRatio = events.filter((e) => e.verified).length / events.length
  const avgSources = events.reduce((sum, e) => sum + e.sourceCount, 0) / events.length
  const score = Math.round(clamp(58 + 24 * verifiedRatio + 3.2 * avgSources + (coverKeys ? 2 : 0), 60, 99))

  return {
    no,
    date: source.date,
    weekday: weekdayCn(source.date),
    window: source.window,
    generatedAt: brief.generatedAt ?? addMinutes(leadEvent.time, 38),
    headline: brief.headline,
    stats,
    synthesis: brief.synthesis,
    lead: {
      kicker: brief.lead.kicker,
      title: brief.lead.title,
      dek: brief.lead.dek,
      image: mediaPath(assets, coverKeys ? coverKeys[0] : brief.lead.imageKey, 'lg'),
      credit: 'K!B0 图库',
      sources: leadSources,
      verified: leadEvent.verified,
      sourceCount: leadEvent.sourceCount,
      storylineId: brief.lead.storylineId ?? null,
      href: null,
    },
    cards,
    briefs,
    analysis: {
      articleId: analysisEvent.articles[0].id,
      label: brief.analysis.label,
      topic: brief.analysis.topic,
      title: brief.analysis.title,
      body: brief.analysis.body,
      metrics: brief.analysis.metrics,
      takeaway: brief.analysis.takeaway,
      sections: brief.analysis.sections ?? [],
      citations: brief.analysis.citations ?? [],
    },
    storylineId: brief.lead.storylineId ?? null,
    currentNode: brief.lead.storylineId ? (brief.storylines?.[brief.lead.storylineId] ?? 0) : 0,
    trends: [],
    sources: sourceMatrix,
    quality: {
      score,
      items: [
        { label: '信源覆盖', value: verifiedRatio >= 0.75 ? '良好' : verifiedRatio >= 0.5 ? '一般' : '偏弱' },
        { label: '重复内容合并', value: `${stats.merged} 条` },
        { label: '低置信内容', value: `${hiddenCount} 条已隐藏`, warn: hiddenCount > 0 },
      ],
      note: '未达到发布阈值的内容不会出现在日报中；评分基于信源数量、独立信源覆盖与配图可用性自动计算。',
    },
    regional: withRegionalIds(brief.regional, source.date),
  }
}

/** 属地新闻改成「属地新闻」后仍要能深挖：给每条补稳定 id，并保留概括 */
function withRegionalIds(regional, date) {
  if (!regional?.cities) return regional
  const day = String(date).replace(/-/g, '').slice(4)
  const cityCode = { 重庆: 'cq', 青海: 'qh', 新疆: 'xj' }
  return {
    ...regional,
    cities: regional.cities.map((city, ci) => ({
      ...city,
      items: city.items.map((item, ii) => ({
        ...item,
        id: item.id || `r${day}-${cityCode[city.city] ?? `c${ci}`}-${ii + 1}`,
        summary: item.summary || item.title,
      })),
    })),
  }
}

/**
 * 重要度：编辑标注优先（1—5），否则按可核对信号打分，保证「重要的排前面」。
 * 财经与非财经信号词**分开各计一次**，避免财经词表数量多导致非财经硬新闻
 * 系统性低分（对应 feeds.json topicMix 的 60—70% 配比：配比靠多检索达成，
 * 不靠改排序，所以这里只做「打分口径校准」，不做题材配额、不给非财经加权）。
 */
const FINANCE_SIGNAL = /利率|加息|CPI|央行|关税|监管|汇率|出口|财报|分拆|上市|GDP|就业|通胀|产能|订单|营收|估值|融资|并购|股价|市值|进出口|成交额/
const PUBLIC_SIGNAL = /制裁|选举|判决|司法解释|事故|遇难|伤亡|灾害|疫情|确诊|疫苗|医保|集采|召回|停课|停运|管制|疏散|赔付|火灾|地震|暴雨|寒潮|污染|预警|抽检|起诉|通报|问责|学费|放假|退休|社保|学位|药品|审批|停供|限行/
const FINANCE_UNIT = /亿|万亿|%|个百分点|美元|元\/|基点|bp|万辆|吨/
const PUBLIC_UNIT = /人|例|户|起|所学校|毫米|摄氏度|℃|公里|万人次|万千瓦|万件|天数|省份|个省|级响应/

function importanceOf(event, brief) {
  const explicit = brief.importance?.[event.articles[0].id] ?? event.articles[0].importance
  if (Number.isFinite(Number(explicit)) && Number(explicit) > 0) return Number(explicit)
  const text = `${event.title} ${event.summary}`
  let score = 1
  score += Math.min(event.sourceCount, 3) * 0.6            // 多信源交叉
  if (FINANCE_SIGNAL.test(text)) score += 1.6
  if (PUBLIC_SIGNAL.test(text)) score += 1.6               // 与财经同等权重，校准而非加权
  if (FINANCE_UNIT.test(event.summary) || PUBLIC_UNIT.test(event.summary)) score += 0.7
  if (/\d/.test(event.summary) && /所以|意味着|判断|下一步|观察点|传导|回落|改写|责任|救治|后续/.test(event.summary)) score += 0.5
  if (/会议召开|圆满|揭晓|慰问|调研|建成\d+座/.test(event.title)) score -= 1.5
  return Math.round(clamp(score, 1, 5) * 10) / 10
}

/** FNV-1a 确定性 hash：同一期同一标题必得同一组图，不同期必然换图 */
function pickCoverKeys(assets, date, titles, count) {
  const pool = Object.keys(assets).filter((k) => /^pool-\d+$/.test(k)).sort()
  if (pool.length < count) return null
  const hash = (s) => {
    let x = 2166136261
    for (let i = 0; i < s.length; i += 1) {
      x ^= s.charCodeAt(i)
      x = Math.imul(x, 16777619)
    }
    return x >>> 0
  }
  const used = new Set()
  const out = []
  for (let i = 0; i < count; i += 1) {
    let idx = hash(`${date}|${titles[i] ?? ''}|${i}`) % pool.length
    while (used.has(pool[idx])) idx = (idx + 1) % pool.length
    used.add(pool[idx])
    out.push(pool[idx])
  }
  return out
}

function normalizeTitle(text = '') {
  return String(text).replace(/[\s\p{P}\p{S}]/gu, '')
}

/**
 * 「今日重点」的锚点：头条 + 三张卡各算一个锚点块。
 * 归一化会去掉标点，所以「144.7%」与「144.7」都变成 1447，标题与卡片数字口径自动对齐。
 * 锚点同时收标题与卡片正文/数字/口径注，这样「英伟达两日跌超9%」这类编辑化标题
 * 也能靠卡里的 4700 亿美元与速览的「市值蒸发超4700亿美元」对上。
 */
function buildTopAnchors(brief) {
  const blocks = [
    [brief.lead?.title, brief.lead?.dek].filter(Boolean).join(' '),
    ...(brief.cards ?? []).map((c) =>
      [c.title, c.body, c.footnote, c.caption, c.big, c.unit, c.label].filter(Boolean).join(' '),
    ),
  ]
  return blocks.map((text) => ({ grams: gramsOf(text), nums: rareNumsOf(text) }))
}

/** 相邻 2 字片段 + 连续数字串，作为「专名/数字」指纹 */
function gramsOf(text) {
  const t = normalizeTitle(text)
  const set = new Set()
  for (let i = 0; i < t.length - 1; i += 1) set.add(t.slice(i, i + 2))
  for (const m of t.matchAll(/\d{2,}/g)) set.add(m[0])
  return set
}

function rareNumsOf(text) {
  return [...normalizeTitle(text).matchAll(/\d{3,}/g)].map((m) => m[0])
}

/** 速览某条是否与今日重点讲的是同一件事 */
function coveredByTopStory(title, anchors) {
  const g = gramsOf(title)
  if (!g.size) return false
  const nums = rareNumsOf(title)
  for (const a of anchors) {
    if (!a.grams.size) continue
    let hit = 0
    for (const x of g) if (a.grams.has(x)) hit += 1
    const overlap = hit / Math.min(g.size, a.grams.size)
    const sharedRare = nums.some((n) => a.nums.includes(n))
    if (overlap > 0.72) return true                    // 措辞高度雷同，几乎确定同事件
    if (sharedRare && overlap > 0.18) return true      // 共享关键数字（口径/量级一致）
    if (overlap > 0.5) return true                     // 专名大面积重合
  }
  return false
}

/** 完全相同、互相包含，或二字词组重合度 > 0.72，都算同一条新闻 */
function titleDuplicate(a, b) {
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  const g = (s) => {
    const set = new Set()
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2))
    return set
  }
  const A = g(a)
  const B = g(b)
  if (!A.size || !B.size) return false
  let hit = 0
  for (const x of A) if (B.has(x)) hit += 1
  return hit / Math.min(A.size, B.size) > 0.72
}

function mediaPath(assets, key, size) {
  const entry = assets[key]
  if (!entry) throw new Error(`[compose] 素材缺失：${key}，请先运行 assets 阶段`)
  return `images/media/${key}-${size}.webp`
}

function initialOf(name) {
  const latin = name.match(/[A-Za-z]/)
  if (latin) return latin[0].toUpperCase()
  return name.trim().charAt(0)
}

function trim(text = '', max = 60) {
  const clean = String(text).replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h * 60 + m + minutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
