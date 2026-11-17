/**
 * 两个大标题的硬闸门（2026-11-17）。
 *
 * 背景：首页报头 `headline`（72px 大字）与今日主线 `lead.title` 本该是
 * 「从当天主线抽象出来的一句短句」。规范一度把 headline 定义成「一个具体数字
 * 或一个反常识判断」，模型便把当天所有数字用分号串成「整期目录」——
 * 11-17 那条 95 字、3 个分号、罗列 4 条新闻，读者一眼看过去全是数字。
 *
 * 职责分工（保证每天稳定，而不是只救一期）：
 *   1) 规范 content/prompts/style-guide.md 第七条补充一 + source-guide 自检 11h
 *      —— 决定「质量」：模型每天完整读取，按抽象命题句写。
 *   2) 本文件 —— 决定「下限」：模型偶尔写歪时，出刊前做确定性收敛，
 *      绝不让超长 / 分号罗列 / 数字堆砌的大标题上线，也绝不因此中断出刊
 *      （历史上「出刊中断 → 打开不是最新」已发生过一次）。
 *
 * 收敛是纯结构性的，不生成新语义、不臆造抽象句：
 *   分号截断 → 顿号罗列取末段 → 去数字尾巴 → 在标点处限长。
 * 合格标题原样放行，一个字都不动；收敛会打印 [大标题收敛] 便于回溯。
 *
 * `lead.title` 额外保守：它是速览去重与追踪续报的「主体专名 / 稀有数字」锚点，
 * 所以只做限长 + 去分号，不清数字、不删专名（见 compose.mjs buildTopAnchors、
 * scripts/enrich.mjs collectFollowUps）。
 */

export const HEADLINE_MAX = 20
export const LEAD_MAX = 22

const norm = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()

/** 固定套话：11-11 / 11-12 曾连续两天用同一句，等于没有 headline */
const CLICHE = /早上好|算一算|真正值得|值得一看|今天.{0,6}值得|一览|速览今日/

/** 返回不合格原因数组；空数组 = 合格 */
export function headlineIssues(raw) {
  const s = norm(raw)
  const out = []
  if (!s) return ['空标题']
  if (s.length > HEADLINE_MAX) out.push(`超长 ${s.length}>${HEADLINE_MAX}`)
  if (/[；;]/.test(s)) out.push('含分号（整期目录）')
  if ((s.match(/、/g) ?? []).length >= 2) out.push('顿号罗列多条事件')
  if ((s.match(/\d+(?:\.\d+)?/g) ?? []).length >= 3) out.push('数字堆砌')
  if (CLICHE.test(s)) out.push('固定套话（与上一期重复）')
  return out
}

export function leadIssues(raw) {
  const s = norm(raw)
  const out = []
  if (!s) return ['空标题']
  if (s.length > LEAD_MAX) out.push(`超长 ${s.length}>${LEAD_MAX}`)
  if (/[；;]/.test(s)) out.push('含分号（细节堆砌）')
  return out
}

/** 在标点处安全截断，避免把词切断 */
function clipAtPunct(s, max) {
  if (s.length <= max) return s
  const head = s.slice(0, max)
  const cut = Math.max(head.lastIndexOf('，'), head.lastIndexOf('、'), head.lastIndexOf(' '))
  // 标点太靠前就宁可硬截，保证长度达标
  return cut >= max * 0.55 ? head.slice(0, cut) : head
}

/** 去掉数字、百分比与常见量词，把「10月工业增4.8%」洗成短语 */
function stripNumbers(s) {
  return s
    .replace(/\d+(?:\.\d+)?\s*(?:%|个百分点|个点|亿|万亿|万|美元|欧元|元|吨|桶|种|起|市|个月|月|年|次|天|日)?/g, '')
    .replace(/[：:，,、\s]+/g, '')
    .trim()
}

/**
 * 收敛报头大字标题。合格 → 原样返回（changed=false）。
 * 不合格 → 结构收敛，返回短句 + 原因，出刊照常进行。
 */
export function tightenHeadline(raw, { label = '' } = {}) {
  const s = norm(raw)
  const issues = headlineIssues(s)
  if (!issues.length) return { value: s, changed: false, issues: [] }

  let t = s.split(/[；;]/)[0] // 整期目录：只留第一件事
  // 顿号罗列（「A、B、C供强需弱」）→ 取末段，它往往是概括性结论
  if ((t.match(/、/g) ?? []).length >= 2) {
    const parts = t.split('、')
    t = parts[parts.length - 1]
  }
  t = stripNumbers(t)
  // 洗完太短说明这一句全是数字，退回第一句在标点处截断，不臆造怪句
  if (t.length < 6) t = clipAtPunct(s.split(/[；;]/)[0], HEADLINE_MAX).replace(/[；;].*$/, '')
  t = clipAtPunct(t, HEADLINE_MAX).replace(/[，,、：:；;\s]+$/, '')

  const value = t || clipAtPunct(s, HEADLINE_MAX)
  console.log(`[大标题收敛] ${label} headline ${s.length}字 → ${value.length}字 ｜ 原因：${issues.join('、')} ｜ 「${value}」`)
  return { value, changed: true, issues }
}

/**
 * 收敛今日主线标题：只限长 + 去分号，保留主体专名与数字锚点。
 */
export function tightenLeadTitle(raw, { label = '' } = {}) {
  const s = norm(raw)
  const issues = leadIssues(s)
  if (!issues.length) return { value: s, changed: false, issues: [] }

  let t = s.split(/[；;]/)[0]
  t = clipAtPunct(t, LEAD_MAX).replace(/[，,、：:；;\s]+$/, '')
  const value = t || clipAtPunct(s, LEAD_MAX)
  console.log(`[大标题收敛] ${label} lead.title ${s.length}字 → ${value.length}字 ｜ 原因：${issues.join('、')} ｜ 「${value}」`)
  return { value, changed: true, issues }
}

/** 给校验脚本用：一份 issue 的两个大标题是否都合格 */
export function auditBigTitles(issue) {
  return {
    date: issue?.date,
    headline: { value: norm(issue?.headline), issues: headlineIssues(issue?.headline) },
    leadTitle: { value: norm(issue?.lead?.title), issues: leadIssues(issue?.lead?.title) },
  }
}
