const db = require('../db');

const log = async ({ userId, action, details, req }) => {
  try {
    await db.query(
      `INSERT INTO audit_logs 
        (user_id, action, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId || null,
        action,
        details ? JSON.stringify(details) : null,
        req?.ip || null,
        req?.headers?.['user-agent'] || null
      ]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

module.exports = { log };