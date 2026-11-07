import type { Metadata } from "next";
import { Suspense } from "react";
import { Lexend, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { A11yProvider } from "@/components/a11y";
import { SiteHeader } from "@/components/SiteHeader";
import { ThemeShell } from "@/components/ThemeShell";

const lexend = Lexend({ variable: "--font-lexend", subsets: ["latin"] });
const pressStart = Press_Start_2P({ variable: "--font-press-start", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Rematch — learn, explain, come back stronger",
  description: "Classroom learning sprints for reading comprehension and math: attempt, explain, diagnose, practise, rematch.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lexend.variable} ${pressStart.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <A11yProvider>
          <Suspense fallback={<div className="flex-1" />}>
            <ThemeShell>
              <Suspense fallback={<div className="h-14 border-b border-line" />}>
                <SiteHeader />
              </Suspense>
              <main id="main" className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
                <Suspense fallback={<p role="status" className="text-center text-navy-soft py-10">Loading…</p>}>{children}</Suspense>
              </main>
              <footer className="text-sm text-navy-soft text-center py-6 px-4 border-t border-line">
                Rematch MVP · Grade 5 demonstration content · Curriculum alignment not verified · Fictional demo data is labelled
              </footer>
            </ThemeShell>
          </Suspense>
        </A11yProvider>
      </body>
    </html>
  );
}
