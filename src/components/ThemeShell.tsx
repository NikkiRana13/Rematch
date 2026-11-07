"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Applies the student arcade theme to every page except the teacher (/host) area,
 * and the pixel-world backdrop to sprint (/play) screens.
 */
export function ThemeShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const isStudent = !path.startsWith("/host");
  const isSprint = path.startsWith("/play/");
  return <div className={`flex-1 flex flex-col ${isStudent ? "theme-student" : ""} ${isSprint ? "sprint-world" : ""}`}>{children}</div>;
}
