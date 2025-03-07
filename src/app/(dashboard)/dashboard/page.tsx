// src/app/(dashboard)/dashboard/page.tsx
'use client';

import { useCompany } from '@/contexts/CompanyContext';
import { DashboardShell } from '@/components/shell/dashboard-shell';
import { DashboardHeader } from '@/components/shell/dashboard-header';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { 
  Users2Icon, 
  HomeIcon, 
  SettingsIcon, 
  MessageSquareIcon, 
  CalendarIcon 
} from 'lucide-react';

export default function DashboardPage() {
  const { company, currentUserProfile, companyUsers } = useCompany();
  
  // Check if the user is an admin
  const isAdmin = company?.adminIds?.includes(currentUserProfile?.id || '') || false;
  
  const quickLinks = [
    {
      title: 'Floor Plan',
      description: 'Access the virtual office layout',
      icon: HomeIcon,
      href: '/floor-plan',
      color: 'bg-blue-100 dark:bg-blue-900',
    },
    {
      title: 'Team Members',
      description: `View all ${companyUsers.length} team members`,
      icon: Users2Icon,
      href: '/company',
      color: 'bg-green-100 dark:bg-green-900',
    },
    {
      title: 'Messages',
      description: 'Chat with colleagues',
      icon: MessageSquareIcon,
      href: '/messages',
      color: 'bg-yellow-100 dark:bg-yellow-900',
    },
    {
      title: 'Calendar',
      description: 'Schedule meetings and events',
      icon: CalendarIcon,
      href: '/calendar',
      color: 'bg-purple-100 dark:bg-purple-900',
    },
    {
      title: 'Settings',
      description: 'Update your profile and preferences',
      icon: SettingsIcon,
      href: '/settings',
      color: 'bg-gray-100 dark:bg-gray-800',
    },
  ];

  return (
    <DashboardShell>
      <DashboardHeader
        heading={`Welcome, ${currentUserProfile?.displayName || 'User'}!`}
        description={`${company?.name || 'Your company'} virtual office dashboard`}
      />
      
      <div className="grid gap-8">
        {/* Company Overview Card */}
        <Card>
          <CardHeader>
            <CardTitle>{company?.name || 'Company'} Overview</CardTitle>
            <CardDescription>Quick summary of your virtual office</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col bg-muted/50 p-4 rounded-lg">
              <span className="text-muted-foreground text-sm font-medium">Members</span>
              <span className="text-3xl font-bold mt-1">{companyUsers.length}</span>
            </div>
            
            <div className="flex flex-col bg-muted/50 p-4 rounded-lg">
              <span className="text-muted-foreground text-sm font-medium">Online</span>
              <span className="text-3xl font-bold mt-1">
                {companyUsers.filter(user => user.status === 'online').length}
              </span>
            </div>
            
            <div className="flex flex-col bg-muted/50 p-4 rounded-lg">
              <span className="text-muted-foreground text-sm font-medium">Rooms</span>
              <span className="text-3xl font-bold mt-1">
                {company?.settings?.maxRooms || 10}
              </span>
            </div>
            
            <div className="flex flex-col bg-muted/50 p-4 rounded-lg">
              <span className="text-muted-foreground text-sm font-medium">Your Role</span>
              <span className="text-xl font-bold mt-1 capitalize">
                {currentUserProfile?.role || 'Member'}
              </span>
            </div>
          </CardContent>
          <CardFooter>
            {isAdmin && (
              <Button asChild>
                <Link href="/company?tab=settings">Manage Company</Link>
              </Button>
            )}
          </CardFooter>
        </Card>
        
        {/* Quick Links Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Card key={link.href} className="overflow-hidden">
              <CardHeader className={`${link.color} text-foreground`}>
                <div className="flex items-center gap-2">
                  <link.icon className="h-5 w-5" />
                  <CardTitle className="text-lg">{link.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                <CardDescription>{link.description}</CardDescription>
              </CardContent>
              <CardFooter>
                <Button asChild variant="ghost" className="w-full">
                  <Link href={link.href}>Open {link.title}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
        
        {/* Admin Actions (Only visible to admins) */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Admin Actions</CardTitle>
              <CardDescription>
                Special actions available to company administrators
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/company">
                    <Users2Icon className="mr-2 h-4 w-4" />
                    Manage Team
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href="/company?tab=settings">
                    <SettingsIcon className="mr-2 h-4 w-4" />
                    Company Settings
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}