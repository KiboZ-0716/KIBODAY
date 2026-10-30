import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getIssue, latestIssue } from '@/data'
import { useLastIssue } from '@/lib/hooks'
import { useUi } from '@/lib/ui'
import { PageShell } from '@/components/PageShell'
import { IssueHeader } from '@/components/IssueHeader'
import { LeadBlock } from '@/components/LeadBlock'
import { BriefsSection } from '@/components/BriefsSection'
import { AnalysisSection } from '@/components/AnalysisSection'
import { TimelineSection } from '@/components/TimelineSection'
import { Rail } from '@/components/Rail'
import { RegionalSection } from '@/components/RegionalSection'
import { ArchiveSection } from '@/components/ArchiveSection'

export function TodayPage() {
  const { no } = useParams()
  const issue = getIssue(no ?? '') ?? latestIssue
  const { openMethod } = useUi()
  useLastIssue()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [issue.no])

  return (
    <PageShell title={`NO.${issue.no} ${issue.date}`} onEditionJump={scrollToArchive}>
      <IssueHeader issue={issue} onOpenMethod={() => openMethod(issue)} />
      <LeadBlock issue={issue} />

      <div className="content-grid">
        <div className="main-column">
          <BriefsSection issue={issue} />
          <AnalysisSection issue={issue} />
          <TimelineSection issue={issue} />
        </div>
        <Rail issue={issue} onOpenMethod={() => openMethod(issue)} />
      </div>

      <RegionalSection issue={issue} />
      <ArchiveSection issue={issue} />
    </PageShell>
  )
}

function scrollToArchive() {
  document.getElementById('archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
