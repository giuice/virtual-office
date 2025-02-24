// app/(dashboard)/floor-plan/page.tsx
'use client'

import { FloorPlan } from '@/components/floor-plan'
import { DashboardShell } from '@/components/shell'

export default function FloorPlanPage() {
  return (
    <DashboardShell>
      <FloorPlan />
    </DashboardShell>
  )
}