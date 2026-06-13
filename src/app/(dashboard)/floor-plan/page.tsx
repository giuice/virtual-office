// src/app/(dashboard)/floor-plan/page.tsx
'use client'

import { DashboardShell } from '@/components/shell/dashboard-shell'
import { FloorPlan } from "@/components/floor-plan/floor-plan";

export default function FloorPlanPage() {
  return (
    <DashboardShell>
      <div className="size-full flex justify-center">
        <FloorPlan />
      </div>
    </DashboardShell>
  );
}
