import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { search } from '@/data'
import { PageShell } from '@/components/PageShell'
import { Icon } from '@/components/Icon'

const SUGGESTIONS = ['暴雪', '油价', '高铁', '以旧换新', '港口']

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const initial = params.get('q') ?? ''
  const [query, setQuery] = useState(initial)
  const hits = useMemo(() => search(query, 40), [query])

  const submit = (value: string) => {
    setQuery(value)
    if (value.trim()) setParams({ q: value })
    else setParams({})
  }

  return (
    <PageShell title="搜索">
      <section className="page-head">
        <p className="eyebrow">SEARCH · 全站</p>
        <h1>找一件事的来龙去脉。</h1>
        <p className="lede">检索范围覆盖全部期次的主线、速览与专题节点，结果按相关度排序。</p>

        <div className="search-field" style={{ maxWidth: 560, marginTop: 26, border: '1px solid var(--ink)' }}>
          <Icon name="search" />
          <input
            value={query}
            placeholder="输入关键词"
            aria-label="搜索关键词"
            onChange={(e) => submit(e.target.value)}
          />
          {query && (
            <button className="icon-button" onClick={() => submit('')} aria-label="清空">
              <Icon name="close" />
            </button>
          )}
        </div>

        <div className="filter-bar" style={{ marginTop: 18 }}>
          {SUGGESTIONS.map((word) => (
            <button key={word} className="chip" onClick={() => submit(word)}>
              {word}
            </button>
          ))}
        </div>
      </section>

      <div className="page-body">
        {!query.trim() ? (
          <div className="empty-state">
            <h3>输入关键词开始检索</h3>
            <p>例如「暴雪」「油价」「高铁」。也可以直接点上面的建议词。</p>
          </div>
        ) : hits.length === 0 ? (
          <div className="empty-state">
            <h3>没有匹配「{query}」的内容</h3>
            <p>试试更短的关键词，或者去往期归档逐期翻看。</p>
            <Link to="/archive">打开往期归档</Link>
          </div>
        ) : (
          <>
            <p className="head-meta" style={{ marginBottom: 20 }}>
              共 {hits.length} 条结果
            </p>
            <div className="news-list">
              {hits.map((hit) => (
                <Link className="news-row" key={hit.id} to={hit.to}>
                  <time>{hit.kind}</time>
                  <div>
                    <h3>{highlight(hit.title, query)}</h3>
                    <p>{hit.meta}</p>
                  </div>
                  <span className="row-arrow" aria-hidden="true">
                    <Icon name="arrow" />
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}

function highlight(text: string, query: string) {
  const q = query.trim()
  if (!q) return text
  const index = text.toLowerCase().indexOf(q.toLowerCase())
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + q.length)}</mark>
      {text.slice(index + q.length)}
    </>
  )
}
