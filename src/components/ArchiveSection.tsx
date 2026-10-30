import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { issueStats, issues, pad } from '@/data'
import { Icon } from './Icon'
import { SectionHeading } from './Layout'

export function ArchiveSection({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(false)
  const others = issues.filter((i) => i.no !== issue.no)
  const visible = expanded ? others : others.slice(0, 4)
  const month = issue.date.slice(0, 7).replace('-', '年')
  const stats = issueStats(issue)

  return (
    <section className="archive" id="archive">
      <SectionHeading
        index="05"
        title="往期日报"
        en="DAILY ARCHIVE"
        action={
          <span className="archive-count">
            {month} 月 · 共 {issues.length} 期
          </span>
        }
      />

      <div className="archive-current">
        <div>
          <span>当前阅读</span>
          <b>{formatShort(issue.date)}</b>
          <small>{issue.weekday}</small>
        </div>
        <h3>{issue.synthesis.split('。')[0]}。</h3>
        <p>
          {stats.events} 个有效事件 · {stats.articles} 篇来源文章
        </p>
      </div>

      <div className="archive-list">
        {visible.map((item) => (
          <ArchiveRow key={item.no} issue={item} />
        ))}
      </div>

      {others.length > 4 && (
        <button className="archive-more" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? '收起列表' : '查看更多日报'} <span>{expanded ? '↑' : '↓'}</span>
        </button>
      )}
      {others.length === 0 && (
        <p className="archive-more" style={{ textAlign: 'center' }}>
          这是目前最早的一期
        </p>
      )}
      {others.length > 0 && others.length <= 4 && (
        <Link className="archive-more" to="/archive" style={{ display: 'block', textAlign: 'center' }}>
          查看完整归档 <span>→</span>
        </Link>
      )}
    </section>
  )
}

export function ArchiveRow({ issue }: { issue: Issue }) {
  const stats = issueStats(issue)
  return (
    <Link className="archive-row" to={`/issue/${issue.no}`}>
      <span className="archive-date">
        <b>{formatShort(issue.date)}</b>
        <small>{issue.weekday}</small>
      </span>
      <span className="archive-title">
        <small>NO. {pad(issue.no)}</small>
        <b>{issue.lead.title.replace(/\n/g, '')}</b>
      </span>
      <span className="archive-stats">
        {stats.events} 个事件 · {stats.sources} 篇来源
      </span>
      <Icon name="arrow" />
    </Link>
  )
}

export function formatShort(iso: string) {
  const [, m, d] = iso.split('-')
  return `${Number(m)}月${Number(d)}日`
}
