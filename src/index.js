const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({ path: '.env.dev' });
const cron = require('node-cron');
const db = require('./db');
const { sendEventReminderEmail } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));

// ── Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.'
});
app.use('/api/', limiter);

// ── Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// ── Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    env: process.env.NODE_ENV,
    time: new Date().toISOString()
  });
});

// ── Routes (we add these next)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/gf', require('./routes/gravityforms'));
app.use('/api/events', require('./routes/events'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api', require('./routes/resources'));
require('./services/emailService'); // triggers SMTP verification on startup

// ── 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 ILC Backend running on port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV}`);
});
// ── EVENT REMINDER SCHEDULER
// Runs every day at 9:00 AM
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Running event reminder job...');
  try {
    // Get all events happening tomorrow
    const eventsResult = await db.query(
      `SELECT * FROM events 
       WHERE date = CURRENT_DATE + INTERVAL '1 day'`
    );

    if (eventsResult.rows.length === 0) {
      console.log('📅 No events tomorrow — no reminders sent');
      return;
    }

    for (const event of eventsResult.rows) {
      // Get all CONFIRMED bookings for this event
      const bookingsResult = await db.query(
        `SELECT u.id, u.name, u.email 
         FROM bookings b
         JOIN users u ON u.id = b.user_id
         WHERE b.event_id = $1 AND b.status = 'CONFIRMED'`,
        [event.id]
      );

      console.log(`📧 Sending reminders for "${event.title}" to ${bookingsResult.rows.length} attendees`);

      for (const user of bookingsResult.rows) {
        await sendEventReminderEmail(user, event).catch(err => {
          console.error(`❌ Reminder failed for ${user.email}:`, err.message);
        });
      }
    }

    console.log('✅ Event reminder job complete');
  } catch (err) {
    console.error('❌ Event reminder job failed:', err);
  }
}, {
  timezone: 'Asia/Kolkata'
});