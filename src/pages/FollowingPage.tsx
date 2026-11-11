import { Link } from 'react-router-dom'
import { getIssue, latestIssue, pad, storylines } from '@/data'
import { useFollowing } from '@/lib/hooks'
import { PageShell } from '@/components/PageShell'
import { Icon } from '@/components/Icon'

/**
 * 「追踪」= 订阅一个还没结论的事件。
 * 同一个事件每天出现新报道时，内容包会给它加一个节点，这里就会跟着变。
 * 订阅关系存在浏览器本地，不需要登录。
 */
export function FollowingPage() {
  const { ids, toggle } = useFollowing()
  const byNewest = (a: typeof storylines[number], b: typeof storylines[number]) =>
    String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
  const tracked = storylines.filter((s) => ids.includes(s.id)).sort(byNewest)
  const available = storylines.filter((s) => !ids.includes(s.id)).sort(byNewest)
  const today = latestIssue?.date ?? ''
  const fresh = storylines.filter((s) => s.updatedAt === today).length

  const row = (storyline: typeof storylines[number], isTracked: boolean) => {
    const issue = getIssue(storyline.latestNo)
    const node = issue ? storyline.nodes[Math.min(issue.currentNode, storyline.nodes.length - 1)] : storyline.nodes[storyline.nodes.length - 1]
    const isFresh = !!storyline.updatedAt && storyline.updatedAt >= today
    return (
      <div className="archive-row" key={storyline.id} style={{ gridTemplateColumns: '110px minmax(0, 1fr) 170px auto' }}>
        <span className="archive-date">
          <b>{storyline.topic.split(' · ')[0]}</b>
          <small>{storyline.nodes.length} 个节点 · 更新至 {storyline.updatedAt ?? '—'}</small>
        </span>
        <Link className="archive-title" to={`/storyline/${storyline.id}`}>
          <small>
            {isFresh && <span style={{ color: '#c0392b', marginRight: 8 }}>● 今日有新进展</span>}
            NO. {issue ? pad(issue.no) : '—'} · {storyline.relatedDates?.length ?? 1} 期跟踪
          </small>
          <b>{storyline.title}</b>
        </Link>
        <span className="archive-stats">
          {node?.time}
          <br />
          {node?.title}
          {node?.body && <span style={{ display: 'block', opacity: 0.65, marginTop: 4, fontSize: 12 }}>{node.body.slice(0, 46)}…</span>}
        </span>
        <button
          className={isTracked ? 'follow active' : 'follow'}
          onClick={() => toggle(storyline.id)}
          aria-label={`${isTracked ? '取消追踪' : '追踪'} ${storyline.title}`}
        >
          <Icon name="bookmark" /> {isTracked ? '已追踪' : '追踪'}
        </button>
      </div>
    )
  }

  return (
    <PageShell title="我的追踪">
      <section className="page-head">
        <p className="eyebrow">WATCHLIST · {tracked.length} TRACKED · {fresh} UPDATED TODAY</p>
        <h1>你在等结论的事。</h1>
        <p className="lede">
          一个事件往往要几天才有结果。点「追踪事件」把它留在这里，之后每期日报只要出现新进展，
          它的时间线就会多一个节点，并标上「今日有新进展」。订阅只存在这台设备的浏览器里，不需要登录。
        </p>
      </section>

      <div className="page-body">
        {tracked.length === 0 ? (
          <div className="empty-state">
            <h3>还没有追踪任何事件</h3>
            <p>点开首页头条或三张重点卡片，在专题页点「追踪事件」，它就会出现在这里。</p>
            <Link to="/">去今天这一期</Link>
          </div>
        ) : (
          <div className="archive-list" style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}>
            {tracked.map((s) => row(s, true))}
          </div>
        )}

        {available.length > 0 && (
          <section className="follow-suggest">
            <div className="rail-title">
              <span>{tracked.length === 0 ? '正在跟踪的事件' : '还可以追踪'}</span>
              <b>OPEN STORYLINES</b>
            </div>
            <div
              className="archive-list"
              style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}
            >
              {available.map((s) => row(s, false))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  )
}
