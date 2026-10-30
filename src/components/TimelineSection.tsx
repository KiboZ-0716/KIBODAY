import { Link } from 'react-router-dom'
import type { Issue } from '@/data'
import { storylineOf, timelineWindow } from '@/data'
import { useFollowing } from '@/lib/hooks'
import { Icon } from './Icon'
import { SectionHeading } from './Layout'

export function TimelineSection({ issue }: { issue: Issue }) {
  const storyline = storylineOf(issue)
  const { isFollowing, toggle } = useFollowing()

  if (!storyline) return null

  const nodes = timelineWindow(storyline, issue.currentNode)
  const followed = isFollowing(storyline.id)

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

      <div className="timeline-card">
        <div className="timeline-title">
          <div>
            <span className="topic-tag">{storyline.topic}</span>
            <h3>{storyline.title}</h3>
          </div>
          <button
            className={followed ? 'follow active' : 'follow'}
            onClick={() => toggle(storyline.id)}
            aria-pressed={followed}
          >
            <Icon name="bookmark" /> {followed ? '已追踪' : '追踪事件'}
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
    </section>
  )
}
