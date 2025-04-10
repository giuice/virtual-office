// src/app/layout.tsx
import { AuthProvider } from '@/contexts/AuthContext';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { MessagingProvider } from '@/contexts/messaging/MessagingContext'; // Use the modular provider
import { ThemeProvider } from '@/providers/theme-provider';
import { QueryProvider } from '@/providers/query-provider';
import { Toaster } from 'sonner';
import { PresenceProvider } from '@/contexts/PresenceContext';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <CompanyProvider>
                <PresenceProvider>
                  <MessagingProvider> {/* Wrap with MessagingProvider */}
                    {children}
                    <Toaster richColors closeButton position="top-right" />
                  </MessagingProvider>
                </PresenceProvider>
              </CompanyProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
