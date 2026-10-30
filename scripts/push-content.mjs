// 把 src/data 里的全站数据打成一份「内容包」上传到云数据库。
// 每日管线跑完后执行它，站点不用重新部署，读者刷新就能看到最新一期。
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const DATA = join(ROOT, 'src', 'data')

// 发布域名与 publishableKey 是一对：服务端按 Origin 精确校验，必须与应用域名一致
const ENDPOINT = 'https://daily-hotspot-brief-88193.app.workbuddy.host'
const PUBLISHABLE_KEY =
  'wbpk_U6IarWrMqRm6vY3hw9TgUI_yJz5JfbIEEXxjgiuI57Rducv50rno1EQ'
const TABLE = 'kib0_content'
const ROW_ID = 'bundle'

const read = (name) => JSON.parse(readFileSync(join(DATA, name), 'utf8'))

const issueFiles = readdirSync(join(DATA, 'issues')).filter((f) => f.endsWith('.json'))
const issues = issueFiles
  .map((f) => read(join('issues', f)))
  .sort((a, b) => b.date.localeCompare(a.date))

if (issues.length === 0) {
  console.error('src/data/issues 里没有任何一期，拒绝上传空包')
  process.exit(1)
}

const bundle = {
  version: 1,
  generatedAt: new Date().toISOString(),
  issues,
  storylines: read('storylines.json').storylines ?? [],
  topics: read('topics.json').topics ?? [],
  weekly: read('weekly.json'),
  reports: read('reports.json').reports ?? [],
}

const res = await fetch(`${ENDPOINT}/.cloud/database/rest/${TABLE}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-wb-webapp-access-key': PUBLISHABLE_KEY,
    // 同一 id 覆盖写，等价于 upsert
    Prefer: 'resolution=merge-duplicates,return=representation',
  },
  body: JSON.stringify([{ id: ROW_ID, payload: bundle }]),
})

const text = await res.text()
const kb = Math.round(JSON.stringify(bundle).length / 1024)

if (!res.ok) {
  console.error(`上传失败 HTTP ${res.status}: ${text.slice(0, 400)}`)
  process.exit(1)
}

const rows = JSON.parse(text)
console.log(
  `已上传内容包：${issues.length} 期（最新 ${issues[0].date}）、${bundle.topics.length} 条深挖索引、${kb} KB`,
)
console.log('云端写入时间：', rows?.[0]?.updated_at ?? '(未返回)')
