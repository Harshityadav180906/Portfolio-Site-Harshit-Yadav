const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Permissive headers for font, script, and API security
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;");
  next();
});

// Serve static assets from public directory
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'portfolio_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test connection and auto-create inquiries table
pool.getConnection()
  .then(async (c) => {
    console.log('✅ Connected to MySQL Database: ' + (process.env.DB_NAME || 'portfolio_db'));
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

// ==========================================
// 1. PAGE ROUTES
// ==========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/secret-admin-console', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin.html'));
});

// ==========================================
// 2. AUTHENTICATION
// ==========================================
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const verifyAuth = (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, message: 'Authenticated' });
  }
  return res.status(401).json({ success: false, message: 'Invalid password' });
};

app.post('/api/login', verifyAuth);
app.post('/api/admin/auth', verifyAuth);

// ==========================================
// 3. PROFILE API
// ==========================================
app.get('/api/profile', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM profile WHERE id = 1 LIMIT 1');
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/profile', async (req, res) => {
  const { name, title, bio, avatar_url, github_url, linkedin_url, email } = req.body;
  try {
    await pool.query(
      `INSERT INTO profile (id, name, title, bio, avatar_url, github_url, linkedin_url, email)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         name = VALUES(name), title = VALUES(title), bio = VALUES(bio),
         avatar_url = VALUES(avatar_url), github_url = VALUES(github_url),
         linkedin_url = VALUES(linkedin_url), email = VALUES(email)`,
      [name, title, bio, avatar_url, github_url, linkedin_url, email]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. PORTFOLIO ITEMS API
// ==========================================
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

app.post('/api/items', async (req, res) => {
  const { category, title, subtitle, date_label, description, badge, tags, link } = req.body;
  if (!category || !title) return res.status(400).json({ error: 'Category & Title required' });
  try {
    const [result] = await pool.query(
      `INSERT INTO portfolio_items (category, title, subtitle, date_label, description, badge, tags, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [category, title, subtitle || '', date_label || '', description || '', badge || '', tags || '', link || '']
    );
    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/items/:id', async (req, res) => {
  const { id } = req.params;
  const { category, title, subtitle, date_label, description, badge, tags, link } = req.body;

  if (!category || !title) {
    return res.status(400).json({ error: 'Category and Title are required' });
  }

  try {
    const [result] = await pool.query(
      `UPDATE portfolio_items 
       SET category = ?, title = ?, subtitle = ?, date_label = ?, description = ?, badge = ?, tags = ?, link = ?
       WHERE id = ?`,
      [category, title, subtitle || '', date_label || '', description || '', badge || '', tags || '', link || '', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ success: true, message: 'Item updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM portfolio_items WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. INQUIRIES API (CONTACT FORM)
// ==========================================
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
    console.error('Error saving inquiry:', err);
    res.status(500).json({ error: 'Failed to record inquiry.' });
  }
});

app.get('/api/admin/inquiries', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM inquiries ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/inquiries/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM inquiries WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
  console.log(`🌐 Public Client Site:  http://localhost:${PORT}/`);
  console.log(`🔒 Private Admin Site:  http://localhost:${PORT}/secret-admin-console`);
});