#!/usr/bin/env node
// 原文配图入库（可选层，缺省不走）：
//   1. 读取 content/raw/<date>.json 里带 imageUrl 的条目（仅限 lead + 首页 image 卡对应事件）；
//   2. 下载到 content/images/_cache/，复用 assets 阶段已有的缓存约定；
//   3. 复制成 content/images/<slug>.jpg，让 pipeline/stages/assets.mjs 自动转 WebP 多尺寸；
//   4. 把出处写进 content/images/_provenance.json（原始页面 URL、来源、下载时间），
//      编辑侧据此核对版权，再决定是否在 raw 里把 image 字段从素材库换成这个 slug。
//
// 用法：node scripts/fetch-images.mjs 2026-10-30
// 约束：任何一步失败只告警并跳过该图，绝不让整期管线失败 —— 素材库永远是兜底。
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson } from '../pipeline/lib.mjs'

const date = process.argv[2]
if (!date) {
  console.error('用法：node scripts/fetch-images.mjs <YYYY-MM-DD>')
  process.exit(1)
}

const raw = readJson(path.join(ROOT, 'content', 'raw', `${date}.json`))
const CACHE = path.join(ROOT, 'content', 'images', '_cache')
const OUT = path.join(ROOT, 'content', 'images')
const PROVENANCE = path.join(OUT, '_provenance.json')
const ALLOWED_HOSTS = /(news\.cctv\.com|news\.cn|xinhuanet\.com|chinanews\.com\.cn|gov\.cn)$/i

fs.mkdirSync(CACHE, { recursive: true })
const provenance = fs.existsSync(PROVENANCE) ? readJson(PROVENANCE) : {}
provenance[date] = provenance[date] ?? []

const targets = raw.articles.filter((a) => a.imageUrl)
if (targets.length === 0) {
  console.log('本期没有提供 imageUrl，维持素材库示意图（成本为零）。')
  process.exit(0)
}

for (const a of targets.slice(0, 6)) {
  const slug = a.eventKey ?? a.id
  try {
    if (!ALLOWED_HOSTS.test(new URL(a.imageUrl).hostname)) {
      throw new Error(`来源域名不在白名单（仅官媒/政府站）：${a.imageUrl}`)
    }
    if (!a.imageSource) throw new Error('缺少 imageSource（原文页 URL，用于版权核对）')

    const res = await fetch(a.imageUrl, { headers: { 'user-agent': 'KIB0-DailyBrief/1.0' } })
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 20_000) throw new Error(`文件过小（${buf.length} B），疑似占位图`)

    const cacheName = `${Buffer.from(a.imageUrl).toString('base64url').slice(0, 24)}.jpg`
    fs.writeFileSync(path.join(CACHE, cacheName), buf)
    fs.copyFileSync(path.join(CACHE, cacheName), path.join(OUT, `${slug}.jpg`))

    provenance[date] = provenance[date].filter((x) => x.slug !== slug)
    provenance[date].push({
      slug,
      eventKey: a.eventKey,
      title: a.title,
      imageUrl: a.imageUrl,
      imageSource: a.imageSource,
      source: a.source,
      bytes: buf.length,
      fetchedAt: new Date().toISOString(),
    })
    console.log(`  · ${slug}.jpg  ${(buf.length / 1024).toFixed(0)} KB  ← ${a.source}`)
  } catch (err) {
    console.warn(`  ! ${slug} 跳过：${err.message}（该条继续使用素材库示意图）`)
  }
}

writeProvenance()
function writeProvenance() {
  fs.writeFileSync(PROVENANCE, JSON.stringify(provenance, null, 2) + '\n')
}
console.log(`完成：${provenance[date].length} 张已入库，出处见 content/images/_provenance.json`)
