const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.dev' });

console.log('🔌 Migrate connecting to:', process.env.DB_HOST, '/', process.env.DB_NAME);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  ssl: false
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  console.log('🔄 Running migrations...');

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
      await pool.query(sql);
      console.log(`✅ ${file}`);
    } catch (err) {
      // If table already exists skip it
      if (err.code === '42P07' || err.code === '42710') {
        console.log(`⏭ ${file} already exists, skipping`);
      } else {
        console.error(`❌ ${file} failed:`, err.message);
        process.exit(1);
      }
    }
  }

  console.log('✅ All migrations complete');
  await pool.end();
}

runMigrations();