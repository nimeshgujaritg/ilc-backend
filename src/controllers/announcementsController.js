const db = require('../db');
const { log } = require('../utils/audit');

const getAnnouncements = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*, u.name as created_by_name
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.is_active = true
       ORDER BY a.created_at DESC`
    );
    return res.json({ announcements: result.rows });
  } catch (err) {
    console.error('Get announcements error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

const createAnnouncement = async (req, res) => {
  const { title, content, type } = req.body;
  if (!title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: 'Title and content are required' });
  }
  try {
    const result = await db.query(
      `INSERT INTO announcements (title, content, type, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [title.trim(), content.trim(), type || 'General', req.user.id]
    );
    await log({
      userId: req.user.id,
      action: 'ANNOUNCEMENT_CREATED',
      details: { title },
      req
    });
    return res.status(201).json({ announcement: result.rows[0] });
  } catch (err) {
    console.error('Create announcement error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

const deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE announcements SET is_active = false WHERE id = $1', [id]);
    await log({
      userId: req.user.id,
      action: 'ANNOUNCEMENT_DELETED',
      details: { id },
      req
    });
    return res.json({ message: 'Announcement deleted' });
  } catch (err) {
    console.error('Delete announcement error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAnnouncements, createAnnouncement, deleteAnnouncement };