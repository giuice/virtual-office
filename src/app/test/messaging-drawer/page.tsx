import { notFound } from 'next/navigation';
import { MessagingDrawerTestClient } from './MessagingDrawerTestClient';

export default function MessagingDrawerTestPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  return <MessagingDrawerTestClient />;
}
