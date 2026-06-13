import type { Metadata } from 'next';
import JoinPage from './join-client';

export const metadata: Metadata = {
  title: 'Join Company | Virtual Office',
  description: 'Accept a Virtual Office company invitation.',
};

export default function Page() {
  return <JoinPage />;
}
