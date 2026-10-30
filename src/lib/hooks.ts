import { useCallback, useEffect, useState } from 'react'

const KEYS = {
  following: 'kib0.following',
  city: 'kib0.city',
  lastIssue: 'kib0.lastIssue',
} as const

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 隐私模式下写入会失败，静默降级为仅本次会话有效 */
  }
}

/** 追踪事件，落 localStorage，跨期次与刷新都保留 */
export function useFollowing() {
  const [ids, setIds] = useState<string[]>(() => read<string[]>(KEYS.following, []))

  const toggle = useCallback((id: string) => {
    setIds((current) => {
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
      write(KEYS.following, next)
      return next
    })
  }, [])

  const isFollowing = useCallback((id: string) => ids.includes(id), [ids])

  return { ids, toggle, isFollowing }
}

/** 关注城市 */
export function useCity(fallback: string) {
  const [city, setCityState] = useState<string>(() => read<string>(KEYS.city, fallback))

  const setCity = useCallback((next: string) => {
    setCityState(next)
    write(KEYS.city, next)
  }, [])

  return { city, setCity }
}

export function useLastIssue() {
  useEffect(() => {
    const path = window.location.hash.replace(/^#/, '')
    const match = path.match(/^\/issue\/(\d+)/)
    if (match) write(KEYS.lastIssue, Number(match[1]))
  }, [])
}

export function useBodyLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}

export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onEscape])
}
