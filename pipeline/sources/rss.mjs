import path from 'node:path'
import { ROOT, readJson } from '../lib.mjs'

/**
 * 在线数据源：按 content/feeds.json 抓取 RSS / Atom。
 * 只用标准库 fetch，不引第三方解析器；对坏源做逐源降级，不因单源失败中断整期。
 */
export async function loadFeeds({ date, windowStart = '00:00', windowEnd = '09:30', timeoutMs = 12000 }) {
  const config = readJson(path.join(ROOT, 'content', 'feeds.json'))
  const feeds = config.feeds ?? []
  const articles = []
  const failures = []

  for (const feed of feeds) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(feed.url, {
        signal: controller.signal,
        headers: { 'user-agent': 'KIB0-DailyBrief/1.0 (+https://kib0.example)' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const items = parseFeed(xml, feed.name)
      articles.push(...items.filter((a) => inWindow(a.publishedAt, windowStart, windowEnd)))
    } catch (err) {
      failures.push({ feed: feed.name, reason: String(err.message ?? err) })
    } finally {
      clearTimeout(timer)
    }
  }

  if (!articles.length) {
    throw new Error(
      `[rss] 全部信源抓取失败或无窗口内文章：${failures.map((f) => `${f.feed}(${f.reason})`).join('; ')}`,
    )
  }

  return {
    date,
    window: `${windowStart}—${windowEnd}`,
    fetchedAt: new Date().toISOString(),
    articles,
    origin: 'rss',
    failures,
  }
}

function inWindow(hhmm, start, end) {
  return hhmm >= start && hhmm <= end
}

export function parseFeed(xml, feedName) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0])
  return blocks.map((block) => {
    const title = stripTags(pick(block, 'title'))
    const link = pickAttr(block, 'link', 'href') || stripTags(pick(block, 'link'))
    const published = pick(block, 'pubDate') || pick(block, 'published') || pick(block, 'updated')
    const desc = stripTags(pick(block, 'description') || pick(block, 'summary') || pick(block, 'content'))
    const media =
      pickAttr(block, 'media:content', 'url') ||
      pickAttr(block, 'enclosure', 'url') ||
      firstImage(stripTags(pick(block, 'content:encoded')))

    return {
      title,
      source: feedName,
      publishedAt: toHHmm(published),
      url: link,
      summary: desc.slice(0, 160),
      tags: [],
      image: media || null,
      imageCredit: media ? feedName : null,
    }
  }).filter((a) => a.title)
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? m[1] : ''
}

function pickAttr(block, tag, attr) {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, 'i'))
  return m ? m[1] : ''
}

function firstImage(html) {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i)
  return m ? m[1] : ''
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toHHmm(input) {
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) {
    const m = String(input).match(/(\d{2}):(\d{2})/)
    return m ? `${m[1]}:${m[2]}` : '00:00'
  }
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai',
  }).format(d)
}
