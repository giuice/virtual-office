import type { Metadata } from 'next';
import MessagingComparisonPage from './messaging-comparison-client';

export const metadata: Metadata = {
  title: 'Messaging Comparison | Virtual Office',
  description: 'Debug messaging component comparison.',
};

export default function Page() {
  return <MessagingComparisonPage />;
}
