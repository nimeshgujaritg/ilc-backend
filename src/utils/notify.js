const db = require('../db');

const createNotification = async ({ userId, title, message, type = 'general' }) => {
  try {
    await db.query(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES ($1, $2, $3, $4)`,
      [userId, title, message, type]
    );
  } catch (err) {
    console.error('Create notification error:', err);
  }
};

module.exports = { createNotification };