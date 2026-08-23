import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ojas — AI-native post-discharge care for hospitals",
  description:
    "Ojas is an agentic, multi-tenant SaaS platform hospitals use to monitor patients after discharge — scheduled WhatsApp check-ins, AI-triaged risk, and a prioritized coordinator worklist so nothing falls through the cracks.",
  keywords: [
    "Ojas", "post-discharge care", "hospital SaaS", "patient monitoring",
    "AI triage", "WhatsApp check-ins", "care coordination", "NABH compliance",
  ],
  authors: [{ name: "Ojas" }],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "Ojas — AI-native post-discharge care",
    description: "Scheduled check-ins, AI-triaged risk, prioritized coordinator worklist.",
    siteName: "Ojas",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md">
            Skip to content
          </a>
          {children}
          <SonnerToaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
