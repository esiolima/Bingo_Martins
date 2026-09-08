const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido. Configure a variável de ambiente antes de iniciar o servidor.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'init.sql');

async function boot() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schema);
}

module.exports = { pool, boot };
