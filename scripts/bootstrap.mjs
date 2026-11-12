/**
 * 定时任务自举：把上一轮发布出去的实时内容包恢复成 src/data 下的文件。
 *
 * 定时任务每次在全新沙箱里执行，本地文件是空的。先恢复云端/RAW 的完整状态
 * （全部期次、专题、周报、深挖索引），再生成今天的新内容，状态就能逐日累积，
 * 不会出现「周报永远只有 W43/W44」或「内容包被本地少量数据整包覆盖」。
 */
import { readdirSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DATA = join(ROOT, 'src', 'data')
const URL = 'https://raw.githubusercontent.com/KiboZ-0716/KIBODAY/main/live-bundle.json'
const API = 'https://api.github.com/repos/KiboZ-0716/KIBODAY/contents/live-bundle.json?ref=main'
const FALLBACK = 'https://daily-hotspot-brief-88193.app.workbuddy.host/.cloud/database/rest/kib0_content'
const KEY = 'wbpk_U6IarWrMqRm6vY3hw9TgUI_yJz5JfbIEEXxjgiuI57Rducv50rno1EQ'

let token = process.env.GITHUB_TOKEN || ''
if (!token) {
  try {
    token = readFileSync(join(ROOT, '.gh_token'), 'utf8').trim()
  } catch {
    /* 没有 token 就跳过 API 通道 */
  }
}

async function getBundle() {
  const ok = (b) => Array.isArray(b?.issues) && b.issues.length > 0

  // 1) 云数据库优先：自家域名，国内网络也稳，通常几秒返回
  try {
    const res = await fetch(FALLBACK, {
      headers: { 'x-wb-webapp-access-key': KEY },
      signal: AbortSignal.timeout(20000),
    })
    if (res.ok) {
      const rows = await res.json()
      const row = rows.find((r) => r.id === 'bundle')
      if (ok(row?.payload)) return { bundle: row.payload, from: 'cloud' }
    }
  } catch (e) {
    console.log(`[自举] 云数据库不可用：${e.message}`)
  }

  // 2) GitHub API（走 api.github.com，比 RAW 域名稳；内容包超过 1MB 需 raw media type）
  if (token) {
    try {
      const res = await fetch(API, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.raw+json',
          'User-Agent': 'kib0-bootstrap',
        },
        signal: AbortSignal.timeout(60000),
      })
      if (res.ok) {
        const b = await res.json()
        if (ok(b)) return { bundle: b, from: 'api' }
      }
    } catch (e) {
      console.log(`[自举] GitHub API 不可用：${e.message}`)
    }
  }

  // 3) RAW 最后兜底（国内可能极慢，给足 90 秒）
  try {
    const res = await fetch(`${URL}?t=${Date.now()}`, { signal: AbortSignal.timeout(90000) })
    if (res.ok) {
      const b = await res.json()
      if (ok(b)) return { bundle: b, from: 'raw' }
    }
  } catch (e) {
    console.log(`[自举] RAW 不可用：${e.message}`)
  }

  return { bundle: null, from: 'none' }
}

const { bundle, from } = await getBundle()
if (!bundle) {
  console.log('[自举] 没有可取的内容包，保留仓库自带数据继续')
  process.exit(0)
}

mkdirSync(join(DATA, 'issues'), { recursive: true })
for (const f of readdirSync(join(DATA, 'issues'))) {
  if (f.endsWith('.json')) rmSync(join(DATA, 'issues', f))
}
for (const issue of bundle.issues) {
  writeFileSync(join(DATA, 'issues', `${issue.date}.json`), JSON.stringify(issue, null, 1), 'utf8')
}
const dump = (name, value) => {
  if (value === undefined || value === null) return
  const body = Array.isArray(value) ? { [name]: value } : value
  writeFileSync(join(DATA, `${name}.json`), JSON.stringify(body, null, 1), 'utf8')
}
dump('storylines', bundle.storylines)
dump('topics', bundle.topics)
dump('weekly', bundle.weekly)
if (bundle.reports) {
  writeFileSync(
    join(DATA, 'reports.json'),
    JSON.stringify(
      {
        promptId: 'event-report',
        promptVersion: 'v1.2',
        promptPath: 'content/prompts/event-report.md',
        generatedAt: bundle.generatedAt ?? new Date().toISOString(),
        reports: bundle.reports,
      },
      null,
      1,
    ),
    'utf8',
  )
}

// 周报按 content/weekly/<ISO周>.json 编排，把内容包里的历史周报反向写回源文件，
// 这样下次生成新一期时，buildWeekly() 能编出「累积」的周报而不是只有仓库里那两期。
if (bundle.weekly?.issues?.length) {
  const dir = join(ROOT, 'content', 'weekly')
  mkdirSync(dir, { recursive: true })
  for (const w of bundle.weekly.issues) {
    const { stats, ...rest } = w
    writeFileSync(join(dir, `${w.id}.json`), JSON.stringify(rest, null, 1), 'utf8')
  }
}

console.log(
  `[自举] 来源=${from} · 恢复 ${bundle.issues.length} 期（最新 ${bundle.issues[0].date}）、${bundle.storylines?.length ?? 0} 个专题、${bundle.weekly?.issues?.length ?? 0} 期周报`,
)

// 顺手把原始包写到项目根：构建后置步骤会复制进 dist，让站点以「同源」为主通道，
// 不必再依赖国内经常超时的 raw.githubusercontent.com。
try {
  writeFileSync(join(ROOT, 'live-bundle.json'), JSON.stringify(bundle), 'utf8')
} catch (e) {
  console.log(`[自举] 写 live-bundle.json 失败：${e.message}`)
}
