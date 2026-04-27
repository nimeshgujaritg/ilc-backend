const db = require('../db');
const { log } = require('../utils/audit');
const { sendAdminNotification, sendBookingConfirmationEmail } = require('../services/emailService');
const { createNotification } = require('../utils/notify');
// ── GET ALL EVENTS
const getAllEvents = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         e.*,
         COUNT(CASE WHEN b.status = 'CONFIRMED' THEN 1 END)::int AS booking_count,
         MAX(CASE WHEN b.user_id = $1 AND b.status = 'CONFIRMED' THEN 1 ELSE 0 END)::int AS is_booked,
         MAX(CASE WHEN b.user_id = $1 AND b.status = 'WAITLIST' THEN 1 ELSE 0 END)::int AS is_waitlisted
       FROM events e
       LEFT JOIN bookings b ON b.event_id = e.id
       GROUP BY e.id
       ORDER BY e.date ASC, e.time ASC`,
      [req.user.id]
    );
    return res.json({ events: result.rows });
  } catch (err) {
    console.error('Get all events error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── GET SINGLE EVENT
const getEventById = async (req, res) => {
  try {
    const { id } = req.params;

    const eventResult = await db.query(
      `SELECT 
         e.*,
         COUNT(CASE WHEN b.status = 'CONFIRMED' THEN 1 END)::int AS booking_count,
         MAX(CASE WHEN b.user_id = $2 AND b.status = 'CONFIRMED' THEN 1 ELSE 0 END)::int AS is_booked,
         MAX(CASE WHEN b.user_id = $2 AND b.status = 'WAITLIST' THEN 1 ELSE 0 END)::int AS is_waitlisted
       FROM events e
       LEFT JOIN bookings b ON b.event_id = e.id
       WHERE e.id = $1
       GROUP BY e.id`,
      [id, req.user.id]
    );

    if (!eventResult.rows[0]) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Only show CONFIRMED attendees — not waitlisted
    const attendeesResult = await db.query(
      `SELECT u.id, u.name, u.title, u.photo_url, u.initials
       FROM bookings b
       JOIN users u ON u.id = b.user_id
       WHERE b.event_id = $1 AND b.status = 'CONFIRMED'
       ORDER BY b.booked_at ASC`,
      [id]
    );

    return res.json({
      event: eventResult.rows[0],
      attendees: attendeesResult.rows
    });
  } catch (err) {
    console.error('Get event error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CREATE EVENT (admin only)
const createEvent = async (req, res) => {
  const { title, date, time, location, description, capacity, calendly_link, image_url } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO events (title, date, time, location, description, capacity, calendly_link, image_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [title, date, time || null, location || null, description || null,
       capacity || null, calendly_link || null, image_url || null, req.user.id]
    );
    await log({ userId: req.user.id, action: 'EVENT_CREATED', details: { title }, req });
    return res.status(201).json({ event: result.rows[0] });
  } catch (err) {
    console.error('Create event error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── UPDATE EVENT (admin only)
const updateEvent = async (req, res) => {
  const { id } = req.params;
  const { title, date, time, location, description, capacity, calendly_link, image_url } = req.body;
  try {
    const result = await db.query(
      `UPDATE events
       SET title=$1, date=$2, time=$3, location=$4, description=$5,
           capacity=$6, calendly_link=$7, image_url=$8, updated_at=NOW()
       WHERE id=$9
       RETURNING *`,
      [title, date, time || null, location || null, description || null,
       capacity || null, calendly_link || null, image_url || null, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Event not found' });
    await log({ userId: req.user.id, action: 'EVENT_UPDATED', details: { id, title }, req });
    return res.json({ event: result.rows[0] });
  } catch (err) {
    console.error('Update event error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── DELETE EVENT (admin only)
const deleteEvent = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('DELETE FROM events WHERE id=$1 RETURNING title', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Event not found' });
    await log({ userId: req.user.id, action: 'EVENT_DELETED', details: { id }, req });
    return res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── BOOK EVENT (CEO only)
const bookEvent = async (req, res) => {
  const { id } = req.params;
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Single query — get event + existing booking + confirmed count
    const result = await client.query(
      `SELECT 
         e.*,
         b.status AS existing_status,
         COUNT(CASE WHEN b2.status = 'CONFIRMED' THEN 1 END)::int AS confirmed_count
       FROM events e
       LEFT JOIN bookings b ON b.event_id = e.id AND b.user_id = $2
       LEFT JOIN bookings b2 ON b2.event_id = e.id
       WHERE e.id = $1
       GROUP BY e.id, b.status`,
      [id, req.user.id]
    );

    const event = result.rows[0];
    if (!event) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event.existing_status === 'CONFIRMED')
      return res.status(400).json({ error: 'You have already booked this event' });
    if (event.existing_status === 'WAITLIST')
      return res.status(400).json({ error: 'You are already on the waitlist' });

    const status = event.capacity && event.confirmed_count >= event.capacity
      ? 'WAITLIST' : 'CONFIRMED';

    await client.query(
      'INSERT INTO bookings (event_id, user_id, status) VALUES ($1, $2, $3)',
      [id, req.user.id, status]
    );

    await client.query('COMMIT');

    // Non-critical — fire and forget after commit
    log({ userId: req.user.id, action: status === 'CONFIRMED' ? 'EVENT_BOOKED' : 'EVENT_WAITLISTED', details: { eventId: id, title: event.title }, req }).catch(() => {});
    sendAdminNotification({ subject: status === 'CONFIRMED' ? 'New Event Booking' : 'New Waitlist Entry', message: `${req.user.name} has ${status === 'CONFIRMED' ? 'booked' : 'joined waitlist for'} <strong>${event.title}</strong>.` }).catch(() => {});
createNotification({ userId: req.user.id, title: status === 'CONFIRMED' ? 'Booking Confirmed' : 'Added to Waitlist', message: status === 'CONFIRMED' ? `You have successfully booked a spot at ${event.title}.` : `You have been added to the waitlist for ${event.title}.`, type: 'event' }).catch(() => {});

// Send confirmation email only if no Calendly link
if (status === 'CONFIRMED' && !event.calendly_link) {
  sendBookingConfirmationEmail(req.user, event).catch(() => {});
}
    return res.json({ message: status === 'CONFIRMED' ? 'Booking confirmed' : 'Added to waitlist', status, event });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Book event error:', err);
    return res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};


module.exports = { getAllEvents, getEventById, createEvent, updateEvent, deleteEvent, bookEvent };