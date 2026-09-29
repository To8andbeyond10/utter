import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';

// Stores one private JSON record per email in Vercel Blob.
// The file name is a hash of the email, so repeat signups overwrite
// instead of duplicating, and emails never appear in file names.

const AUDIENCES = new Set(['me', 'kids', 'both']);
const DEVICES = new Set(['android', 'windows', 'both']);
const PRICES = new Set(['0', '4.99', '9.99', '14.99']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'invalid_body' });
  }

  // Honeypot: real visitors never fill this hidden field.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return res.status(201).json({ ok: true });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }

  const record = {
    email,
    audience: AUDIENCES.has(body.audience) ? body.audience : 'me',
    device: DEVICES.has(body.device) ? body.device : 'both',
    investigatorPrice: PRICES.has(body.price) ? Number(body.price) : null,
    joinedAt: new Date().toISOString()
  };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('waitlist: BLOB_READ_WRITE_TOKEN is not set');
    return res.status(503).json({ error: 'storage_not_configured' });
  }

  const key = createHash('sha256').update(email).digest('hex');
  try {
    await put(`waitlist/${key}.json`, JSON.stringify(record), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true
    });
  } catch (err) {
    console.error('waitlist: save failed', err && err.message);
    return res.status(500).json({ error: 'save_failed' });
  }

  return res.status(201).json({ ok: true });
}
