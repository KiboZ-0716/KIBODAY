import { bigrams, jaccard, uniq } from '../lib.mjs'

/**
 * 事件聚类。
 *
 * 合并规则（任一成立）：
 *   1. 归并键相同 —— 归并键由上游抽取阶段给出（同一件事的规范化标识），这是主路径；
 *   2. 共享实体 ≥ 2 —— 无归并键时（例如直接接 RSS），用「谁 + 哪里」兜底；
 *   3. 共享 1 个实体且标题相似度 ≥ 0.25；
 *   4. 标题相似度 ≥ 0.5。
 *
 * 之所以不让标题相似度单独决定，是因为中文新闻同一事件的措辞差异极大，
 * 单靠字面相似度会漏并；反过来只靠实体又会把「同城不同事」并到一起，所以两条都要。
 */
export function cluster(articles) {
  const nodes = articles.map((a) => ({
    article: a,
    bg: bigrams(a.title),
    entities: new Set(a.entities ?? []),
  }))
  const parent = nodes.map((_, i) => i)

  const find = (i) => {
    let cur = i
    while (parent[cur] !== cur) {
      parent[cur] = parent[parent[cur]]
      cur = parent[cur]
    }
    return cur
  }
  const union = (a, b) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const keyA = nodes[i].article.eventKey
      const keyB = nodes[j].article.eventKey
      if (keyA && keyB && keyA === keyB) {
        union(i, j)
        continue
      }
      const shared = countShared(nodes[i].entities, nodes[j].entities)
      const similarity = jaccard(nodes[i].bg, nodes[j].bg)
      if (shared >= 2 || (shared >= 1 && similarity >= 0.25) || similarity >= 0.5) union(i, j)
    }
  }

  const groups = new Map()
  nodes.forEach((node, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(node.article)
  })

  return [...groups.values()]
    .map((group) => buildEvent(group))
    .sort((a, b) => b.time.localeCompare(a.time))
}

function countShared(a, b) {
  let n = 0
  for (const item of a) if (b.has(item)) n += 1
  return n
}

function buildEvent(articles) {
  const sorted = [...articles].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
  const sources = uniq(sorted.map((a) => a.source))
  const tags = uniq(sorted.flatMap((a) => a.tags ?? []))
  const entities = uniq(sorted.flatMap((a) => a.entities ?? []))

  const primary = [...sorted].sort((a, b) => {
    if (a.image && !b.image) return -1
    if (!a.image && b.image) return 1
    if (a.summary.length !== b.summary.length) return b.summary.length - a.summary.length
    return b.duplicates.length - a.duplicates.length
  })[0]

  return {
    id: primary.id,
    eventKey: sorted.find((a) => a.eventKey)?.eventKey ?? null,
    time: sorted[sorted.length - 1].publishedAt,
    firstTime: sorted[0].publishedAt,
    title: primary.title,
    summary: primary.summary,
    tag: tags[0] ?? '国内',
    tags,
    entities,
    sources,
    articles: sorted,
    image: sorted.find((a) => a.image)?.image ?? null,
    imageCredit: sorted.find((a) => a.image)?.imageCredit ?? null,
  }
}
