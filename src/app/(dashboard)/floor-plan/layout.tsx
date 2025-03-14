// app/(dashboard)/floor-plan/layout.tsx
import DashboardNav from '@/components/nav'

export default function FloorPlanLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container grid items-start gap-8 pb-8 pt-6 md:grid-cols-[200px_1fr]">
      <DashboardNav />
      <main className="flex w-full flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  )
}