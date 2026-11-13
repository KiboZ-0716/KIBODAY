import { applyBundle, issues } from '@/data'
import type { ContentBundle } from '@/data/types'
import { getCloud, isDeepDiveReady } from './cloud'

/**
 * 内容分发（2026-11-13 从头重写）
 *
 * 唯一真源：仓库 main 分支的 live-bundle.json。
 * 旧实现的事故链：站点 09:00 用「构建期旧副本」发布，内容包 09:57 才推上去；
 * 前端又是「同源包优先、拿到就 return」，旧副本直接压过新包，远端通道连机会都没有；
 * 加上云库在新域名未开通、GitHub RAW 国内超时，读者只能看到隔夜一期。
 *
 * 现在的原则：
 *   1) 构建期数据、同源 dist 副本都只是兜底，绝不允许压过更新的远端包；
 *   2) 所有通道并发赛跑，统一按「期次日期 + generatedAt」择优，谁最新用谁；
 *   3) 每发现一个更新的包立即替换并重渲染，不必等最慢的通道超时；
 *   4) 同源请求透传 sharecode（发布平台不带该参数会返回 403「链接不完整」）；
 *   5) 远端走「内容包最后一次提交」锁定的 jsDelivr 地址：@main 有 12 小时 CDN 缓存会串期，
 *      @<commit> 永久缓存且随每次推送自动换地址，既实时又不会拿到昨天的包。
 * 于是「站点有没有重新构建、定时任务几点跑」都不再影响打开是不是最新一期。
 */
const TABLE = 'kib0_content'
const ROW_ID = 'bundle'
const REPO = 'KiboZ-0716/KIBODAY'
const SAME_ORIGIN = './live-bundle.json'
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/live-bundle.json`
// 查「内容包最后一次提交」而不是 HEAD：源码推送会频繁改 HEAD，但内容包没变，
// CDN 地址保持稳定；只有每天出刊推包时才会换，且那时 CDN 早已就绪。
const BUNDLE_COMMIT_API = `https://api.github.com/repos/${REPO}/commits?path=live-bundle.json&per_page=1`
const CDN_BY_COMMIT = (sha: string) =>
  `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/live-bundle.json`
const CDN_MAIN = `https://cdn.jsdelivr.net/gh/${REPO}@main/live-bundle.json`

const SAME_ORIGIN_MS = 3500
const REMOTE_MS = 9000
const CACHE_KEY = 'kib0:live-bundle:v1'

export type LiveStatus = {
  source: 'cloud' | 'local'
  /** 实际生效的通道，?debug 时显示在页面上 */
  channel: 'same-origin' | 'cdn' | 'raw' | 'database' | 'cache' | 'baked'
  date: string
  error?: string
  /** ?debug 时展示：每个通道拿到的期次，一眼看出哪条链路滞后 */
  channels?: Record<string, string>
}

let status: LiveStatus | null = null

export function getContentStatus(): LiveStatus | null {
  return status
}

function looksUsable(bundle: unknown): bundle is ContentBundle {
  const b = bundle as ContentBundle | null
  return !!b && Array.isArray(b.issues) && b.issues.length > 0 && !!b.issues[0].date
}

/** 期次优先；同期次再比生成时间。构建期数据没有 generatedAt，天然排最后 */
function stamp(bundle: ContentBundle): string {
  return `${bundle.issues[0].date}|${bundle.generatedAt ?? ''}`
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const sep = url.includes('?') ? '&' : '?'
    const res = await fetch(`${url}${sep}t=${Date.now()}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchBundle(url: string, timeoutMs: number): Promise<ContentBundle | null> {
  const data = await fetchJson(url, timeoutMs)
  return looksUsable(data) ? data : null
}

/** 内容包最后一次提交 → 按 commit 锁定的 CDN，绕开 @main 的 12 小时缓存 */
async function fetchByCommit(timeoutMs: number): Promise<ContentBundle | null> {
  const head = (await fetchJson(BUNDLE_COMMIT_API, Math.min(timeoutMs, 4000))) as
    | Array<{ sha?: string }>
    | { sha?: string }
    | null
  const sha = Array.isArray(head) ? head[0]?.sha : head?.sha
  if (!sha) return null
  return fetchBundle(CDN_BY_COMMIT(sha), timeoutMs)
}

async function fetchDatabase(timeoutMs: number): Promise<ContentBundle | null> {
  if (!isDeepDiveReady()) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const { data, error } = await getCloud()
      .database.from(TABLE)
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
    const parsed = raw ? (JSON.parse(raw) as ContentBundle) : null
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

/** 发布平台对不带 sharecode 的静态资源请求返回 403，同源包必须透传 */
function sameOriginUrl(): string {
  if (typeof location === 'undefined') return SAME_ORIGIN
  const share = new URLSearchParams(location.search).get('sharecode')
  return share ? `${SAME_ORIGIN}?sharecode=${encodeURIComponent(share)}` : SAME_ORIGIN
}

/**
 * 并发赛跑 + 渐进择优。onBetter 在每发现一个更新的包时触发（立即重渲染），
 * 所以 CDN 3 秒内返回就已经是最新一期，不必等 GitHub RAW 之类慢通道超时。
 */
export async function loadRemoteContent(onBetter?: () => void): Promise<LiveStatus> {
  const baked = issues[0]?.date ?? ''
  const seen: Record<string, string> = { baked }
  const failed: string[] = []
  let bestStamp = `${baked}|`
  let bestChannel: LiveStatus['channel'] = 'baked'
  let bestDate = baked

  function consider(bundle: ContentBundle | null, channel: LiveStatus['channel']) {
    if (!bundle) {
      failed.push(`${channel} 未取到`)
      return
    }
    seen[channel] = bundle.issues[0].date
    const s = stamp(bundle)
    if (s <= bestStamp) return
    bestStamp = s
    bestChannel = channel
    bestDate = bundle.issues[0].date
    applyBundle(bundle)
    if (channel !== 'cache') writeCache(bundle)
    onBetter?.()
  }

  // 上次成功拿到的包先顶上，避免首屏闪回隔夜内容
  consider(readCache(), 'cache')

  await Promise.allSettled([
    fetchBundle(sameOriginUrl(), SAME_ORIGIN_MS).then((b) => consider(b, 'same-origin')),
    fetchByCommit(REMOTE_MS).then((b) => consider(b, 'cdn')),
    fetchBundle(CDN_MAIN, REMOTE_MS).then((b) => consider(b, 'cdn')),
    fetchBundle(RAW_URL, REMOTE_MS).then((b) => consider(b, 'raw')),
    fetchDatabase(REMOTE_MS).then((b) => consider(b, 'database')),
  ])

  status = {
    source: bestChannel === 'baked' ? 'local' : 'cloud',
    channel: bestChannel,
    date: bestDate,
    channels: seen,
    error: failed.length ? failed.join('；') : undefined,
  }
  return status
}
