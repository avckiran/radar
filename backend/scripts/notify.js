// Sends a short plain email to the owner, using the same mail account as the daily digest.
// Used by the server's backup job when something goes wrong:
//   npm run notify -w backend -- "Subject" "What happened"
// It goes to RADAR_EMAIL_AVCKIRAN (the owner). Set NOTIFY_TO to send somewhere else.
import { config } from '../src/config.js';
import { createMailer } from '../src/digest/mailer.js';

const [subject, ...rest] = process.argv.slice(2);
const body = rest.join(' ');
const to = process.env.NOTIFY_TO || process.env.RADAR_EMAIL_AVCKIRAN;

if (!subject) {
  console.error('Usage: npm run notify -w backend -- "Subject" "Message"');
  process.exit(1);
}
const mailer = createMailer(config);
if (!mailer || !to) {
  console.error('Cannot send: set SMTP_USER, SMTP_PASS and RADAR_EMAIL_AVCKIRAN in backend/.env.');
  process.exit(1);
}
try {
  await mailer.send({ to, subject, text: `${body}\n\n(Sent by RADAR on the server.)` });
  console.log(`Sent "${subject}" to ${to}.`);
} catch (err) {
  console.error(`Could not send: ${err.message}`);
  process.exit(1);
}
