import type { Issue } from '@/data'
import { pad } from '@/data'
import { useBodyLock, useEscape } from '@/lib/hooks'
import { Icon } from './Icon'

const STEPS = [
  { name: '抓取', desc: '按信源清单拉取 RSS 与站点接口，只取标题、时间、摘要与原文配图链接，不做全文转载。' },
  { name: '归一化去重', desc: '同一事件被多家转载时，按标题与摘要指纹识别转载，保留信息最完整的一条并计数。' },
  { name: '事件聚类', desc: '以抽取阶段产出的归并键为主、实体重合与标题相似度为辅，把多条独立报道聚成一个事件。' },
  { name: '信源核验', desc: '统计每个事件的独立信源数量；单信源事件照常上刊，但标注为未经交叉核验。' },
  { name: '编排成刊', desc: '按信息完整度过闸，剔除摘要过短的条目，再由编辑意图组织主线、速览与深度解读。' },
]

export function MethodDrawer({ issue, onClose }: { issue: Issue | null; onClose: () => void }) {
  useBodyLock(Boolean(issue))
  useEscape(Boolean(issue), onClose)

  if (!issue) return null

  const { stats } = issue

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="本期生成依据">
        <div className="drawer-head">
          <h2>本期生成依据</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <Icon name="close" />
          </button>
        </div>

        <div className="drawer-body">
          <p>
            NO.{pad(issue.no)} · {issue.date} {issue.weekday} · 覆盖 {issue.window} CST，
            {issue.generatedAt} 自动生成完成。
          </p>

          <h3>本期漏斗</h3>
          <ul className="meter-list">
            <li>
              <span>抓取文章</span>
              <b>{stats.fetched} 篇</b>
            </li>
            <li>
              <span>重复内容合并</span>
              <b>{stats.merged} 条</b>
            </li>
            <li>
              <span>有效事件</span>
              <b>{stats.events} 个</b>
            </li>
            <li>
              <span>未过闸隐藏</span>
              <b>{stats.hidden} 条</b>
            </li>
            <li>
              <span>综合可信度</span>
              <b>{issue.quality.score} / 100</b>
            </li>
          </ul>

          <h3>处理流程</h3>
          <div className="flow">
            {STEPS.map((step, index) => (
              <div className="flow-step" key={step.name}>
                <b>{String(index + 1).padStart(2, '0')}</b>
                <div>
                  {step.name}
                  <span>{step.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <h3>主线信源</h3>
          <ul className="meter-list">
            {issue.sources.map((source) => (
              <li key={source.name}>
                <span>
                  {source.name} · {source.stance}
                </span>
                <b>
                  {source.time} {source.verified ? '已核验' : '待核验'}
                </b>
              </li>
            ))}
          </ul>

          <h3>研判口径</h3>
          <ul className="meter-list">
            {issue.trends.map((trend) => (
              <li key={trend.title}>
                <span>{trend.title}</span>
                <b>{trend.score} / 100</b>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: 14 }}>
            趋势评分由事件数量、独立信源权重与近 7 日变化合成，仅用于排序参考，不构成事实判断。
          </p>

          <h3>边界说明</h3>
          <p>
            事实信息来自原始信源，分析性内容由模型生成。日报不对事件定性，只呈现已核验的信息与可追溯的推理路径；
            原文链接与核验记录保留在每期信源矩阵中。
          </p>
        </div>
      </aside>
    </>
  )
}
