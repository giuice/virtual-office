// components/nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { 
  HomeIcon, 
  Users2Icon, 
  LayoutDashboardIcon,
  CalendarDaysIcon,
  SettingsIcon 
} from 'lucide-react'

interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboardIcon,
  },
  {
    title: 'Floor Plan',
    href: '/floor-plan',
    icon: HomeIcon,
  },
  {
    title: 'Team',
    href: '/team',
    icon: Users2Icon,
  },
  {
    title: 'Calendar',
    href: '/calendar',
    icon: CalendarDaysIcon,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: SettingsIcon,
  },
]

export function DashboardNav() {
  const pathname = usePathname()

  return (
    <nav className="grid items-start gap-2">
      {navItems.map((item) => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              buttonVariants({ variant: isActive ? 'default' : 'ghost' }),
              'justify-start',
              'gap-2'
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.title}
          </Link>
        )
      })}
    </nav>
  )
}