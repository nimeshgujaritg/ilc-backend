INSERT INTO users (
  email,
  password_hash,
  name,
  title,
  initials,
  role,
  is_first_login,
  profile_status
) VALUES 
(
  'ceo@ilc.in',
  '$2b$10$21GPCpWnjb1xovgGeF3nDOvpK71g1YDlgnCV.3.fCc3rZVUqfVOle',
  'Amitav Ghosh',
  'Global MD',
  'AG',
  'CEO',
  false,
  'APPROVED'
),
(
  'rxckxng@gmail.com',
  '$2b$10$21GPCpWnjb1xovgGeF3nDOvpK71g1YDlgnCV.3.fCc3rZVUqfVOle',
  'Rahul Dev',
  'Managing Director',
  'RD',
  'CEO',
  true,
  'PENDING'
);