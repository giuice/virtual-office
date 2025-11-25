// src/app/layout.tsx
import { AuthProvider } from '@/contexts/AuthContext';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { MessagingProvider } from '@/contexts/messaging/MessagingContext'; // Use the modular provider
import { ThemeProvider } from '@/providers/theme-provider';
import { VOThemeProvider } from '@/contexts/ThemeContext';
import { QueryProvider } from '@/providers/query-provider';
import { Toaster } from 'sonner';
import { PresenceProvider } from '@/contexts/PresenceContext';
import { CallingProvider } from '@/contexts/CallingContext';
import { CallNotifications } from '@/components/messaging/CallNotification';
import { MessagingDrawer } from '@/components/messaging/MessagingDrawer';
import { MessagingTrigger } from '@/components/messaging/MessagingTrigger';
import { AmbientMesh } from '@/components/ui/AmbientMesh';
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
          attribute="data-theme"
          defaultTheme="paper"
          themes={['neon', 'zen', 'obsidian', 'paper']}
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          <QueryProvider>
            <AuthProvider>
              <VOThemeProvider>
                <AmbientMesh />
                <CompanyProvider>
                  <MessagingProvider> {/* Move MessagingProvider above PresenceProvider */}
                    <PresenceProvider>
                      <CallingProvider>
                      {children}
                      <CallNotifications />
                      <MessagingTrigger />
                      <MessagingDrawer />
                      <Toaster richColors closeButton position="top-right" />
                      </CallingProvider>
                    </PresenceProvider>
                  </MessagingProvider>
                </CompanyProvider>
              </VOThemeProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
