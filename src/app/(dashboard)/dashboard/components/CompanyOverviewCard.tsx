import { Company, User } from '@/types/database';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function CompanyOverviewCard({
  company,
  companyUsers,
  currentUserProfile
}: {
  company?: Company;
  companyUsers: User[];
  currentUserProfile?: User;
}) {
  const onlineCount = companyUsers.filter(user => user.status === 'online').length;

  return (
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
          <span className="text-3xl font-bold mt-1">{onlineCount}</span>
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
        {company?.adminIds?.includes(currentUserProfile?.id || '') && (
          <Button asChild>
            <Link href="/company?tab=settings">Manage Company</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
