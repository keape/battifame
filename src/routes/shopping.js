'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendShoppingList } = require('../email');

// GET /api/shopping/weeks — settimane che hanno un piano
router.get('/weeks', (req, res) => {
  const weeks = db.getWeeksWithPlan();
  // Arricchisce con lo stato di conferma
  const result = weeks.map(w => {
    const status = db.getWeekStatus(w);
    return { week: w, confirmed: status ? status.confirmed : 0 };
  });
  res.json(result);
});

// GET /api/shopping?week=2025-01-06
router.get('/', (req, res) => {
  const week = req.query.week || db.nextWeekStart();
  const items = db.getShoppingList(week);

  // Aggrega ingredienti per nome (deduplicazione)
  const aggregated = {};
  for (const item of items) {
    const key = item.ingredient.toLowerCase().trim();
    if (!aggregated[key]) {
      aggregated[key] = { ingredient: item.ingredient, unit: item.unit };
    }
  }

  const list = Object.values(aggregated).sort((a, b) =>
    a.ingredient.localeCompare(b.ingredient, 'it')
  );
  res.json({ week, items: list });
});

// POST /api/shopping/send-email
router.post('/send-email', async (req, res) => {
  const week = req.body.week || db.nextWeekStart();
  try {
    await sendShoppingList(week);
    res.json({ ok: true, week });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
