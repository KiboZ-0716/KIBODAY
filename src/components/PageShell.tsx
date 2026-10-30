import { useEffect, type ReactNode } from 'react'
import { TopBar } from './TopBar'
import { SiteFooter } from './Layout'
import { useUi } from '@/lib/ui'

export function PageShell({
  title,
  children,
  editionTo,
  onEditionJump,
  variant = 'news',
  editionLabel,
  siteName = 'K!B0 每日情报',
}: {
  title?: string
  children: ReactNode
  editionTo?: string
  onEditionJump?: () => void
  variant?: 'news' | 'weekly'
  editionLabel?: string
  siteName?: string
}) {
  const { openSearch } = useUi()

  useEffect(() => {
    document.title = title ? `${title} · ${siteName}` : siteName
  }, [title, siteName])

  return (
    <div className="app-shell">
      <TopBar
        onOpenSearch={openSearch}
        editionTo={editionTo}
        onEditionJump={onEditionJump}
        editionLabel={editionLabel}
        variant={variant}
      />
      <main>{children}</main>
      <SiteFooter />
    </div>
  )
}
