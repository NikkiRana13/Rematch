import type { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getHost } from "@/lib/auth/host";
import { getRecommendation } from "@/lib/services/host";

export async function GET(req: NextRequest) {
  const subject = req.nextUrl.searchParams.get("subject") === "reading" ? "reading" : "math";
  return handle(async () => getRecommendation(getDb(), await getHost(), subject));
}
