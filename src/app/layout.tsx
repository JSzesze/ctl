import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { ControlProvider } from "@/components/control-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { getThemeInitScript } from "@/config/theme-init-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenClaw control",
  description: "Minimal OpenClaw gateway control UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: getThemeInitScript() }}
        />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <ControlProvider>
            <AppNav />
            <main className="mx-auto max-w-[52rem] px-5 pb-8 pt-4">{children}</main>
          </ControlProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
