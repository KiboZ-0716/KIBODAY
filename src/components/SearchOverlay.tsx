import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { search } from '@/data'
import { useBodyLock, useEscape } from '@/lib/hooks'
import { Icon } from './Icon'

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useBodyLock(open)
  useEscape(open, onClose)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  const hits = useMemo(() => search(query, 8), [query])

  if (!open) return null

  const go = (to: string) => {
    onClose()
    navigate(to)
  }

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="搜索"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="search-panel">
        <div className="search-field">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索事件、速览标题或信源"
            aria-label="搜索关键词"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              }
              if (e.key === 'Enter' && hits[active]) go(hits[active].to)
            }}
          />
          <kbd>ESC</kbd>
        </div>

        {query.trim() ? (
          hits.length ? (
            <div className="search-results">
              {hits.map((hit, index) => (
                <button
                  key={hit.id}
                  className="search-result"
                  data-active={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(hit.to)}
                >
                  <small>
                    {hit.kind} · {hit.meta}
                  </small>
                  <h4>{hit.title}</h4>
                </button>
              ))}
            </div>
          ) : (
            <p className="search-empty">没有匹配的内容。试试「暴雪」「油价」「高铁」。</p>
          )
        ) : (
          <p className="search-hint">检索范围：全部期次的速览、主线与专题</p>
        )}
      </div>
    </div>
  )
}
