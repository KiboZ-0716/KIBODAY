import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { Icon } from './Icon'
import { MediaImage } from './MediaImage'

export function LeadBlock({ issue }: { issue: Issue }) {
  const { lead } = issue

  return (
    <section className="lead-grid lead-grid--solo">
      <article className={lead.image ? 'lead-story' : 'lead-story no-image'}>
        {lead.image && (
          <div className="image-wrap">
            <MediaImage
              src={lead.image}
              alt={lead.title.replace(/\n/g, '')}
              sizes="(max-width: 760px) 100vw, (max-width: 1024px) 100vw, 46vw"
              priority
            />
            <div className="image-credit">{lead.credit}</div>
          </div>
        )}

        <div className="story-content">
          <div className="story-kicker">
            <span>{lead.kicker[0]}</span>
            <span>{lead.kicker[1]}</span>
            <span className="verified">
              <Icon name="check" />
              {lead.verified
                ? `${lead.sourceCount}/${lead.sourceCount} 信源已核验`
                : '单信源 · 待交叉核验'}
            </span>
          </div>

          <h2>{lead.title}</h2>
          <p className="dek">{lead.dek}</p>

          <div className="story-footer">
            <div className="source-stack">
              {lead.sources.map((source) => (
                <span key={source.name} title={source.name}>
                  {source.initial}
                </span>
              ))}
              <b>{lead.sourceCount} 个独立信源</b>
            </div>
            {lead.storylineId ? (
              <Link className="text-button" to={`/storyline/${lead.storylineId}`}>
                进入事件专题 <Icon name="arrow" />
              </Link>
            ) : (
              <Link className="text-button" to={`/issue/${issue.no}/briefs`}>
                查看本期全部 <Icon name="arrow" />
              </Link>
            )}
          </div>
        </div>
      </article>

    </section>
  )
}
