import type { Issue } from '@/data'
import { pad } from '@/data'
import { Icon } from './Icon'

export function IssueHeader({ issue, onOpenMethod }: { issue: Issue; onOpenMethod: () => void }) {
  return (
    <>
      <section className="brief-heading">
        <div>
          <p className="eyebrow">DAILY INTELLIGENCE · NO. {pad(issue.no)}</p>
          <h1>{issue.headline}</h1>
        </div>
        <div className="brief-meta">
          <p>
            {formatDate(issue.date)} · {issue.weekday}
          </p>
          <p>本期覆盖 {issue.window} CST</p>
          <span>
            <i />
            {issue.generatedAt} 自动生成完成
          </span>
        </div>
      </section>

      <section className="pipeline-bar" aria-label="本期生成状态">
        <div>
          <span className="pipeline-dot" />
          本期内容已就绪
        </div>
        <div>
          <b>{issue.stats.fetched}</b>
          <span>抓取文章</span>
        </div>
        <div>
          <b>{issue.stats.events}</b>
          <span>有效事件</span>
        </div>
        <p>事实信息来自原始信源，分析性内容由 AI 生成</p>
      </section>

      <section className="signal-strip" aria-label="AI 研判摘要">
        <div className="signal-label">
          <span>AI SYNTHESIS</span>今日研判摘要
        </div>
        <p>{issue.synthesis}</p>
        <button onClick={onOpenMethod}>
          查看生成依据 <Icon name="arrow" />
        </button>
      </section>
    </>
  )
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}
