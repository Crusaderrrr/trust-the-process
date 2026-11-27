// Owner tools, run inside the container: `docker compose exec app node dist-server/cli.js invite [count]`
import { formatInvite, newInviteCode } from './auth.js';
import { importCatalog } from './catalog.js';
import { connect, migrate } from './db.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const [command, arg] = process.argv.slice(2);

const sql = connect(databaseUrl);
try {
  await migrate(sql);
  if (command === 'invite') {
    const count = Math.min(Math.max(Number(arg ?? 1) || 1, 1), 50);
    for (let i = 0; i < count; i++) {
      const code = newInviteCode();
      await sql`INSERT INTO invite (code) VALUES (${code})`;
      console.log(formatInvite(code));
    }
  } else if (command === 'users') {
    const users = await sql<{ username: string; created_at: Date }[]>`SELECT username, created_at FROM app_user ORDER BY id`;
    for (const u of users) console.log(`${u.username}\t${u.created_at.toISOString()}`);
  } else if (command === 'import-repdb' && arg) {
    const done = await importCatalog(sql, arg);
    console.log(`imported ${done.exercises} exercises and ${done.images} images; libraries synced`);
  } else {
    console.error('usage: cli.js invite [count] | users | import-repdb <dataset folder>');
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
