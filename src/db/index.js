const { Pool } = require('pg');
require('dotenv').config({ path: '.env.dev' });

console.log('🔌 Connecting to:', process.env.DB_HOST, '/', process.env.DB_NAME);

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  ssl:      false,

  max:                20,
  min:                2,
  idleTimeoutMillis:  30000,
  connectionTimeoutMillis: 5000,
  statement_timeout:  10000,   // ← ADD: kill any query hanging over 10s

  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err.message);
  // Don't exit — let pool recover automatically
});

// ── Query with auto-retry
const query = async (text, params, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await pool.query(text, params);
    } catch (err) {
      const isConnectionError =
        err.code === 'ECONNRESET' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'EPIPE' ||
        err.message?.includes('terminating connection') ||
        err.message?.includes('Connection terminated');

      if (isConnectionError && i < retries - 1) {
        console.warn(`⚠️ DB connection lost — retrying (${i + 1}/${retries - 1})...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
};

// ── Health check — keeps connections alive
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.warn('⚠️ DB health check failed:', err.message);
  }
}, 5 * 60 * 1000);


module.exports = { query, pool };