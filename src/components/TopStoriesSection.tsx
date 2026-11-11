import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { Icon } from './Icon'
import { SectionHeading } from './Layout'
import { MediaImage } from './MediaImage'

/**
 * 首页「今日重点」：一个模块里放 1 个最重要的头条 + 3 件次重要的事。
 * 四条全部按重要性挑、与题材无关，且都指向模型撰写的完整专题。
 * 头条与三张卡各自使用不同主题配图。
 */
export function TopStoriesSection({ issue }: { issue: Issue }) {
  const { lead } = issue
  const cards = (issue.cards ?? []).slice(0, 3) as Record<string, any>[]
  const leadTo = lead.storylineId ? `/storyline/${lead.storylineId}` : `/issue/${issue.no}/briefs`

  return (
    <section className="section-block top-block">
      <SectionHeading
        index="00"
        title="今日重点"
        en="TOP STORIES"
        action={<span style={{ fontSize: 12, opacity: 0.65 }}>1 个头条 + 3 件次重要 · 全部可读完整专题</span>}
      />

      <div className="top-grid">
        <Link className="top-lead" to={leadTo}>
          {lead.image && (
            <div className="top-lead-media">
              <MediaImage src={lead.image} alt={lead.title.replace(/\n/g, '')} sizes="(max-width: 900px) 100vw, 42vw" priority />
              <div className="image-credit">{lead.credit}</div>
            </div>
          )}
          <div className="top-lead-body">
            <div className="top-lead-kicker">
              <span className="top-no">01</span>
              <span className="card-label">头条 · {lead.kicker[1] ?? lead.kicker[0]}</span>
              <span className="verified">
                <Icon name="check" />
                {lead.verified ? `${lead.sourceCount} 个独立信源已核验` : '单信源 · 待交叉核验'}
              </span>
            </div>
            <h2>{String(lead.title).replace(/\n/g, ' ')}</h2>
            <p className="top-lead-dek">{lead.dek}</p>
            <div className="top-lead-sources">
              <div className="source-stack">
                {lead.sources.map((s) => (
                  <span key={s.name} title={s.name}>{s.initial}</span>
                ))}
              </div>
              <b>{lead.sources.map((s) => s.name).join(' · ')}</b>
            </div>
            <span className="top-more">读完整专题 <Icon name="arrow" /></span>
          </div>
        </Link>

        <div className="top-sub">
          {cards.map((card, index) => {
            const to = String(card.to ?? `/issue/${issue.no}/briefs`)
            return (
              <Link className="top-sub-card" to={to} key={`${to}-${index}`}>
                {card.image && (
                  <div className="top-sub-media">
                    <MediaImage src={card.image} alt={card.title} sizes="(max-width: 900px) 100vw, 30vw" />
                  </div>
                )}
                <div className="top-sub-body">
                  <span className="top-no">{String(index + 2).padStart(2, '0')}</span>
                  <span className="card-label">{card.label ?? '今日重点'}</span>
                  <h3>{String(card.title ?? '').replace(/\n/g, ' ')}</h3>
                  {card.kind === 'data' ? (
                    <div className="top-sub-data">
                      <b>{card.big}<small>{card.unit}</small></b>
                      <span>{card.caption} · {card.footnote}</span>
                    </div>
                  ) : (
                    <p>{card.body}</p>
                  )}
                  <span className="top-more">读完整专题 <Icon name="arrow" /></span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </section>
  )
}
