import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { ROOT, readJson, writeJson } from '../lib.mjs'

const SIZES = {
  lg: [1400, 900],
  md: [760, 490],
  sm: [380, 245],
}

const SRC_DIR = path.join(ROOT, 'content', 'images')
const OUT_DIR = path.join(ROOT, 'public', 'images', 'media')
const CACHE_DIR = path.join(SRC_DIR, '_cache')
const MANIFEST = path.join(OUT_DIR, 'manifest.json')

/**
 * 素材阶段：
 * 1. 远程图先落到本地缓存（抓取到的原文配图），避免热链与失效；
 * 2. 统一转 WebP 三档尺寸，幂等——源文件没变就跳过；
 * 3. 输出 manifest 供编排阶段引用。
 */
export async function buildAssets({ force = false } = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(CACHE_DIR, { recursive: true })

  const previous = fs.existsSync(MANIFEST) ? readJson(MANIFEST) : {}
  const sources = fs.existsSync(SRC_DIR)
    ? fs
        .readdirSync(SRC_DIR)
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
        .map((f) => ({ key: path.basename(f, path.extname(f)), file: path.join(SRC_DIR, f) }))
    : []

  if (!sources.length) {
    throw new Error('[assets] content/images 下没有任何图片，无法出品')
  }

  const manifest = {}
  for (const { key, file } of sources) {
    const stat = fs.statSync(file)
    const cached = previous[key]
    const upToDate =
      !force &&
      cached &&
      cached.sourceMtime === stat.mtimeMs &&
      Object.keys(SIZES).every((size) => fs.existsSync(path.join(OUT_DIR, `${key}-${size}.webp`)))

    if (upToDate) {
      manifest[key] = cached
      continue
    }

    const meta = await sharp(file).metadata()
    const entry = { sourceMtime: stat.mtimeMs, source: path.relative(ROOT, file), sizes: {} }

    for (const [size, [w, h]] of Object.entries(SIZES)) {
      const out = path.join(OUT_DIR, `${key}-${size}.webp`)
      await sharp(file)
        .rotate()
        .resize(w, h, { fit: 'cover', position: 'centre', withoutEnlargement: false })
        .webp({ quality: 84, effort: 6 })
        .toFile(out)
      entry.sizes[size] = { width: w, height: h, bytes: fs.statSync(out).size }
    }

    entry.width = meta.width
    entry.height = meta.height
    manifest[key] = entry
    console.log(`  · 素材 ${key}: ${meta.width}×${meta.height} → lg/md/sm`)
  }

  writeJson(MANIFEST, manifest)
  return manifest
}

/** 下载远程配图到本地缓存，返回本地绝对路径 */
export async function cacheRemote(url) {
  const name = Buffer.from(url).toString('base64url').slice(0, 24)
  const ext = (url.split('?')[0].match(/\.(jpe?g|png|webp)$/i)?.[1] ?? 'jpg').toLowerCase()
  const file = path.join(CACHE_DIR, `${name}.${ext}`)
  if (fs.existsSync(file)) return file
  const res = await fetch(url, { headers: { 'user-agent': 'KIB0-DailyBrief/1.0' } })
  if (!res.ok) throw new Error(`下载失败 ${res.status}`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}

export { MANIFEST }
