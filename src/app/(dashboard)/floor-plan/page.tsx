// src/app/(dashboard)/floor-plan/page.tsx
'use client'


import { DashboardShell } from '@/components/shell/dashboard-shell'
import { FloorPlan } from "@/components/floor-plan/floor-plan"; // Corrected import path


export default function FloorPlanPage() {
  return (
    <DashboardShell>
      <div className="h-full w-full">
        <FloorPlan />
      </div>
    </DashboardShell>
  );
}
