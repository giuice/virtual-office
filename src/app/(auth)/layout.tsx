import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication - Virtual Office',
  description: 'Authentication pages for Virtual Office',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      {children}
    </div>
  );
}