const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken } = require('../utils/jwt');
const { log } = require('../utils/audit');

// ── LOGIN
const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find user
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    const user = result.rows[0];

    if (!user) {
      await log({ action: 'LOGIN_FAILED', details: { email }, req });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 2. Check password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      await log({ 
        userId: user.id, 
        action: 'LOGIN_FAILED', 
        details: { email }, 
        req 
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3. Generate JWT
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      title: user.title,
      initials: user.initials,
      role: user.role,
      isFirstLogin: user.is_first_login,
      profileStatus: user.profile_status
    });

    // 4. Log success
    await log({ 
      userId: user.id, 
      action: 'LOGIN_SUCCESS', 
      req 
    });

    // 5. Return token + user info
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        title: user.title,
        initials: user.initials,
        role: user.role,
        isFirstLogin: user.is_first_login,
        profileStatus: user.profile_status
      }
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── CHANGE PASSWORD (first login reset)
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const userId = req.user?.id;
    console.log('🔑 Change password request - userId:', userId);
    console.log('🔑 req.user:', req.user);

    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // 1. Get user from DB
    const result = await db.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2. Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // 3. Hash new password
    const hash = await bcrypt.hash(newPassword, 10);

    // 4. Update DB
    await db.query(
      `UPDATE users 
       SET password_hash = $1, is_first_login = false 
       WHERE id = $2`,
      [hash, userId]
    );

    // 5. Generate new token
    const token = generateToken({
      id: user.id,
      email: user.email,
      name: user.name,
      title: user.title,
      initials: user.initials,
      role: user.role,
      isFirstLogin: false,
      profileStatus: user.profile_status
    });

    await log({
      userId,
      action: 'PASSWORD_CHANGED',
      req
    });

    return res.json({
      token,
      message: 'Password changed successfully'
    });

  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── LOGOUT
const logout = async (req, res) => {
  await log({ 
    userId: req.user?.id, 
    action: 'LOGOUT', 
    req 
  });
  return res.json({ message: 'Logged out successfully' });
};

// ── GET ME (current user)
const getMe = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, title, initials, role, 
              is_first_login, profile_status, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user });
  } catch (err) {
    console.error('Get me error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login, changePassword, logout, getMe };