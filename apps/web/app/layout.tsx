import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@ever-hust/utils";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { ConnectionStatus } from "@/components/shared/connection-status";
import { Toaster } from "@ever-hust/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} - AI-Powered Job Search Assistant`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "Chat with AI to find, apply, and land your dream job. Search 50+ job boards, generate cover letters, and get interview prep - all through natural conversation.",
  keywords: [
    "AI job search",
    "job search assistant",
    "cover letter generator",
    "interview prep AI",
    "remote jobs",
    "job board aggregator",
    "career AI assistant",
    "job application tracker",
    "AI resume help",
    "find remote work",
  ],
  authors: [{ name: "Ever Gauzy AI" }],
  creator: "Ever Gauzy AI",
  publisher: "Ever Gauzy AI",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  ),
  manifest: "/manifest.json",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  openGraph: {
    title: `${APP_NAME} - AI-Powered Job Search Assistant`,
    description:
      "Chat with AI to find, apply, and land your dream job. Search 50+ job boards at once.",
    url: "/",
    siteName: APP_NAME,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: `${APP_NAME} - AI-Powered Job Search Assistant`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} - AI-Powered Job Search Assistant`,
    description:
      "Chat with AI to find, apply, and land your dream job. Search 50+ job boards at once.",
    images: ["/api/og"],
  },
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        {/* Skip to main content link for keyboard/screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:outline-none"
        >
          Skip to main content
        </a>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
            <ConnectionStatus />
            <ServiceWorkerRegister />
            <Analytics />
            <SpeedInsights />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
