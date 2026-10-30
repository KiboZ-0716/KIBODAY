import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useUi } from '@/lib/ui'

export function SectionHeading({
  index,
  title,
  en,
  action,
}: {
  index: string
  title: string
  en: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <span className="section-index">{index}</span>
        <h2>{title}</h2>
        <span>{en}</span>
      </div>
      {action}
    </div>
  )
}

export function SiteFooter() {
  const { openSearch } = useUi()

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          K<span>!</span>B0
        </div>
        <p>少一点噪音，多一点理解。</p>
        <div className="footer-links">
          <Link to="/archive">往期日报</Link>
          <Link to="/ai-weekly">AI 周报</Link>
          <Link to="/following">我的追踪</Link>
          <button onClick={openSearch}>搜索全站</button>
        </div>
      </div>
    </footer>
  )
}
