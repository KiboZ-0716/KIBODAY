import fs from 'node:fs'
import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '..')
export const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export function listJson(dir) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f))
}

/** 去掉标点、空白、全角差异，用于标题比对 */
export function normalizeTitle(title) {
  return title
    .replace(/[\s\u3000]/g, '')
    .replace(/[，。、；：？！“”‘’（）《》【】—…·,.:;?!"'()<>\[\]|/\\-]/g, '')
    .toLowerCase()
}

/** 中文字符二元组集合，用于相似度计算 */
export function bigrams(text) {
  const clean = normalizeTitle(text)
  const set = new Set()
  for (let i = 0; i < clean.length - 1; i += 1) set.add(clean.slice(i, i + 2))
  if (clean.length === 1) set.add(clean)
  return set
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const item of a) if (b.has(item)) inter += 1
  return inter / (a.size + b.size - inter)
}

export function weekdayCn(isoDate) {
  const d = new Date(`${isoDate}T00:00:00+08:00`)
  return WEEKDAYS[d.getDay()]
}

export function toCnDate(isoDate) {
  const [, m, d] = isoDate.split('-')
  return `${Number(m)}月${Number(d)}日`
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

export function uniq(list) {
  return [...new Set(list)]
}
