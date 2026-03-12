'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./src/database');
const { startScheduler } = require('./src/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/meals',       require('./src/routes/meals'));
app.use('/api/ingredients', require('./src/routes/ingredients'));
app.use('/api/plan',        require('./src/routes/planner'));
app.use('/api/shopping',    require('./src/routes/shopping'));
app.use('/api/settings',    require('./src/routes/settings'));
app.use('/api/stats',       require('./src/routes/stats'));

// Helper: settimane corrente e prossima
app.get('/api/weeks', (req, res) => {
  res.json({
    current: db.currentWeekStart(),
    next: db.nextWeekStart(),
  });
});

// Fallback: serve index.html per route non API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── AVVIO ────────────────────────────────────────────────────────────────────
db.getDb(); // inizializza DB e schema

// Seed automatico al primo avvio
try {
  require('./src/seed');
} catch (e) {
  console.warn('[Seed] Errore nel seed:', e.message);
}

startScheduler();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🥗 BattiFame è in esecuzione!`);
  console.log(`   Apri il browser su: http://localhost:${PORT}\n`);
});
