import { Link } from 'react-router-dom'
import { getIssue, latestIssue, pad, storylines } from '@/data'
import { useFollowing } from '@/lib/hooks'
import { PageShell } from '@/components/PageShell'
import { Icon } from '@/components/Icon'

/**
 * 「追踪」= 订阅一个还没结论的事件：每天汇总它的新进展。
 * 不追踪的事件只作为候选列在下面，不进入清单、不逐日跟踪。
 * 订阅关系存在浏览器本地，不需要登录。
 */
export function FollowingPage() {
  const { ids, toggle } = useFollowing()
  const byNewest = (a: typeof storylines[number], b: typeof storylines[number]) =>
    String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
  const tracked = storylines.filter((s) => ids.includes(s.id)).sort(byNewest)
  const available = storylines.filter((s) => !ids.includes(s.id)).sort(byNewest)
  const today = latestIssue?.date ?? ''

  const hasFreshProgress = (s: typeof storylines[number]) =>
    (s.nodes ?? []).some(
      (n) => String(n.time).includes('今日进展') && !/没有新的可核对进展/.test(n.title),
    ) && s.updatedAt === today
  const fresh = tracked.filter(hasFreshProgress).length

  const row = (storyline: typeof storylines[number], isTracked: boolean) => {
    const issue = getIssue(storyline.latestNo)
    const node = issue
      ? storyline.nodes[Math.min(issue.currentNode, storyline.nodes.length - 1)]
      : storyline.nodes[storyline.nodes.length - 1]
    const isFresh = hasFreshProgress(storyline)
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
          <b>追踪 = 每天替你盯这条事件</b>：每期日报只要出现新报道，这里就多一个节点并标「今日有新进展」，首页的持续追踪也会展开完整时间线。
          <b> 不追踪 = 不特别跟踪</b>，只作为候选列在下面，不占你的追踪清单。订阅只存在这台设备的浏览器里，不需要登录。
        </p>
      </section>

      <div className="page-body">
        {tracked.length === 0 ? (
          <div className="empty-state">
            <h3>还没有追踪任何事件</h3>
            <p>点开首页「今日重点」里任意一条，在专题页点「追踪事件」，它就会进入这份每日更新的清单。</p>
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
              <span>还可以追踪</span>
              <b>OPEN STORYLINES</b>
            </div>
            <p className="rail-intro">下面这些事件目前没有特别跟踪，也不会逐日汇总进展。点「追踪」后才会进入上面的清单。</p>
            <div className="candidate-list">
              {available.map((s) => (
                <div className="candidate-row" key={s.id}>
                  <Link to={`/storyline/${s.id}`}>
                    <b>{s.title}</b>
                    <small>{s.topic} · 更新至 {s.updatedAt ?? '—'}</small>
                  </Link>
                  <button className="follow" onClick={() => toggle(s.id)} aria-label={`追踪 ${s.title}`}>
                    <Icon name="bookmark" /> 追踪
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  )
}
