import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { Icon } from './Icon'
import { SectionHeading } from './Layout'

export function AnalysisSection({ issue }: { issue: Issue }) {
  const { analysis } = issue

  return (
    <section className="section-block">
      <SectionHeading index="02" title="不止于头条" en="GO DEEPER" />

      <article className="analysis-card">
        <div className="analysis-main">
          <div className="story-kicker">
            <span>{analysis.label}</span>
            <span>{analysis.topic}</span>
          </div>
          <h2>{analysis.title}</h2>
          <p>{analysis.body}</p>

          <div className="impact-grid">
            {analysis.metrics.map((metric) => (
              <div key={metric.label}>
                <b>{metric.value}</b>
                <span>{metric.label}</span>
              </div>
            ))}
          </div>
        </div>

        <aside className="takeaway">
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
          <Link className="dark-button" to={`/issue/${issue.no}/analysis`}>
            读完整解读 <Icon name="arrow" />
          </Link>
        </aside>
      </article>
    </section>
  )
}
