import { handle } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getLearner } from "@/lib/auth/participant";
import { getLearnerHome } from "@/lib/services/play";

export async function GET() {
  return handle(async () => ({ home: await getLearnerHome(getDb(), await getLearner()) }));
}
