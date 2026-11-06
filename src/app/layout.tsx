import type { Metadata } from "next";
import "./globals.css";
import { JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "TCT Asset Tracker — 5-Stage IT Asset Lifecycle",
  description:
    "TCT Lightweight IT Asset Lifecycle Tracker for 50–300 person companies. Track assets through Procurement, Deployment, Maintenance, Optimization, and Decommission and expose money leaks without enterprise ITAM bloat.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-mono", jetbrainsMono.variable)}>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
