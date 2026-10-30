import { applyBundle, issues } from '@/data'
import type { ContentBundle } from '@/data/types'
import { getCloud, isDeepDiveReady } from './cloud'

/**
 * 内容分两层：构建期打进 dist 的数据是兜底；启动时再从云端拉一份「内容包」。
 * 内容包由每日管线写入云数据库，所以出刊不需要重新部署站点，读者刷新即可看到最新一期。
 */
const TABLE = 'kib0_content'
const ROW_ID = 'bundle'
/** 拉不到就直接用本地数据，不能让网络把首屏拖住 */
const TIMEOUT_MS = 2500

export type LiveStatus = {
  source: 'cloud' | 'local'
  date: string
  error?: string
}

/** 本次启动的内容来源，?debug 时显示在页面上，便于确认云端内容包是否真的生效 */
let status: LiveStatus | null = null

export function getContentStatus(): LiveStatus | null {
  return status
}

function looksUsable(bundle: unknown): bundle is ContentBundle {
  const b = bundle as ContentBundle | null
  return !!b && Array.isArray(b.issues) && b.issues.length > 0 && !!b.issues[0].date
}

export async function loadRemoteContent(): Promise<LiveStatus> {
  const baked = issues[0]?.date ?? ''
  if (!isDeepDiveReady()) {
    status = { source: 'local', date: baked, error: '当前域名没有可用的云服务凭据' }
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
    // 云端那一期更旧（比如某天没出刊）就不要覆盖，避免内容倒退
    if (bundle.issues[0].date < baked) {
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
