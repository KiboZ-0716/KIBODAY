import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { Icon } from './Icon'
import { SectionHeading } from './Layout'

export function BriefsSection({ issue, limit = 4 }: { issue: Issue; limit?: number }) {
  const shown = issue.briefs.slice(0, limit)

  return (
    <section className="section-block">
      <SectionHeading
        index="01"
        title="本期速览"
        en="DAILY BRIEFING"
        action={
          <Link to={`/issue/${issue.no}/briefs`}>
            查看全部 {issue.briefs.length} 条 <Icon name="arrow" />
          </Link>
        }
      />

      <div className="news-list">
        {shown.map((brief) => (
          <div className="news-row" key={`${brief.time}-${brief.title}`}>
            <time>{brief.time}</time>
            <div>
              <span className="topic-tag">{brief.tag}</span>
              <h3>{brief.title}</h3>
              <p>
                {brief.source} · {brief.sources} 个信源 · AI 摘要
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
