const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'portfolio_db',
  waitForConnections: true,
  connectionLimit: 10,
});

// --- CLIENT ROUTES ---
app.get('/api/profile', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM profile WHERE id = 1 LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM portfolio_items ORDER BY is_featured DESC, id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiry', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields required.' });
  try {
    const [result] = await pool.query('INSERT INTO inquiries (name, email, message) VALUES (?, ?, ?)', [name, email, message]);
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record inquiry.' });
  }
});

// --- ADMIN ROUTES ---
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const verifyAuth = (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) return res.json({ success: true, message: 'Authenticated' });
  return res.status(401).json({ success: false, message: 'Invalid password' });
};

app.post('/api/login', verifyAuth);
app.post('/api/admin/auth', verifyAuth);

app.put('/api/profile', async (req, res) => {
  const { name, title, bio, avatar_url, github_url, linkedin_url, email } = req.body;
  try {
    await pool.query(
      `INSERT INTO profile (id, name, title, bio, avatar_url, github_url, linkedin_url, email)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), title=VALUES(title), bio=VALUES(bio)`,
      [name, title, bio, avatar_url, github_url, linkedin_url, email]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/secret-admin-console', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// Local listener vs Vercel export
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;