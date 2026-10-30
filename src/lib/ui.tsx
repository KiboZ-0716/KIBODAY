import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Issue } from '@/data'
import { SearchOverlay } from '@/components/SearchOverlay'
import { MethodDrawer } from '@/components/MethodDrawer'

type UiState = {
  openSearch: () => void
  openMethod: (issue: Issue) => void
}

const UiContext = createContext<UiState>({
  openSearch: () => undefined,
  openMethod: () => undefined,
})

export function useUi() {
  return useContext(UiContext)
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [methodIssue, setMethodIssue] = useState<Issue | null>(null)

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const openMethod = useCallback((issue: Issue) => setMethodIssue(issue), [])

  const value = useMemo(() => ({ openSearch, openMethod }), [openSearch, openMethod])

  return (
    <UiContext.Provider value={value}>
      {children}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MethodDrawer issue={methodIssue} onClose={() => setMethodIssue(null)} />
    </UiContext.Provider>
  )
}
