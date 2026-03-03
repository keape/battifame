'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const NUTRITION_DATA = require('./nutrition_data');

const DB_PATH = path.join(__dirname, '..', 'data', 'battifame.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meal_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('colazione','spuntino','pranzo','merenda','cena')),
      description TEXT DEFAULT '',
      kcal_lui INTEGER DEFAULT 0,
      protein_lui REAL DEFAULT 0,
      carbs_lui REAL DEFAULT 0,
      fats_lui REAL DEFAULT 0,
      qty_description_lui TEXT DEFAULT '',
      kcal_lei INTEGER DEFAULT 0,
      protein_lei REAL DEFAULT 0,
      carbs_lei REAL DEFAULT 0,
      fats_lei REAL DEFAULT 0,
      qty_description_lei TEXT DEFAULT '',
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS meal_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_option_id INTEGER NOT NULL REFERENCES meal_options(id) ON DELETE CASCADE,
      ingredient TEXT NOT NULL,
      qty_lui TEXT DEFAULT '',
      qty_lei TEXT DEFAULT '',
      unit TEXT DEFAULT 'g'
    );

    CREATE TABLE IF NOT EXISTS ingredient_nutrition (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      kcal_per_100 REAL DEFAULT 0,
      protein_per_100 REAL DEFAULT 0,
      carbs_per_100 REAL DEFAULT 0,
      fats_per_100 REAL DEFAULT 0,
      weight_per_piece REAL DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS weekly_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start TEXT NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      meal_category TEXT NOT NULL CHECK(meal_category IN ('colazione','spuntino','pranzo','merenda','cena')),
      meal_option_id INTEGER REFERENCES meal_options(id),
      UNIQUE(week_start, day_of_week, meal_category)
    );

    CREATE TABLE IF NOT EXISTS week_status (
      week_start TEXT PRIMARY KEY,
      confirmed INTEGER DEFAULT 0,
      shopping_sent INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );
  `);

  // Migrazione: aggiungi colonne numeriche a meal_ingredients se non esistono
  const cols = db.prepare("PRAGMA table_info(meal_ingredients)").all().map(c => c.name);
  if (!cols.includes('qty_lui_num')) {
    db.exec("ALTER TABLE meal_ingredients ADD COLUMN qty_lui_num REAL DEFAULT 0");
  }
  if (!cols.includes('qty_lei_num')) {
    db.exec("ALTER TABLE meal_ingredients ADD COLUMN qty_lei_num REAL DEFAULT 0");
  }

  // Seed ingredient_nutrition se vuoto
  const ingCount = db.prepare('SELECT COUNT(*) as c FROM ingredient_nutrition').get();
  if (ingCount.c === 0) {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO ingredient_nutrition (name, kcal_per_100, protein_per_100, carbs_per_100, fats_per_100, weight_per_piece) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const n of NUTRITION_DATA) {
      insert.run(n.name, n.kcal, n.protein, n.carbs, n.fats, n.weight_pz || 100);
    }
    console.log('[DB] Tabella ingredient_nutrition popolata con', NUTRITION_DATA.length, 'ingredienti.');
  }

  // Impostazioni di default
  const defaultSettings = [
    ['email_lui', ''],
    ['email_lei', ''],
    ['smtp_host', 'smtp.gmail.com'],
    ['smtp_port', '587'],
    ['smtp_user', ''],
    ['smtp_pass', ''],
    ['nome_lui', 'Lui'],
    ['nome_lei', 'Lei'],
  ];
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }
}

// ─── INGREDIENT NUTRITION ─────────────────────────────────────────────────────

function getIngredientNutrition(name) {
  return getDb().prepare(
    'SELECT * FROM ingredient_nutrition WHERE name = ? COLLATE NOCASE'
  ).get(name);
}

function listIngredients() {
  return getDb().prepare(
    'SELECT * FROM ingredient_nutrition ORDER BY name'
  ).all();
}

function getIngredientById(id) {
  return getDb().prepare('SELECT * FROM ingredient_nutrition WHERE id = ?').get(id);
}

function createIngredientNutrition(data) {
  const r = getDb().prepare(
    'INSERT INTO ingredient_nutrition (name, kcal_per_100, protein_per_100, carbs_per_100, fats_per_100, weight_per_piece) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(
    data.name,
    parseFloat(data.kcal_per_100) || 0,
    parseFloat(data.protein_per_100) || 0,
    parseFloat(data.carbs_per_100) || 0,
    parseFloat(data.fats_per_100) || 0,
    parseFloat(data.weight_per_piece) || 100
  );
  return getIngredientById(r.lastInsertRowid);
}

function updateIngredientNutrition(id, data) {
  getDb().prepare(
    'UPDATE ingredient_nutrition SET name=?, kcal_per_100=?, protein_per_100=?, carbs_per_100=?, fats_per_100=?, weight_per_piece=? WHERE id=?'
  ).run(
    data.name,
    parseFloat(data.kcal_per_100) || 0,
    parseFloat(data.protein_per_100) || 0,
    parseFloat(data.carbs_per_100) || 0,
    parseFloat(data.fats_per_100) || 0,
    parseFloat(data.weight_per_piece) || 100,
    id
  );
  return getIngredientById(id);
}

function deleteIngredientNutrition(id) {
  return getDb().prepare('DELETE FROM ingredient_nutrition WHERE id = ?').run(id);
}

/** Ricalcola e aggiorna i valori nutrizionali del pasto a partire dagli ingredienti. */
function calculateAndUpdateNutrition(mealOptionId) {
  const ingredients = getIngredients(mealOptionId);
  let t = { kcal_lui: 0, protein_lui: 0, carbs_lui: 0, fats_lui: 0,
            kcal_lei: 0, protein_lei: 0, carbs_lei: 0, fats_lei: 0 };
  const descLui = [], descLei = [];

  for (const ing of ingredients) {
    const n = getIngredientNutrition(ing.ingredient);
    const qLui = parseFloat(ing.qty_lui_num) || 0;
    const qLei = parseFloat(ing.qty_lei_num) || 0;
    const weightPz = n ? n.weight_per_piece : 100;

    if (qLui > 0) {
      const gLui = ing.unit === 'pz' ? qLui * weightPz : qLui;
      if (n) {
        t.kcal_lui    += n.kcal_per_100    * gLui / 100;
        t.protein_lui += n.protein_per_100 * gLui / 100;
        t.carbs_lui   += n.carbs_per_100   * gLui / 100;
        t.fats_lui    += n.fats_per_100    * gLui / 100;
      }
      const label = ing.unit === 'pz'
        ? `${qLui} ${ing.ingredient}`
        : `${qLui}${ing.unit} ${ing.ingredient}`;
      descLui.push(label);
    }

    if (qLei > 0) {
      const gLei = ing.unit === 'pz' ? qLei * weightPz : qLei;
      if (n) {
        t.kcal_lei    += n.kcal_per_100    * gLei / 100;
        t.protein_lei += n.protein_per_100 * gLei / 100;
        t.carbs_lei   += n.carbs_per_100   * gLei / 100;
        t.fats_lei    += n.fats_per_100    * gLei / 100;
      }
      const label = ing.unit === 'pz'
        ? `${qLei} ${ing.ingredient}`
        : `${qLei}${ing.unit} ${ing.ingredient}`;
      descLei.push(label);
    }
  }

  // Arrotondamento
  t.kcal_lui    = Math.round(t.kcal_lui);
  t.protein_lui = Math.round(t.protein_lui * 10) / 10;
  t.carbs_lui   = Math.round(t.carbs_lui   * 10) / 10;
  t.fats_lui    = Math.round(t.fats_lui    * 10) / 10;
  t.kcal_lei    = Math.round(t.kcal_lei);
  t.protein_lei = Math.round(t.protein_lei * 10) / 10;
  t.carbs_lei   = Math.round(t.carbs_lei   * 10) / 10;
  t.fats_lei    = Math.round(t.fats_lei    * 10) / 10;

  getDb().prepare(`
    UPDATE meal_options SET
      kcal_lui = @kcal_lui, protein_lui = @protein_lui,
      carbs_lui = @carbs_lui, fats_lui = @fats_lui,
      qty_description_lui = @qty_description_lui,
      kcal_lei = @kcal_lei, protein_lei = @protein_lei,
      carbs_lei = @carbs_lei, fats_lei = @fats_lei,
      qty_description_lei = @qty_description_lei
    WHERE id = @id
  `).run({
    ...t,
    qty_description_lui: descLui.join(', '),
    qty_description_lei: descLei.join(', '),
    id: mealOptionId,
  });

  return t;
}

// ─── MEAL OPTIONS ────────────────────────────────────────────────────────────

function getMeals(category) {
  const d = getDb();
  if (category) {
    return d.prepare('SELECT * FROM meal_options WHERE category = ? AND active = 1 ORDER BY name').all(category);
  }
  return d.prepare('SELECT * FROM meal_options WHERE active = 1 ORDER BY category, name').all();
}

function getMealById(id) {
  return getDb().prepare('SELECT * FROM meal_options WHERE id = ?').get(id);
}

function createMeal(data) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO meal_options
      (name, category, description,
       kcal_lui, protein_lui, carbs_lui, fats_lui, qty_description_lui,
       kcal_lei, protein_lei, carbs_lei, fats_lei, qty_description_lei)
    VALUES
      (@name, @category, @description,
       @kcal_lui, @protein_lui, @carbs_lui, @fats_lui, @qty_description_lui,
       @kcal_lei, @protein_lei, @carbs_lei, @fats_lei, @qty_description_lei)
  `);
  const result = stmt.run({
    name: data.name, category: data.category, description: data.description || '',
    kcal_lui: 0, protein_lui: 0, carbs_lui: 0, fats_lui: 0, qty_description_lui: '',
    kcal_lei: 0, protein_lei: 0, carbs_lei: 0, fats_lei: 0, qty_description_lei: '',
  });
  return getMealById(result.lastInsertRowid);
}

function updateMeal(id, data) {
  const d = getDb();
  d.prepare(`
    UPDATE meal_options SET
      name = @name, category = @category, description = @description
    WHERE id = @id
  `).run({ name: data.name, category: data.category, description: data.description || '', id });
  return getMealById(id);
}

function deleteMeal(id) {
  getDb().prepare('UPDATE meal_options SET active = 0 WHERE id = ?').run(id);
}

// ─── INGREDIENTS ─────────────────────────────────────────────────────────────

function getIngredients(mealOptionId) {
  return getDb().prepare('SELECT * FROM meal_ingredients WHERE meal_option_id = ?').all(mealOptionId);
}

function replaceIngredients(mealOptionId, ingredients) {
  const d = getDb();
  d.prepare('DELETE FROM meal_ingredients WHERE meal_option_id = ?').run(mealOptionId);
  const insert = d.prepare(
    'INSERT INTO meal_ingredients (meal_option_id, ingredient, qty_lui, qty_lei, unit, qty_lui_num, qty_lei_num) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  for (const ing of ingredients) {
    const qLuiNum = parseFloat(ing.qty_lui_num) || 0;
    const qLeiNum = parseFloat(ing.qty_lei_num) || 0;
    const qLui = ing.qty_lui || (qLuiNum > 0 ? `${qLuiNum}${ing.unit || 'g'}` : '');
    const qLei = ing.qty_lei || (qLeiNum > 0 ? `${qLeiNum}${ing.unit || 'g'}` : '');
    insert.run(mealOptionId, ing.ingredient, qLui, qLei, ing.unit || 'g', qLuiNum, qLeiNum);
  }
}

// ─── WEEKLY PLAN ─────────────────────────────────────────────────────────────

function getWeekPlan(weekStart) {
  return getDb().prepare(`
    SELECT wp.*, mo.name, mo.category,
           mo.kcal_lui, mo.qty_description_lui,
           mo.kcal_lei, mo.qty_description_lei
    FROM weekly_plan wp
    LEFT JOIN meal_options mo ON mo.id = wp.meal_option_id
    WHERE wp.week_start = ?
    ORDER BY wp.day_of_week, wp.meal_category
  `).all(weekStart);
}

function setPlanEntry(weekStart, dayOfWeek, mealCategory, mealOptionId) {
  getDb().prepare(`
    INSERT INTO weekly_plan (week_start, day_of_week, meal_category, meal_option_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(week_start, day_of_week, meal_category)
    DO UPDATE SET meal_option_id = excluded.meal_option_id
  `).run(weekStart, dayOfWeek, mealCategory, mealOptionId);
}

function deletePlanEntry(id) {
  getDb().prepare('DELETE FROM weekly_plan WHERE id = ?').run(id);
}

function getWeeksWithPlan() {
  return getDb().prepare(
    'SELECT DISTINCT week_start FROM weekly_plan ORDER BY week_start DESC'
  ).all().map(r => r.week_start);
}

// ─── WEEK STATUS ─────────────────────────────────────────────────────────────

function getWeekStatus(weekStart) {
  const d = getDb();
  let row = d.prepare('SELECT * FROM week_status WHERE week_start = ?').get(weekStart);
  if (!row) {
    d.prepare('INSERT OR IGNORE INTO week_status (week_start) VALUES (?)').run(weekStart);
    row = d.prepare('SELECT * FROM week_status WHERE week_start = ?').get(weekStart);
  }
  return row;
}

function confirmWeek(weekStart) {
  const d = getDb();
  d.prepare('INSERT OR IGNORE INTO week_status (week_start) VALUES (?)').run(weekStart);
  d.prepare('UPDATE week_status SET confirmed = 1 WHERE week_start = ?').run(weekStart);
}

function markShoppingSent(weekStart) {
  getDb().prepare('UPDATE week_status SET shopping_sent = 1 WHERE week_start = ?').run(weekStart);
}

// ─── SHOPPING LIST ───────────────────────────────────────────────────────────

function getShoppingList(weekStart) {
  return getDb().prepare(`
    SELECT mi.ingredient, mi.unit,
           GROUP_CONCAT(mi.qty_lui, '|') AS qtys_lui,
           GROUP_CONCAT(mi.qty_lei, '|') AS qtys_lei
    FROM weekly_plan wp
    JOIN meal_options mo ON mo.id = wp.meal_option_id
    JOIN meal_ingredients mi ON mi.meal_option_id = mo.id
    WHERE wp.week_start = ?
      AND (mi.qty_lui_num > 0 OR mi.qty_lei_num > 0)
    GROUP BY mi.ingredient, mi.unit
    ORDER BY mi.ingredient
  `).all(weekStart);
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function setSetting(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

function setSettings(obj) {
  const upsert = getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(obj)) {
    upsert.run(key, String(value));
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function currentWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function nextWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day === 0 ? 1 : 8 - day);
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

module.exports = {
  getDb,
  getMeals, getMealById, createMeal, updateMeal, deleteMeal,
  getIngredients, replaceIngredients,
  getIngredientNutrition, listIngredients, calculateAndUpdateNutrition,
  getIngredientById, createIngredientNutrition, updateIngredientNutrition, deleteIngredientNutrition,
  getWeekPlan, setPlanEntry, deletePlanEntry, getWeeksWithPlan,
  getWeekStatus, confirmWeek, markShoppingSent,
  getShoppingList,
  getSetting, getAllSettings, setSetting, setSettings,
  currentWeekStart, nextWeekStart,
};
