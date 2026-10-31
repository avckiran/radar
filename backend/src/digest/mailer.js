import nodemailer from 'nodemailer';

// Gmail needs an "app password" (a separate 16-character password for this app), not the normal account password.
export function mailConfigured(config) {
  return Boolean(config.smtpUser && config.smtpPass);
}

export function createMailer(config) {
  if (!mailConfigured(config)) return null;
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  const from = config.mailFrom || `RADAR <${config.smtpUser}>`;
  return {
    from,
    async send({ to, subject, html, text }) {
      await transport.sendMail({ from, to, subject, html, text });
    },
    verify: () => transport.verify(),
  };
}
