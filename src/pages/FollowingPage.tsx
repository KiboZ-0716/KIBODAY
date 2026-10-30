import { Link } from 'react-router-dom'
import { getIssue, pad, storylines } from '@/data'
import { useFollowing } from '@/lib/hooks'
import { PageShell } from '@/components/PageShell'
import { Icon } from '@/components/Icon'

export function FollowingPage() {
  const { ids, toggle } = useFollowing()
  const tracked = storylines.filter((s) => ids.includes(s.id))
  const available = storylines.filter((s) => !ids.includes(s.id))

  return (
    <PageShell title="我的追踪">
      <section className="page-head">
        <p className="eyebrow">WATCHLIST · {tracked.length} STORYLINES</p>
        <h1>你在等结论的事。</h1>
        <p className="lede">
          追踪列表保存在这台设备的浏览器里，不需要登录。每期日报更新后，这里会同步显示该事件的最新节点。
        </p>
      </section>

      <div className="page-body">
        {tracked.length === 0 ? (
          <div className="empty-state">
            <h3>还没有追踪任何事件</h3>
            <p>在每期首页的「持续追踪」版块点击「追踪事件」，它就会出现在这里。</p>
            <Link to="/">去今天这一期</Link>
          </div>
        ) : (
          <div className="archive-list" style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}>
            {tracked.map((storyline) => {
              const issue = getIssue(storyline.latestNo)
              const node = issue ? storyline.nodes[issue.currentNode] : storyline.nodes[storyline.nodes.length - 1]
              return (
                <div className="archive-row" key={storyline.id} style={{ gridTemplateColumns: '110px minmax(0, 1fr) 150px auto' }}>
                  <span className="archive-date">
                    <b>{storyline.topic.split(' · ')[0]}</b>
                    <small>{storyline.nodes.length} 个节点</small>
                  </span>
                  <Link className="archive-title" to={`/storyline/${storyline.id}`}>
                    <small>NO. {issue ? pad(issue.no) : '—'} 最新节点</small>
                    <b>{storyline.title}</b>
                  </Link>
                  <span className="archive-stats">
                    {node?.time}
                    <br />
                    {node?.title}
                  </span>
                  <button
                    className="follow"
                    onClick={() => toggle(storyline.id)}
                    aria-label={`取消追踪 ${storyline.title}`}
                  >
                    <Icon name="bookmark" /> 已追踪
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {available.length > 0 && (
          <section className="follow-suggest">
            <div className="rail-title">
              <span>{tracked.length === 0 ? '可以追踪的事件' : '还可以追踪'}</span>
              <b>OPEN STORYLINES</b>
            </div>
            <div
              className="archive-list"
              style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--ink)' }}
            >
              {available.map((storyline) => {
                const issue = getIssue(storyline.latestNo)
                const node = issue
                  ? storyline.nodes[issue.currentNode]
                  : storyline.nodes[storyline.nodes.length - 1]
                return (
                  <div
                    className="archive-row"
                    key={storyline.id}
                    style={{ gridTemplateColumns: '110px minmax(0, 1fr) 150px auto' }}
                  >
                    <span className="archive-date">
                      <b>{storyline.topic.split(' · ')[0]}</b>
                      <small>{storyline.nodes.length} 个节点</small>
                    </span>
                    <Link className="archive-title" to={`/storyline/${storyline.id}`}>
                      <small>NO. {issue ? pad(issue.no) : '—'} 最新节点</small>
                      <b>{storyline.title}</b>
                    </Link>
                    <span className="archive-stats">
                      {node?.time}
                      <br />
                      {node?.title}
                    </span>
                    <button
                      className="follow"
                      onClick={() => toggle(storyline.id)}
                      aria-label={`追踪 ${storyline.title}`}
                    >
                      <Icon name="bookmark" /> 追踪
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  )
}
