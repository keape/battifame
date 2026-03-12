'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');

const CATEGORIES_LUI = ['spuntino', 'pranzo', 'merenda', 'cena'];
const CATEGORIES_LEI = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];
const DAYS = 7;

// GET /api/plan?week=2025-01-06
router.get('/', (req, res) => {
  const week = req.query.week || db.currentWeekStart();
  const entries = db.getWeekPlan(week);
  const status = db.getWeekStatus(week);
  res.json({ week, entries, status });
});

// POST /api/plan/generate  — auto-genera piano per la settimana specificata
router.post('/generate', (req, res) => {
  const week = req.body.week || db.nextWeekStart();

  // Raccoglie tutte le opzioni per categoria
  const options = {};
  for (const cat of CATEGORIES_LEI) {
    options[cat] = db.getMeals(cat);
  }

  // Evita di ripetere lo stesso pasto nella stessa settimana (best effort)
  const usedPerCat = {};
  for (const cat of CATEGORIES_LEI) {
    usedPerCat[cat] = [];
  }

  function pickMeal(cat) {
    const pool = options[cat].filter(m => !usedPerCat[cat].includes(m.id));
    if (pool.length === 0) {
      // Tutte usate: resetta
      usedPerCat[cat] = [];
      return options[cat][Math.floor(Math.random() * options[cat].length)];
    }
    const picked = pool[Math.floor(Math.random() * pool.length)];
    usedPerCat[cat].push(picked.id);
    return picked;
  }

  let generated = 0;
  for (let day = 0; day < DAYS; day++) {
    const categories = CATEGORIES_LEI; // includiamo merenda per lei
    for (const cat of categories) {
      if (options[cat].length === 0) continue;
      const meal = pickMeal(cat);
      db.setPlanEntry(week, day, cat, meal.id);
      generated++;
    }
  }

  const entries = db.getWeekPlan(week);
  const status = db.getWeekStatus(week);
  res.json({ week, entries, status, generated });
});

// PUT /api/plan/quantities  — aggiorna quantità per persona in uno slot
router.put('/quantities', (req, res) => {
  const { plan_id, qty_overrides_lui, qty_overrides_lei, plan_kcal_lui, plan_kcal_lei } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'plan_id richiesto' });

  const data = {};
  if (qty_overrides_lui !== undefined)
    data.qty_overrides_lui = qty_overrides_lui !== null ? JSON.stringify(qty_overrides_lui) : null;
  if (qty_overrides_lei !== undefined)
    data.qty_overrides_lei = qty_overrides_lei !== null ? JSON.stringify(qty_overrides_lei) : null;
  if (plan_kcal_lui !== undefined) data.plan_kcal_lui = plan_kcal_lui;
  if (plan_kcal_lei !== undefined) data.plan_kcal_lei = plan_kcal_lei;

  db.updatePlanQuantities(parseInt(plan_id, 10), data);
  res.json({ ok: true });
});

// GET /api/plan/extras?plan_id=X
router.get('/extras', (req, res) => {
  const planId = parseInt(req.query.plan_id, 10);
  if (!planId) return res.status(400).json({ error: 'plan_id richiesto' });
  const extras = db.getPlanExtras(planId);
  res.json(extras);
});

// POST /api/plan/extras
router.post('/extras', (req, res) => {
  const { plan_id, type, ref_id, person, qty, unit } = req.body;
  if (!plan_id || !type || !ref_id || !person || qty == null) {
    return res.status(400).json({ error: 'Campi obbligatori: plan_id, type, ref_id, person, qty' });
  }
  if (!['recipe', 'ingredient'].includes(type)) {
    return res.status(400).json({ error: 'type deve essere recipe o ingredient' });
  }
  if (!['lui', 'lei'].includes(person)) {
    return res.status(400).json({ error: 'person deve essere lui o lei' });
  }
  let extra;
  try {
    extra = db.addPlanExtra(
      parseInt(plan_id, 10), type, parseInt(ref_id, 10),
      person, parseFloat(qty), unit || 'g'
    );
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Extra già presente per questa persona' });
    }
    throw err;
  }
  res.status(201).json(extra);
});

// DELETE /api/plan/extras/:id
router.delete('/extras/:id', (req, res) => {
  const result = db.deletePlanExtra(parseInt(req.params.id, 10));
  if (result.changes === 0) return res.status(404).json({ error: 'Extra non trovato' });
  res.json({ ok: true });
});

// PUT /api/plan/:id  — sostituisci un singolo pasto
router.put('/:id', (req, res) => {
  const { meal_option_id } = req.body;
  if (!meal_option_id) return res.status(400).json({ error: 'meal_option_id richiesto' });

  const meal = db.getMealById(parseInt(meal_option_id, 10));
  if (!meal) return res.status(404).json({ error: 'Pasto non trovato' });

  // Recupera l'entry esistente
  const week = req.body.week;
  const dayOfWeek = req.body.day_of_week;
  const category = req.body.meal_category;

  if (week !== undefined && dayOfWeek !== undefined && category) {
    db.setPlanEntry(week, parseInt(dayOfWeek, 10), category, parseInt(meal_option_id, 10));
  } else {
    // Compatibilità: aggiornamento diretto per ID nella weekly_plan
    db.getDb().prepare('UPDATE weekly_plan SET meal_option_id = ? WHERE id = ?')
      .run(parseInt(meal_option_id, 10), parseInt(req.params.id, 10));
  }

  res.json({ ok: true });
});

// POST /api/plan/confirm  — conferma piano della settimana
router.post('/confirm', (req, res) => {
  const week = req.body.week || db.nextWeekStart();
  db.confirmWeek(week);
  res.json({ ok: true, week, confirmed: true });
});

// GET /api/plan/status?week=...
router.get('/status', (req, res) => {
  const week = req.query.week || db.nextWeekStart();
  const status = db.getWeekStatus(week);
  res.json(status);
});

module.exports = router;
