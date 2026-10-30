import { bigrams, jaccard, normalizeTitle, uniq } from '../lib.mjs'

/**
 * 归一化 + 去重（转载识别）。
 * 两条规则：
 *   1. 归一化后标题完全相同 —— 直接合并；
 *   2. 归并键相同 且 摘要前缀高度相似（≥0.8）—— 判定为转载，保留信息更全的一条。
 * 被合并的条数会进入"重复内容合并 N 条"统计，这是质量报告的一部分。
 */
export function normalize(articles, { prefixLength = 64, summaryThreshold = 0.8 } = {}) {
  const kept = []
  let merged = 0

  for (const article of articles) {
    const titleKey = normalizeTitle(article.title)
    const sig = normalizeTitle(article.summary ?? '').slice(0, prefixLength)
    const sigBg = bigrams(sig)

    const dup = kept.find((k) => {
      if (k._titleKey === titleKey) return true
      if (!article.eventKey || k.eventKey !== article.eventKey) return false
      if (!sig || !k._sig) return false
      return jaccard(k._sigBg, sigBg) >= summaryThreshold
    })

    if (dup) {
      dup.duplicates.push({
        source: article.source,
        time: article.publishedAt,
        title: article.title,
      })
      merged += 1
      if (!dup.image && article.image) {
        dup.image = article.image
        dup.imageCredit = article.imageCredit
      }
      continue
    }

    kept.push({
      ...article,
      duplicates: [],
      _titleKey: titleKey,
      _sig: sig,
      _sigBg: sigBg,
    })
  }

  return {
    articles: kept.map(({ _titleKey, _sig, _sigBg, ...rest }) => rest),
    merged,
  }
}
