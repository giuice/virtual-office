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

export function QuickLinksGrid({ isAdmin }: { isAdmin: boolean }) {
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
      description: 'View and manage team members',
      icon: Users2Icon,
      href: '/company',
      color: 'bg-green-100 dark:bg-green-900',
    },
    {
      title: 'Settings',
      description: 'Update your profile and preferences',
      icon: SettingsIcon,
      href: '/settings',
      color: 'bg-gray-100 dark:bg-gray-800',
    },
  ];

  if (isAdmin) {
    quickLinks.push({
      title: 'Manage Invitations',
      description: 'Send and manage team invitations',
      icon: Users2Icon,
      href: '/admin/invitations',
      color: 'bg-red-100 dark:bg-red-900',
    });
  }

  return (
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
  );
}
