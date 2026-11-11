import { applyBundle, issues } from '@/data'
import type { ContentBundle } from '@/data/types'
import { getCloud, isDeepDiveReady } from './cloud'

/**
 * 内容分两层：构建期打进 dist 的数据只是兜底；启动时拉「实时内容包」替换。
 *
 * 实时内容包由每日任务推到 GitHub 仓库的 live-bundle.json，
 * raw.githubusercontent.com 对任意域名开放 CORS，所以无论站点发布在哪个域名、
 * 有没有开通云服务，读者刷新都能拿到当天最新一期，不需要重新部署。
 */
const TABLE = 'kib0_content'
const ROW_ID = 'bundle'
const LIVE_URL = 'https://raw.githubusercontent.com/KiboZ-0716/KIBODAY/main/live-bundle.json'
/** 拉不到就直接用本地数据，不能让网络把首屏拖住 */
const TIMEOUT_MS = 4000

export type LiveStatus = {
  source: 'cloud' | 'local'
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

export async function loadRemoteContent(): Promise<LiveStatus> {
  const baked = issues[0]?.date ?? ''

  // 1) 首选：开放通道的实时内容包（所有域名都可用，不依赖云服务凭据）
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    const res = await fetch(`${LIVE_URL}?t=${Date.now()}`, { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      const bundle = (await res.json()) as ContentBundle
      if (looksUsable(bundle) && accept(bundle, baked)) {
        applyBundle(bundle)
        status = { source: 'cloud', date: bundle.issues[0].date }
        return status
      }
      if (looksUsable(bundle)) {
        status = { source: 'local', date: baked, error: '实时内容包比本地旧，已跳过' }
        return status
      }
    }
  } catch {
    // 继续走下面的备用通道
  }

  // 2) 备用：站点自身的云数据库（旧站已开通云服务时可用）
  if (!isDeepDiveReady()) {
    status = { source: 'local', date: baked, error: '实时内容包不可用且当前域名没有云服务凭据' }
    return status
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const cloud = getCloud()
    const { data, error } = await cloud.database
      .from(TABLE)
      .select('payload')
      .eq('id', ROW_ID)
      .abortSignal(controller.signal)
      .maybeSingle()

    if (error) throw error
    const row = data as { payload?: unknown } | null
    if (!row || !looksUsable(row.payload)) {
      status = { source: 'local', date: baked }
      return status
    }

    const bundle = row.payload as ContentBundle
    if (!accept(bundle, baked)) {
      status = { source: 'local', date: baked, error: '云端内容包比本地旧，已跳过' }
      return status
    }

    applyBundle(bundle)
    status = { source: 'cloud', date: bundle.issues[0].date }
    return status
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    status = { source: 'local', date: baked, error: message }
    return status
  } finally {
    clearTimeout(timer)
  }
}
