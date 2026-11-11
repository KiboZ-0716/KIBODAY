import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { Icon } from './Icon'
import { SectionHeading } from './Layout'
import { MediaImage } from './MediaImage'

/**
 * 首页「今日三件事」：当天最重要、最该展开读的三条，与题材类别无关。
 * 每张卡都指向一份带前因后果、关键数字、概念口径、影响与后续节点的完整专题。
 */
export function TopStoriesSection({ issue }: { issue: Issue }) {
  const cards = (issue.cards ?? []).slice(0, 3) as Record<string, any>[]
  if (!cards.length) return null

  return (
    <section className="section-block top-stories-block">
      <SectionHeading
        index="00"
        title="今日三件事"
        en="TOP STORIES"
        action={<span style={{ fontSize: 12, opacity: 0.65 }}>按重要性挑，与题材无关 · 点开读完整专题</span>}
      />
      <div className="top-stories">
        {cards.map((card, index) => {
          const to = String(card.to ?? `/issue/${issue.no}/briefs`)
          return (
            <Link className="top-story" to={to} key={`${to}-${index}`}>
              <span className="top-story-no">{String(index + 1).padStart(2, '0')}</span>
              {card.image && (
                <div className="top-story-media">
                  <MediaImage src={card.image} alt={card.title} sizes="(max-width: 900px) 100vw, 32vw" />
                </div>
              )}
              <div className="top-story-body">
                <span className="card-label">{card.label ?? '今日重点'}</span>
                <h3>{String(card.title ?? '').replace(/\n/g, ' ')}</h3>
                {card.kind === 'data' ? (
                  <div className="top-story-data">
                    <b>{card.big}<small>{card.unit}</small></b>
                    <span>{card.caption} · {card.footnote}</span>
                  </div>
                ) : (
                  <p>{card.body}</p>
                )}
                <span className="top-story-more">
                  读完整专题 <Icon name="arrow" />
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
