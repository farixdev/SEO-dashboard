import type { Metadata, Viewport } from "next";

import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider, themeScript } from "@/components/ui/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SEO Dashboard",
    template: "%s · SEO Dashboard",
  },
  description:
    "Multi-project SEO management — rank tracking, link building, on-page audits and a client portal.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1a19" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Paint the right theme before first frame — avoids a white flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
