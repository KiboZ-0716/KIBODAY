// 深挖索引：把每条可深挖的条目（速览 + 与你有关）连同同源报道一起导出
// 站点在浏览器里按这个索引构造提示词，再调用模型生成事件报告
export function buildTopics({ issue, articles }) {
  const groups = new Map()
  const keyOf = new Map()

  for (const article of articles) {
    const key = article.eventKey ?? article.id
    keyOf.set(article.id, key)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({
      name: article.source,
      time: article.publishedAt,
      title: article.title,
      summary: article.summary,
      url: article.url,
    })
  }

  const topics = []

  for (const brief of issue.briefs) {
    const reports = groups.get(keyOf.get(brief.id)) ?? []
    topics.push({
      id: brief.id,
      kind: 'brief',
      issueNo: issue.no,
      date: issue.date,
      time: brief.time,
      tag: brief.tag,
      title: brief.title,
      summary: brief.summary,
      url: brief.url,
      sourceCount: brief.sources,
      reports,
    })
  }

  for (const city of issue.regional.cities) {
    for (const item of city.items) {
      topics.push({
        id: item.id,
        kind: 'regional',
        issueNo: issue.no,
        date: issue.date,
        time: item.relTime,
        tag: item.tag,
        title: item.title,
        summary: item.summary,
        url: item.url ?? '',
        sourceCount: 1,
        city: city.city,
        reports: [
          {
            name: item.source,
            time: item.relTime,
            title: item.title,
            summary: item.summary,
            url: item.url ?? '',
          },
        ],
      })
    }
  }

  return topics
}
