import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { getOverview } from "@/lib/services/host";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const s = sp.get("subject");
  const subject = s === "reading" || s === "math" ? s : "all";
  const ids = sp.get("ids");
  return handle(async () => getOverview(getDb(), await getHost(), { subject, competitionIds: ids ? ids.split(",").filter(Boolean).slice(0, 100) : null }));
}
