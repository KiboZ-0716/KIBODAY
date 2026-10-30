import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getWeekly, pad, weekly } from '@/data'
import { PageShell } from '@/components/PageShell'

export function WeeklyPage() {
  const { id } = useParams()
  const issue = getWeekly(id)
  const isCurrent = issue.id === weekly.current.id

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [issue.id])

  return (
    <PageShell
      variant="weekly"
      title={`AI 周报 ${issue.label} · ${issue.period}`}
      siteName="K!B0 AI 周报"
      editionLabel="往期周报"
      onEditionJump={scrollToArchive}
    >
      <div className="weekly-main">
        <section className="weekly-hero">
          <div className="weekly-issue">
            AI WEEKLY · {issue.id.slice(0, 4)} {issue.label} · NO. {pad(issue.no)}
          </div>
          <div className="weekly-hero-row">
            <div>
              <h1>AI 行业周报</h1>
              <p>为产品经理和项目经理过滤噪音，把一周热点转成产品判断与交付行动。</p>
            </div>
            <div className="weekly-meta">
              <span>{issue.period}</span>
              <b>
                {issue.deepDives.length} 篇深读 · {issue.shipList.length} 个产品动态
              </b>
              <small>{weekly.cadence}</small>
            </div>
          </div>
          <div className="weekly-thesis">
            <span>本周一句话</span>
            <h2>{issue.thesis}</h2>
          </div>
        </section>

        <section className="weekly-overview">
          <SectionTitle index="01" title="本周总览" en="OVERVIEW" />
          <div className="weekly-overview-grid">
            <div className="overview-copy">
              <p>{issue.overview.copy}</p>
              <div className="weekly-chips">
                {issue.overview.chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            </div>
            <aside className="role-takeaway">
              <span>给 PM / 项目经理最重要的一条</span>
              <p>{issue.overview.takeaway}</p>
            </aside>
          </div>
          <div className="weekly-numbers">
            {issue.overview.numbers.map((item) => (
              <div key={item.label}>
                <b>{item.value}</b>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="weekly-layout">
          <div className="weekly-primary">
            <section>
              <SectionTitle index="02" title="重点深读" en="DEEP DIVE" />
              {issue.deepDives.map((item) => (
                <article className="weekly-deep" key={item.no}>
                  <div className="deep-number">{item.no}</div>
                  <div className="deep-body">
                    <div className="deep-category">{item.category}</div>
                    <h3>{item.title}</h3>
                    <div className="fact-analysis">
                      <div>
                        <span>事实</span>
                        <p>{item.fact}</p>
                      </div>
                      <div>
                        <span>为什么重要</span>
                        <p>{item.analysis}</p>
                      </div>
                    </div>
                    <div className="role-grid">
                      <div>
                        <span>对产品经理</span>
                        <p>{item.pm}</p>
                      </div>
                      <div>
                        <span>对项目经理</span>
                        <p>{item.project}</p>
                      </div>
                      <div className="action-box">
                        <span>本周行动</span>
                        <p>{item.action}</p>
                      </div>
                    </div>
                    <div className="deep-sources">
                      <span>来源</span>
                      <div>
                        {item.sources.map((source) => (
                          <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                            {source.name}
                            {source.date ? ` · ${source.date}` : ''}
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <section className="ship-section">
              <SectionTitle index="03" title="本周发布速览" en="SHIP LIST" />
              <div className="ship-table">
                <div className="ship-head">
                  <span>产品 / 能力</span>
                  <span>类别</span>
                  <span>对团队的意义</span>
                  <span>关注度</span>
                </div>
                {issue.shipList.map((item) => (
                  <div className="ship-row" key={item.name}>
                    <b>{item.name}</b>
                    <span>{item.category}</span>
                    <p>{item.meaning}</p>
                    <i>{item.heat}</i>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle index="04" title="趋势判断" en="观点 · 非事实" />
              <div className="trend-grid">
                {issue.trends.map((item, index) => (
                  <article key={item.title}>
                    <span>观点 {pad(index + 1)}</span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="weekly-checklists">
              <SectionTitle index="05" title="本周行动清单" en="CHECKLIST" />
              <div className="checklist-grid">
                <div>
                  <h3>给产品经理</h3>
                  <ul>
                    {issue.checklists.pm.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3>给项目经理</h3>
                  <ul>
                    {issue.checklists.project.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <aside className="weekly-sidebar" id="weekly-archive">
            <div className="weekly-side-title">
              <span>往期周报</span>
              <small>WEEKLY ARCHIVE</small>
            </div>
            {weekly.archive.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                className={`weekly-archive-row${item.id === issue.id ? ' current' : ''}`}
                aria-current={item.id === issue.id ? 'page' : undefined}
              >
                <span>
                  {item.label}
                  {item.isCurrent ? ' · 最新' : ''}
                </span>
                <small>{item.period}</small>
                <b>{item.headline}</b>
              </Link>
            ))}
            <div className="weekly-archive-more">
              共 {weekly.archive.length} 期 · {weekly.cadence}
            </div>
            <div className="weekly-method">
              <span>编辑方法</span>
              <p>{issue.method}</p>
            </div>
            {!isCurrent ? (
              <Link className="weekly-back-latest" to="/ai-weekly">
                回到最新一期 →
              </Link>
            ) : null}
          </aside>
        </div>
      </div>
    </PageShell>
  )
}

function SectionTitle({ index, title, en }: { index: string; title: string; en: string }) {
  return (
    <div className="weekly-section-title">
      <span>{index}</span>
      <h2>{title}</h2>
      <small>{en}</small>
    </div>
  )
}

function scrollToArchive() {
  document.getElementById('weekly-archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
