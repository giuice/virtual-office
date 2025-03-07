// src/app/layout.tsx
import { AuthProvider } from '@/contexts/AuthContext';
import { CompanyProvider } from '@/contexts/CompanyContext';
import { ThemeProvider } from '@/providers/theme-provider';
import { Toaster } from 'sonner';
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
          <AuthProvider>
            <CompanyProvider>
              {children}
              <Toaster richColors closeButton position="top-right" />
            </CompanyProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}