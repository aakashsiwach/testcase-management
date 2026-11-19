const nodemailer = require('nodemailer');
const env = require('../config/env');
const db = require('../config/db');

let transporter = null;
if (env.smtp.host) {
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
}

// Notifies a user that test cases were assigned to them. Sends email when SMTP is
// configured, otherwise logs. Never throws: notification failure must not fail the request.
async function notifyAssignment(assigneeId, testCases, assignedBy) {
  try {
    if (!assigneeId || !testCases.length) return;
    const { rows } = await db.query('SELECT name, email FROM users WHERE id = $1', [assigneeId]);
    if (!rows[0]) return;
    const list = testCases.map((tc) => `- #${tc.id} ${tc.title}`).join('\n');
    const subject = `${testCases.length} test case(s) assigned to you`;
    const text = `Hi ${rows[0].name},\n\n${assignedBy.name} assigned you:\n${list}\n\nOpen: ${env.appUrl}/testcases\n`;
    if (transporter) {
      await transporter.sendMail({ from: env.smtp.from, to: rows[0].email, subject, text });
    } else if (!env.isTest) {
      console.log(`[notify] (email not configured) to=${rows[0].email} subject="${subject}"`);
    }
  } catch (err) {
    console.warn('[notify] failed:', err.message);
  }
}

module.exports = { notifyAssignment };
