"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Student pages get the arcade theme (pixel type + palette); the teacher area and the
 * role-choice start page get the same palette with regular type. Sprint (/play) screens
 * also get the pixel-world backdrop.
 */
export function ThemeShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const area = siteArea(path);
  const isSprint = path.startsWith("/play/");
  return <div className={`flex-1 flex flex-col ${area === "student" ? "theme-student" : "theme-teacher"} ${isSprint ? "sprint-world" : ""}`}>{children}</div>;
}

export type SiteArea = "start" | "student" | "teacher";

const STUDENT_PREFIXES = ["/join", "/me", "/play", "/roadmap"];

export function siteArea(path: string): SiteArea {
  if (path === "/") return "start";
  if (STUDENT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return "student";
  return "teacher";
}
