/**
 * 构建后置：把根目录的实时内容包复制进 dist。
 *
 * 同源 ./live-bundle.json 是前端并发择优的通道之一（不再是「拿到就返回」的主通道）；
 * 构建期数据与它必须同源，否则首屏会先闪一下隔夜内容。
 * 少了这一步，站点只剩构建期数据，极端情况下会看到旧一期。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const src = join(ROOT, 'live-bundle.json')
const dist = join(ROOT, 'dist')

if (!existsSync(dist)) {
  console.error('[同源包] 没有 dist，先执行构建')
  process.exit(1)
}
if (!existsSync(src)) {
  console.error('[同源包] 缺少 live-bundle.json：先执行 npm run bootstrap 恢复内容')
  process.exit(1)
}

const raw = readFileSync(src, 'utf8')
let latest = '?'
try {
  latest = JSON.parse(raw).issues?.[0]?.date ?? '?'
} catch {
  console.error('[同源包] live-bundle.json 不是合法 JSON')
  process.exit(1)
}

writeFileSync(join(dist, 'live-bundle.json'), raw, 'utf8')
console.log(`[同源包] 已复制 dist/live-bundle.json · 最新一期 ${latest} · ${Math.round(raw.length / 1024)} KB`)
