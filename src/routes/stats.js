'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../database');

// GET /api/stats/weight?person=lui&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/weight', (req, res) => {
  const { person, from, to } = req.query;
  if (!person || !['lui', 'lei'].includes(person)) {
    return res.status(400).json({ error: 'Parametro person obbligatorio (lui|lei)' });
  }
  if (!from || !to) {
    return res.status(400).json({ error: 'Parametri from e to obbligatori (YYYY-MM-DD)' });
  }
  res.json(db.listWeightLogs(person, from, to));
});

// POST /api/stats/weight  body: { date, person, weight_kg }
router.post('/weight', (req, res) => {
  const { date, person, weight_kg } = req.body;
  if (!date || !person || weight_kg == null) {
    return res.status(400).json({ error: 'date, person e weight_kg obbligatori' });
  }
  if (!['lui', 'lei'].includes(person)) {
    return res.status(400).json({ error: 'person deve essere "lui" o "lei"' });
  }
  const kg = parseFloat(weight_kg);
  if (!kg || kg <= 0 || kg > 500) {
    return res.status(400).json({ error: 'Peso non valido' });
  }
  const entry = db.upsertWeightLog(date, person, kg);
  res.status(201).json(entry);
});

// DELETE /api/stats/weight/:id
router.delete('/weight/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'ID non valido' });
  db.deleteWeightLog(id);
  res.json({ ok: true });
});

// GET /api/stats/calories?person=lui&from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/calories', (req, res) => {
  const { person, from, to } = req.query;
  if (!person || !['lui', 'lei'].includes(person)) {
    return res.status(400).json({ error: 'Parametro person obbligatorio (lui|lei)' });
  }
  if (!from || !to) {
    return res.status(400).json({ error: 'Parametri from e to obbligatori (YYYY-MM-DD)' });
  }
  res.json(db.getCaloriesByDay(person, from, to));
});

module.exports = router;
