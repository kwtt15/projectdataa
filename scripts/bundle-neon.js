const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const dir = path.join(__dirname, '../database/postgres');
const chunks = [
  '-- Run ONCE in the Neon SQL Editor on a NEW empty database. Includes source example data.',
  '-- Existing data is never deleted. To use an empty database, use npm run db:migrate instead.',
  'BEGIN;',
  'SELECT pg_advisory_xact_lock(873219);',
  'CREATE TABLE schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());'
];
for (const name of fs.readdirSync(dir).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
  const sql = fs.readFileSync(path.join(dir, name), 'utf8');
  const hash = createHash('sha256').update(sql).digest('hex');
  chunks.push(sql, `INSERT INTO schema_migrations(name,checksum) VALUES('${name}','${hash}');`);
}
chunks.push(fs.readFileSync(path.join(dir, 'seed.sql'), 'utf8'), 'COMMIT;');
const dest = path.join(dir, 'setup-neon.sql');
fs.writeFileSync(dest, chunks.join('\n') + '\n');
console.log('Generated database/postgres/setup-neon.sql');
