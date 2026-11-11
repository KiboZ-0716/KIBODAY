/**
 * 定时任务自举：把上一轮发布出去的实时内容包恢复成 src/data 下的文件。
 *
 * 定时任务每次在全新沙箱里执行，本地文件是空的。先恢复云端/RAW 的完整状态
 * （全部期次、专题、周报、深挖索引），再生成今天的新内容，状态就能逐日累积，
 * 不会出现「周报永远只有 W43/W44」或「内容包被本地少量数据整包覆盖」。
 */
import { readdirSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DATA = join(ROOT, 'src', 'data')
const URL = 'https://raw.githubusercontent.com/KiboZ-0716/KIBODAY/main/live-bundle.json'
const FALLBACK = 'https://daily-hotspot-brief-88193.app.workbuddy.host/.cloud/database/rest/kib0_content'
const KEY = 'wbpk_U6IarWrMqRm6vY3hw9TgUI_yJz5JfbIEEXxjgiuI57Rducv50rno1EQ'

async function getBundle() {
  // RAW 优先（CORS 开放、无鉴权）；失败再退回云数据库
  try {
    const res = await fetch(`${URL}?t=${Date.now()}`, { signal: AbortSignal.timeout(30000) })
    if (res.ok) {
      const b = await res.json()
      if (Array.isArray(b?.issues) && b.issues.length) return { bundle: b, from: 'raw' }
    }
  } catch (e) {
    console.log(`[自举] RAW 不可用：${e.message}`)
  }
  try {
    const res = await fetch(FALLBACK, {
      headers: { 'x-wb-webapp-access-key': KEY },
      signal: AbortSignal.timeout(30000),
    })
    if (res.ok) {
      const rows = await res.json()
      const row = rows.find((r) => r.id === 'bundle')
      if (row?.payload?.issues?.length) return { bundle: row.payload, from: 'cloud' }
    }
  } catch (e) {
    console.log(`[自举] 云数据库不可用：${e.message}`)
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
