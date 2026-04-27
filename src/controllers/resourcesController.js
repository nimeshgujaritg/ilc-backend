const db = require('../db');
const { log } = require('../utils/audit');

// ── GET ALL RESOURCES
const getAllResources = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM resources ORDER BY created_at DESC'
    );
    return res.json({ resources: result.rows });
  } catch (err) {
    console.error('Get resources error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CREATE RESOURCE (admin only)
const createResource = async (req, res) => {
  const { title, description, link, category } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO resources (title, description, link, category, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, description || null, link || null, category || 'Article', req.user.id]
    );
    await log({ userId: req.user.id, action: 'RESOURCE_CREATED', details: { title }, req });
    return res.status(201).json({ resource: result.rows[0] });
  } catch (err) {
    console.error('Create resource error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── DELETE RESOURCE (admin only)
const deleteResource = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM resources WHERE id=$1', [id]);
    await log({ userId: req.user.id, action: 'RESOURCE_DELETED', details: { id }, req });
    return res.json({ message: 'Resource deleted' });
  } catch (err) {
    console.error('Delete resource error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── GET ALL GLIMPSES
const getAllGlimpses = async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM glimpses ORDER BY created_at DESC'
    );
    return res.json({ glimpses: result.rows });
  } catch (err) {
    console.error('Get glimpses error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CREATE GLIMPSE (admin only)
const createGlimpse = async (req, res) => {
  const { photo_url, caption, event_name } = req.body;
  try {
    if (!photo_url) return res.status(400).json({ error: 'Photo URL is required' });
    const result = await db.query(
      `INSERT INTO glimpses (photo_url, caption, event_name, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [photo_url, caption || null, event_name || null, req.user.id]
    );
    await log({ userId: req.user.id, action: 'GLIMPSE_CREATED', details: { event_name }, req });
    return res.status(201).json({ glimpse: result.rows[0] });
  } catch (err) {
    console.error('Create glimpse error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── DELETE GLIMPSE (admin only)
const deleteGlimpse = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM glimpses WHERE id=$1', [id]);
    await log({ userId: req.user.id, action: 'GLIMPSE_DELETED', details: { id }, req });
    return res.json({ message: 'Glimpse deleted' });
  } catch (err) {
    console.error('Delete glimpse error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getAllResources, createResource, deleteResource,
  getAllGlimpses, createGlimpse, deleteGlimpse
};