#!/usr/bin/env node
/**
 * 深挖模型撰稿（出刊环节真调模型）
 *
 * 浏览器里点「重新深挖」会受到发布域名凭据的 Origin 校验（旧 key 绑定旧域名，
 * 新域名 403）。但出刊脚本运行在服务端沙箱，请求不带浏览器 Origin，可以直连模型。
 * 因此把「调用模型写完整新闻事件专题分析」放在这里：每天出刊时，为当期所有可深挖
 * 条目（本期速览 + 属地新闻）各调一次模型，产出完整专题 JSON，落到 content/deep/{id}.json，
 * report.mjs 优先读取。读者点「深挖」看到的就是模型产物，不再是脚本拼贴或静态占位。
 *
 * 设计：增量（已有稿且非强制则跳过）、并发受限、单条失败/超时自动降级保留已有稿，
 * 任何模型异常都不会让整期出刊失败。
 */
import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, writeJson } from '../pipeline/lib.mjs'

const ENDPOINT = 'https://a564b245be247abf2.app.workbuddy.host'
const OAUTH_RELAY = 'https://www.workbuddy.cn/v2/as/genie-baas/oauth'
const PUBLISHABLE_KEY = 'wbpk_U6IarWrMqRm6vY3hw9TgUI_yJz5JfbIEEXxjgiuI57Rducv50rno1EQ'
const MODEL = 'hunyuan-chat'

const DEEP_DIR = path.join(ROOT, 'content', 'deep')
const TOPICS = path.join(ROOT, 'src', 'data', 'topics.json')

const SYSTEM_PROMPT = [
  '你是一名财经与公共政策领域的调查编辑，为一档严肃新闻简报撰写「完整事件专题分析」。',
  '你的产出不是新闻改写、不是导语复述，而是能让读者在几分钟内判断这件事与自己是否相关的深度专题。',
  '硬性约束：',
  '1. 不编造事实。任何数字、人名、机构、时间，必须能在提供的报道素材里找到出处；找不到就写「尚未披露」。',
  '2. 区分事实与判断。事实用陈述句；判断、归因、推论必须以「判断：」开头，并说明依据。',
  '3. 不重复标题。不写「据XX报道」这类导语，直接给增量信息。',
  '4. 写清数字的口径与边界：这个数是谁发布的、统计什么、不含什么、是否预测值/意向值、不能直接外推成什么。',
  '5. 必须写出「为什么是现在」（此前状态 + 触发点 + 时间线）与「机制」（从触发到结果怎么一步步传导）。',
  '6. 有边界就写边界：信息不足时明确写出缺什么、下一步该看哪份文件或哪个数据、什么时间可验证。',
  '7. 中文，不用形容词堆砌，不用「值得关注」「引发热议」这类空话；每段 80—160 字。',
  '只输出一个 JSON 对象，不要任何解释文字、不要代码块标记。',
].join('\n')

const OUTPUT_SHAPE = [
  '{',
  '  "bottomLine": ["三到四条结论，其中至少一条以「判断：」开头"],',
  '  "sections": [',
  '    { "heading": "发生了什么", "paragraphs": ["增量事实，不复述标题"] },',
  '    { "heading": "前因：为什么偏偏是现在", "paragraphs": ["此前状态 / 触发点 / 时间线"] },',
  '    { "heading": "数字的口径与边界", "paragraphs": ["谁发布 / 统计什么 / 不含什么 / 不能直接外推成什么"] },',
  '    { "heading": "机制：这一步怎么传导到结果", "paragraphs": ["链条式拆解"] },',
  '    { "heading": "影响到谁", "paragraphs": ["分层：直接承受者 / 产业链 / 普通读者"] },',
  '    { "heading": "接下来盯什么", "paragraphs": ["含具体时间点或披露节点的观察清单"] }',
  '  ],',
  '  "facts": ["带数字、可核查的事实，5—8 条"],',
  '  "stances": [{ "source": "信源名", "point": "该信源的侧重或当事方表述" }],',
  '  "openQuestions": ["目前还不清楚、需要后续披露才能回答的问题，3—5 条"]',
  '}',
].join('\n')

function safe(text, max = 300) {
  return String(text ?? '').replace(/[`{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * 判断一份已有深挖稿是否合格（两种 schema 都认）：
 * - sections 版（deepgen 产物）：bottomLine 非空 且 sections 总字数 ≥ 500
 * - background 版（手写编辑稿）：background/mechanism/impact 等核心字段合计 ≥ 600 字
 * 不合格（空壳、被截断、字段全空）一律判「需重新生成」，避免空壳文件
 * 永久残留导致页面出现空专题 + 虚假「模型撰写」标注。
 */
function isDeepUsable(old) {
  if (!old || typeof old !== 'object') return false
  const sectionChars = (old.sections ?? [])
    .reduce((n, s) => n + (s?.paragraphs ?? []).join('').length, 0)
  if (Array.isArray(old.sections)) {
    return Boolean(old.sections.length >= 3) && sectionChars >= 500 && Boolean(old.bottomLine?.length)
  }
  const flatChars = [old.background, old.mechanism, old.impact, old.whatNext]
    .reduce((n, x) => n + String(x ?? '').length, 0)
  return flatChars >= 600 && Boolean(old.bottomLine?.length)
}

function buildUserPrompt(topic) {
  const lines = []
  lines.push(`事件标题：${safe(topic.title, 120)}`)
  lines.push(`期次与日期：NO.${topic.issueNo} · ${topic.date} ${safe(topic.time, 20)}`)
  lines.push(`题材标签：${safe(topic.tag, 30)}`)
  if (topic.city) {
    lines.push(`所属地区：${topic.city}`)
    lines.push('素材说明：这是属地条目，公开细节通常少于全国性事件。数字、机构表态、时间地点等硬信息凡素材中没有的，一律写「尚未披露」；但「为什么是现在」「机制」「影响到谁」三节不要留空，可基于制度背景与常识给出以「判断：」开头的推断，并说明依据。')
  }
  lines.push(`编辑摘要：${safe(topic.summary, 400)}`)
  lines.push('')
  lines.push('可引用的同源报道素材（只能用这些素材里的硬信息）：')
  ;(topic.reports ?? []).slice(0, 8).forEach((r, i) => {
    lines.push(`${i + 1}. [${safe(r.name, 24)} · ${safe(r.time, 20)}] ${safe(r.title, 140)} —— ${safe(r.summary, 400)}`)
  })
  lines.push('')
  lines.push('请按以下 JSON 结构输出一份完整专题分析，不要输出其他内容：')
  lines.push(OUTPUT_SHAPE)
  return lines.join('\n')
}

/** 从模型输出里取出第一个完整的 JSON 对象（正文可能夹杂说明文字） */
function extractJson(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型输出里没有完整 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizeShape(parsed) {
  const bottomLine = (Array.isArray(parsed.bottomLine) ? parsed.bottomLine : [])
    .filter((x) => x && String(x).trim()).map(String).slice(0, 4)
  const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
    .filter((s) => s && typeof s.heading === 'string')
    .map((s) => ({
      heading: String(s.heading),
      paragraphs: (Array.isArray(s.paragraphs) ? s.paragraphs : []).filter(Boolean).map(String),
    }))
    .filter((s) => s.paragraphs.length)
  if (!bottomLine.length && !sections.length) throw new Error('模型返回内容为空')
  const chars = sections.reduce((n, s) => n + s.paragraphs.join('').length, 0)
  if (chars < 500) throw new Error(`专题过短（${chars} 字），判为不合格`)
  return {
    bottomLine: bottomLine.length ? bottomLine : ['模型未给出结论'],
    sections,
    facts: (Array.isArray(parsed.facts) ? parsed.facts : []).filter(Boolean).map(String).slice(0, 8),
    stances: (Array.isArray(parsed.stances) ? parsed.stances : [])
      .filter((s) => s && s.source)
      .map((s) => ({ source: String(s.source), point: String(s.point ?? '') })).slice(0, 6),
    openQuestions: (Array.isArray(parsed.openQuestions) ? parsed.openQuestions : [])
      .filter(Boolean).map(String).slice(0, 6),
  }
}

async function generateOne(cloud, topic) {
  let text = ''
  for await (const chunk of await cloud.llm.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(topic) },
    ],
    stream: true,
    max_tokens: 2800,
    signal: AbortSignal.timeout(90000),
  })) {
    const delta = chunk?.choices?.[0]?.delta
    if (delta?.content) text += delta.content
    if (delta?.reasoning_content && !text) text += delta.reasoning_content
  }
  return normalizeShape(extractJson(text))
}

/**
 * 为指定日期的可深挖条目补齐模型专题。
 * @param {{date?:string, force?:boolean, concurrency?:number, quiet?:boolean}} opts
 */
export async function generateDeepReports(opts = {}) {
  const { date, force = false, concurrency = 3, quiet = false } = opts
  const all = readJson(TOPICS, { topics: [] }).topics ?? []
  const targets = all.filter((t) => (date ? t.date === date : true))
  if (!targets.length) return { generated: 0, skipped: 0, failed: 0, total: 0 }

  fs.mkdirSync(DEEP_DIR, { recursive: true })
  const need = targets.filter((t) => {
    const f = path.join(DEEP_DIR, `${t.id}.json`)
    if (force || !fs.existsSync(f)) return true
    try {
      return !isDeepUsable(readJson(f))
    } catch {
      return true
    }
  })

  let cloud = null
  if (need.length) {
    try {
      const { createWorkBuddyCloud } = await import('@tencent-ai/workbuddy-cloud-sdk')
      cloud = createWorkBuddyCloud({
        endpoint: ENDPOINT,
        oauthRelayBaseUrl: OAUTH_RELAY,
        publishableKey: PUBLISHABLE_KEY,
      })
    } catch (e) {
      console.warn(`  [深挖] 模型 SDK 不可用，保留已有稿：${e.message}`)
      return { generated: 0, skipped: targets.length, failed: 0, total: targets.length }
    }
  }

  let generated = 0
  let failed = 0
  let discarded = 0
  let cursor = 0
  const workers = Array.from({ length: Math.min(concurrency, need.length) }, async () => {
    while (cursor < need.length) {
      const topic = need[cursor++]
      try {
        let body
        try {
          body = await generateOne(cloud, topic)
        } catch (firstErr) {
          // 单条失败重试一次，仍失败则进入统一失败处理
          if (!quiet) console.warn(`  [深挖] ⚠ ${topic.id} 首次失败（${String(firstErr.message).slice(0, 60)}），重试一次`)
          body = await generateOne(cloud, topic)
        }
        writeJson(path.join(DEEP_DIR, `${topic.id}.json`), {
          ...body,
          _meta: { authoredBy: 'model', via: 'deepgen/sdk', model: MODEL, at: new Date().toISOString() },
        })
        generated += 1
        if (!quiet) console.log(`  [深挖] ✔ ${topic.id} · ${body.sections.length} 节 / ${topic.title.slice(0, 24)}`)
      } catch (e) {
        failed += 1
        if (!quiet) console.warn(`  [深挖] ✘ ${topic.id} · ${String(e.message).slice(0, 70)}`)
        // 关键：若已有稿是不合格的空壳，删除它，让 report.mjs 走「同源报道编排」
        // 的如实兜底，而不是留着空壳被虚标为「模型撰写的深读专题」。
        const f = path.join(DEEP_DIR, `${topic.id}.json`)
        try {
          if (fs.existsSync(f) && !isDeepUsable(readJson(f))) {
            fs.rmSync(f)
            discarded += 1
            if (!quiet) console.warn(`  [深挖] 🗑 ${topic.id} 清除不合格空壳稿，出刊将走如实编排兜底`)
          }
        } catch { /* 清理失败不影响出刊 */ }
      }
    }
  })
  await Promise.all(workers)
  const skipped = targets.length - need.length
  if (!quiet) console.log(`  深挖模型撰稿：新生成 ${generated} · 已有跳过 ${skipped} · 失败 ${failed} · 清除空壳 ${discarded} / 共 ${targets.length}`)
  return { generated, skipped, failed, discarded, total: targets.length }
}

// 允许单独运行：node scripts/deepgen.mjs [--date 2026-11-11] [--force]
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : undefined
  generateDeepReports({ date, force: args.includes('--force') })
    .then((r) => console.log(`\n✔ 完成：${r.generated} 份模型专题`))
    .catch((e) => { console.error(`✖ ${e.message}`); process.exit(1) })
}
