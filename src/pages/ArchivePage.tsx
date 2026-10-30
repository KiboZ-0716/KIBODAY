import { issues, pad } from '@/data'
import { PageShell } from '@/components/PageShell'
import { ArchiveRow } from '@/components/ArchiveSection'

export function ArchivePage() {
  const groups = new Map<string, typeof issues>()
  for (const issue of issues) {
    const key = issue.date.slice(0, 7)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(issue)
  }

  const totalEvents = issues.reduce((sum, i) => sum + i.stats.events, 0)

  return (
    <PageShell title="往期日报">
      <section className="page-head">
        <p className="eyebrow">DAILY ARCHIVE · {issues.length} ISSUES</p>
        <h1>每一个早晨，都留下一份判断。</h1>
        <p className="lede">
          按发布时间倒序排列。每期都保留当日的信源矩阵与质量报告，可以回看某个判断是在什么信息基础上做出的。
        </p>
        <div className="head-meta">
          <span>共 {issues.length} 期</span>
          <span>累计 {totalEvents} 个有效事件</span>
          <span>最早一期 NO.{pad(issues[issues.length - 1].no)}</span>
        </div>
      </section>

      <div className="page-body">
        {[...groups.entries()].map(([month, list]) => (
          <section className="month-group" key={month}>
            <div className="month-title">
              <h2>{month.replace('-', ' 年 ')} 月</h2>
              <span>MONTHLY</span>
              <b>{list.length} 期</b>
            </div>
            <div className="archive-list" style={{ borderTop: 0 }}>
              {list.map((issue) => (
                <ArchiveRow key={issue.no} issue={issue} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  )
}
