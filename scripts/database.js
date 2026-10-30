require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { getPool } = require('../server/database');
const dir = path.join(__dirname, '../database/postgres');
async function migrate(client) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(873219)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of fs.readdirSync(dir).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (prior.rows.length) {
        if (prior.rows[0].checksum !== checksum) throw Error('Applied migration changed: ' + name);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
      console.log('Applied ' + name);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
}
async function seed(client) {
  await client.query(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8'));
  console.log('Imported source example data (630 bookings).');
}
async function main() {
  const command = process.argv[2];
  if (!['migrate','seed'].includes(command)) throw Error('Use migrate or seed');
  const pool = getPool(), client = await pool.connect();
  try { await (command === 'migrate' ? migrate : seed)(client); }
  finally { client.release(); await pool.end(); }
}
if (require.main === module) main().catch(e => { console.error('Database setup failed:', e.code || '', e.code === 'P0001' ? e.message : 'Check database connection, TLS and migration state.'); process.exitCode = 1; });
module.exports = { migrate, seed };
