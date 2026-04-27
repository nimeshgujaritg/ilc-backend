const https = require('https');
const db = require('../db');
const { log } = require('../utils/audit');
const { sendAdminNotification } = require('../services/emailService');

const gfRequest = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(
      `${process.env.GF_CONSUMER_KEY}:${process.env.GF_CONSUMER_SECRET}`
    ).toString('base64');

    const url = new URL(process.env.GF_URL + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

// ── GET FORM FIELDS
const getForm = async (req, res) => {
  try {
    const formId = process.env.GF_FORM_ID;
    const result = await gfRequest('GET', `/wp-json/gf/v2/forms/${formId}`);

    if (result.status !== 200) {
      return res.status(500).json({ error: 'Failed to fetch form' });
    }
      console.log('GF raw fields:', JSON.stringify(result.data.fields.map(f => ({ id: f.id, type: f.type, label: f.label, visibility: f.visibility })), null, 2));

    // Filter out html, captcha, hidden fields — never send these to frontend
const fields = result.data.fields
  .filter(f => f.type !== 'html' && f.type !== 'captcha' && f.type !== 'hidden' && f.visibility !== 'hidden')
      .map(f => ({
        id: f.id,
        label: f.label,
        type: f.type,
        isRequired: f.isRequired || false,
        choices: f.choices || null,
        description: f.description || '',
      }));

    return res.json({ fields });
  } catch (err) {
    console.error('Get form error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── SUBMIT FORM
// GF REST API expects: { "input_50": "value", "input_75": "val1,val2" }
// Checkboxes → join selected values with comma
// Everything else → plain string
const submitForm = async (req, res) => {
  const { values } = req.body;
  const userId = req.user.id;

  try {
    const formId = process.env.GF_FORM_ID;

    // Build input object — flat key/value pairs
const input = {};
Object.entries(values).forEach(([fieldId, value]) => {
  if (Array.isArray(value)) {
    input[String(fieldId)] = value.join(', ');
  } else {
    input[String(fieldId)] = value || '';
  }
});

    // GF REST API entry payload
    const payload = {
      ...input,
      form_id: parseInt(formId),
    };

    console.log('GF payload:', JSON.stringify(payload, null, 2));

    const result = await gfRequest(
      'POST',
      `/wp-json/gf/v2/forms/${formId}/entries`,
      payload
    );

    console.log('GF response status:', result.status);
    console.log('GF response data:', JSON.stringify(result.data, null, 2));

    if (result.status !== 200 && result.status !== 201) {
      console.error('GF submission error:', result.data);
      return res.status(500).json({ error: 'Form submission failed' });
    }

    const entryId = result.data.id;

    // Update user profile_status
    await db.query(
      `UPDATE users SET profile_status = 'SUBMITTED', gf_entry_id = $1 WHERE id = $2`,
      [entryId, userId]
    );

    // Notify admin
    const userResult = await db.query(
      'SELECT name, email FROM users WHERE id = $1', [userId]
    );
    const user = userResult.rows[0];

    await sendAdminNotification({
      subject: 'New Profile Submitted for Review',
      message: `${user.name} (${user.email}) has submitted their membership profile. Entry ID: ${entryId}.`
    });

    await log({
      userId,
      action: 'PROFILE_SUBMITTED',
      details: { gfEntryId: entryId },
      req
    });

    return res.json({ message: 'Profile submitted successfully', entryId });

  } catch (err) {
    console.error('Submit form error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ── GET ENTRY
const getEntry = async (req, res) => {
  const { entryId } = req.params;
  try {
    const result = await gfRequest('GET', `/wp-json/gf/v2/entries/${entryId}`);
    if (result.status !== 200) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    return res.json({ entry: result.data });
  } catch (err) {
    console.error('Get entry error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getForm, submitForm, getEntry };