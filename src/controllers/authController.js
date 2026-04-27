const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');
const { generateToken } = require('../utils/jwt');
const { log } = require('../utils/audit');
const { sendOtpEmail } = require('../services/emailService');

// ── LOGIN
const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = result.rows[0];

    if (!user) {
      await log({ action: 'LOGIN_FAILED', details: { email }, req });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      await log({ userId: user.id, action: 'LOGIN_FAILED', details: { email }, req });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({
      id: user.id, email: user.email, name: user.name,
      title: user.title, initials: user.initials, role: user.role,
      isFirstLogin: user.is_first_login, profileStatus: user.profile_status
    });

    await log({ userId: user.id, action: 'LOGIN_SUCCESS', req });

    return res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name,
        title: user.title, initials: user.initials, role: user.role,
        photo_url: user.photo_url,
        isFirstLogin: user.is_first_login, profileStatus: user.profile_status
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CHANGE PASSWORD
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1, is_first_login = false WHERE id = $2', [hash, userId]);

    const token = generateToken({
      id: user.id, email: user.email, name: user.name,
      title: user.title, initials: user.initials, role: user.role,
      isFirstLogin: false, profileStatus: user.profile_status
    });

    await log({ userId, action: 'PASSWORD_CHANGED', req });
    return res.json({ token, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── LOGOUT
const logout = async (req, res) => {
  await log({ userId: req.user?.id, action: 'LOGOUT', req });
  return res.json({ message: 'Logged out successfully' });
};

// ── GET ME — joins spocs table to include SPOC details
const getMe = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
         u.id, u.email, u.name, u.title, u.initials, u.role,
         u.photo_url, u.is_first_login, u.profile_status, u.created_at,
         s.id        AS spoc_id,
         s.name      AS spoc_name,
         s.title     AS spoc_title,
         s.email     AS spoc_email,
         s.phone     AS spoc_phone,
         s.photo_url AS spoc_photo_url
       FROM users u
       LEFT JOIN spocs s ON u.spoc_id = s.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'User not found' });

    // Shape the response — nest SPOC as its own object
    const user = {
      id:             row.id,
      email:          row.email,
      name:           row.name,
      title:          row.title,
      initials:       row.initials,
      role:           row.role,
      photo_url:      row.photo_url,
      is_first_login: row.is_first_login,
      profile_status: row.profile_status,
      created_at:     row.created_at,
      spoc: row.spoc_id ? {
        id:        row.spoc_id,
        name:      row.spoc_name,
        title:     row.spoc_title,
        email:     row.spoc_email,
        phone:     row.spoc_phone,
        photo_url: row.spoc_photo_url,
      } : null
    };

    return res.json({ user });
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── REQUEST OTP
const requestOtp = async (req, res) => {
  const { email } = req.body;
  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = result.rows[0];
    if (!user) return res.json({ message: 'If this email exists, an OTP has been sent.' });

    const otp = crypto.randomInt(100000, 999999).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    await db.query('DELETE FROM password_resets WHERE user_id = $1 AND used = false', [user.id]);
    await db.query(
      `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used)
       VALUES (gen_random_uuid(), $1, $2, NOW() + INTERVAL '10 minutes', false)`,
      [user.id, otpHash]
    );

    await sendOtpEmail(user, otp);
    await log({ userId: user.id, action: 'OTP_REQUESTED', req });
    return res.json({ message: 'If this email exists, an OTP has been sent.' });
  } catch (err) {
    console.error('Request OTP error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── VERIFY OTP
const verifyOtp = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  try {
    const userResult = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = userResult.rows[0];
    if (!user) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const otpResult = await db.query(
      `SELECT * FROM password_resets 
       WHERE user_id = $1 AND used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    const otpRecord = otpResult.rows[0];
    if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const isValidOtp = await bcrypt.compare(otp, otpRecord.token_hash);
    if (!isValidOtp) {
      await log({ userId: user.id, action: 'OTP_FAILED', req });
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1, is_first_login = false WHERE id = $2', [newHash, user.id]);
    await db.query('UPDATE password_resets SET used = true WHERE id = $1', [otpRecord.id]);

    const token = generateToken({
      id: user.id, email: user.email, name: user.name,
      title: user.title, initials: user.initials, role: user.role,
      isFirstLogin: false, profileStatus: user.profile_status
    });

    await log({ userId: user.id, action: 'PASSWORD_RESET_VIA_OTP', req });

    return res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name,
        title: user.title, initials: user.initials, role: user.role,
        photo_url: user.photo_url,
        isFirstLogin: false, profileStatus: user.profile_status
      },
      message: 'Password reset successfully'
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
const updateLinkedin = async (req, res) => {
  const { linkedin_url } = req.body;
  try {
    await db.query(
      'UPDATE users SET linkedin_url = $1 WHERE id = $2',
      [linkedin_url || null, req.user.id]
    );
    return res.json({ message: 'LinkedIn updated' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};
module.exports = { login, changePassword, logout, getMe, requestOtp, verifyOtp, updateLinkedin };