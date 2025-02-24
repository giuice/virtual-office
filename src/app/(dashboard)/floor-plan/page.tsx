// app/(dashboard)/floor-plan/page.tsx
'use client'

import { FloorPlan } from '@/components/floor-plan'
import { MessageFeed } from '@/components/dashboard/message-feed'
import { DashboardShell } from '@/components/shell'

export default function FloorPlanPage() {
  return (
    <DashboardShell>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4">
        <FloorPlan />
        <MessageFeed />
      </div>
    </DashboardShell>
  )
}