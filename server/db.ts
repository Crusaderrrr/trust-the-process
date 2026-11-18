import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

export function connect(url: string, options: postgres.Options<Record<string, never>> = {}): Sql {
  // Neon suspends idle compute after 5 min and kills open sockets; recycle ours sooner so a wake-up never hits a dead one.
  return postgres(url, { onnotice: () => {}, idle_timeout: 20, max_lifetime: 60 * 30, ...options });
}

// Resolves to <repo>/server/migrations from both server/ (tsx, tests) and dist-server/ (compiled).
const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../server/migrations');

// Arbitrary constant; serialises concurrent starts (e.g. two containers) on the same database.
const MIGRATION_LOCK = 727274;

/**
 * Applies every unapplied `NNN_name.sql` in filename order, all in one transaction.
 * Applied files are never edited (same rule as the v1 SQLite migrations). Returns the names applied.
 */
export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const done = new Set((await tx<{ name: string }[]>`SELECT name FROM schema_migrations`).map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      await tx.unsafe(await readFile(path.join(dir, file), 'utf8'));
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      applied.push(file);
    }
  });
  return applied;
}
