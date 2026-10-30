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
  const ranked = [...briefPool].sort((a, b) => {
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount
    return b.time.localeCompare(a.time)
  })

  // 速览按发布时间倒序，最新在前；ranked 只决定入选集合，不决定展示顺序
  const briefs = ranked.map((event) => ({
    id: event.articles[0].id,
    time: event.time,
    tag: event.tag,
    title: event.title,
    source: event.sources[0],
    sources: event.sourceCount,
    summary: trim(event.summary, 64),
    url: event.articles[0].url,
  })).sort((a, b) => String(b.time).localeCompare(String(a.time)))

  // 卡片跳转校验：image/data 卡必须落在详情（事件报告或事件脉络）上，
  // 禁止再退回速览列表搜索页 —— 这是 2026-10-30 复盘出的编辑侧通病。
  const reportIds = new Set(events.flatMap((e) => e.articles.map((a) => a.id)))
  const storylineIds = new Set(Object.keys(brief.storylines ?? {}))
  for (const card of brief.cards ?? []) {
    const to = card.to ?? ''
    const reportHit = to.match(/^\/report\/([A-Za-z0-9-]+)$/)
    if (reportHit) {
      if (!reportIds.has(reportHit[1])) {
        throw new Error(`[compose] 卡片跳转指向不存在的事件报告：${to}（本期无此条目 id）`)
      }
      continue
    }
    const storylineHit = to.match(/^\/storyline\/([A-Za-z0-9-]+)$/)
    if (storylineHit) {
      if (!storylineIds.has(storylineHit[1])) {
        console.warn(`  ! 卡片跳转 ${to} 未在 brief.storylines 里登记，仅作提示`)
      }
      continue
    }
    throw new Error(
      `[compose] 卡片「${card.title ?? card.label ?? ''}」的 to="${to}" 不是详情路由。` +
        'image/data 卡必须指向 /report/<本期条目id> 或 /storyline/<脉络id>，不能指向 /issue/:no/briefs?q= 列表页。',
    )
  }

  const cards = (brief.cards ?? []).map((card) =>
    card.kind === 'image'
      ? {
          kind: 'image',
          image: mediaPath(assets, card.imageKey, 'lg'),
          credit: card.credit ?? leadEvent.imageCredit ?? 'K!B0',
          label: card.label,
          title: card.title,
          body: card.body,
          readMin: card.readMin ?? 3,
          to: card.to ?? `/issue/${no}/briefs`,
        }
      : card,
  )

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
  const score = Math.round(clamp(58 + 24 * verifiedRatio + 3.2 * avgSources + (leadEvent.image ? 2 : 0), 60, 99))

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
      image: leadEvent.image ? mediaPath(assets, brief.lead.imageKey, 'lg') : null,
      credit: leadEvent.imageCredit ?? brief.lead.credit ?? 'K!B0',
      sources: leadSources,
      verified: leadEvent.verified,
      sourceCount: leadEvent.sourceCount,
      storylineId: brief.lead.storylineId ?? null,
      href: null,
    },
    cards,
    briefs,
    analysis: {
      articleId: (
        analysisEvent.articles.find((a) => a.id === brief.analysis.eventId) ??
        analysisEvent.articles[0]
      ).id,
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
    trends: brief.trends,
    sources: sourceMatrix,
    quality: {
      score,
      items: [
        { label: '信源覆盖', value: verifiedRatio >= 0.75 ? '良好' : verifiedRatio >= 0.5 ? '一般' : '偏弱' },
        { label: '重复内容合并', value: `${stats.merged} 条` },
        { label: '低置信内容', value: `${hiddenCount} 条已隐藏`, warn: hiddenCount > 0 },
      ],
      note: '未达到发布阈值的内容不会出现在日报中；评分基于信源数量、独立信源覆盖与图片可用性自动计算。',
    },
    regional: brief.regional,
  }
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
