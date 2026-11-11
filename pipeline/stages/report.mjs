import fs from 'node:fs'
import path from 'node:path'
import { ROOT, readJson, writeJson } from '../lib.mjs'

/**
 * 事件报告阶段：为每条速览产出可深挖的事件报告。
 *
 * - 深读版（deep）：content/reports/<eventId>.json 已存在时采用。这份文件由模型按
 *   content/prompts/event-report.md 的提示词产出，再经编辑复核。
 * - 基础版（outline）：尚无完整报告时，用事件自身的同期报道自动组装，
 *   不推测、不补充原文里没有的信息，并在页面上如实标注。
 *
 * 原则与配图一致：永不空白，也永不拿推测冒充事实。
 */

const PROMPT_ID = 'deep-story'
const PROMPT_VERSION = 'v1'

export function buildReports({ dates }) {
  const CONTENT = path.join(ROOT, 'content')
  const ISSUE_DIR = path.join(ROOT, 'src', 'data', 'issues')
  const REPORTS_DIR = path.join(CONTENT, 'reports')
  const DEEP_DIR = path.join(CONTENT, 'deep')
  const reports = []

  for (const date of dates) {
    const issue = readJson(path.join(ISSUE_DIR, `${date}.json`))
    const rawPath = path.join(CONTENT, 'raw', `${date}.json`)
    const raw = fs.existsSync(rawPath) ? readJson(rawPath) : { articles: [] }

    // 可深挖条目 = 本期速览 + 属地新闻。属地条目没有同源报道，用其自身信源构造 sources。
    const entries = [
      ...issue.briefs.map((b) => ({ ...b, _kind: 'brief' })),
      ...(issue.regional?.cities ?? []).flatMap((c) =>
        (c.items ?? []).map((i) => ({ ...i, _kind: 'regional', city: c.city })),
      ),
    ]

    for (const brief of entries) {
      const article = brief._kind === 'brief'
        ? raw.articles.find((a) => a.id === brief.id)
        : null
      const peers = article?.eventKey
        ? raw.articles.filter((a) => a.eventKey === article.eventKey)
        : [article].filter(Boolean)

      const sources = brief._kind === 'regional'
        ? [{ name: brief.source, time: brief.relTime, url: '' }]
        : peers.map((a) => ({
            name: a.source,
            time: a.publishedAt,
            url: a.url,
          }))

      // 深挖正文由出刊时的模型按 content/prompts/deep-story.md 撰写，
      // 优先读 content/deep/{briefId}.json；旧版 content/reports 作兼容。
      // 准入校验：只有内容完整（结论 + 正文达到实质字数）的稿才允许标为「深读」，
      // 空壳 / 被截断的文件一律降级走下面的「同源报道编排」如实兜底，
      // 避免出现「页面空专题 + 虚标模型撰写」的质量事故。
      const deepPath = path.join(DEEP_DIR, `${brief.id}.json`)
      const legacyPath = path.join(REPORTS_DIR, `${brief.id}.json`)
      const presetRaw = fs.existsSync(deepPath)
        ? readJson(deepPath)
        : fs.existsSync(legacyPath)
          ? readJson(legacyPath)
          : null
      const sectionChars = (presetRaw?.sections ?? [])
        .reduce((n, s) => n + (s?.paragraphs ?? []).join('').length, 0)
      const narrativeChars = [presetRaw?.background, presetRaw?.mechanism, presetRaw?.impact, presetRaw?.whatNext]
        .reduce((n, x) => n + String(x ?? '').length, 0)
      const preset = presetRaw && (presetRaw.bottomLine?.length > 0) && (sectionChars >= 500 || narrativeChars >= 600)
        ? presetRaw
        : null

      if (preset) {
        // 标注如实分档：模型稿写明模型；手写编辑稿写明编辑稿；不统一虚标。
        const isModelAuthored = preset._meta?.authoredBy === 'model'
        const credit = isModelAuthored
          ? `${preset._meta.model} · 出刊时调用模型撰写`
          : '编辑撰稿（按 deep-story 规范人工撰写并复核）'
        reports.push({
          id: brief.id,
          level: 'deep',
          issueNo: issue.no,
          date,
          title: brief.title,
          tag: brief.tag,
          summary: brief.summary,
          bottomLine: preset.bottomLine,
          sections: preset.sections,
          facts: preset.facts,
          stances: preset.stances ?? [],
          openQuestions: preset.openQuestions,
          sources,
          generatedWith: {
            level: 'deep',
            promptId: PROMPT_ID,
            promptVersion: PROMPT_VERSION,
            model: credit,
            generatedAt: preset._meta?.at ?? issue.generatedAt,
            note: isModelAuthored
              ? '由模型在出刊环节按 content/prompts/deep-story.md 写成完整专题分析；事实与判断分开，数字带口径。'
              : '由编辑按 content/prompts/deep-story.md 规范撰写并人工复核；事实与判断分开，数字带口径。',
          },
        })
        continue
      }

      // 基础版不再是占位模板：把同源报道里的真实句子编排成一份可核对的静态报告。
      // 当前发布域名没有模型通道，读者点「深挖」必须直接看到内容，而不是「深挖失败」。
      const uniq = (arr) => [...new Set(arr.filter((x) => x && String(x).trim()))]
      const lines = uniq(peers.map((a) => String(a.summary ?? '').replace(/\s+/g, ' ').trim()))
      const sentences = uniq(
        lines.join(' ').split(/(?<=[。！？；])/).map((s) => s.trim()).filter((s) => s.length > 8),
      )
      const pick = (re, fallback) => {
        const hit = sentences.filter((s) => re.test(s)).slice(0, 3)
        return hit.length ? hit : [fallback]
      }
      const facts = sentences.filter((s) => /\d/.test(s)).slice(0, 6)
      const caliber = pick(
        /口径|不等于|不是已|这是|注意|属于|不含|预测值|意向|尚未披露/,
        `本条数字的可核对范围以「${brief.source}」披露为准，未披露的部分不做推测。`,
      )
      const impact = pick(/所以|意味着|影响|传导|会变|承压|改写|落到|改写/, `${brief.title}。${brief.summary}`)
      const next = pick(
        /下一步|观察点|观察|下一个|届时|到期|看招股书/,
        '关注下一期同一事件的官方数据与后续披露。',
      )
      reports.push({
        id: brief.id,
        level: 'outline',
        issueNo: issue.no,
        date,
        title: brief.title,
        tag: brief.tag,
        summary: brief.summary,
        bottomLine: sentences.slice(0, 3).length >= 2 ? sentences.slice(0, 3) : [brief.summary],
        sections: [
          { heading: '发生了什么', paragraphs: lines.slice(0, 3).length ? lines.slice(0, 3) : [brief.summary] },
          { heading: '数字的口径与边界', paragraphs: caliber },
          { heading: '为什么是现在、影响到谁', paragraphs: impact },
          { heading: '接下来盯什么', paragraphs: next },
        ],
        facts: facts.length ? facts : [brief.summary],
        stances: peers.length > 1 ? peers.map((a) => ({ source: a.source, point: String(a.title) })) : [],
        openQuestions: uniq([...next.slice(0, 2), '是否有更多独立信源交叉确认']),
        sources,
        generatedWith: {
          level: 'outline',
          promptId: PROMPT_ID,
          promptVersion: PROMPT_VERSION,
          model: '同源报道自动编排（未调用模型）',
          generatedAt: issue.generatedAt,
          note: '由当期同源报道的原文句子编排，事实与口径均来自报道，未做推测补充。',
        },
      })
    }
  }

  const deep = reports.filter((r) => r.level === 'deep').length
  writeJson(path.join(ROOT, 'src', 'data', 'reports.json'), {
    promptId: PROMPT_ID,
    promptVersion: PROMPT_VERSION,
    promptPath: 'content/prompts/event-report.md',
    generatedAt: new Date().toISOString(),
    reports,
  })

  console.log(`  事件报告 ${reports.length} 份（深读 ${deep} · 基础 ${reports.length - deep}）`)
  return reports
}
