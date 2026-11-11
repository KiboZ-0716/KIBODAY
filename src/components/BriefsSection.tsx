import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { Icon } from './Icon'
import { SectionHeading } from './Layout'

const normalize = (s = '') => String(s).replace(/[\s\p{P}\p{S}]/gu, '')

/** 完全相同、互相包含，或二字词组重合度 > 0.72，判为同一条新闻 */
function duplicate(a: string, b: string) {
  if (!a || !b) return false
  if (a === b || a.includes(b) || b.includes(a)) return true
  const g = (s: string) => {
    const set = new Set<string>()
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

export function BriefsSection({ issue, limit = 6 }: { issue: Issue; limit?: number }) {
  // 「与你有关」已经展开的条目不再出现在「本期速览」，两个版块不重复
  const regionalTitles = (issue.regional?.cities ?? []).flatMap((c) =>
    (c.items ?? []).map((i) => normalize(i.title)),
  )
  const briefs = issue.briefs.filter(
    (b) => !regionalTitles.some((r) => duplicate(r, normalize(b.title))),
  )
  const shown = briefs.slice(0, limit)

  return (
    <section className="section-block">
      <SectionHeading
        index="01"
        title="本期速览"
        en="DAILY BRIEFING"
        action={
          <Link to={`/issue/${issue.no}/briefs`}>
            查看全部 {briefs.length} 条 <Icon name="arrow" />
          </Link>
        }
      />

      <div className="news-list">
        {shown.map((brief) => (
          <div className="news-row news-row--rich" key={`${brief.time}-${brief.title}`}>
            <time>{brief.time}</time>
            <div>
              <span className="topic-tag">{brief.tag}</span>
              <h3>{brief.title}</h3>
              <p className="news-summary">{brief.summary}</p>
              <p className="news-byline">
                {brief.source} · {brief.sources} 个信源 · 原文可核对
              </p>
            </div>
            <span className="row-actions">
              <Link to={`/report/${brief.id}`} title="生成该事件的深度报告">
                <Icon name="search" /> 深挖
              </Link>
              <Link to={`/issue/${issue.no}/briefs?tag=${encodeURIComponent(brief.tag)}`}>
                <span className="row-arrow">
                  <Icon name="arrow" />
                </span>
              </Link>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
