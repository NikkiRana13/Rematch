/**
 * Adds the FICTIONAL demo learning plans + demo learners to the demo teacher account
 * (rivera.demo@rematch-demo.app) in a Supabase project, and assigns them to the
 * "Live Demo" room so real visitors who join it also see the roadmap.
 *
 *   npm run populate:plans            # fails if demo plans already exist
 *   npm run populate:plans -- --reset # removes previous demo plans/classes/learners first
 *
 * Resume codes for the fictional learners are written to demo-learner-codes.local.txt (gitignored).
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SupabaseDb } from "../src/lib/db/supabase";
import { buildDemoPlans, insertDemoPlans } from "../src/lib/services/demoPlans";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("Missing Supabase env");
const admin = createClient(url, key, { auth: { persistSession: false } });
const db = new SupabaseDb(url, key);

async function main() {
  const { data } = await admin.auth.admin.listUsers();
  const rivera = data.users.find((u) => u.email === "rivera.demo@rematch-demo.app");
  if (!rivera) throw new Error("Run npm run populate:demo first (demo teacher not found).");
  const plans = await db.select("learning_plans", { eq: { ownerId: rivera.id, isDemoData: true } });
  if (plans.length) {
    if (!process.argv.includes("--reset")) throw new Error("Demo plans already exist. Use --reset to replace them.");
    const comps = (await db.select("competitions", { eq: { ownerId: rivera.id, isDemoData: true } })).filter((c) => c.isPracticeSpace || c.title.startsWith("Room 5B Roadmap Class"));
    const parts = comps.length ? await db.select("participants", { in: { column: "competitionId", values: comps.map((c) => c.id) } }) : [];
    const learnerIds = [...new Set(parts.map((p) => p.learnerId).filter(Boolean))] as string[];
    for (const p of plans) await admin.from("learning_plans").delete().eq("id", p.id);
    if (comps.length) await admin.from("competitions").delete().in("id", comps.map((c) => c.id));
    if (learnerIds.length) await admin.from("learners").delete().in("id", learnerIds).eq("is_synthetic", true);
    console.log(`Removed ${plans.length} demo plans, ${comps.length} demo competitions, ${learnerIds.length} demo learners.`);
  }
  const all = await db.select("competitions", { eq: { ownerId: rivera.id } });
  const liveDemo = all.find((c) => c.title.startsWith("Live Demo"));
  const bundle = buildDemoPlans(rivera.id, new Set(all.map((c) => c.roomCode)), liveDemo ? [liveDemo.id] : []);
  await insertDemoPlans(db, bundle);
  fs.writeFileSync(
    "demo-learner-codes.local.txt",
    `Resume codes for FICTIONAL demo learners (enter at /roadmap → "Resume code").\nKeep private; regenerate with npm run populate:plans -- --reset.\n\n${bundle.resumeCodes.map((r) => `${r.nickname}: ${r.code}`).join("\n")}\n`,
  );
  console.log(`Created ${bundle.plans.length} plans, ${bundle.learners.length} demo learners, ${bundle.attempts.length} demo attempts.`);
  console.log(`Assigned to: ${bundle.competitions.filter((c) => !c.isPracticeSpace).map((c) => c.title).join(", ")}${liveDemo ? `, ${liveDemo.title}` : ""}`);
  console.log("Resume codes written to demo-learner-codes.local.txt");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
