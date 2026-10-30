import { clamp } from '../lib.mjs'

/**
 * 发布闸门。
 *
 * 关键判断：单信源不等于不可信——大量一手通报本身就是单信源。
 * 所以"隐藏"不以信源数量为准，而以信息完整度为准：
 *   · 摘要过短、无标签、标题过短 → 信息不足，不进日报；
 *   · 单信源但信息完整 → 正常上刊，但标记为"未经交叉核验"。
 * 这样既不会因为求稳把日报做成空白，也不会把残缺信息当成品发出。
 */
export function verify(events, { minConfidence = 0.5 } = {}) {
  const scored = events.map((event) => {
    const sourceCount = event.sources.length
    const hasImage = Boolean(event.image)
    const summaryLength = (event.summary ?? '').replace(/\s/g, '').length
    const titleLength = (event.title ?? '').replace(/\s/g, '').length

    const complete = summaryLength >= 30 && titleLength >= 8 && event.tags.length > 0
    const confidence = clamp(
      0.5 + 0.15 * (sourceCount - 1) + (hasImage ? 0.06 : 0) + (event.articles.length > 1 ? 0.04 : 0),
      0,
      1,
    )

    return {
      ...event,
      sourceCount,
      verified: sourceCount >= 2,
      confidence: Number(confidence.toFixed(3)),
      complete,
      reason: complete ? null : summaryLength < 30 ? '摘要信息不足' : '缺少分类标签',
    }
  })

  const published = scored.filter((e) => e.complete && e.confidence >= minConfidence)
  const hidden = scored.filter((e) => !published.includes(e))

  return {
    events: published,
    hiddenCount: hidden.length,
    hidden: hidden.map((e) => ({ title: e.title, reason: e.reason ?? '置信度不足' })),
  }
}
