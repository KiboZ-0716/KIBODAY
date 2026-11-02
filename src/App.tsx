import { HashRouter, Route, Routes } from 'react-router-dom'
import { UiProvider } from '@/lib/ui'
import { PageShell } from '@/components/PageShell'
import { getContentStatus } from '@/lib/livecontent'
import { TodayPage } from '@/pages/TodayPage'
import { ArchivePage } from '@/pages/ArchivePage'
import { BriefsPage } from '@/pages/BriefsPage'
import { AnalysisPage } from '@/pages/AnalysisPage'
import { ReportPage } from '@/pages/ReportPage'
import { StorylinePage } from '@/pages/StorylinePage'
import { SearchPage } from '@/pages/SearchPage'
import { FollowingPage } from '@/pages/FollowingPage'
import { WeeklyPage } from '@/pages/WeeklyPage'
import { Link } from 'react-router-dom'

export default function App() {
  return (
    <HashRouter>
      <UiProvider>
        <ContentDebugBadge />
        <Routes>
          {/* 首页直接渲染「今日」页：无参数时 TodayPage 自动取最新一期，
              云端内容包到达并整体替换数据集后会随之更新 —— 打开网页永远看到最新一期 */}
          <Route path="/issue/:no" element={<TodayPage />} />
          <Route path="/issue/:no/briefs" element={<BriefsPage />} />
          <Route path="/issue/:no/analysis" element={<AnalysisPage />} />
          <Route path="/report/:id" element={<ReportPage />} />
          <Route path="/storyline/:id" element={<StorylinePage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/following" element={<FollowingPage />} />
          <Route path="/ai-weekly" element={<WeeklyPage />} />
          <Route path="/ai-weekly/:id" element={<WeeklyPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </UiProvider>
    </HashRouter>
  )
}

/** 只在 ?debug 打开时显示，用于确认页面用的是云端内容包还是构建期数据 */
function ContentDebugBadge() {
  if (!location.search.includes('debug')) return null
  const status = getContentStatus()
  return (
    <div className="content-debug">
      内容来源：{status?.source === 'cloud' ? '云端内容包' : '构建期数据'} · {status?.date ?? '-'}
      {status?.error ? ` · ${status.error}` : ''}
    </div>
  )
}

function NotFound() {
  return (
    <PageShell title="页面不存在">
      <div className="page-body">
        <div className="empty-state">
          <h3>这里什么都没有</h3>
          <p>链接可能过期了。回今天这一期，或者翻翻往期。</p>
          <Link to="/">回到今天</Link>
        </div>
      </div>
    </PageShell>
  )
}
