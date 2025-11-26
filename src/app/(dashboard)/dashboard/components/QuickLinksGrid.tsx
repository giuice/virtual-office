import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { 
  Users2Icon, 
  HomeIcon, 
  SettingsIcon, 
  MessageSquareIcon, 
  CalendarIcon,
  VideoIcon,
  BrainCircuitIcon,
  BarChart3Icon,
  PresentationIcon,
  RocketIcon,
  UserPlusIcon,
  BuildingIcon,
  SparklesIcon,
  Clock
} from 'lucide-react';

// ============================================
// QUICK LINKS GRID - Investor-Ready Dashboard
// ============================================

interface QuickLink {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
}

interface ComingSoonFeature {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  epic: string;
  color: string;
}

interface InvestorResource {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: string;
  external?: boolean;
}

export function QuickLinksGrid({ isAdmin }: { isAdmin: boolean }) {
  // ============================================
  // WORKING FEATURES - These routes exist and work
  // ============================================
  const workingFeatures: QuickLink[] = [
    {
      title: 'Virtual Office',
      description: 'Enter the interactive floor plan with real-time presence',
      icon: HomeIcon,
      href: '/floor-plan',
      color: 'bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border-cyan-500/30',
    },
    {
      title: 'Team Members',
      description: 'View and manage your team roster',
      icon: Users2Icon,
      href: '/company',
      color: 'bg-gradient-to-br from-green-500/20 to-emerald-600/20 border-green-500/30',
    },
    {
      title: 'Settings',
      description: 'Update your profile and preferences',
      icon: SettingsIcon,
      href: '/settings',
      color: 'bg-gradient-to-br from-gray-500/20 to-slate-600/20 border-gray-500/30',
    },
  ];

  // ============================================
  // ADMIN FEATURES - Only shown to admins
  // ============================================
  const adminFeatures: QuickLink[] = isAdmin ? [
    {
      title: 'Invite Team',
      description: 'Send invitations to new team members',
      icon: UserPlusIcon,
      href: '/admin/invitations',
      color: 'bg-gradient-to-br from-violet-500/20 to-purple-600/20 border-violet-500/30',
    },
    {
      title: 'Company Settings',
      description: 'Manage company configuration',
      icon: BuildingIcon,
      href: '/company?tab=settings',
      color: 'bg-gradient-to-br from-orange-500/20 to-amber-600/20 border-orange-500/30',
    },
  ] : [];

  // ============================================
  // COMING SOON - Roadmap teasers for investors
  // ============================================
  const comingSoonFeatures: ComingSoonFeature[] = [
    {
      title: 'Real-Time Messaging',
      description: 'Slack-level messaging with threads, reactions, and offline sync',
      icon: MessageSquareIcon,
      epic: 'Epic 4',
      color: 'border-yellow-500/20',
    },
    {
      title: 'Video Conferencing',
      description: 'WebRTC video calls with screen sharing built-in',
      icon: VideoIcon,
      epic: 'Epic 8',
      color: 'border-pink-500/20',
    },
    {
      title: 'AI Meeting Notes',
      description: 'Automatic transcription and action item extraction',
      icon: BrainCircuitIcon,
      epic: 'Epic 5 & 7',
      color: 'border-purple-500/20',
    },
    {
      title: 'Calendar Integration',
      description: 'Schedule meetings directly in your virtual office',
      icon: CalendarIcon,
      epic: 'Epic 8',
      color: 'border-blue-500/20',
    },
    {
      title: 'Analytics Dashboard',
      description: 'Presence analytics and productivity insights',
      icon: BarChart3Icon,
      epic: 'Epic 9',
      color: 'border-emerald-500/20',
    },
  ];

  // ============================================
  // INVESTOR RESOURCES - Links to static showcase pages
  // ============================================
  const investorResources: InvestorResource[] = [
    {
      title: 'Investor Deck',
      description: 'Interactive 3D presentation showcasing our vision',
      icon: PresentationIcon,
      href: '/docs/investor-presentation-v2.html',
      color: 'bg-gradient-to-br from-fuchsia-500/20 to-pink-600/20 border-fuchsia-500/30',
      external: true,
    },
    {
      title: 'Product Vision',
      description: 'Command center overview and feature roadmap',
      icon: RocketIcon,
      href: '/docs/landing.html',
      color: 'bg-gradient-to-br from-cyan-500/20 to-teal-600/20 border-cyan-500/30',
      external: true,
    },
  ];

  return (
    <div className="space-y-8">
      {/* ============================================ */}
      {/* SECTION: Working Features */}
      {/* ============================================ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <SparklesIcon className="h-5 w-5 text-cyan-500" />
          <h3 className="text-lg font-semibold">Available Now</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...workingFeatures, ...adminFeatures].map((link) => (
            <Card key={link.href} className={`overflow-hidden border ${link.color} hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-background/50">
                    <link.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <CardTitle className="text-lg">{link.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <CardDescription>{link.description}</CardDescription>
              </CardContent>
              <CardFooter>
                <Button asChild variant="ghost" className="w-full hover:bg-cyan-500/10 hover:text-cyan-500">
                  <Link href={link.href}>
                    Open {link.title}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>

      {/* ============================================ */}
      {/* SECTION: Coming Soon Teasers */}
      {/* ============================================ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-muted-foreground">Coming Soon</h3>
          <Badge variant="outline" className="text-xs">Roadmap</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {comingSoonFeatures.map((feature) => (
            <Card key={feature.title} className={`overflow-hidden border ${feature.color} opacity-60 hover:opacity-80 transition-opacity cursor-default`}>
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <feature.icon className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {feature.epic}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-medium text-muted-foreground mt-2">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <CardDescription className="text-xs line-clamp-2">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ============================================ */}
      {/* SECTION: Investor Resources */}
      {/* ============================================ */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <PresentationIcon className="h-5 w-5 text-fuchsia-500" />
          <h3 className="text-lg font-semibold">Investor Resources</h3>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {investorResources.map((resource) => (
            <Card key={resource.href} className={`overflow-hidden border ${resource.color} hover:shadow-lg hover:shadow-fuchsia-500/10 transition-all duration-300`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-background/50">
                    <resource.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <CardTitle className="text-lg">{resource.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pb-2">
                <CardDescription>{resource.description}</CardDescription>
              </CardContent>
              <CardFooter>
                <Button asChild variant="ghost" className="w-full hover:bg-fuchsia-500/10 hover:text-fuchsia-500">
                  <a href={resource.href} target="_blank" rel="noopener noreferrer">
                    View {resource.title} →
                  </a>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
