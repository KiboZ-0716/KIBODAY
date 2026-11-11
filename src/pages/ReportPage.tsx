import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTopic, pad, presetReport, reportMetaInfo } from '@/data'
import type { GeneratedReport } from '@/data/types'
import { PageShell } from '@/components/PageShell'
import {
  describeError,
  generateReport,
  readCachedReport,
  writeCachedReport,
} from '@/lib/deepdive'
import { isDeepDiveReady } from '@/lib/cloud'

type Status = 'ready' | 'generating' | 'done' | 'error'

function localTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace('T', ' ')
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function ReportPage() {
  const { id = '' } = useParams()
  const topic = getTopic(id)

  const [status, setStatus] = useState<Status>('ready')
  const [report, setReport] = useState<GeneratedReport | null>(null)
  const [chars, setChars] = useState(0)
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)

  const run = useCallback(
    async (topicId: string) => {
      const target = getTopic(topicId)
      if (!target) return

      // 浏览器实时调用受「发布域名 ↔ 凭据」绑定限制；出刊环节已由模型
      // 真调写好完整专题。这里优先载入出刊模型稿，保证按钮永远有内容、不报错。
      if (!isDeepDiveReady()) {
        const preset = presetReport(topicId)
        if (preset) {
          setReport(preset)
          setStatus('done')
          setError('')
        }
        return
      }
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      setStatus('generating')
      setChars(0)
      setError('')
      setReport(null)

      try {
        const result = await generateReport(target, {
          signal: controller.signal,
          onProgress: (n) => setChars(n),
        })
        writeCachedReport(topicId, result)
        setReport(result)
        setStatus('done')
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          const cached = readCachedReport(topicId)
          setReport(cached)
          setStatus(cached ? 'done' : 'ready')
          return
        }
        setError(describeError(err))
        setStatus('error')
      }
    },
    [],
  )

  // 进页面先取已有结果（本机缓存 → 构建期预生成）；都没有就直接开始调模型
  useEffect(() => {
    if (!topic) return
    const cached = readCachedReport(id) ?? presetReport(id) ?? null
    if (cached) {
      setReport(cached)
      setStatus('done')
      return
    }
    run(id)
    return () => controllerRef.current?.abort()
  }, [id, topic, run])

  if (!topic) {
    return (
      <PageShell title="未找到这条事件">
        <div className="page-body">
          <div className="empty-state">
            <h3>这条事件不在本期日报里</h3>
            <p>可能是链接过期了。回到速览列表，选一条重新深挖。</p>
            <Link to="/">回到今天这一期</Link>
          </div>
        </div>
      </PageShell>
    )
  }

  const sources = topic.reports
  const isGenerating = status === 'generating'

  return (
    <PageShell title={`事件报告 · ${topic.title}`}>
      <section className="page-head report-head">
        <p className="eyebrow">
          EVENT REPORT · NO. {pad(topic.issueNo)} · {topic.date} · {topic.tag}
          {topic.city ? ` · ${topic.city}` : ''}
        </p>
        <h1>{topic.title}</h1>
        <p className="lede">{topic.summary}</p>

        <div className="head-meta">
          <span>{sources.length} 个信源</span>
          <span>{topic.time}</span>
          {topic.city && <span>地方条目</span>}
        </div>

        <div className={`report-gen${status === 'error' ? ' is-outline' : ''}`}>
          <div className="gen-row">
            <b>
              {isGenerating
                ? '正在调用模型深挖'
                : status === 'error'
                  ? '专题暂时拉取失败'
                  : report?.from === 'preset'
                    ? '完整专题分析 · 模型撰稿'
                    : '模型实时生成'}
            </b>
            {isGenerating ? (
              <button className="gen-stop" onClick={() => controllerRef.current?.abort()}>
                停止
              </button>
            ) : (
              <button className="gen-run" onClick={() => run(id)} disabled={isGenerating}>
                {isDeepDiveReady() ? '重新深挖' : '重读完整专题'}
              </button>
            )}
          </div>
          <span>
            {isGenerating
              ? `已输出 ${chars} 字 · 提示词 ${reportMetaInfo.promptId} ${reportMetaInfo.promptVersion}`
              : status === 'error'
                ? error
                : report
                  ? `${report.model} · 生成于 ${localTime(report.generatedAt)}`
                  : `提示词 ${reportMetaInfo.promptId} ${reportMetaInfo.promptVersion}`}
          </span>
          {isGenerating && (
            <div className="gen-bar" aria-hidden="true">
              <i />
            </div>
          )}
        </div>
      </section>

      {isGenerating && (
        <div className="generating-state">
          <p>
            模型正在读 {sources.length} 篇同源报道，按「不编造、事实与判断分开、写清边界」的口径写报告。
          </p>
          <ul>
            <li>三句话结论</li>
            <li>发生了什么 / 为什么 / 谁受影响 / 还不清楚什么</li>
            <li>可核查事实与待解问题</li>
          </ul>
        </div>
      )}

      {status === 'error' && (
        <div className="generating-state is-error">
          <p>{error}</p>
          <button className="gen-run" onClick={() => run(id)}>
            重试
          </button>
        </div>
      )}

      {report && !isGenerating && (
        <div className="deep-layout">
          <article className="deep-body">
            <section className="deep-section bottom-line">
              <div className="deep-section-index">TL;DR</div>
              <h2>三句话结论</h2>
              <ul>
                {report.body.bottomLine.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>

            {report.body.sections.map((section, index) => (
              <section className="deep-section" key={`${section.heading}-${index}`}>
                <div className="deep-section-index">{String(index + 1).padStart(2, '0')}</div>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph, pIndex) => (
                  <p key={`${index}-${pIndex}`}>{paragraph}</p>
                ))}
              </section>
            ))}
          </article>

          <aside className="deep-rail">
            {report.body.facts.length > 0 && (
              <div className="deep-card">
                <span>可核查事实</span>
                <ul className="citation-list">
                  {report.body.facts.map((fact) => (
                    <li key={fact}>
                      <b>·</b>
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.body.stances.length > 0 && (
              <div className="deep-card">
                <span>信源各自的侧重</span>
                <ul className="citation-list">
                  {report.body.stances.map((stance) => (
                    <li key={`${stance.source}-${stance.point}`}>
                      <b>{stance.source}</b>
                      <span>{stance.point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.body.openQuestions.length > 0 && (
              <div className="deep-card">
                <span>待解问题</span>
                <ul className="citation-list">
                  {report.body.openQuestions.map((question) => (
                    <li key={question}>
                      <b>?</b>
                      <span>{question}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="deep-card">
              <span>本次深挖依据的报道</span>
              <ul className="related-list">
                {sources.map((source) => (
                  <li key={`${source.name}-${source.time}`}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        <b>{source.name}</b>
                        <small>{source.time} · 打开原文</small>
                      </a>
                    ) : (
                      <span className="no-link">
                        <b>{source.name}</b>
                        <small>{source.time} · 无外链</small>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}

      <div className="issue-switch deep-switch">
        <Link to={`/issue/${topic.issueNo}/briefs`}>
          回到本期速览
          <b>NO.{pad(topic.issueNo)} · {topic.date}</b>
        </Link>
        <Link to={`/issue/${topic.issueNo}`}>
          回到本期日报
          <b>{topic.date}</b>
        </Link>
      </div>

      <p className="report-footnote">
        这份专题由出刊环节调用模型按 {reportMetaInfo.promptPath}（{reportMetaInfo.promptId}{' '}
        {reportMetaInfo.promptVersion}）撰写：前因、机制、带口径的数字、影响与下一步分开写，
        判断句以「判断：」开头，事实与判断不混。每天出刊时模型会为当期事件重新撰写，
        点开即为最新一版的模型产物，不需要在浏览器里等待生成。
      </p>
    </PageShell>
  )
}
