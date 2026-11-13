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
const REPO = 'KiboZ-0716/KIBODAY'
// 唯一真源 = 仓库 main 的 live-bundle.json。@main 的 CDN 缓存 12 小时会串期，
// 所以按「内容包最后一次提交」锁定地址；云库只作最后兜底（旧数据不再优先）。
const BUNDLE_COMMIT_API = `https://api.github.com/repos/${REPO}/commits?path=live-bundle.json&per_page=1`
const CDN_BY_COMMIT = (sha) => `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/live-bundle.json`
const API = `https://api.github.com/repos/${REPO}/contents/live-bundle.json?ref=main`
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/main/live-bundle.json`
const CLOUD = 'https://a564b245be247abf2.app.workbuddy.host/.cloud/database/rest/kib0_content'
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

  // 1) 按 commit 锁定的 CDN：唯一真源、免 token、2—3 秒，且不会拿到缓存里的昨天
  try {
    const head = await fetch(BUNDLE_COMMIT_API, {
      headers: { 'User-Agent': 'kib0-bootstrap' },
      signal: AbortSignal.timeout(15000),
    })
    if (head.ok) {
      const info = await head.json()
      const sha = Array.isArray(info) ? info[0]?.sha : info?.sha
      if (sha) {
        const res = await fetch(CDN_BY_COMMIT(sha), { signal: AbortSignal.timeout(60000) })
        if (res.ok) {
          const b = await res.json()
          if (ok(b)) return { bundle: b, from: 'cdn' }
        }
      }
    }
  } catch (e) {
    console.log(`[自举] commit CDN 不可用：${e.message}`)
  }

  // 2) GitHub API（带 token，内容包超过 1MB 需 raw media type）
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

  // 3) 云数据库（旧数据风险高，放在后面，且恢复前还会做防倒退校验）
  try {
    const res = await fetch(CLOUD, {
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

  // 4) RAW 最后兜底（国内可能极慢，给足 90 秒）
  try {
    const res = await fetch(`${RAW_URL}?t=${Date.now()}`, { signal: AbortSignal.timeout(90000) })
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

// 防倒退：云库/缓存里可能残留几个月前的旧包，绝不能用它清空 src/data。
function localLatestDate() {
  try {
    const files = readdirSync(join(DATA, 'issues')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    return files.map((f) => f.slice(0, 10)).sort().at(-1) ?? ''
  } catch {
    return ''
  }
}
const localLatest = localLatestDate()
if (localLatest && bundle.issues[0].date < localLatest) {
  console.log(
    `[自举] 取到的包 ${bundle.issues[0].date} 比本地 ${localLatest} 旧，拒绝恢复（防倒退）`,
  )
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

// 顺手把原始包写到项目根：构建后置步骤会复制进 dist，作为同源兜底副本。
// 前端会并发比对所有通道并按期次择优，副本旧也压不过远端新包。
try {
  writeFileSync(join(ROOT, 'live-bundle.json'), JSON.stringify(bundle), 'utf8')
} catch (e) {
  console.log(`[自举] 写 live-bundle.json 失败：${e.message}`)
}
