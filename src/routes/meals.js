'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/meals/ingredients-list — per autocomplete e calcolo client-side
router.get('/ingredients-list', (req, res) => {
  const list = db.listIngredients();
  res.json(list);
});

// GET /api/meals?category=pranzo
router.get('/', (req, res) => {
  const { category } = req.query;
  const meals = db.getMeals(category || null);
  res.json(meals);
});

// GET /api/meals/:id
router.get('/:id', (req, res) => {
  const meal = db.getMealById(parseInt(req.params.id, 10));
  if (!meal) return res.status(404).json({ error: 'Pasto non trovato' });
  const ingredients = db.getIngredients(meal.id);
  res.json({ ...meal, ingredients });
});

// POST /api/meals
router.post('/', (req, res) => {
  const { ingredients, ...data } = req.body;
  if (!data.name || !data.category) {
    return res.status(400).json({ error: 'Nome e categoria sono obbligatori' });
  }
  const meal = db.createMeal(data);
  if (ingredients && ingredients.length > 0) {
    db.replaceIngredients(meal.id, ingredients);
    db.calculateAndUpdateNutrition(meal.id);
  }
  const result = db.getMealById(meal.id);
  res.status(201).json({ ...result, ingredients: db.getIngredients(meal.id) });
});

// PUT /api/meals/:id
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.getMealById(id);
  if (!existing) return res.status(404).json({ error: 'Pasto non trovato' });
  const { ingredients, ...data } = req.body;
  db.updateMeal(id, data);
  if (ingredients !== undefined) {
    db.replaceIngredients(id, ingredients);
    db.calculateAndUpdateNutrition(id);
  }
  const updated = db.getMealById(id);
  res.json({ ...updated, ingredients: db.getIngredients(id) });
});

// DELETE /api/meals/:id
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.getMealById(id);
  if (!existing) return res.status(404).json({ error: 'Pasto non trovato' });
  db.deleteMeal(id);
  res.json({ ok: true });
});

module.exports = router;
