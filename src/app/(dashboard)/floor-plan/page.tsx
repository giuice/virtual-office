// src/app/(dashboard)/floor-plan/page.tsx
'use client'

import { DashboardShell } from '@/components/shell/dashboard-shell'
import { FloorPlan } from "@/components/floor-plan/floor-plan"; // Corrected import path
import { DashboardHeader } from '@/components/shell/dashboard-header'


export default function FloorPlanPage() {
  return (
    <DashboardShell>
      <DashboardHeader
        heading="Avatar Components Demo"
        description="Explore and test various avatar components"
      />
      <div className="h-full w-full">
        <FloorPlan />
      </div>
    </DashboardShell>
  );
}
