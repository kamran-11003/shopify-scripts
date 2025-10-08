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
const FORCE_TO_EMAIL = process.env.EMAIL_FORCE_TO || '';

// Middleware
app.use(cors());
// Ensure raw body for Shopify webhook BEFORE JSON parsing
app.use('/webhook/shopify', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Prefer HTTP email provider (Resend) if available; fallback to SMTP (Gmail)
const USE_RESEND = !!process.env.RESEND_API_KEY;

let transporter = null;
if (!USE_RESEND) {
  const isGmail = (process.env.MAIL_SERVICE || '').toLowerCase() === 'gmail' || (process.env.MAIL_SERVER || '').includes('gmail');
  transporter = nodemailer.createTransport({
    service: isGmail ? 'gmail' : undefined,
    host: isGmail ? undefined : process.env.MAIL_SERVER,
    port: isGmail ? 465 : parseInt(process.env.MAIL_PORT || '587', 10),
    secure: isGmail ? true : (process.env.MAIL_PORT === '465'),
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: (process.env.MAIL_PASSWORD || '').replace(/\s+/g, '')
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
} else {
  console.log('Using Resend API for email delivery');
}

async function deliverEmail(mail) {
  if (USE_RESEND) {
    const apiKey = process.env.RESEND_API_KEY;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: mail.from,
        to: Array.isArray(mail.to) ? mail.to : [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      })
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Resend API error ${response.status}: ${text}`);
    }
    const data = await response.json();
    return { messageId: data?.id || 'resend', accepted: [mail.to].flat() };
  }

  const info = await transporter.sendMail(mail);
  return { messageId: info.messageId, accepted: info.accepted };
}

// Minimal welcome email endpoint
app.post('/welcome', async (req, res) => {
  try {
    const { to, name } = req.body;

    const recipient = FORCE_TO_EMAIL || to;

    if (!recipient) {
      return res.status(400).json({ success: false, message: 'Missing required field: to' });
    }

    const mail = {
      from: process.env.MAIL_FROM || process.env.MAIL_USERNAME,
      to: recipient,
      subject: 'Welcome!',
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6">
          <h2>Welcome${name ? `, ${name}` : ''}!</h2>
          <p>Thanks for visiting. We're glad to have you here.</p>
        </div>
      `,
      text: `Welcome${name ? `, ${name}` : ''}!\n\nThanks for visiting. We're glad to have you here.`
    };

    const info = await deliverEmail(mail);
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

    // In-memory timers for abandoned carts (1 minute)
    if (!global.__abandonTimers) {
      global.__abandonTimers = new Map();
    }
    const abandonTimers = global.__abandonTimers;

    const extractEmail = (obj) => (
      obj?.email || obj?.customer?.email || obj?.order?.email || undefined
    );

    const sendAbandonedEmail = async (toEmail, previewText) => {
      const recipient = FORCE_TO_EMAIL || toEmail;
      if (!recipient) return;
      const mail = {
        from: process.env.MAIL_FROM || process.env.MAIL_USERNAME,
        to: recipient,
        subject: 'You left items in your cart',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6">
            <h2>Forgot something?</h2>
            <p>${previewText || 'It looks like you left items in your cart. Complete your purchase when you are ready.'}</p>
          </div>
        `,
        text: `Forgot something? ${previewText || 'It looks like you left items in your cart. Complete your purchase when you are ready.'}`
      };
      await deliverEmail(mail);
    };

    // Immediate welcome only for customers/create
    if (topic === 'customers/create') {
      const email = extractEmail(payload);
      const recipient = FORCE_TO_EMAIL || email;
      if (recipient) {
        const name = payload?.first_name && payload?.last_name
          ? `${payload.first_name} ${payload.last_name}`
          : (payload?.customer?.first_name || '');
        const mail = {
          from: process.env.MAIL_FROM || process.env.MAIL_USERNAME,
          to: recipient,
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
        await deliverEmail(mail);
      }
      return res.status(200).send('OK');
    }

    // Schedule 1-minute abandoned email on checkout activity
    if (topic === 'checkouts/create' || topic === 'checkouts/update') {
      const checkoutId = payload?.id || payload?.token || payload?.checkout?.id || payload?.checkout?.token;
      const email = extractEmail(payload) || extractEmail(payload?.checkout || {});
      if (checkoutId && email) {
        if (abandonTimers.has(checkoutId)) {
          clearTimeout(abandonTimers.get(checkoutId).timer);
          abandonTimers.delete(checkoutId);
        }
        const timer = setTimeout(async () => {
          try {
            await sendAbandonedEmail(email, 'Complete your checkout — your items are waiting.');
          } catch (e) {
            console.error('Abandoned cart email error:', e);
          } finally {
            abandonTimers.delete(checkoutId);
          }
        }, 60 * 1000);
        abandonTimers.set(checkoutId, { timer, email });
      }
      return res.status(200).send('OK');
    }

    // Cancel abandoned email when order completes
    if (topic === 'orders/create') {
      const checkoutId = payload?.checkout_id || payload?.checkout_token;
      if (checkoutId && abandonTimers.has(checkoutId)) {
        clearTimeout(abandonTimers.get(checkoutId).timer);
        abandonTimers.delete(checkoutId);
      }
      return res.status(200).send('OK');
    }

    // Other topics acknowledged without email
    return res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).send('Internal error');
  }
});

