const db = require('../db');
const { createNotification } = require('../utils/notify');

// GET /api/connections — get all my connections + pending requests
const getConnections = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         c.id, c.status, c.created_at,
         c.requester_id, c.receiver_id,
         -- requester details
         ru.name AS requester_name, ru.title AS requester_title,
         ru.photo_url AS requester_photo, ru.initials AS requester_initials,
         ru.email AS requester_email, ru.phone AS requester_phone,
         -- receiver details
         rv.name AS receiver_name, rv.title AS receiver_title,
         rv.photo_url AS receiver_photo, rv.initials AS receiver_initials,
         rv.email AS receiver_email, rv.phone AS receiver_phone
       FROM connections c
       JOIN users ru ON ru.id = c.requester_id
       JOIN users rv ON rv.id = c.receiver_id
       WHERE c.requester_id = $1 OR c.receiver_id = $1`,
      [req.user.id]
    );
    return res.json({ connections: result.rows });
  } catch (err) {
    console.error('Get connections error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/connections/request/:userId — send connection request
const sendRequest = async (req, res) => {
  const { userId } = req.params;

  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot connect with yourself' });
  }

  try {
    // Check receiver exists and is approved CEO
    const userResult = await db.query(
      `SELECT id, name FROM users WHERE id = $1 AND role = 'CEO' AND profile_status = 'APPROVED'`,
      [userId]
    );
    if (!userResult.rows[0]) {
      return res.status(404).json({ error: 'Member not found' });
    }
    const receiver = userResult.rows[0];

    // Check if connection already exists in either direction
    const existing = await db.query(
      `SELECT id, status FROM connections 
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
      [req.user.id, userId]
    );
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'Connection already exists' });
    }

    await db.query(
      `INSERT INTO connections (requester_id, receiver_id, status)
       VALUES ($1, $2, 'PENDING')`,
      [req.user.id, userId]
    );

    // Notify the receiver
    await createNotification({
      userId: receiver.id,
      title: 'New Connection Request',
      message: `${req.user.name} has sent you a connection request.`,
      type: 'general'
    });

    return res.json({ message: 'Connection request sent' });
  } catch (err) {
    console.error('Send request error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// PATCH /api/connections/accept/:userId — accept a request from userId
const acceptRequest = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await db.query(
      `UPDATE connections SET status = 'ACCEPTED'
       WHERE requester_id = $1 AND receiver_id = $2 AND status = 'PENDING'
       RETURNING *`,
      [userId, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Connection request not found' });
    }

    // Notify the requester
    await createNotification({
      userId,
      title: 'Connection Accepted',
      message: `${req.user.name} accepted your connection request.`,
      type: 'general'
    });

    return res.json({ message: 'Connection accepted' });
  } catch (err) {
    console.error('Accept request error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// PATCH /api/connections/reject/:userId — reject a request from userId
const rejectRequest = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await db.query(
      `DELETE FROM connections
       WHERE requester_id = $1 AND receiver_id = $2 AND status = 'PENDING'
       RETURNING id`,
      [userId, req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Connection request not found' });
    }

    return res.json({ message: 'Connection rejected' });
  } catch (err) {
    console.error('Reject request error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getConnections, sendRequest, acceptRequest, rejectRequest };