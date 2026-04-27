const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { log } = require('../utils/audit');
const { createNotification } = require('../utils/notify');
const {
  sendWelcomeEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendSpocChangeEmail,
  sendAdminNotification
} = require('../services/emailService');

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const generateTempPassword = () => {
  const rand = crypto.randomBytes(8).toString('hex').slice(0, 6);
  return `ILC@${rand.charAt(0).toUpperCase()}${rand.slice(1)}`;
};

const getInitials = (name) => {
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};


// ─────────────────────────────────────────────
// GET ALL USERS
// ─────────────────────────────────────────────
const getAllUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, title, initials, role, photo_url,
              is_first_login, profile_status, gf_entry_id, spoc_id, created_at
       FROM users ORDER BY created_at DESC`
    );
    return res.json({ users: result.rows });
  } catch (err) {
    console.error('Get all users error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// CREATE SINGLE USER
// ─────────────────────────────────────────────
const createUser = async (req, res) => {
  const { email, name, title, role, photo_url, phone, spoc_id } = req.body;
  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const initials = getInitials(name);

    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, title, initials, role, photo_url, phone, spoc_id, is_first_login, profile_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'PENDING')
       RETURNING id, email, name, title, initials, role, photo_url, phone, spoc_id, is_first_login, profile_status, created_at`,
      [email.toLowerCase().trim(), passwordHash, name.trim(), title.trim(), initials, role, photo_url || null, phone || null, spoc_id || null]
    );

    const newUser = result.rows[0];

    sendWelcomeEmail(newUser, tempPassword).catch(err => console.error('Welcome email failed:', err));
sendAdminNotification({
  subject: 'New Member Created',
  message: `${name} (${email}) has been added to the ILC Portal with role: ${role}.`
}).catch(err => console.error('Admin notif failed:', err));

    await log({ userId: req.user.id, action: 'USER_CREATED', details: { createdEmail: email, role }, req });

    return res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (err) {
    console.error('Create user error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// APPROVE USER
// ─────────────────────────────────────────────
const approveUser = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.profile_status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Only submitted profiles can be approved' });
    }

    await db.query(`UPDATE users SET profile_status = 'APPROVED' WHERE id = $1`, [id]);
    await sendApprovalEmail(user);
    await createNotification({
  userId: user.id,
  title: 'Profile Approved',
  message: 'Your membership profile has been approved. Welcome to the Council!',
  type: 'approval'
});
    await sendAdminNotification({
      subject: 'Member Profile Approved',
      message: `${user.name} (${user.email}) has been approved by ${req.user.email}.`
    });
    await log({ userId: req.user.id, action: 'USER_APPROVED', details: { approvedUserId: id, approvedEmail: user.email }, req });

    return res.json({ message: 'User approved successfully' });
  } catch (err) {
    console.error('Approve user error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// REJECT USER
// ─────────────────────────────────────────────
const rejectUser = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.profile_status !== 'SUBMITTED') {
      return res.status(400).json({ error: 'Only submitted profiles can be rejected' });
    }

    await db.query(`UPDATE users SET profile_status = 'PENDING' WHERE id = $1`, [id]);
    await sendRejectionEmail(user);
    await sendAdminNotification({
      subject: 'Member Profile Rejected',
      message: `${user.name} (${user.email}) profile was rejected by ${req.user.email}.`
    });
    await log({ userId: req.user.id, action: 'USER_REJECTED', details: { rejectedUserId: id, rejectedEmail: user.email }, req });

    return res.json({ message: 'User rejected — sent back to pending' });
  } catch (err) {
    console.error('Reject user error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// BULK CREATE USERS
// ─────────────────────────────────────────────
const bulkCreateUsers = async (req, res) => {
  const { users } = req.body;
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const results = [];
    const skipped = [];
    const createdUsersWithPasswords = [];

    for (const u of users) {
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [u.email.toLowerCase().trim()]);
      if (existing.rows.length > 0) { skipped.push(u.email); continue; }

      const tempPassword = generateTempPassword();
      const passwordHash = await bcrypt.hash(tempPassword, 10);
      const initials = getInitials(u.name);

      const result = await client.query(
  `INSERT INTO users (email, password_hash, name, title, initials, role, photo_url, phone, spoc_id, is_first_login, profile_status)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 'PENDING')
   RETURNING id, email, name, title, initials, role, photo_url, phone, spoc_id, created_at`,
  [u.email.toLowerCase().trim(), passwordHash, u.name.trim(), u.title.trim(), initials, u.role || 'CEO', u.photo_url || null, u.phone || null, u.spoc_id || null]
);

      const newUser = result.rows[0];
      results.push(newUser);
      createdUsersWithPasswords.push({ user: newUser, tempPassword });
    }

    await client.query('COMMIT');

    for (const { user, tempPassword } of createdUsersWithPasswords) {
      await sendWelcomeEmail(user, tempPassword);
    }

    if (results.length > 0) {
      await sendAdminNotification({
        subject: `Bulk Upload — ${results.length} Members Created`,
        message: `${results.length} new members were added via bulk upload. ${skipped.length > 0 ? `${skipped.length} skipped: ${skipped.join(', ')}` : 'No duplicates.'}`
      });
    }

    await log({
      userId: req.user.id,
      action: 'BULK_USERS_CREATED',
      details: { created: results.length, skipped: skipped.length, skippedEmails: skipped },
      req
    });

    return res.status(201).json({
      message: `${results.length} users created, ${skipped.length} skipped (already exist)`,
      created: results.length,
      skipped,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Bulk create error:', err);
    return res.status(500).json({ error: 'Bulk upload failed — all changes rolled back' });
  } finally {
    client.release();
  }
};


// ─────────────────────────────────────────────
// ASSIGN SPOC TO USER
// ─────────────────────────────────────────────
const assignSpoc = async (req, res) => {
  const { id } = req.params;
  const { spocId } = req.body; // can be null to unassign

  try {
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    await db.query('UPDATE users SET spoc_id = $1 WHERE id = $2', [spocId || null, id]);

    // Get SPOC details for email
    let spoc = null;
    if (spocId) {
      const spocResult = await db.query('SELECT * FROM spocs WHERE id = $1', [spocId]);
      spoc = spocResult.rows[0];
    }

    // Email the CEO their new SPOC details
    await sendSpocChangeEmail(user, spoc);
await createNotification({
  userId: user.id,
  title: 'SPOC Updated',
  message: spoc
    ? `Your dedicated SPOC has been updated to ${spoc.name}.`
    : 'Your SPOC assignment has been removed.',
  type: 'spoc'
});
    // Notify admin
    await sendAdminNotification({
      subject: 'SPOC Assignment Updated',
      message: `${user.name} (${user.email}) has been ${spoc ? `assigned SPOC: ${spoc.name}` : 'unassigned from their SPOC'} by ${req.user.email}.`
    });

    await log({
      userId: req.user.id,
      action: 'SPOC_ASSIGNED',
      details: { userId: id, userEmail: user.email, spocId: spocId || null },
      req
    });

    return res.json({ message: 'SPOC assigned successfully' });
  } catch (err) {
    console.error('Assign SPOC error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// GET ALL SPOCS
// ─────────────────────────────────────────────
const getAllSpocs = async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM spocs ORDER BY name ASC');
    return res.json({ spocs: result.rows });
  } catch (err) {
    console.error('Get spocs error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// CREATE SPOC
// ─────────────────────────────────────────────
const createSpoc = async (req, res) => {
  const { name, title, email, phone, photo_url } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO spocs (name, title, email, phone, photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), title?.trim() || null, email?.trim() || null, phone?.trim() || null, photo_url?.trim() || null]
    );
    await log({ userId: req.user.id, action: 'SPOC_CREATED', details: { name }, req });
    return res.status(201).json({ message: 'SPOC created', spoc: result.rows[0] });
  } catch (err) {
    console.error('Create SPOC error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// DELETE SPOC
// ─────────────────────────────────────────────
const deleteSpoc = async (req, res) => {
  const { id } = req.params;
  try {
    // Unassign from all users first
    await db.query('UPDATE users SET spoc_id = NULL WHERE spoc_id = $1', [id]);
    await db.query('DELETE FROM spocs WHERE id = $1', [id]);
    await log({ userId: req.user.id, action: 'SPOC_DELETED', details: { spocId: id }, req });
    return res.json({ message: 'SPOC deleted' });
  } catch (err) {
    console.error('Delete SPOC error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// GET AUDIT LOGS
// ─────────────────────────────────────────────
const getAuditLogs = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const actionFilter = req.query.action || null;

  try {
    let query = `
      SELECT al.id, al.action, al.details, al.ip_address, al.created_at,
             u.name AS user_name, u.email AS user_email, u.role AS user_role
      FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
    `;
    const params = [];
    if (actionFilter) { params.push(actionFilter); query += ` WHERE al.action = $${params.length}`; }
    query += ` ORDER BY al.created_at DESC`;

    const countQuery = `SELECT COUNT(*) FROM audit_logs al ${actionFilter ? `WHERE al.action = $1` : ''}`;
    const countResult = await db.query(countQuery, actionFilter ? [actionFilter] : []);
    const total = parseInt(countResult.rows[0].count);

    params.push(limit); query += ` LIMIT $${params.length}`;
    params.push(offset); query += ` OFFSET $${params.length}`;

    const result = await db.query(query, params);

    return res.json({
      logs: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Get audit logs error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// DEV ONLY — remove after Phase 6
// ─────────────────────────────────────────────
const markSubmitted = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`UPDATE users SET profile_status = 'SUBMITTED' WHERE id = $1`, [id]);
    await log({ userId: req.user.id, action: 'DEV_MARK_SUBMITTED', details: { userId: id }, req });
    return res.json({ message: 'Marked as submitted' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

// ─────────────────────────────────────────────
// GET MEMBERS (CEO list for members page)
// ─────────────────────────────────────────────
const getMembers = async (req, res) => {
  try {
    const result = await db.query(
  `SELECT id, name, title, initials, photo_url, linkedin_url, created_at
   FROM users 
   WHERE role = 'CEO' AND profile_status = 'APPROVED'
   ORDER BY name ASC`
);
    return res.json({ members: result.rows });
  } catch (err) {
    console.error('Get members error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ─────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────
const getNotifications = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [req.user.id]
    );
    const unread = result.rows.filter(n => !n.is_read).length;
    return res.json({ notifications: result.rows, unread });
  } catch (err) {
    console.error('Get notifications error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

const markNotificationRead = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    return res.json({ message: 'Marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    await db.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1',
      [req.user.id]
    );
    return res.json({ message: 'All marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllUsers, createUser, approveUser, rejectUser,
  bulkCreateUsers, assignSpoc,
  getAllSpocs, createSpoc, deleteSpoc,
  getAuditLogs, markSubmitted, getMembers,
  getNotifications, markNotificationRead, markAllNotificationsRead
};