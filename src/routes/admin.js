const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const adminController = require('../controllers/adminController');

const adminOnly = [auth, rbac('ADMIN')];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

// ── USERS
router.get('/users', adminOnly, adminController.getAllUsers);

router.post('/users',
  adminOnly,
  [
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('name').notEmpty().withMessage('Name is required').trim(),
    body('title').notEmpty().withMessage('Title is required').trim(),
    body('role').isIn(['CEO', 'ADMIN']).withMessage('Role must be CEO or ADMIN'),
  ],
  validate,
  adminController.createUser
);

router.patch('/users/:id/approve', adminOnly, adminController.approveUser);
router.patch('/users/:id/reject', adminOnly, adminController.rejectUser);
router.patch('/users/:id/mark-submitted', adminOnly, adminController.markSubmitted);
router.patch('/users/:id/assign-spoc', adminOnly, adminController.assignSpoc);

router.post('/users/bulk',
  adminOnly,
  [
    body('users').isArray({ min: 1 }).withMessage('Users array required'),
    body('users.*.email').isEmail().withMessage('Each user needs valid email'),
    body('users.*.name').notEmpty().withMessage('Each user needs a name'),
    body('users.*.title').notEmpty().withMessage('Each user needs a title'),
    body('users.*.role').isIn(['CEO', 'ADMIN']).withMessage('Role must be CEO or ADMIN'),
  ],
  validate,
  adminController.bulkCreateUsers
);

// ── SPOCS
router.get('/spocs', adminOnly, adminController.getAllSpocs);

router.post('/spocs',
  adminOnly,
  [body('name').notEmpty().withMessage('Name is required')],
  validate,
  adminController.createSpoc
);

router.delete('/spocs/:id', adminOnly, adminController.deleteSpoc);
router.get('/members-list', [auth], adminController.getMembers);
// ── AUDIT LOGS
router.get('/audit-logs', adminOnly, adminController.getAuditLogs);

// ── NOTIFICATIONS
router.get('/notifications',          auth, adminController.getNotifications);
router.patch('/notifications/:id/read', auth, adminController.markNotificationRead);
router.patch('/notifications/read-all', auth, adminController.markAllNotificationsRead);
// ── BROADCAST EMAIL
router.post('/broadcast', adminOnly, [
  body('subject').notEmpty().withMessage('Subject is required'),
  body('message').notEmpty().withMessage('Message is required'),
], validate, adminController.broadcastEmail);

router.get('/stats', adminOnly, adminController.getAdminStats);

module.exports = router;