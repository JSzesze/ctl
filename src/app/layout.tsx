import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { ControlProvider } from "@/components/control-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { getThemeInitScript } from "@/config/theme-init-script";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: {
    default: "CTL",
    template: "%s · CTL",
  },
  description:
    "Personal command station on OpenClaw—today, projects, meetings, and radar without replacing your systems of record.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: getThemeInitScript() }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ControlProvider>
            <AppShell>{children}</AppShell>
          </ControlProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
