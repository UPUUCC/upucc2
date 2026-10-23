const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { db } = require('./config/firebase');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'API is running' });
});

// Turnstile verification endpoint
app.post('/api/verify-turnstile', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Token turnstile diperlukan.' });
  }

  const secretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ success: false, message: 'Turnstile secret key belum dikonfigurasi.' });
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    const clientIp = req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp) {
      formData.append('remoteip', clientIp);
    }

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData
    });

    const result = await verifyRes.json();
    if (result.success) {
      return res.json({ success: true, message: 'Verifikasi Turnstile berhasil.' });
    } else {
      return res.status(400).json({ success: false, message: 'Verifikasi Turnstile gagal.', errorCodes: result['error-codes'] });
    }
  } catch (err) {
    console.error('Error verifying Turnstile:', err);
    return res.status(500).json({ success: false, message: 'Gagal menghubungi server verifikasi Cloudflare.' });
  }
});

// Example route to fetch all 'informasi'
app.get('/api/informasi', async (req, res) => {
  try {
    const snapshot = await db.collection('informasi').get();
    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });
    res.json(data);
  } catch (error) {
    console.error("Error fetching informasi:", error);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
