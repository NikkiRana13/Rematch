import "server-only";
import fs from "node:fs";
import path from "node:path";
import { appMode, supabaseConfig } from "../env";
import { emptyStore, MemoryDb, type Store } from "./memory";
import { SupabaseDb } from "./supabase";
import type { Db } from "./types";
import { DbUnavailableError } from "./types";
import { seedLocalStore } from "../services/localSeed";
import { ensureLocalTestCompetition } from "../services/localTestCompetition";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "rematch-local.json");

type G = typeof globalThis & { __rematchDb?: Db };

function loadLocal(): Db {
  let store: Store | null = null;
  try {
    if (fs.existsSync(DATA_FILE)) store = { ...emptyStore(), ...(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as Store) };
  } catch (e) {
    console.warn("[local-demo] Could not read local data file; reseeding.", e);
  }
  const persist = () => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(db.store));
    } catch (e) {
      console.warn("[local-demo] Could not persist local data.", e);
    }
  };
  const db = new MemoryDb(store ?? seedLocalStore(), persist);
  // Older local data files get the hardcoded 123456 competition too.
  const added = store ? ensureLocalTestCompetition(db.store) : false;
  if (!store || added) persist();
  return db;
}

export function getDb(): Db {
  const g = globalThis as G;
  if (g.__rematchDb) return g.__rematchDb;
  const mode = appMode();
  if (mode === "supabase") {
    const cfg = supabaseConfig()!;
    g.__rematchDb = new SupabaseDb(cfg.url, cfg.serviceRoleKey);
  } else if (mode === "local-demo") {
    g.__rematchDb = loadLocal();
  } else {
    throw new DbUnavailableError("Rematch is not configured. Set Supabase environment variables.");
  }
  return g.__rematchDb;
}

/** Local demo only: wipe and reseed. */
export function resetLocalDb(): void {
  if (appMode() !== "local-demo") throw new Error("Reset is only available in local demo mode.");
  const g = globalThis as G;
  try {
    fs.rmSync(DATA_FILE, { force: true });
  } catch {}
  g.__rematchDb = undefined;
  getDb();
}
