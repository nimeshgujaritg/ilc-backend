const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const eventsController = require('../controllers/eventsController');

const adminOnly = [auth, rbac('ADMIN')];
const anyUser = [auth];

// ── CEO + ADMIN
router.get('/',     anyUser,   eventsController.getAllEvents);
router.get('/:id',  anyUser,   eventsController.getEventById);
router.post('/:id/book', anyUser, eventsController.bookEvent);

// ── ADMIN ONLY
router.post('/',        adminOnly, eventsController.createEvent);
router.put('/:id',      adminOnly, eventsController.updateEvent);
router.delete('/:id',   adminOnly, eventsController.deleteEvent);

module.exports = router;