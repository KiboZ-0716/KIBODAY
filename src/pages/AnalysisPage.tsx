import { Link, useParams } from 'react-router-dom'
import { getIssue, getIssueNeighbours, pad } from '@/data'
import { PageShell } from '@/components/PageShell'
import { Icon } from '@/components/Icon'

export function AnalysisPage() {
  const { no } = useParams()
  const issue = getIssue(no ?? '')

  if (!issue) {
    return (
      <PageShell title="未找到解读">
        <div className="page-body">
          <div className="empty-state">
            <h3>没有这一期的解读</h3>
            <p>链接可能过期了，去归档里找找。</p>
            <Link to="/archive">打开往期归档</Link>
          </div>
        </div>
      </PageShell>
    )
  }

  const { analysis } = issue
  const { prev, next } = getIssueNeighbours(issue.no)
  const related = issue.briefs.filter((brief) =>
    analysis.topic
      .split(' · ')
      .some((topic) => brief.tag === topic || brief.title.includes(topic)),
  )

  return (
    <PageShell title={`NO.${pad(issue.no)} 深度解读`}>
      <section className="page-head deep-head">
        <p className="eyebrow">
          {analysis.label} · NO. {pad(issue.no)} · {issue.date}
        </p>
        <h1 className="deep-title">{analysis.title}</h1>
        <p className="lede">{analysis.body}</p>
        <div className="head-meta">
          <span>{analysis.topic}</span>
          <span>{analysis.sections.length} 节</span>
          <span>约 {analysis.sections.reduce((n, s) => n + s.paragraphs.join('').length, 0)} 字</span>
          <span>数字与出处 {analysis.citations.length} 条</span>
        </div>
      </section>

      <div className="deep-layout">
        <article className="deep-body">
          {analysis.sections.map((section, index) => (
            <section className="deep-section" key={section.heading} id={`s${index + 1}`}>
              <div className="deep-section-index">{String(index + 1).padStart(2, '0')}</div>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 12)}>{paragraph}</p>
              ))}
              {section.list && (
                <ul>
                  {section.list.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>

        <aside className="deep-rail">
          <div className="deep-card">
            <span>关键数字</span>
            <div className="impact-grid">
              {analysis.metrics.map((metric) => (
                <div key={metric.label}>
                  <b>{metric.value}</b>
                  <span>{metric.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="deep-card takeaway-card">
            <span>AI TAKEAWAY · 研判内容</span>
            <h3>{analysis.takeaway.title}</h3>
            <p>{analysis.takeaway.body}</p>
            <ul>
              {analysis.takeaway.points.map((point, index) => (
                <li key={point}>
                  <Icon name={index === 0 ? 'check' : 'clock'} />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="deep-card">
            <span>数字与出处</span>
            <ul className="citation-list">
              {analysis.citations.map((citation) => (
                <li key={citation.label}>
                  <b>{citation.value}</b>
                  <span>{citation.label}</span>
                  <small>{citation.source}</small>
                </li>
              ))}
            </ul>
          </div>

          {related.length > 0 && (
            <div className="deep-card">
              <span>同期相关速览</span>
              <ul className="related-list">
                {related.slice(0, 4).map((brief) => (
                  <li key={brief.title}>
                    <Link to={`/issue/${issue.no}/briefs?q=${encodeURIComponent(brief.tag)}`}>
                      <b>{brief.title}</b>
                      <small>
                        {brief.time} · {brief.source}
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <div className="issue-switch deep-switch">
        <Link to={`/issue/${issue.no}`}>
          回到本期日报
          <b>NO.{pad(issue.no)} · {issue.date}</b>
        </Link>
        {next ? (
          <Link to={`/issue/${next.no}/analysis`}>
            下一期解读 · NO.{pad(next.no)}
            <b>{next.analysis.title.replace(/\n/g, '')}</b>
          </Link>
        ) : prev ? (
          <Link to={`/issue/${prev.no}/analysis`}>
            上一期解读 · NO.{pad(prev.no)}
            <b>{prev.analysis.title.replace(/\n/g, '')}</b>
          </Link>
        ) : (
          <span />
        )}
      </div>
    </PageShell>
  )
}
