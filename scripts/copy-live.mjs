/**
 * 构建后置：把根目录的实时内容包复制进 dist。
 *
 * 站点前端的第一通道是同源 ./live-bundle.json —— 同域名、几十毫秒返回；
 * 而 GitHub RAW 在国内经常要几分钟甚至超时，只作为备用。
 * 少了这一步，站点就只剩「构建期数据」可用，打开会看到隔夜内容。
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
