import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { getBank } from "@/lib/services/host";

export async function GET(req: NextRequest) {
  const s = req.nextUrl.searchParams.get("subject");
  const subject = s === "reading" || s === "math" ? s : undefined;
  return handle(async () => getBank(getDb(), await getHost(), subject));
}
