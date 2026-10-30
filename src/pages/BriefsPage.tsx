import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { getIssue, issues, pad } from '@/data'
import { PageShell } from '@/components/PageShell'
import { Icon } from '@/components/Icon'

export function BriefsPage() {
  const { no } = useParams()
  const issue = getIssue(no ?? '')
  const [params, setParams] = useSearchParams()
  const tag = params.get('tag') ?? '全部'
  const keyword = (params.get('q') ?? '').trim()

  const tags = useMemo(() => {
    if (!issue) return []
    const counts = new Map<string, number>()
    for (const brief of issue.briefs) counts.set(brief.tag, (counts.get(brief.tag) ?? 0) + 1)
    return [{ name: '全部', count: issue.briefs.length }, ...[...counts].map(([name, count]) => ({ name, count }))]
  }, [issue])

  if (!issue) return <NotFoundBriefs />

  const list = issue.briefs
    .filter((b) => tag === '全部' || b.tag === tag)
    .filter((b) =>
      !keyword ||
      `${b.title} ${b.summary} ${b.tag} ${b.source}`.toLowerCase().includes(keyword.toLowerCase()),
    )

  return (
    <PageShell title={`NO.${pad(issue.no)} 本期速览`}>
      <section className="page-head">
        <p className="eyebrow">
          NO. {pad(issue.no)} · {issue.date} {issue.weekday}
        </p>
        <h1>本期速览</h1>
        <p className="lede">
          覆盖 {issue.window} CST 通过核验的全部事件，按发布时间倒序。每条都保留原始信源，可跳转原文核对。
        </p>
        <div className="head-meta">
          <span>{issue.briefs.length} 条速览</span>
          <span>{issue.stats.events} 个有效事件</span>
          <span>{issue.stats.hidden} 条未过闸</span>
        </div>
      </section>

      <div className="page-body">
        <div className="filter-bar" role="group" aria-label="按标签筛选">
          {tags.map((item) => (
            <button
              key={item.name}
              className="chip"
              aria-pressed={tag === item.name}
              onClick={() => {
                const next: Record<string, string> = {}
                if (item.name !== '全部') next.tag = item.name
                if (keyword) next.q = keyword
                setParams(next)
              }}
            >
              {item.name}
              <span className="chip-count">{item.count}</span>
            </button>
          ))}
        </div>

        {keyword && (
          <div className="filter-note">
            <span>
              搜索「{keyword}」命中 {list.length} 条
            </span>
            <button
              onClick={() => {
                const next: Record<string, string> = {}
                if (tag !== '全部') next.tag = tag
                setParams(next)
              }}
            >
              清除关键词
            </button>
          </div>
        )}

        <div className="news-list">
          {list.map((brief) => (
            <div className="news-row" key={`${brief.time}-${brief.title}`}>
              <time>{brief.time}</time>
              <div>
                <span className="topic-tag">{brief.tag}</span>
                <h3>{brief.title}</h3>
                <p>
                  {brief.summary}
                  <br />
                  {brief.source} · {brief.sources} 个信源
                </p>
              </div>
              <span className="row-actions">
                <Link to={`/report/${brief.id}`} title="生成该事件的深度报告">
                  <Icon name="search" /> 深挖
                </Link>
                <a
                  className="row-arrow"
                  href={brief.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`打开原文：${brief.title}`}
                >
                  <Icon name="arrow" />
                </a>
              </span>
            </div>
          ))}
        </div>

        {list.length === 0 && (
          <div className="empty-state">
            <h3>这个标签下没有条目</h3>
            <p>换一个标签，或回到本期首页看主线。</p>
            <Link to={`/issue/${issue.no}`}>返回本期日报</Link>
          </div>
        )}

        <div className="issue-switch">
          {(() => {
            const index = issues.findIndex((i) => i.no === issue.no)
            const prev = issues[index + 1]
            const next = issues[index - 1]
            return (
              <>
                {prev ? (
                  <Link to={`/issue/${prev.no}/briefs`}>
                    上一期 · NO.{pad(prev.no)}
                    <b>{prev.lead.title.replace(/\n/g, '')}</b>
                  </Link>
                ) : (
                  <span />
                )}
                {next ? (
                  <Link to={`/issue/${next.no}/briefs`}>
                    下一期 · NO.{pad(next.no)}
                    <b>{next.lead.title.replace(/\n/g, '')}</b>
                  </Link>
                ) : (
                  <span />
                )}
              </>
            )
          })()}
        </div>
      </div>
    </PageShell>
  )
}

function NotFoundBriefs() {
  return (
    <PageShell title="未找到该期">
      <div className="page-body">
        <div className="empty-state">
          <h3>没有这一期</h3>
          <p>可能链接过期了，去归档里找找。</p>
          <Link to="/archive">打开往期归档</Link>
        </div>
      </div>
    </PageShell>
  )
}
