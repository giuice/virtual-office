import type { Metadata } from 'next';
import MessagingTestPage from './messaging-test-client';

export const metadata: Metadata = {
  title: 'Messaging Test | Virtual Office',
  description: 'Debug messaging integration tests.',
};

export default function Page() {
  return <MessagingTestPage />;
}
