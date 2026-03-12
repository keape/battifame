'use strict';

const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/ingredients — lista tutti gli ingredienti del database nutrizionale
router.get('/', (req, res) => {
  res.json(db.listIngredients());
});

// GET /api/ingredients/lookup?q=nome — cerca valori nutrizionali su USDA FoodData Central (gratuito, no API key)
router.get('/lookup', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Parametro q obbligatorio' });

  const USDA_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';
  const url = 'https://api.nal.usda.gov/fdc/v1/foods/search' +
    `?query=${encodeURIComponent(q)}&api_key=${USDA_KEY}` +
    '&pageSize=10&dataType=SR%20Legacy,Foundation,Branded';

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await resp.json();
    const foods = data.foods || [];

    for (const food of foods) {
      const n = {};
      for (const fn of (food.foodNutrients || [])) {
        n[fn.nutrientNumber] = fn.value;
      }
      // 208=kcal, 203=proteine, 205=carboidrati, 204=grassi (per 100g)
      if (n['208'] != null) {
        return res.json({
          kcal_per_100:    Math.round(n['208'] || 0),
          protein_per_100: Math.round((n['203'] || 0) * 10) / 10,
          carbs_per_100:   Math.round((n['205'] || 0) * 10) / 10,
          fats_per_100:    Math.round((n['204'] || 0) * 10) / 10,
        });
      }
    }
    res.status(404).json({ error: `Nessun dato trovato per "${q}". Prova in inglese (es. "chicken" invece di "pollo") o inserisci i valori manualmente.` });
  } catch (_) {
    res.status(503).json({ error: 'Servizio non raggiungibile. Controlla la connessione internet.' });
  }
});

// GET /api/ingredients/barcode/:code — cerca prodotto per codice EAN su Open Food Facts
router.get('/barcode/:code', async (req, res) => {
  const code = req.params.code.trim();

  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json` +
    '?fields=product_name,nutriments';

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = await resp.json();

    if (data.status !== 1 || !data.product) {
      return res.status(404).json({ error: 'Prodotto non trovato. Prova la ricerca per nome.' });
    }

    const p = data.product;
    const n = p.nutriments || {};

    if (n['energy-kcal_100g'] == null) {
      return res.status(404).json({ error: 'Valori nutrizionali non disponibili per questo prodotto.' });
    }

    return res.json({
      name:            (p.product_name || '').trim(),
      kcal_per_100:    Math.round(n['energy-kcal_100g']        || 0),
      protein_per_100: Math.round((n['proteins_100g']          || 0) * 10) / 10,
      carbs_per_100:   Math.round((n['carbohydrates_100g']     || 0) * 10) / 10,
      fats_per_100:    Math.round((n['fat_100g']               || 0) * 10) / 10,
    });
  } catch (_) {
    res.status(503).json({ error: 'Servizio non raggiungibile. Controlla la connessione internet.' });
  }
});

// POST /api/ingredients — aggiungi un nuovo ingrediente
router.post('/', (req, res) => {
  const data = req.body;
  if (!data.name || !data.name.trim()) {
    return res.status(400).json({ error: 'Il nome è obbligatorio' });
  }
  try {
    const ing = db.createIngredientNutrition(data);
    res.status(201).json(ing);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `Esiste già un ingrediente con il nome "${data.name}"` });
    }
    throw err;
  }
});

// PUT /api/ingredients/:id — modifica un ingrediente
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.getIngredientById(id);
  if (!existing) return res.status(404).json({ error: 'Ingrediente non trovato' });
  try {
    const updated = db.updateIngredientNutrition(id, req.body);
    res.json(updated);
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: `Esiste già un ingrediente con il nome "${req.body.name}"` });
    }
    throw err;
  }
});

// DELETE /api/ingredients/:id — elimina un ingrediente
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.getIngredientById(id);
  if (!existing) return res.status(404).json({ error: 'Ingrediente non trovato' });
  db.deleteIngredientNutrition(id);
  res.json({ ok: true });
});

module.exports = router;
