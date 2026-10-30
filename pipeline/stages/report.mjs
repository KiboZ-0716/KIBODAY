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

const PROMPT_ID = 'event-report'
const PROMPT_VERSION = 'v1.2'

export function buildReports({ dates }) {
  const CONTENT = path.join(ROOT, 'content')
  const ISSUE_DIR = path.join(ROOT, 'src', 'data', 'issues')
  const REPORTS_DIR = path.join(CONTENT, 'reports')
  const reports = []

  for (const date of dates) {
    const issue = readJson(path.join(ISSUE_DIR, `${date}.json`))
    const rawPath = path.join(CONTENT, 'raw', `${date}.json`)
    const raw = fs.existsSync(rawPath) ? readJson(rawPath) : { articles: [] }

    for (const brief of issue.briefs) {
      const article = raw.articles.find((a) => a.id === brief.id)
      const peers = article?.eventKey
        ? raw.articles.filter((a) => a.eventKey === article.eventKey)
        : [article].filter(Boolean)

      const sources = peers.map((a) => ({
        name: a.source,
        time: a.publishedAt,
        url: a.url,
      }))

      const presetPath = path.join(REPORTS_DIR, `${brief.id}.json`)
      const preset = fs.existsSync(presetPath) ? readJson(presetPath) : null

      if (preset) {
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
            model: 'K!B0 事件报告模型',
            generatedAt: issue.generatedAt,
            note: '按 event-report 提示词生成，编辑复核。数字与结论均来自同源报道，未做推测填充。',
          },
        })
        continue
      }

      const times = sources.map((s) => s.time).sort()
      reports.push({
        id: brief.id,
        level: 'outline',
        issueNo: issue.no,
        date,
        title: brief.title,
        tag: brief.tag,
        summary: brief.summary,
        bottomLine: [
          `目前共 ${sources.length} 篇同源报道（${times[0]} 起），完整事件报告尚未生成。`,
          brief.summary,
        ],
        sections: [
          {
            heading: '目前已知的',
            paragraphs: [
              brief.summary,
              `同期共有 ${sources.length} 篇报道，时间跨度 ${times[0]} 至 ${times[times.length - 1]}，均可通过下方链接核对原文。`,
            ],
          },
          {
            heading: '为什么这里是基础版',
            paragraphs: [
              '这条事件还没有生成完整报告。每天跑批时，只对进入深挖清单的事件调用报告提示词；未被选中的事件保留基础版，不做推测补充。',
              '需要完整版时，把该事件加入当日深挖清单，模型按 event-report 提示词产出后重新跑管线即可。',
            ],
          },
        ],
        facts: [brief.summary],
        stances: [],
        openQuestions: ['该事件的后续进展与官方口径', '是否有更多独立信源交叉确认'],
        sources,
        generatedWith: {
          level: 'outline',
          promptId: PROMPT_ID,
          promptVersion: PROMPT_VERSION,
          model: '自动组装（未调用模型）',
          generatedAt: issue.generatedAt,
          note: '基础版，由同期报道自动组装，不做推测补充。',
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
