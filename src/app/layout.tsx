// src/app/layout.tsx
import { AuthProvider } from '@/contexts/AuthContext';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { MessagingProvider } from '@/contexts/messaging/MessagingContext'; // Use the modular provider
import { ThemeProvider } from '@/providers/theme-provider';
import { VOThemeProvider } from '@/contexts/ThemeContext';
import { QueryProvider } from '@/providers/query-provider';
import { Toaster } from 'sonner';
import { PresenceRouteBoundary } from '@/components/presence/PresenceRouteBoundary';
import { CallingProvider } from '@/contexts/CallingContext';
import { CallNotifications } from '@/components/messaging/CallNotification';
import { MessagingDrawer } from '@/components/messaging/MessagingDrawer';
import { MessagingTrigger } from '@/components/messaging/MessagingTrigger';
import { AmbientMesh } from '@/components/ui/AmbientMesh';
import { DM_Sans, Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${dmSans.variable}`} suppressHydrationWarning>
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
                    <PresenceRouteBoundary>
                      <CallingProvider>
                      {children}
                      <CallNotifications />
                      <MessagingTrigger />
                      <MessagingDrawer />
                      <Toaster
                        richColors
                        closeButton
                        position="bottom-right"
                        offset={{ bottom: 88, right: 24 }}
                        mobileOffset={{ bottom: 88, right: 24 }}
                      />
                      </CallingProvider>
                    </PresenceRouteBoundary>
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
