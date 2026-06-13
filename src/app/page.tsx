// src/app/page.tsx
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Virtual Office',
  description: 'Virtual Office workspace entry point.',
};

export default function Home() {
  redirect('/login');
}
