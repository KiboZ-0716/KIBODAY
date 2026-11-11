import type { Issue } from '@/data'
import { Icon } from './Icon'

export function Rail({ issue, onOpenMethod }: { issue: Issue; onOpenMethod: () => void }) {
  return (
    <aside className="rail">
      <section className="rail-section watch-section">
        <div className="rail-title">
          <span>接下来看什么</span>
          <b>WHAT TO WATCH</b>
        </div>
        <p className="rail-intro">不给分数。下面每条只说清两件事：正在发生什么，以及哪天该回来核对哪个数。</p>

        {issue.trends.map((trend, index) => (
          <div className="watch-item" key={trend.title}>
            <div className="watch-head">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{trend.title}</h3>
            </div>
            <p>{trend.body}</p>
            <div className="watch-next">
              <b>下一个观察点</b>
              <span>{trend.watch ?? '关注后续官方披露与实施公告'}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="rail-section sources">
        <div className="rail-title">
          <span>信源矩阵</span>
          <b>SOURCE MAP</b>
        </div>
        <p className="rail-intro">
          主线事件已由 {issue.lead.sourceCount} 个独立信源交叉确认。
        </p>

        {issue.sources.map((source) => (
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

        <button className="outline-button" onClick={onOpenMethod}>
          查看原文与核验记录 <Icon name="arrow" />
        </button>
      </section>

      <section className="quality-card">
        <div className="rail-title">
          <span>本期质量</span>
          <b>QUALITY REPORT</b>
        </div>
        <div className="quality-score">
          <b>{issue.quality.score}</b>
          <span>
            / 100
            <br />
            综合可信度
          </span>
        </div>
        <ul>
          {issue.quality.items.map((item) => (
            <li key={item.label}>
              <span>{item.label}</span>
              <b className={item.warn ? 'warn' : undefined}>{item.value}</b>
            </li>
          ))}
        </ul>
        <p>未达到发布阈值的内容不会出现在日报中。</p>
      </section>
    </aside>
  )
}
