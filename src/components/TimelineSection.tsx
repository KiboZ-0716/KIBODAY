import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { storylineOf, timelineWindow } from '@/data'
import { useFollowing } from '@/lib/hooks'
import { Icon } from './Icon'
import { SectionHeading } from './Layout'

/**
 * 持续追踪：追踪与不追踪必须有实质区别。
 * - 未追踪：只给一句说明与追踪按钮，不展开时间线，不特别跟踪这条事件。
 * - 已追踪：按天展开事件脉络，并在有当日新进展时明确标出。
 */
export function TimelineSection({ issue }: { issue: Issue }) {
  const storyline = storylineOf(issue)
  const { isFollowing, toggle } = useFollowing()

  if (!storyline) return null

  const followed = isFollowing(storyline.id)
  const nodes = timelineWindow(storyline, issue.currentNode)
  const progress = storyline.nodes.find((n) => String(n.time).includes('今日进展'))
  const hasFresh = !!progress && !/没有新的可核对进展/.test(progress.title)

  return (
    <section className="section-block">
      <SectionHeading
        index="03"
        title="持续追踪"
        en="STORYLINES"
        action={
          <Link to="/following">
            追踪管理 <Icon name="arrow" />
          </Link>
        }
      />

      {!followed ? (
        <div className="timeline-card timeline-locked">
          <div className="timeline-title">
            <div>
              <span className="topic-tag">{storyline.topic}</span>
              <h3>{storyline.title}</h3>
            </div>
            <button className="follow" onClick={() => toggle(storyline.id)}>
              <Icon name="bookmark" /> 追踪事件
            </button>
          </div>
          <p className="timeline-hint">
            <b>追踪之后，这里每天会汇总这条事件的新进展</b>，出现新报道就加一个节点并标「今日有新进展」；
            不追踪就不特别跟踪，时间线也不展开。订阅只存在这台设备，不需要登录。
          </p>
          <Link className="text-button" to={`/storyline/${storyline.id}`}>
            先读完整专题 <Icon name="arrow" />
          </Link>
        </div>
      ) : (
        <div className="timeline-card">
          <div className="timeline-title">
            <div>
              <span className="topic-tag">{storyline.topic}</span>
              <h3>{storyline.title}</h3>
              {hasFresh && <span className="fresh-flag">● 今日有新进展</span>}
              {!hasFresh && <span className="fresh-flag is-quiet">今日无新增可核对进展</span>}
            </div>
            <button
              className="follow active"
              onClick={() => toggle(storyline.id)}
              aria-pressed="true"
            >
              <Icon name="bookmark" /> 已追踪
            </button>
          </div>
          <div className="timeline">
            {nodes.map((node) => (
              <div key={node.time} className={node.state === 'current' ? 'current' : node.state === 'future' ? 'future' : ''}>
                <time>{node.time}</time>
                <span />
                <p>
                  <b>{node.title}</b>
                  {node.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
