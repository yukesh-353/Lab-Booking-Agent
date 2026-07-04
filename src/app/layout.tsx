import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
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
  title: "Labby · Campus Lab Booking Agent",
  description: "AI-powered booking agent for campus computer labs. Chat naturally to book a lab, check availability, manage your reservations, and view campus-wide stats.",
  keywords: ["lab booking", "AI agent", "campus", "computer lab", "Next.js", "booking system"],
  authors: [{ name: "Labby" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Labby · Campus Lab Booking Agent",
    description: "AI-powered booking agent for campus computer labs",
    siteName: "Labby",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Labby · Campus Lab Booking Agent",
    description: "AI-powered booking agent for campus computer labs",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
