'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');

const ALLOWED_KEYS = [
  'email_lui', 'email_lei',
  'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
  'nome_lui', 'nome_lei',
];

// GET /api/settings
router.get('/', (req, res) => {
  const settings = db.getAllSettings();
  // Oscura la password SMTP nella risposta
  const safe = { ...settings };
  if (safe.smtp_pass && safe.smtp_pass.length > 0) {
    safe.smtp_pass = '••••••••';
  }
  res.json(safe);
});

// PUT /api/settings
router.put('/', (req, res) => {
  const body = req.body;
  const toSave = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) {
      toSave[key] = body[key];
    }
  }
  // Se smtp_pass è il placeholder, non sovrascrivere
  if (toSave.smtp_pass === '••••••••') {
    delete toSave.smtp_pass;
  }
  db.setSettings(toSave);
  res.json({ ok: true, saved: Object.keys(toSave) });
});

module.exports = router;
