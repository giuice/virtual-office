// src/app/(dashboard)/floor-plan/page.tsx
'use client'

import { useState } from 'react'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Space } from '@/components/floor-plan/types'
import { Announcement } from '@/types/database'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAvatarUrl, getUserInitials } from '@/lib/avatar-utils'
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
