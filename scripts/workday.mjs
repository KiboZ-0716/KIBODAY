#!/usr/bin/env node
/**
 * 非工作日判断 + 搜索窗口单一真源。
 *
 * 定时任务第 0 步执行 `node scripts/workday.mjs`，读纯 JSON 输出：
 *   · skip=true  → 今天是非工作日，立即结束，不生成日报；
 *   · skip=false → 按 searchFrom 设定搜索窗口（假期后第一期自动放宽到被跳过的日期）。
 *
 * 读者要求（2026-11-13）：周末 / 法定假期 / 非工作日跳过，假期后第一个日报
 * 把跳过日期的重要信息一起搜进来。**除搜索窗口外一切照旧**——不新建期次、
 * 不补空白期、不加汇总模块、不改任何字段与版面结构。
 *
 * 日历见 content/holidays.json：周末默认非工作日，法定放假日由区间展开，
 * 调休补班日（周末但上班）覆盖为工作日。
 *
 * 用法：
 *   node scripts/workday.mjs
 *   node scripts/workday.mjs --date 2026-11-16 --latest 2026-11-13   # 测试
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CAL = JSON.parse(readFileSync(join(ROOT, 'content', 'holidays.json'), 'utf8'))

const DAY = 86400000

const parse = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s))
  if (!m) throw new Error(`[workday] 日期格式错误：${s}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}
const fmt = (ts) => new Date(ts).toISOString().slice(0, 10)
const addDays = (s, n) => fmt(parse(s) + n * DAY)
const weekday = (s) => new Date(parse(s)).getUTCDay() // 0=周日 6=周六
const beijingToday = () => fmt(Date.now() + 8 * 3600000)

/** 展开 holidayRanges + extraHolidays 成日期集合 */
const holidays = new Set(CAL.extraHolidays ?? [])
for (const r of CAL.holidayRanges ?? []) {
  for (let t = parse(r.from); t <= parse(r.to); t += DAY) holidays.add(fmt(t))
}
const makeup = new Set(CAL.makeupWorkdays ?? [])

/** 某天是不是工作日，以及原因（用于收尾如实报告） */
export function workdayOf(date) {
  if (makeup.has(date)) return { workday: true, reason: '调休补班日（按工作日处理）' }
  if (holidays.has(date)) return { workday: false, reason: '法定放假日' }
  const w = weekday(date)
  if (w === 0) return { workday: false, reason: '周日' }
  if (w === 6) return { workday: false, reason: '周六' }
  return { workday: true, reason: '工作日' }
}

/** 已出刊的最新一期日期；自举恢复后 src/data/issues 里就有 */
export function latestIssueDate(dir = join(ROOT, 'src', 'data', 'issues')) {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  return files.map((f) => f.slice(0, 10)).sort().at(-1) ?? null
}

/**
 * 决策：今天是否出刊、搜索窗口从哪天起。
 * gap = 上一期次日 → 今天前一日的所有日期（无论工作日与否，漏了就算间隔）。
 * 有 gap 时 searchFrom 取「上一期日期」，把跳过日及其前后一并纳入检索，避免漏掉
 * 上一期出刊时点之后的新闻；无 gap 时 searchFrom = 今天，与平常完全一致。
 */
export function decide({ date, latest } = {}) {
  const today = date ?? beijingToday()
  const wd = workdayOf(today)
  const latestIssue = latest ?? latestIssueDate()

  const gap = []
  if (latestIssue && latestIssue < today) {
    for (let t = parse(addDays(latestIssue, 1)); t < parse(today); t += DAY) gap.push(fmt(t))
  }
  const skippedDates = gap.filter((d) => !workdayOf(d).workday)
  const year = Number(today.slice(0, 4))
  const covered = (CAL.coveredYears ?? []).includes(year)

  return {
    date: today,
    isWorkday: wd.workday,
    reason: wd.reason,
    skip: !wd.workday,
    latestIssue,
    catchUpDays: gap.length,
    catchUpDates: gap,
    skippedDates,
    searchFrom: gap.length ? latestIssue : today,
    windowLabel: gap.length ? `${gap[0]}—${gap[gap.length - 1]}` : today,
    calendarWarning: covered
      ? null
      : `${year} 年节假日尚未写入 content/holidays.json，本次仅按周末判断；请补国务院公布的安排`,
  }
}

// CLI：只输出纯 JSON，方便定时任务解析，不掺日志
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name) => {
    const i = process.argv.indexOf(name)
    return i >= 0 ? process.argv[i + 1] : undefined
  }
  const out = decide({ date: arg('--date'), latest: arg('--latest') })
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
  if (out.calendarWarning) process.stderr.write(`[workday] ${out.calendarWarning}\n`)
  // 退出码 0：非工作日也是正常结束，由调用方读 skip 决定收尾，不算失败
}
