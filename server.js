const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const crypto = require('crypto');
const dotenv = require('dotenv');
// Load .env by default; if not set, try a file named 'env'
dotenv.config();
if (!process.env.MAIL_USERNAME && !process.env.MAIL_SERVER && !process.env.MAIL_SERVICE) {
  dotenv.config({ path: './env' });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Ensure raw body for Shopify webhook BEFORE JSON parsing
app.use('/webhook/shopify', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Email sender (Gmail-friendly config + timeouts for Render)
const isGmail = (process.env.MAIL_SERVICE || '').toLowerCase() === 'gmail' || (process.env.MAIL_SERVER || '').includes('gmail');
const transporter = nodemailer.createTransport({
  service: isGmail ? 'gmail' : undefined,
  host: isGmail ? undefined : process.env.MAIL_SERVER,
  port: isGmail ? 465 : parseInt(process.env.MAIL_PORT || '587', 10),
  secure: isGmail ? true : (process.env.MAIL_PORT === '465'),
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: (process.env.MAIL_PASSWORD || '').replace(/\s+/g, '') // strip spaces from Gmail app password
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 30000
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

// Shopify webhook (secure) — place after exports so app is created before usage
// Route-level raw body parser to compute HMAC on exact bytes
app.post('/webhook/shopify', async (req, res) => {
  try {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256') || '';
    const topic = req.get('X-Shopify-Topic') || '';
    const shop = req.get('X-Shopify-Shop-Domain') || '';

    const secret = process.env.SHOPIFY_WEBHOOK_SECRET || '';
    if (!secret) {
      return res.status(500).send('Missing SHOPIFY_WEBHOOK_SECRET');
    }

    const digest = crypto
      .createHmac('sha256', secret)
      .update(req.body)
      .digest('base64');

    const isValid = (() => {
      try {
        return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
      } catch (_) {
        return false;
      }
    })();

    if (!isValid) {
      return res.status(401).send('Invalid HMAC');
    }

    const payload = JSON.parse(req.body.toString('utf8'));

    // Try to extract an email from common webhook shapes (customers/create, orders/create, etc.)
    const candidateEmail = (
      payload?.email ||
      payload?.customer?.email ||
      payload?.order?.email ||
      (Array.isArray(payload?.line_items) ? payload?.customer?.email : undefined)
    );

    if (!candidateEmail) {
      // Acknowledge webhook; nothing to email
      return res.status(200).send('OK');
    }

    const name = payload?.first_name && payload?.last_name
      ? `${payload.first_name} ${payload.last_name}`
      : (payload?.customer?.first_name || '');

    const mail = {
      from: process.env.MAIL_FROM || process.env.MAIL_USERNAME,
      to: candidateEmail,
      subject: 'Welcome!',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Welcome${name ? `, ${name}` : ''}!</h2>
          <p>Thanks for visiting. We're glad to have you here.</p>
          <p style="color:#888;font-size:12px">Shop: ${shop} • Topic: ${topic}</p>
        </div>
      `,
      text: `Welcome${name ? `, ${name}` : ''}!\n\nThanks for visiting. We're glad to have you here.\nShop: ${shop} • Topic: ${topic}`
    };

    await transporter.sendMail(mail);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send('Internal error');
  }
});

