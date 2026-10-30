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
        title="与你有关"
        en="REGIONAL WATCH"
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
        {current.items.map((item) => (
          <article key={item.id}>
            <span>{item.tag}</span>
            <h3>{item.title}</h3>
            <div className="region-foot">
              <p>
                {item.source} · {item.relTime}
              </p>
              {item.id && (
                <Link className="region-dig" to={`/report/${item.id}`}>
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
