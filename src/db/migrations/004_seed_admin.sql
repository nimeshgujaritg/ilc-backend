DELETE FROM users WHERE email = 'admin@ilc.in';

INSERT INTO users (
  email,
  password_hash,
  name,
  title,
  initials,
  role,
  is_first_login,
  profile_status
) VALUES (
  'admin@ilc.in',
  '$2b$10$JQNZEJmOnudYu/E8ZiF6HO.8k082I8HeF1Ln8AmhoEXtNI0MGIfFi',
  'Admin Director',
  'Director of Operations',
  'AD',
  'ADMIN',
  false,
  'APPROVED'
);