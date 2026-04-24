const https = require('https');
const db = require('../db');
const { log } = require('../utils/audit');
const { sendAdminNotification } = require('../services/emailService');

// ─────────────────────────────────────────────
// HELPER — make authenticated request to GF API
// Teaching: GF REST API uses HTTP Basic Auth with
// consumer key + secret encoded as base64.
// ─────────────────────────────────────────────
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


// ─────────────────────────────────────────────
// GET FORM FIELDS
// GET /api/gf/form
// Used by frontend to know field IDs and choices
// Teaching: We proxy this through our backend so
// GF API keys never go to the browser
// ─────────────────────────────────────────────
const getForm = async (req, res) => {
  try {
    const formId = process.env.GF_FORM_ID;
    const result = await gfRequest('GET', `/wp-json/gf/v2/forms/${formId}`);

    if (result.status !== 200) {
      return res.status(500).json({ error: 'Failed to fetch form' });
    }

    // Return only what frontend needs — fields with choices
    const fields = result.data.fields
      .filter(f => f.type !== 'html' && f.type !== 'captcha')
      .map(f => ({
        id: f.id,
        label: f.label,
        type: f.type,
        isRequired: f.isRequired,
        choices: f.choices || null,
        description: f.description || '',
      }));

    return res.json({ fields });
  } catch (err) {
    console.error('Get form error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// SUBMIT FORM
// POST /api/gf/submit
// Body: { values: { [fieldId]: value } }
// Teaching: GF API expects field values as:
// { "input_50": "John", "input_33": "Doe", ... }
// Checkboxes use sub-inputs: input_75_1, input_75_2
// ─────────────────────────────────────────────
const submitForm = async (req, res) => {
  const { values } = req.body;
  const userId = req.user.id;

  try {
    const formId = process.env.GF_FORM_ID;

    // Build GF submission payload
    // Teaching: GF REST API expects field_values object
    // with keys like "input_50" for single fields
    // and "input_75.1", "input_75.2" for checkboxes
    const fieldValues = {};

    Object.entries(values).forEach(([fieldId, value]) => {
      if (Array.isArray(value)) {
        // Checkbox — each selected value gets its own sub-input
        value.forEach((val, idx) => {
          fieldValues[`input_${fieldId}_${idx + 1}`] = val;
        });
      } else {
        fieldValues[`input_${fieldId}`] = value || '';
      }
    });

    const payload = {
      form_id: parseInt(formId),
      field_values: fieldValues,
      // Skip CAPTCHA validation on server-side submission
      ip: req.ip,
      source_url: process.env.FRONTEND_URL,
    };

   const result = await gfRequest(
  'POST',
  `/wp-json/gf/v2/forms/${formId}/entries`,
  payload
);

    if (result.status !== 200 && result.status !== 201) {
      console.error('GF submission error:', result.data);
      return res.status(500).json({ error: 'Form submission failed' });
    }

    const entryId = result.data.id;

    // Update user profile_status to SUBMITTED + save GF entry ID
    await db.query(
      `UPDATE users 
       SET profile_status = 'SUBMITTED', gf_entry_id = $1 
       WHERE id = $2`,
      [entryId, userId]
    );

    // Notify admin
    const userResult = await db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    await sendAdminNotification({
      subject: 'New Profile Submitted for Review',
      message: `${user.name} (${user.email}) has submitted their membership profile. Entry ID: ${entryId}. Please review and approve in the admin panel.`
    });

    await log({
      userId,
      action: 'PROFILE_SUBMITTED',
      details: { gfEntryId: entryId },
      req
    });

    return res.json({
      message: 'Profile submitted successfully',
      entryId
    });

  } catch (err) {
    console.error('Submit form error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};


// ─────────────────────────────────────────────
// GET ENTRY (admin view submitted answers)
// GET /api/gf/entry/:entryId
// ─────────────────────────────────────────────
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