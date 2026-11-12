import { applyBundle, issues } from '@/data'
import type { ContentBundle } from '@/data/types'
import { getCloud, isDeepDiveReady } from './cloud'

/**
 * 内容分两层：构建期打进 dist 的数据只是兜底；启动时拉「实时内容包」替换。
 *
 * 三条通道，按可靠性排序：
 * 1) 同源 ./live-bundle.json —— 每次发布站点时随 dist 一起上传，同域名必然可访问、通常几十毫秒返回；
 *    国内网络访问 raw.githubusercontent.com 经常要几分钟甚至超时，这条才是主通道。
 * 2) GitHub RAW —— 免重新部署，海外/可通网络下生效。
 * 3) 云数据库 —— 旧站通道，最后兜底。
 * 另外把上一次成功拿到的包存 localStorage，通道全部失败时先用它，避免读者看到隔夜内容。
 */
const TABLE = 'kib0_content'
const ROW_ID = 'bundle'
const SAME_ORIGIN_URL = './live-bundle.json'
const LIVE_URL = 'https://raw.githubusercontent.com/KiboZ-0716/KIBODAY/main/live-bundle.json'
/** 同源文件很小概率很慢，给它 3.5 秒；远端给 8 秒，绝不把首屏拖成十几秒 */
const SAME_ORIGIN_MS = 3500
const REMOTE_MS = 8000
const CACHE_KEY = 'kib0:live-bundle:v1'

export type LiveStatus = {
  source: 'cloud' | 'local'
  /** 实际生效的通道，?debug 时显示在页面上 */
  channel: 'same-origin' | 'raw' | 'database' | 'cache' | 'baked'
  date: string
  error?: string
}

/** 本次启动的内容来源，?debug 时显示在页面上，便于确认实时内容包是否真的生效 */
let status: LiveStatus | null = null

export function getContentStatus(): LiveStatus | null {
  return status
}

function looksUsable(bundle: unknown): bundle is ContentBundle {
  const b = bundle as ContentBundle | null
  return !!b && Array.isArray(b.issues) && b.issues.length > 0 && !!b.issues[0].date
}

/** 内容包更旧（比如某天没出刊）就不要覆盖，避免内容倒退 */
function accept(bundle: ContentBundle, baked: string): boolean {
  return bundle.issues[0].date >= baked
}

async function fetchBundle(url: string, timeoutMs: number): Promise<ContentBundle | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const bundle = (await res.json()) as ContentBundle
    return looksUsable(bundle) ? bundle : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchDatabase(timeoutMs: number): Promise<ContentBundle | null> {
  if (!isDeepDiveReady()) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const cloud = getCloud()
    const { data, error } = await cloud.database
      .from(TABLE)
      .select('payload')
      .eq('id', ROW_ID)
      .abortSignal(controller.signal)
      .maybeSingle()
    if (error) return null
    const row = data as { payload?: unknown } | null
    return row && looksUsable(row.payload) ? row.payload : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function readCache(): ContentBundle | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ContentBundle
    return looksUsable(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeCache(bundle: ContentBundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(bundle))
  } catch {
    // 隐私模式或超出配额，忽略即可
  }
}

function use(bundle: ContentBundle, channel: LiveStatus['channel']): LiveStatus {
  applyBundle(bundle)
  writeCache(bundle)
  status = { source: 'cloud', channel, date: bundle.issues[0].date }
  return status
}

export async function loadRemoteContent(): Promise<LiveStatus> {
  const baked = issues[0]?.date ?? ''
  const failed: string[] = []

  // 1) 同源包：发布站点时随 dist 上传，最稳最快
  const sameOrigin = await fetchBundle(SAME_ORIGIN_URL, SAME_ORIGIN_MS)
  if (sameOrigin && accept(sameOrigin, baked)) return use(sameOrigin, 'same-origin')
  if (sameOrigin) failed.push('同源内容包比本地旧')
  else failed.push('同源内容包未取到')

  // 2) 上次成功缓存的包：先让页面看到最近一期，再尝试更新
  const cached = readCache()
  const cachedOk = !!cached && accept(cached, baked)
  if (cached && cachedOk) applyBundle(cached)

  // 3) GitHub RAW 与云数据库并行赛跑，谁先给出可用的就用谁
  const [raw, db] = await Promise.all([
    fetchBundle(LIVE_URL, REMOTE_MS),
    fetchDatabase(REMOTE_MS),
  ])
  const candidates: Array<[ContentBundle | null, LiveStatus['channel']]> = [
    [raw, 'raw'],
    [db, 'database'],
  ]
  const usable = candidates
    .filter(([b]) => b && accept(b as ContentBundle, baked))
    .map(([b, ch]) => [b as ContentBundle, ch] as const)
    .sort((a, b) => String(b[0].issues[0].date).localeCompare(String(a[0].issues[0].date)))

  if (usable.length) return use(usable[0][0], usable[0][1])
  if (!raw) failed.push('GitHub RAW 未取到')
  if (!db) failed.push('云数据库未取到')

  // 4) 全通道失败：缓存可用就用缓存，否则用构建期数据
  if (cached && cachedOk) {
    status = { source: 'cloud', channel: 'cache', date: cached.issues[0].date, error: failed.join('；') }
    return status
  }
  status = { source: 'local', channel: 'baked', date: baked, error: failed.join('；') }
  return status
}
