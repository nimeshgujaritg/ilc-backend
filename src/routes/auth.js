const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Validation helper
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: errors.array()[0].msg 
    });
  }
  next();
};

// POST /api/auth/login
router.post('/login',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required')
  ],
  validate,
  authController.login
);

// POST /api/auth/change-password (protected)
router.post('/change-password',
  authMiddleware,
  [
    body('currentPassword').notEmpty().withMessage('Current password required'),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Min 8 characters')
      .matches(/[A-Z]/).withMessage('Must contain uppercase letter')
      .matches(/[0-9]/).withMessage('Must contain a number')
  ],
  validate,
  authController.changePassword
);

// POST /api/auth/logout (protected)
router.post('/logout',
  authMiddleware,
  authController.logout
);

// GET /api/auth/me (protected)
router.get('/me',
  authMiddleware,
  authController.getMe
);

module.exports = router;