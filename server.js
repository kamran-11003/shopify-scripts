const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Email sender
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_SERVER,
  port: parseInt(process.env.MAIL_PORT || '587', 10),
  secure: (process.env.MAIL_PORT || '587') === '465',
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD
  }
});

transporter.verify().then(() => {
  console.log('SMTP server is ready to send emails');
}).catch((err) => {
  console.error('SMTP configuration error:', err);
});

// Minimal welcome email endpoint
app.post('/welcome', async (req, res) => {
  try {
    const { to, name } = req.body;

    if (!to) {
      return res.status(400).json({ success: false, message: 'Missing required field: to' });
    }

    const mail = {
      from: process.env.MAIL_FROM || process.env.MAIL_USERNAME,
      to,
      subject: 'Welcome!',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Welcome${name ? `, ${name}` : ''}!</h2>
          <p>Thanks for visiting. We're glad to have you here.</p>
        </div>
      `,
      text: `Welcome${name ? `, ${name}` : ''}!\n\nThanks for visiting. We're glad to have you here.`
    };

    const info = await transporter.sendMail(mail);
    return res.json({ success: true, messageId: info.messageId, accepted: info.accepted });
  } catch (err) {
    console.error('Email send error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send email', error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

module.exports = app;

