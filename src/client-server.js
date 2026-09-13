const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
  next();
});

const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'portfolio_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.getConnection()
  .then(async (c) => {
    console.log('✅ Client Server connected to MySQL Database');
    await c.query(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    c.release();
  })
  .catch(err => console.error('❌ MySQL Connection Error:', err.message));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/api/profile', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM profile WHERE id = 1 LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/items', async (req, res) => {
  const { category } = req.query;
  try {
    let sql = 'SELECT * FROM portfolio_items ORDER BY is_featured DESC, id DESC';
    let params = [];
    if (category && category !== 'all') {
      sql = 'SELECT * FROM portfolio_items WHERE category = ? ORDER BY is_featured DESC, id DESC';
      params = [category];
    }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiry', async (req, res) => {
  const { name, email, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO inquiries (name, email, message) VALUES (?, ?, ?)',
      [name, email, message]
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record inquiry.' });
  }
});

if (require.main === module) {
  const PORT = process.env.CLIENT_PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Client Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;