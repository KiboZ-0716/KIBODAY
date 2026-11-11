import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { SectionHeading } from './Layout'
import { Icon } from './Icon'

export function RegionalSection({ issue }: { issue: Issue }) {
  const { regional } = issue
  const [active, setActive] = useState(regional.default)
  const current = regional.cities.find((c) => c.city === active) ?? regional.cities[0]

  return (
    <section className="regional">
      <SectionHeading
        index="04"
        title="属地新闻"
        en="LOCAL DESK"
        action={
          <div className="region-tabs" role="tablist" aria-label="选择地区">
            {regional.cities.map((option) => (
              <button
                key={option.city}
                role="tab"
                aria-selected={current.city === option.city}
                className={current.city === option.city ? 'is-active' : undefined}
                onClick={() => setActive(option.city)}
              >
                {option.city}
              </button>
            ))}
          </div>
        }
      />

      <div className="regional-grid">
        {current.items.slice(0, 3).map((item) => (
          <article key={item.id}>
            <span>{item.tag}</span>
            <h3>{item.title}</h3>
            {item.summary && <p className="region-summary">{item.summary}</p>}
            <div className="region-foot">
              <p>
                {item.source} · {item.relTime}
              </p>
              {item.id && (
                <Link className="region-dig" to={`/report/${item.id}`} title="由模型撰写这条属地事件的完整专题">
                  深挖
                  <Icon name="arrow" />
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
