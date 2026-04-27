const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const announcementsController = require('../controllers/announcementsController');

const adminOnly = [auth, rbac('ADMIN')];

router.get('/', auth, announcementsController.getAnnouncements);
router.post('/', adminOnly, [
  body('title').notEmpty().withMessage('Title is required'),
  body('content').notEmpty().withMessage('Content is required'),
], announcementsController.createAnnouncement);
router.delete('/:id', adminOnly, announcementsController.deleteAnnouncement);

module.exports = router;