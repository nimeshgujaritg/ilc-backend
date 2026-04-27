const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: false }
});

transporter.verify((error) => {
  if (error) console.error('❌ SMTP connection failed:', error.message);
  else console.log('✅ SMTP connected — emails ready');
});

const LOGO_URL = 'https://www.indialeadershipcouncil.com/wp-content/uploads/2026/04/ilc-faciliting.png';

// Teaching: All text in emails uses dark colors for readability.
// Email clients render differently — always use inline styles, never CSS classes.
// Never rely on light gray for body text — use #1f2937 (dark) or #4b5563 (medium).
const emailWrapper = (body) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:4px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header with logo -->
          <tr>
            <td style="background:#1a0525;padding:32px 48px;text-align:center;">
              <img
                src="${LOGO_URL}"
                alt="India Leadership Council"
                width="180"
                style="display:block;margin:0 auto;max-width:180px;"
              />
              <div style="width:40px;height:1px;background:#EDA300;margin:16px auto 0;"></div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:48px;">
              ${body}
            </td>
          </tr>

          <!-- Footer — no concierge email, just ILC branding -->
          <tr>
            <td style="background:#1a0525;padding:20px 48px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:11px;font-family:Arial,sans-serif;line-height:1.6;">
                © 2024 India Leadership Council. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const send = async ({ to, subject, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
      to, subject, html,
    });
    console.log(`📧 Email sent to ${to} — ${subject} [${info.messageId}]`);
    return true;
  } catch (err) {
    console.error(`❌ Email failed to ${to}:`, err.message);
    return false;
  }
};

// ── WELCOME EMAIL
const sendWelcomeEmail = async (user, tempPassword) => {
  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Welcome</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:28px;font-weight:normal;">Dear ${user.name},</h2>
    <p style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">
      You have been granted access to the <strong>India Leadership Council</strong> member portal.
      Please use the credentials below to log in for the first time.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:16px;">
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Portal URL</p>
                <a href="${process.env.FRONTEND_URL}" style="color:#1a0525;font-size:14px;font-family:Arial,sans-serif;font-weight:bold;">${process.env.FRONTEND_URL}</a>
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:16px;">
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Your Email</p>
                <p style="margin:0;color:#1f2937;font-size:15px;font-family:Arial,sans-serif;font-weight:bold;">${user.email}</p>
              </td>
            </tr>
            <tr>
              <td>
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Temporary Password</p>
                <p style="margin:0;color:#1a0525;font-size:22px;font-weight:bold;letter-spacing:4px;font-family:monospace;">${tempPassword}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="color:#1f2937;font-size:14px;line-height:1.8;margin:0 0 12px;font-family:Arial,sans-serif;">
      You will be prompted to <strong>set a new password</strong> on your first login.
    </p>
    <p style="color:#6b7280;font-size:13px;line-height:1.8;margin:0;font-family:Arial,sans-serif;">
      If you did not expect this invitation, please disregard this email.
    </p>
  `);
  return send({ to: user.email, subject: 'Your ILC Portal Access — Action Required', html });
};

// ── OTP EMAIL
const sendOtpEmail = async (user, otp) => {
  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Security Alert</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:28px;font-weight:normal;">Password Reset Request</h2>
    <p style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">
      A password reset was requested for your ILC Portal account.
      Use the one-time password below. This code <strong>expires in 10 minutes</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td align="center" style="background:#1a0525;padding:36px;border-radius:6px;">
          <p style="margin:0 0 10px;color:#EDA300;font-size:11px;letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">One Time Password</p>
          <p style="margin:0;color:#ffffff;font-size:48px;font-weight:bold;letter-spacing:16px;font-family:monospace;">${otp}</p>
        </td>
      </tr>
    </table>

    <p style="color:#6b7280;font-size:13px;line-height:1.8;margin:0;font-family:Arial,sans-serif;">
      If you did not request a password reset, ignore this email. Your password will not be changed.
    </p>
  `);
  return send({ to: user.email, subject: 'ILC Portal — Your Password Reset OTP', html });
};

// ── APPROVAL EMAIL
const sendApprovalEmail = async (user) => {
  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Membership Update</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:28px;font-weight:normal;">Welcome to the Council, ${user.name}.</h2>
    <p style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">
      Your membership profile has been reviewed and <strong style="color:#059669;">approved</strong>.
      You now have full access to the India Leadership Council member portal.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td>
          <a href="${process.env.FRONTEND_URL}"
             style="display:inline-block;background:#1a0525;color:#ffffff;padding:16px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;border-radius:3px;">
            Enter Portal →
          </a>
        </td>
      </tr>
    </table>

    <p style="color:#6b7280;font-size:13px;line-height:1.8;margin:0;font-family:Arial,sans-serif;">
      We look forward to your participation in the India Leadership Council.
    </p>
  `);
  return send({ to: user.email, subject: 'ILC Membership Approved — Welcome to the Council', html });
};

// ── REJECTION EMAIL
const sendRejectionEmail = async (user) => {
  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Membership Update</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:28px;font-weight:normal;">Profile Update Required</h2>
    <p style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">
      Dear ${user.name}, your membership profile requires some updates before it can be approved.
      Please log in to the portal and re-submit your profile with the necessary information.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
      <tr>
        <td>
          <a href="${process.env.FRONTEND_URL}"
             style="display:inline-block;background:#1a0525;color:#ffffff;padding:16px 36px;text-decoration:none;font-size:12px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;border-radius:3px;">
            Update Profile →
          </a>
        </td>
      </tr>
    </table>
  `);
  return send({ to: user.email, subject: 'ILC Portal — Profile Update Required', html });
};

// ── SPOC CHANGE EMAIL
const sendSpocChangeEmail = async (user, spoc) => {
  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Account Update</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:28px;font-weight:normal;">Your SPOC Has Been Updated</h2>
    <p style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">
      Dear ${user.name}, your dedicated Single Point of Contact (SPOC) has been updated.
    </p>
    ${spoc ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:28px 32px;">
          ${spoc.photo_url ? `<img src="${spoc.photo_url}" alt="${spoc.name}" width="64" style="border-radius:50%;margin-bottom:16px;display:block;">` : ''}
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Your SPOC</p>
          <p style="margin:0 0 4px;color:#1a0525;font-size:20px;font-weight:bold;font-family:Arial,sans-serif;">${spoc.name}</p>
          ${spoc.title ? `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;font-family:Arial,sans-serif;">${spoc.title}</p>` : ''}
          ${spoc.email ? `<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;color:#1f2937;"><strong>Email:</strong> <a href="mailto:${spoc.email}" style="color:#1a0525;">${spoc.email}</a></p>` : ''}
          ${spoc.phone ? `<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#1f2937;"><strong>Phone:</strong> ${spoc.phone}</p>` : ''}
        </td>
      </tr>
    </table>
    ` : `<p style="color:#1f2937;font-size:14px;font-family:Arial,sans-serif;margin:0 0 28px;">Your SPOC assignment has been removed.</p>`}
  `);
  return send({ to: user.email, subject: 'ILC Portal — Your SPOC Has Been Updated', html });
};

// ── ADMIN NOTIFICATION
const sendAdminNotification = async ({ subject, message }) => {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER;
  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Admin Notification</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:24px;font-weight:normal;">${subject}</h2>
    <p style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">${message}</p>
    <p style="color:#6b7280;font-size:13px;font-family:Arial,sans-serif;margin:0;">Log in to the admin panel to take action.</p>
  `);
  return send({ to: adminEmail, subject: `ILC Admin — ${subject}`, html });
};

// ── EVENT REMINDER EMAIL
const sendEventReminderEmail = async (user, event) => {
  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const eventTime = event.time ? (() => {
    const [h, m] = event.time.split(':');
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m));
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  })() : null;

  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Event Reminder</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:28px;font-weight:normal;">See You Tomorrow, ${user.name}.</h2>
    <p style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">
      This is a reminder that you have an upcoming ILC event tomorrow.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Event</p>
          <p style="margin:0 0 20px;color:#1a0525;font-size:22px;font-weight:bold;font-family:Arial,sans-serif;">${event.title}</p>

          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:12px;">
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Date</p>
                <p style="margin:0;color:#1f2937;font-size:14px;font-family:Arial,sans-serif;font-weight:bold;">${eventDate}</p>
              </td>
            </tr>
            ${eventTime ? `
            <tr>
              <td style="padding-bottom:12px;">
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Time</p>
                <p style="margin:0;color:#1f2937;font-size:14px;font-family:Arial,sans-serif;font-weight:bold;">${eventTime}</p>
              </td>
            </tr>
            ` : ''}
            ${event.location ? `
            <tr>
              <td>
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Location</p>
                <p style="margin:0;color:#1f2937;font-size:14px;font-family:Arial,sans-serif;font-weight:bold;">${event.location}</p>
              </td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    <p style="color:#6b7280;font-size:13px;line-height:1.8;margin:0;font-family:Arial,sans-serif;">
      We look forward to seeing you. Log in to the portal to view full event details.
    </p>
  `);
  return send({ to: user.email, subject: `Reminder: ${event.title} — Tomorrow`, html });
};

const sendBroadcastEmail = async (user, subject, message) => {
  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">ILC Communication</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:28px;font-weight:normal;">Dear ${user.name},</h2>
    <div style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">
      ${message.replace(/\n/g, '<br/>')}
    </div>
    <p style="color:#6b7280;font-size:13px;font-family:Arial,sans-serif;margin:0;">
      This is an official communication from India Leadership Council.
    </p>
  `);
  return send({ to: user.email, subject, html });
};

// ── BOOKING CONFIRMATION EMAIL
const sendBookingConfirmationEmail = async (user, event) => {
  const eventDate = new Date(event.date).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  const eventTime = event.time ? (() => {
    const [h, m] = event.time.split(':');
    const d = new Date();
    d.setHours(parseInt(h), parseInt(m));
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  })() : null;

  const html = emailWrapper(`
    <p style="margin:0 0 6px;color:#EDA300;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-family:Arial,sans-serif;font-weight:bold;">Booking Confirmed</p>
    <h2 style="margin:0 0 20px;color:#1a0525;font-size:28px;font-weight:normal;">You're confirmed, ${user.name}.</h2>
    <p style="color:#1f2937;font-size:15px;line-height:1.8;margin:0 0 28px;font-family:Arial,sans-serif;">
      Your spot has been reserved for the following ILC event.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:0 0 28px;">
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 6px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Event</p>
          <p style="margin:0 0 20px;color:#1a0525;font-size:22px;font-weight:bold;font-family:Arial,sans-serif;">${event.title}</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-bottom:12px;">
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Date</p>
                <p style="margin:0;color:#1f2937;font-size:14px;font-family:Arial,sans-serif;font-weight:bold;">${eventDate}</p>
              </td>
            </tr>
            ${eventTime ? `
            <tr>
              <td style="padding-bottom:12px;">
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Time</p>
                <p style="margin:0;color:#1f2937;font-size:14px;font-family:Arial,sans-serif;font-weight:bold;">${eventTime}</p>
              </td>
            </tr>
            ` : ''}
            ${event.location ? `
            <tr>
              <td>
                <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:bold;">Location</p>
                <p style="margin:0;color:#1f2937;font-size:14px;font-family:Arial,sans-serif;font-weight:bold;">${event.location}</p>
              </td>
            </tr>
            ` : ''}
          </table>
        </td>
      </tr>
    </table>

    <p style="color:#6b7280;font-size:13px;line-height:1.8;margin:0;font-family:Arial,sans-serif;">
      We look forward to seeing you at the event. Log in to the portal to view full details.
    </p>
  `);
  return send({ to: user.email, subject: `Booking Confirmed — ${event.title}`, html });
};

module.exports = {
  sendWelcomeEmail,
  sendOtpEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendSpocChangeEmail,
  sendAdminNotification,
  sendEventReminderEmail,
  sendBroadcastEmail,
  sendBookingConfirmationEmail,
};