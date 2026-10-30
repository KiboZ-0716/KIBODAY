import path from 'node:path'
import { ROOT, readJson, listJson } from '../lib.mjs'

/**
 * 离线数据源：读取 content/raw/{date}.json 里的抓取快照。
 * 结构与线上抓取器输出一致，因此切换到 rss 源时下游无需改动。
 */
export function loadSnapshot(date) {
  const file = path.join(ROOT, 'content', 'raw', `${date}.json`)
  const raw = readJson(file)
  assertShape(raw, file)
  return {
    date: raw.date,
    window: raw.window ?? '00:00—09:30',
    fetchedAt: raw.fetchedAt,
    articles: raw.articles,
    origin: 'snapshot',
  }
}

export function listSnapshotDates() {
  return listJson(path.join(ROOT, 'content', 'raw')).map((f) =>
    path.basename(f, '.json'),
  )
}

function assertShape(raw, file) {
  const fail = (msg) => {
    throw new Error(`[snapshot] ${path.basename(file)} ${msg}`)
  }
  if (!raw.date) fail('缺少 date')
  if (!Array.isArray(raw.articles)) fail('缺少 articles 数组')
  raw.articles.forEach((a, i) => {
    if (!a.title) fail(`第 ${i + 1} 条缺少 title`)
    if (!a.source) fail(`第 ${i + 1} 条缺少 source`)
    if (!a.publishedAt) fail(`第 ${i + 1} 条缺少 publishedAt`)
  })
}
