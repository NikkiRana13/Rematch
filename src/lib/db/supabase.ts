import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Db, RowMap, SelectOptions, TableName } from "./types";
import { DbUnavailableError, UniqueViolationError } from "./types";

const toSnake = (k: string) => k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Only top-level keys are converted; JSON column contents keep their own keys. */
function rowToDb(row: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toSnake(k), v]));
}
function rowFromDb<T>(row: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [toCamel(k), v])) as T;
}

function raise(table: string, error: { code?: string; message: string }): never {
  if (error.code === "23505") throw new UniqueViolationError(table);
  console.error(`[supabase] ${table}:`, error.code, error.message);
  throw new DbUnavailableError();
}

/**
 * Server-only Supabase access with the service-role key. Every service function performs
 * ownership checks before calling this; RLS policies in the migration are defence in depth
 * for any direct client access.
 */
export class SupabaseDb implements Db {
  readonly mode = "supabase" as const;
  private client: SupabaseClient;
  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async select<T extends TableName>(table: T, opts: SelectOptions<RowMap[T]> = {}): Promise<RowMap[T][]> {
    let q = this.client.from(table).select("*");
    if (opts.eq) {
      for (const [k, v] of Object.entries(opts.eq)) q = v === null ? q.is(toSnake(k), null) : q.eq(toSnake(k), v);
    }
    if (opts.in) q = q.in(toSnake(opts.in.column), opts.in.values);
    if (opts.orderBy) q = q.order(toSnake(opts.orderBy.column), { ascending: opts.orderBy.ascending ?? true });
    if (opts.limit !== undefined) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) raise(table, error);
    return (data ?? []).map((r) => rowFromDb<RowMap[T]>(r));
  }

  async insert<T extends TableName>(table: T, row: RowMap[T]): Promise<RowMap[T]> {
    const { data, error } = await this.client.from(table).insert(rowToDb(row)).select("*").single();
    if (error) raise(table, error);
    return rowFromDb<RowMap[T]>(data);
  }

  async update<T extends TableName>(table: T, where: Partial<RowMap[T]>, patch: Partial<RowMap[T]>): Promise<RowMap[T][]> {
    let q = this.client.from(table).update(rowToDb(patch));
    for (const [k, v] of Object.entries(where)) q = v === null ? q.is(toSnake(k), null) : q.eq(toSnake(k), v);
    const { data, error } = await q.select("*");
    if (error) raise(table, error);
    return (data ?? []).map((r) => rowFromDb<RowMap[T]>(r));
  }
}
