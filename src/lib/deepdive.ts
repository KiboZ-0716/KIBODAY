import type { DeepReport, GeneratedReport, Topic } from '@/data/types'
import { getCloud, isDeepDiveReady, pickModel } from './cloud'

// 提示词口径与 content/prompts/event-report.md 一致（promptId: event-report / v1.2）
// 站点在浏览器里按同一口径调用模型，因此无需在构建期预生成
const SYSTEM_PROMPT = [
  '你是一名财经与公共政策领域的调查编辑。',
  '你的产出不是新闻改写，而是一份能让人在两分钟内判断这件事与自己是否相关的事件报告。',
  '硬性约束：',
  '1. 不编造事实。任何数字、人名、机构、时间，必须能在提供的报道素材里找到出处；找不到就写「尚未披露」。',
  '2. 区分事实与判断。事实段落用陈述句；判断段落必须以「判断：」开头。',
  '3. 不重复标题。报告不重写导语，直接给增量信息。',
  '4. 有边界就写边界。信息不足时明确写出缺什么、下一步该看什么。',
  '5. 中文，不用形容词堆砌；每段不超过 120 字。',
  '只输出 JSON，不要任何解释文字或代码块标记。',
].join('\n')

const OUTPUT_SHAPE = [
  '{',
  '  "bottomLine": ["结论一句", "第二个结论", "第三个结论"],',
  '  "sections": [',
  '    { "heading": "这件事到底发生了什么", "paragraphs": ["…"] },',
  '    { "heading": "为什么会这样", "paragraphs": ["…"] },',
  '    { "heading": "谁会受到影响", "paragraphs": ["…"] },',
  '    { "heading": "目前还不清楚的部分", "paragraphs": ["…"] }',
  '  ],',
  '  "facts": ["带数字的可核查事实"],',
  '  "stances": [{ "source": "信源名", "point": "该信源的角度" }],',
  '  "openQuestions": ["待解问题"]',
  '}',
].join('\n')

/** 清洗后拼进提示词，避免素材里的内容改写系统指令 */
function safe(text: string, max = 220) {
  return String(text ?? '')
    .replace(/[`{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function buildUserPrompt(topic: Topic) {
  const lines: string[] = []
  lines.push(`事件标题：${safe(topic.title, 120)}`)
  lines.push(`发布时间：${topic.date} ${topic.time}`)
  lines.push(`题材标签：${topic.tag}`)
  if (topic.city) {
    lines.push(`所属地区：${topic.city}`)
    lines.push(
      '素材说明：这是地方条目，公开细节通常少于全国性事件。数字、机构表态、时间地点等硬信息凡素材中没有的，一律写「尚未披露」；' +
        '但「为什么会这样」「谁会受到影响」两节不要留空，可基于常识与制度背景给出以「判断：」开头的推断，并说明依据。',
    )
  }
  lines.push(`事件摘要：${safe(topic.summary, 300)}`)
  lines.push('')
  lines.push('同源报道素材：')
  topic.reports.slice(0, 8).forEach((report, index) => {
    lines.push(
      `${index + 1}. [${safe(report.name, 20)} · ${report.time}] ${safe(report.title, 120)} —— ${safe(report.summary, 220)}`,
    )
  })
  lines.push('')
  lines.push(`请按以下 JSON 结构输出，不要输出其他内容：`)
  lines.push(OUTPUT_SHAPE)
  return lines.join('\n')
}

/** 从模型输出里取出最后一个完整的 JSON 对象：正文里可能夹杂思考过程或说明文字 */
function balancedObjects(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0
    let inString = false
    let escaped = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inString) {
        if (escaped) escaped = false
        else if (c === '\\') escaped = true
        else if (c === '"') inString = false
        continue
      }
      if (c === '"') inString = true
      else if (c === '{') depth += 1
      else if (c === '}') {
        depth -= 1
        if (depth === 0) {
          out.push(text.slice(i, j + 1))
          break
        }
      }
    }
  }
  return out
}

function extractJson(text: string): DeepReport {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const parsedObjects = balancedObjects(cleaned)
    .map((candidate) => {
      try {
        return JSON.parse(candidate) as Partial<DeepReport>
      } catch {
        return null
      }
    })
    .filter((value): value is Partial<DeepReport> => Boolean(value))

  // 报告字段所在的最外层对象才是我们要的；嵌套的小节对象不能当报告用
  const parsed =
    parsedObjects.find((p) => Array.isArray(p.bottomLine) || Array.isArray(p.sections)) ??
    parsedObjects[0] ??
    null

  if (!parsed) {
    const truncated = cleaned.length > 0 && !cleaned.trimEnd().endsWith('}')
    throw new Error(
      truncated
        ? '模型输出被截断了，请重新深挖一次'
        : '模型返回的内容不是可用的报告结构，请重新深挖一次',
    )
  }

  const bottomLine = Array.isArray(parsed.bottomLine) ? parsed.bottomLine.filter(Boolean).slice(0, 4) : []
  const sections = Array.isArray(parsed.sections)
    ? parsed.sections
        .filter((s) => s && typeof s.heading === 'string')
        .map((s) => ({
          heading: String(s.heading),
          paragraphs: Array.isArray(s.paragraphs) ? s.paragraphs.filter(Boolean).map(String) : [],
        }))
    : []

  if (bottomLine.length === 0 && sections.length === 0) {
    throw new Error('模型返回的内容为空，请重新深挖一次')
  }

  return {
    bottomLine: bottomLine.length ? bottomLine : ['模型未给出结论，建议重新深挖一次'],
    sections,
    facts: Array.isArray(parsed.facts) ? parsed.facts.filter(Boolean).map(String).slice(0, 8) : [],
    stances: Array.isArray(parsed.stances)
      ? parsed.stances.filter((s) => s && s.source).map((s) => ({ source: String(s.source), point: String(s.point ?? '') }))
      : [],
    openQuestions: Array.isArray(parsed.openQuestions)
      ? parsed.openQuestions.filter(Boolean).map(String).slice(0, 6)
      : [],
  }
}

export type DeepDiveEvents = {
  /** 每次收到流式片段时回调，用于展示"模型正在写" */
  onProgress?: (chars: number) => void
  signal?: AbortSignal
}

export async function generateReport(
  topic: Topic,
  events: DeepDiveEvents = {},
): Promise<GeneratedReport> {
  if (!isDeepDiveReady()) {
    throw new Error(
      '当前域名的模型通道尚未开通，深挖暂不可用（内容更新不受影响）',
    )
  }
  const cloud = getCloud()
  const model = await pickModel()

  let text = ''
  let reasoning = ''

  for await (const chunk of cloud.llm.chat.completions.create({
    model: model.id,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(topic) },
    ],
    stream: true,
    stream_options: { include_usage: true },
    temperature: model.temperature ?? 0.6,
    // 报告是长输出，默认上限容易把它截断在半句
    max_tokens: 2400,
    signal: events.signal,
  })) {
    const delta = (chunk as { choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[] })
      .choices?.[0]?.delta
    if (delta?.content) {
      text += delta.content
      events.onProgress?.(text.length)
    }
    if (delta?.reasoning_content) reasoning += delta.reasoning_content
  }

  // 少数模型会把思考过程写进正文，或只回思考；用思考内容兜底再试一次
  const raw = text.trim() || reasoning.trim()
  if (!raw) throw new Error('模型没有返回内容，请重新深挖一次')

  return {
    body: extractJson(raw),
    model: model.name ?? model.id,
    generatedAt: new Date().toISOString(),
    from: 'model',
  }
}

const CACHE_PREFIX = 'kib0:report:v1:'

export function readCachedReport(id: string): GeneratedReport | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GeneratedReport
    if (!parsed?.body?.sections) return null
    return parsed
  } catch {
    return null
  }
}

export function writeCachedReport(id: string, report: GeneratedReport) {
  try {
    localStorage.setItem(CACHE_PREFIX + id, JSON.stringify(report))
  } catch {
    // 隐私模式下 localStorage 不可写，忽略即可，不影响本次查看
  }
}

/** 把云服务错误翻译成人能看懂的话 */
export function describeError(error: unknown): string {
  const err = error as {
    error?: { code?: string | null; message?: string }
    message?: string
    requestId?: string
  }
  const code = err?.error?.code ?? ''
  const id = err?.requestId ? `（请求号 ${err.requestId}）` : ''

  if (code.startsWith('auth_')) {
    return `模型通道校验未通过，请在已发布的站点上打开本页${id}`
  }
  if (code === 'quota_rate_limited') {
    return `调用过于频繁，稍等一会儿再试${id}`
  }
  if (code.startsWith('quota_')) {
    return `当前模型额度已用尽${id}`
  }
  if (code.startsWith('request_')) {
    return `请求参数不被模型接受，请重新深挖一次${id}`
  }
  if (code.startsWith('gateway_') || code.startsWith('model_')) {
    return `模型服务暂时不可用，请重新深挖一次${id}`
  }
  if (code.startsWith('internal_')) {
    return `服务内部出错${id}`
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '已停止生成'
  }
  return err?.error?.message || err?.message || '生成失败，请重试'
}
