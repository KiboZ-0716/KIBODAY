import type { Issue } from '@/data'
import { Icon } from './Icon'

export function Rail({ issue, onOpenMethod }: { issue: Issue; onOpenMethod: () => void }) {
  return (
    <aside className="rail">
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
