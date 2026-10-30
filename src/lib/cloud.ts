import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'

const oauthRelayBaseUrl = 'https://www.workbuddy.cn/v2/as/genie-baas/oauth'

/**
 * 云服务凭据与「发布域名」一一对应：服务端按 Origin 精确校验，
 * 同一把 publishableKey 换到别的域名会返回
 * 403 access_denied / the request origin is not allowed for this client。
 * 所以两个发布域名各存一套，运行时按 location.host 取对应的一套。
 */
type CloudEnv = {
  endpoint: string
  publishableKey: string
  /** 该域名是否已开通云服务；未开通时界面给明确提示，而不是报「模型不可用」 */
  ready: boolean
}

const ENVS: Record<string, CloudEnv> = {
  // 旧站：PC 端发布，云服务已开通，深挖可用
  'daily-hotspot-brief-88193.app.workbuddy.host': {
    endpoint: 'https://daily-hotspot-brief-88193.app.workbuddy.host',
    publishableKey:
      'wbpk_U6IarWrMqRm6vY3hw9TgUI_yJz5JfbIEEXxjgiuI57Rducv50rno1EQ',
    ready: true,
  },
  // 新站：云端每日自动发布；云服务开通后把 publishableKey 填进来并置 ready
  'a564b245be247abf2.app.workbuddy.host': {
    endpoint: 'https://a564b245be247abf2.app.workbuddy.host',
    publishableKey: '',
    ready: false,
  },
}

const FALLBACK_HOST = 'daily-hotspot-brief-88193.app.workbuddy.host'

export const cloudEnv: CloudEnv =
  ENVS[typeof location === 'undefined' ? FALLBACK_HOST : location.host] ??
  ENVS[FALLBACK_HOST]

export const publicConfig = {
  endpoint: cloudEnv.endpoint,
  oauthRelayBaseUrl,
  publishableKey: cloudEnv.publishableKey,
}

/** 深挖是否可用：域名没登记凭据时直接给结论，不去打一次注定 403 的请求 */
export function isDeepDiveReady(): boolean {
  return cloudEnv.ready && cloudEnv.publishableKey.length > 0
}

let client: ReturnType<typeof createWorkBuddyCloud> | null = null

export function getCloud() {
  if (!client) {
    client = createWorkBuddyCloud({
      endpoint: publicConfig.endpoint,
      oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
      publishableKey: publicConfig.publishableKey,
    })
  }
  return client
}

export type ModelInfo = {
  id: string
  name?: string
  disabled?: boolean
  onlyReasoning?: boolean
  temperature?: number
  top_p?: number
}

/**
 * 只输出思考过程（onlyReasoning）的模型不会给正文，生成类的也不能写报告，
 * 实测 hunyuan-chat 出中文 JSON 稳定且快，排在首选。
 */
const PREFERRED = ['hunyuan-chat', 'glm-4.7', 'glm-4.6']
const NON_TEXT = /image|video|tts|embedding/i

let modelCache: Promise<ModelInfo> | null = null

/** 取一个可用模型；结果在页面生命周期内缓存，避免每次深挖都拉一次列表 */
export function pickModel(): Promise<ModelInfo> {
  if (!modelCache) {
    modelCache = (async () => {
      const cloud = getCloud()
      const models = (await cloud.llm.models.list()) as ModelInfo[]
      const usable = models.filter(
        (m) => m.disabled !== true && m.onlyReasoning !== true && !NON_TEXT.test(m.id),
      )
      const preferred = PREFERRED.find((id) => usable.some((m) => m.id === id))
      const model = usable.find((m) => m.id === preferred) ?? usable[0]
      if (!model) throw new Error('当前没有可用的模型，请稍后再试')
      return model
    })()
  }
  return modelCache
}

export function resetModelCache() {
  modelCache = null
}
