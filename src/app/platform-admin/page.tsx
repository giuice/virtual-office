import type { Metadata } from 'next';
import PlatformAdminPage from './platform-admin-client';

export const metadata: Metadata = {
  title: 'Platform Admin | Virtual Office',
  description: 'Manage Virtual Office platform companies.',
};

export default function Page() {
  return <PlatformAdminPage />;
}
