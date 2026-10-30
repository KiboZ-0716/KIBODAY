import { Link, useParams } from 'react-router-dom'
import { getStoryline, issues, pad } from '@/data'
import { useFollowing } from '@/lib/hooks'
import { PageShell } from '@/components/PageShell'
import { MediaImage } from '@/components/MediaImage'
import { Icon } from '@/components/Icon'
import { ArchiveRow } from '@/components/ArchiveSection'

export function StorylinePage() {
  const { id } = useParams()
  const storyline = id ? getStoryline(id) : undefined
  const { isFollowing, toggle } = useFollowing()

  if (!storyline) {
    return (
      <PageShell title="未找到该专题">
        <div className="page-body">
          <div className="empty-state">
            <h3>没有这个专题</h3>
            <p>它可能还没有被任何一期引用。</p>
            <Link to="/archive">打开往期归档</Link>
          </div>
        </div>
      </PageShell>
    )
  }

  const related = issues.filter((i) => i.storylineId === storyline.id)
  const currentIssue = related[0]
  const currentNode = currentIssue?.currentNode ?? storyline.nodes.length - 1
  const followed = isFollowing(storyline.id)

  return (
    <PageShell title={storyline.title}>
      <section className="page-head">
        <p className="eyebrow">STORYLINE · {storyline.topic}</p>
        <h1>持续追踪一个事件，直到它有了结论。</h1>
      </section>

      <div className="storyline-hero">
        {storyline.image && (
          <div className="hero-media">
            <MediaImage
              src={storyline.image}
              alt={storyline.title}
              sizes="(max-width: 900px) 100vw, 45vw"
              priority
            />
          </div>
        )}
        <div className="hero-copy">
          <span className="card-label">{storyline.topic}</span>
          <h1>{storyline.title}</h1>
          <p className="hero-summary">{storyline.summary}</p>
          <div className="hero-stats">
            <div>
              <b>{storyline.nodes.length}</b>
              <span>个节点</span>
            </div>
            <div>
              <b>{related.length}</b>
              <span>期次引用</span>
            </div>
            <div>
              <b>{currentIssue ? `NO.${pad(currentIssue.no)}` : '—'}</b>
              <span>最新一期</span>
            </div>
          </div>
          <button
            className={followed ? 'follow active' : 'follow'}
            onClick={() => toggle(storyline.id)}
            aria-pressed={followed}
            style={{ alignSelf: 'flex-start' }}
          >
            <Icon name="bookmark" /> {followed ? '已追踪' : '追踪事件'}
          </button>
        </div>
      </div>

      <div className="two-col" style={{ padding: '56px 0 90px' }}>
        <div>
          <div className="track">
            <div className="section-heading">
              <div>
                <span className="section-index">01</span>
                <h2>事件脉络</h2>
                <span>TIMELINE</span>
              </div>
            </div>
            <div className="track-list">
              {storyline.nodes.map((node, index) => (
                <article
                  className={index === currentNode ? 'track-item is-current' : 'track-item'}
                  key={`${node.time}-${node.title}`}
                >
                  <time>{node.time}</time>
                  <h3>
                    {node.title}
                    {index === currentNode && <span className="track-flag">当前节点</span>}
                  </h3>
                  <p>{node.body}</p>
                </article>
              ))}
            </div>
          </div>

          {related.length > 0 && (
            <div style={{ marginTop: 56 }}>
              <div className="section-heading">
                <div>
                  <span className="section-index">02</span>
                  <h2>相关期次</h2>
                  <span>RELATED ISSUES</span>
                </div>
              </div>
              <div className="archive-list" style={{ borderTop: '1px solid var(--ink)' }}>
                {related.map((issue) => (
                  <ArchiveRow key={issue.no} issue={issue} />
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="rail">
          <section className="rail-section sources">
            <div className="rail-title">
              <span>信源</span>
              <b>SOURCES</b>
            </div>
            <p className="rail-intro">以下信源构成了本专题的事实基础。</p>
            {(currentIssue?.sources ?? []).map((source) => (
              <div className="source-row" key={source.name}>
                <div>
                  <b>{source.name}</b>
                  <span>{source.stance}</span>
                </div>
                <div>
                  <time>{source.time}</time>
                  <i>{source.verified && <Icon name="check" />}</i>
                </div>
              </div>
            ))}
            {!currentIssue && <p className="rail-intro">暂无关联期次。</p>}
          </section>

          <section className="rail-section">
            <div className="rail-title">
              <span>怎么读</span>
              <b>HOW TO READ</b>
            </div>
            <p className="rail-intro">
              时间线只记录已确认的事实节点，推测与判断放在每期的「不止于头条」里，两者不混在一起。
            </p>
            <p className="rail-intro">
              节点状态：已发生为实心黑点，当前节点为红点，未发生节点标注为「下一节点」。
            </p>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}

export default StorylinePage
