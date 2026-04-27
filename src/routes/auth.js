const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
};

// OTP rate limit — max 3 requests per email per 15 minutes
// Teaching: keyGenerator uses email so limit is per-user not per-IP
// Prevents spamming OTP emails to anyone's inbox
const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => req.body.email?.toLowerCase().trim() || req.ip,
  handler: (req, res) => res.status(429).json({
    error: 'Too many OTP requests. Please wait 15 minutes before trying again.'
  }),
  standardHeaders: true,
  legacyHeaders: false,
});

// Login rate limit — max 10 attempts per IP per 15 minutes
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  validate: { xForwardedForHeader: false, ip: false },
  keyGenerator: (req) => req.ip || 'unknown',
  handler: (req, res) => res.status(429).json({
    error: 'Too many login attempts. Please wait 15 minutes before trying again.'
  }),
  standardHeaders: true,
  legacyHeaders: false,
});
// POST /api/auth/login
router.post('/login',
  loginRateLimit,
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
router.post('/logout', authMiddleware, authController.logout);

// GET /api/auth/me (protected)
router.get('/me', authMiddleware, authController.getMe);

// POST /api/auth/request-otp — rate limited per email
router.post('/request-otp',
  otpRateLimit,
  [body('email').isEmail().withMessage('Valid email required').normalizeEmail()],
  validate,
  authController.requestOtp
);

// POST /api/auth/verify-otp
router.post('/verify-otp',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('otp')
      .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
      .isNumeric().withMessage('OTP must be numbers only'),
    body('newPassword')
      .isLength({ min: 8 }).withMessage('Min 8 characters')
      .matches(/[A-Z]/).withMessage('Must contain uppercase letter')
      .matches(/[0-9]/).withMessage('Must contain a number')
  ],
  validate,
  authController.verifyOtp
);
router.patch('/linkedin', authMiddleware, authController.updateLinkedin);
module.exports = router;