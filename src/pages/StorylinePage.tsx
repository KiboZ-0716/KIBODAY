import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getStoryline, issues, pad } from '@/data'
import type { Storyline } from '@/data'
import { useFollowing } from '@/lib/hooks'
import { PageShell } from '@/components/PageShell'
import { MediaImage } from '@/components/MediaImage'
import { Icon } from '@/components/Icon'
import { ArchiveRow } from '@/components/ArchiveSection'

/**
 * 兜底：即便内容包里缺了某个专题，也从该期卡片 + 深度分析现场拼一份，
 * 绝不再把读者丢在「没有这个专题」的空页面上。
 */
function fallbackStoryline(rawId: string): Storyline | undefined {
  const id = rawId.replace(/^\/storyline\//, '')
  for (const issue of issues) {
    const card = (issue.cards ?? []).find((c) =>
      String((c as { to?: string }).to ?? '').includes(id),
    ) as Record<string, any> | undefined
    if (!card) continue
    const a = issue.analysis
    const sections = a?.sections ?? []
    return {
      id,
      topic: card.label ?? '今日重点',
      title: String(card.title ?? id).replace(/\n/g, ' '),
      summary: card.body ?? a?.body ?? '',
      image: card.image ?? null,
      credit: card.credit ?? 'K!B0 编辑部',
      nodes: [
        { time: issue.date, title: String(card.title ?? ''), body: card.body ?? a?.body ?? '' },
        ...(issue.briefs ?? []).slice(0, 4).map((b) => ({ time: b.time, title: b.title, body: b.summary })),
        { time: '前因 · 背景', title: '为什么偏偏是现在', body: sections.map((s) => s.paragraphs.join(' ')).join(' ') || a?.body || '' },
        { time: '关键数字', title: '可核对的数', body: (a?.metrics ?? []).map((m) => `${m.value} · ${m.label}`).join('；') },
        { time: '下一节点', title: '接下来盯什么', body: a?.takeaway?.body ?? '' },
      ],
      background: sections[0]?.paragraphs.join(' ') ?? a?.body,
      concepts: sections.slice(1, 4).map((s) => ({ term: s.heading, explain: s.paragraphs.join(' ') })),
      keyNumbers: a?.metrics,
      impact: a?.takeaway?.body,
      whatNext: a?.takeaway?.title,
      sources: (issue.sources ?? []).map((s) => s.name),
      updatedAt: issue.date,
      relatedDates: [issue.date],
    }
  }
  return undefined
}

const para: CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.9,
  color: 'var(--ink)',
  margin: '0 0 14px',
  whiteSpace: 'pre-wrap',
}

export function StorylinePage() {
  const { id } = useParams()
  const storyline = (id ? getStoryline(id) : undefined) ?? (id ? fallbackStoryline(id) : undefined)
  const { isFollowing, toggle } = useFollowing()

  if (!storyline) {
    return (
      <PageShell title="专题整理中">
        <div className="page-body">
          <div className="empty-state">
            <h3>这条专题还在整理</h3>
            <p>今天的日报已经收录了这条事件，可以先回首页看完整解读。</p>
            <Link to="/">回到今天这一期</Link>
          </div>
        </div>
      </PageShell>
    )
  }

  const related = issues.filter(
    (i) =>
      i.storylineId === storyline.id ||
      (i.cards ?? []).some((c) => String((c as { to?: string }).to ?? '').includes(storyline.id)),
  )
  const currentIssue = related[0]
  const currentNode = Math.min(currentIssue?.currentNode ?? storyline.nodes.length - 1, storyline.nodes.length - 1)
  const followed = isFollowing(storyline.id)
  const hasDeep = !!(storyline.background || storyline.concepts?.length || storyline.keyNumbers?.length || storyline.impact)

  return (
    <PageShell title={storyline.title}>
      <section className="page-head">
        <p className="eyebrow">STORYLINE · {storyline.topic}</p>
        <h1>把一件事的来龙去脉讲完。</h1>
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
          {storyline.updatedAt && (
            <p style={{ fontSize: 13, opacity: 0.7, margin: '8px 0 0' }}>更新至 {storyline.updatedAt}</p>
          )}
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
          {hasDeep && (
            <section className="section-block" style={{ marginBottom: 56 }}>
              <div className="section-heading">
                <div>
                  <span className="section-index">01</span>
                  <h2>深度解读</h2>
                  <span>FULL CONTEXT</span>
                </div>
              </div>

              {storyline.background && (
                <div style={{ margin: '28px 0 32px' }}>
                  <h3 style={{ fontSize: 19, margin: '0 0 12px' }}>前因：为什么偏偏是现在</h3>
                  <p style={para}>{storyline.background}</p>
                </div>
              )}

              {!!storyline.keyNumbers?.length && (
                <div style={{ margin: '0 0 32px' }}>
                  <h3 style={{ fontSize: 19, margin: '0 0 12px' }}>关键数字</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {storyline.keyNumbers.map((n) => (
                      <div key={n.label} style={{ border: '1px solid var(--ink)', padding: '14px 18px', minWidth: 170 }}>
                        <b style={{ display: 'block', fontSize: 26 }}>{n.value}</b>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>{n.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!!storyline.concepts?.length && (
                <div style={{ margin: '0 0 32px' }}>
                  <h3 style={{ fontSize: 19, margin: '0 0 12px' }}>概念与口径</h3>
                  {storyline.concepts.map((c) => (
                    <div key={c.term} style={{ marginBottom: 16 }}>
                      <b style={{ display: 'block', marginBottom: 4 }}>{c.term}</b>
                      <p style={para}>{c.explain}</p>
                    </div>
                  ))}
                </div>
              )}

              {storyline.impact && (
                <div style={{ margin: '0 0 32px' }}>
                  <h3 style={{ fontSize: 19, margin: '0 0 12px' }}>影响到谁</h3>
                  <p style={para}>{storyline.impact}</p>
                </div>
              )}

              {storyline.whatNext && (
                <div style={{ margin: '0 0 8px' }}>
                  <h3 style={{ fontSize: 19, margin: '0 0 12px' }}>接下来盯什么</h3>
                  <p style={para}>{storyline.whatNext}</p>
                </div>
              )}
            </section>
          )}

          <div className="track">
            <div className="section-heading">
              <div>
                <span className="section-index">{hasDeep ? '02' : '01'}</span>
                <h2>事件脉络</h2>
                <span>TIMELINE</span>
              </div>
            </div>
            <div className="track-list">
              {storyline.nodes.map((node, index) => (
                <article
                  className={index === currentNode ? 'track-item is-current' : 'track-item'}
                  key={`${node.time}-${node.title}-${index}`}
                >
                  <time>{node.time}</time>
                  <h3>
                    {node.title}
                    {index === currentNode && <span className="track-flag">当前节点</span>}
                  </h3>
                  <p style={{ lineHeight: 1.85 }}>{node.body}</p>
                </article>
              ))}
            </div>
          </div>

          {related.length > 0 && (
            <div style={{ marginTop: 56 }}>
              <div className="section-heading">
                <div>
                  <span className="section-index">{hasDeep ? '03' : '02'}</span>
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
            {!!storyline.sources?.length && (
              <p className="rail-intro" style={{ marginTop: 14 }}>本专题涉及：{storyline.sources.join('、')}</p>
            )}
            {!currentIssue && !storyline.sources?.length && <p className="rail-intro">暂无关联期次。</p>}
          </section>

          <section className="rail-section">
            <div className="rail-title">
              <span>怎么读</span>
              <b>HOW TO READ</b>
            </div>
            <p className="rail-intro">
              事实、前因、判断分开写。时间线只记录已确认的事实节点，推测与判断放在「深度解读」里。
            </p>
            <p className="rail-intro">
              追踪一个事件后，它会进入「我的追踪」；每期日报出现新进展，这里会多出一个节点。
            </p>
          </section>
        </aside>
      </div>
    </PageShell>
  )
}

export default StorylinePage
