import type { CSSProperties } from 'react'

/**
 * 正文「划重点」渲染层。
 *
 * 目标：点进专题/深挖的读者不该面对一整墙没有起伏的文字。
 * 1) 模型稿里的 **重点** → 荧光笔式强调（由 deep-story 规范与 deepgen 提示词保证每天产出）；
 * 2) 无论有没有标记，都自动识别判断句、分层词、关键数字；无标记稿额外把每节首句作为主题句加重；
 * 3) 超过 200 字的段落按句号拆成短段，降低阅读障碍。
 *
 * 只做展示层加工，不改数据；任何异常输入都原样降级，绝不吞字。
 */

type Kind = 'text' | 'strong' | 'num' | 'judge'
type Tok = { kind: Kind; value: string }
type Span = { s: number; e: number; kind: Exclude<Kind, 'text'> }

// 带单位/量纲的数字才算重点；纯日期里的「11 月 12 日」不会被误标
const NUM_RE = /(\d[\d,.]*\s?(?:个百分点|万亿|亿股|万股|亿美元|万美元|亿|万|%|美元|港元|人民币|元|股|bp|基点|倍|个点))/g
const JUDGE_RE = /(判断：[^。；！？\n]*[。；！？]?)/g
const LAYER_RE = /(第一层|第二层|第三层|第四层|第一段|第二段|第三段|其一|其二|其三)/g
const KEY_NUM = /(%|个百分点|亿|万亿|美元|bp|基点|倍)/

function cutBySpans(text: string, spans: Span[]): Tok[] {
  const priority = { judge: 3, strong: 2, num: 1 }
  // 起点优先；重叠时保留优先级更高的区间，避免同一段文字被高亮两次
  spans.sort((a, b) => a.s - b.s || priority[b.kind] - priority[a.kind])
  const kept: Span[] = []
  for (const sp of spans) {
    if (sp.e <= sp.s) continue
    if (kept.some((k) => sp.s < k.e && sp.e > k.s)) continue
    kept.push(sp)
  }
  const out: Tok[] = []
  let cursor = 0
  for (const sp of kept) {
    if (sp.s > cursor) out.push({ kind: 'text', value: text.slice(cursor, sp.s) })
    out.push({ kind: sp.kind, value: text.slice(sp.s, sp.e) })
    cursor = sp.e
  }
  if (cursor < text.length) out.push({ kind: 'text', value: text.slice(cursor) })
  return out.length ? out : [{ kind: 'text', value: text }]
}

/** 自动识别的重点区间：判断句、分层词、关键数字，以及无标记稿的首句主题 */
function collectAutoSpans(text: string, emphasizeLead = false): Span[] {
  const spans: Span[] = []
  for (const m of text.matchAll(JUDGE_RE)) {
    spans.push({ s: m.index!, e: m.index! + m[0].length, kind: 'judge' })
  }
  for (const m of text.matchAll(LAYER_RE)) {
    spans.push({ s: m.index!, e: m.index! + m[0].length, kind: 'strong' })
  }
  // 无标记稿：每节第一段的首句短语作为主题句加重。中文段落首句通常就是该节主旨，
  // 只标 8—40 字、到第一个自然停顿为止，避免整段变黄。模型稿自带标记时不启用。
  if (emphasizeLead) {
    const seg = text.match(/^[^。！？\n，,；;：:]+/)?.[0] ?? ''
    if (seg.length >= 8 && seg.length <= 40) {
      spans.push({ s: 0, e: seg.length, kind: 'strong' })
    }
  }
  const nums: Span[] = []
  for (const m of text.matchAll(NUM_RE)) {
    nums.push({ s: m.index!, e: m.index! + m[0].length, kind: 'num' })
  }
  // 带 % / 亿 / 美元 / 倍 的数字优先，最多 3 处，避免满屏标红
  const picked = [...nums]
    .sort((a, b) => {
      const ka = KEY_NUM.test(text.slice(a.s, a.e)) ? 1 : 0
      const kb = KEY_NUM.test(text.slice(b.s, b.e)) ? 1 : 0
      return kb - ka || a.s - b.s
    })
    .slice(0, 3)
    .sort((a, b) => a.s - b.s)
  spans.push(...picked)
  return spans
}

/** 模型稿：解析 **重点**，并叠加自动识别的数字与判断句（标记优先） */
function explicitMarks(text: string): Tok[] {
  if (!text.includes('**')) return autoMarks(text, false)
  const spans: Span[] = []
  for (const m of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    spans.push({ s: m.index!, e: m.index! + m[0].length, kind: 'strong' })
  }
  if (!spans.length) return autoMarks(stripMarks(text), false)
  spans.push(...collectAutoSpans(text, false))
  // 星号是标记不是正文：所有 token 都剥掉残留定界符，保证不裸露、不吞字
  return cutBySpans(text, spans).map((t) => ({ ...t, value: t.value.replace(/\*\*/g, '') }))
}

function autoMarks(text: string, emphasizeLead = false): Tok[] {
  return cutBySpans(text, collectAutoSpans(text, emphasizeLead))
}

function tokenize(text: string, emphasizeLead = false): Tok[] {
  const t = String(text ?? '')
  return t.includes('**') ? explicitMarks(t) : autoMarks(t, emphasizeLead)
}

/** 长段落按句号拆成 2—3 个短段；已有换行的文本尊重原分段 */
function splitParagraphs(text: string): string[] {
  const raw = String(text ?? '').trim()
  if (!raw) return []
  if (raw.includes('\n')) {
    return raw.split(/\n+/).map((x) => x.trim()).filter(Boolean)
  }
  if (raw.length <= 200) return [raw]
  const sentences = raw.match(/[^。！？]+[。！？]?/g) ?? [raw]
  const parts: string[] = []
  let buf = ''
  for (const s of sentences) {
    buf += s
    if (buf.length >= 110 && /[。！？]\s*$/.test(s)) {
      parts.push(buf.trim())
      buf = ''
    }
  }
  if (buf.trim()) parts.push(buf.trim())
  if (parts.length > 3) parts.splice(2, parts.length - 2, parts.slice(2).join(''))
  return parts.length ? parts : [raw]
}

/** 去掉 ** 定界符，用于标题、摘要、数字卡等不该出现标记的地方 */
export function stripMarks(text: unknown): string {
  return String(text ?? '').replace(/\*\*/g, '')
}

/** 行内重点：用于 li / span / 短句 */
export function InlineRich({ text, emphasizeLead = false }: { text: string; emphasizeLead?: boolean }) {
  return (
    <>
      {tokenize(text, emphasizeLead).map((t, i) =>
        t.kind === 'text' ? (
          <span key={i}>{t.value}</span>
        ) : (
          <span key={i} className={`rt-${t.kind}`}>{t.value}</span>
        ),
      )}
    </>
  )
}

/** 整段正文：自动拆段 + 行内划重点 */
export function RichText({
  text,
  className = '',
  style,
}: {
  text: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <>
      {splitParagraphs(text).map((p, i) => (
        <p key={i} className={`rt-p ${className}`.trim()} style={style}>
          <InlineRich text={p} emphasizeLead={i === 0} />
        </p>
      ))}
    </>
  )
}

export default RichText
