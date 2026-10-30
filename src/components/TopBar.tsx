import { Link, useLocation } from 'react-router-dom'
import { Icon } from './Icon'

type Props = {
  onOpenSearch: () => void
  editionLabel?: string
  editionTo?: string
  onEditionJump?: () => void
  variant?: 'news' | 'weekly'
}

const NAV = [
  { to: '/', label: '今日', match: (p: string) => p.startsWith('/issue') || p === '/' },
  { to: '/archive', label: '往期', match: (p: string) => p === '/archive' },
  { to: '/following', label: '追踪', match: (p: string) => p === '/following' },
]

export function TopBar({
  onOpenSearch,
  editionLabel = '往期日报',
  editionTo,
  onEditionJump,
  variant = 'news',
}: Props) {
  const { pathname } = useLocation()
  const btnClass = variant === 'weekly' ? 'edition-button weekly-edition' : 'edition-button is-ghost'

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="wordmark" aria-label="K!B0 首页">
          K<span className="wordmark-mark">!</span>B0
        </Link>

        {variant === 'weekly' ? (
          <div className="publication-switch" aria-label="刊物切换">
            <Link to="/">News 日报</Link>
            <Link className="active" to="/ai-weekly" aria-current="page">
              AI 周报
            </Link>
          </div>
        ) : (
          <nav className="top-nav" aria-label="主导航">
            {NAV.map((item) => {
              const active = item.match(pathname)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={active ? 'is-active' : undefined}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        )}

        <div className="top-actions">
          <button className="icon-button" onClick={onOpenSearch} aria-label="搜索">
            <Icon name="search" />
          </button>
          {variant === 'news' && (
            <Link className="weekly-cta" to="/ai-weekly">
              AI 周报
              <Icon name="arrow" className="icon weekly-cta-arrow" />
            </Link>
          )}
          {editionTo ? (
            <Link className={btnClass} to={editionTo}>
              {editionLabel} <span>→</span>
            </Link>
          ) : (
            <button className={btnClass} onClick={onEditionJump}>
              {editionLabel} <span>↓</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
