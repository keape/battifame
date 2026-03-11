'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const NUTRITION_DATA = require('./nutrition_data');

const DB_PATH = path.join(__dirname, '..', 'data', 'battifame.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

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

    CREATE TABLE IF NOT EXISTS weight_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT NOT NULL,
      person     TEXT NOT NULL CHECK (person IN ('lui', 'lei')),
      weight_kg  REAL NOT NULL CHECK (weight_kg > 0),
      UNIQUE(date, person)
    );

    CREATE TABLE IF NOT EXISTS plan_extras (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id  INTEGER NOT NULL REFERENCES weekly_plan(id) ON DELETE CASCADE,
      type     TEXT NOT NULL CHECK(type IN ('recipe', 'ingredient')),
      ref_id   INTEGER NOT NULL,
      person   TEXT NOT NULL CHECK(person IN ('lui', 'lei')),
      qty      REAL NOT NULL DEFAULT 1.0,
      unit     TEXT NOT NULL DEFAULT 'g',
      UNIQUE(plan_id, type, ref_id, person)
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
  if (!cols.includes('qty_base_num')) {
    db.exec("ALTER TABLE meal_ingredients ADD COLUMN qty_base_num REAL DEFAULT 0");
  }

  // Migrazione: aggiungi colonne override quantità a weekly_plan
  const wpCols = db.prepare("PRAGMA table_info(weekly_plan)").all().map(c => c.name);
  if (!wpCols.includes('qty_overrides_lui')) {
    db.exec("ALTER TABLE weekly_plan ADD COLUMN qty_overrides_lui TEXT DEFAULT NULL");
  }
  if (!wpCols.includes('qty_overrides_lei')) {
    db.exec("ALTER TABLE weekly_plan ADD COLUMN qty_overrides_lei TEXT DEFAULT NULL");
  }
  if (!wpCols.includes('plan_kcal_lui')) {
    db.exec("ALTER TABLE weekly_plan ADD COLUMN plan_kcal_lui INTEGER DEFAULT NULL");
  }
  if (!wpCols.includes('plan_kcal_lei')) {
    db.exec("ALTER TABLE weekly_plan ADD COLUMN plan_kcal_lei INTEGER DEFAULT NULL");
  }

  // Migrazione plan_extras: unit NOT NULL + UNIQUE(plan_id, type, ref_id, person)
  const peColInfo = db.prepare("PRAGMA table_info(plan_extras)").all();
  const peUnitCol = peColInfo.find(c => c.name === 'unit');
  if (peUnitCol && peUnitCol.notnull === 0) {
    // Ricrea la tabella con il vincolo NOT NULL su unit
    db.exec(`
      BEGIN;
      ALTER TABLE plan_extras RENAME TO plan_extras_old;
      CREATE TABLE plan_extras (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id  INTEGER NOT NULL REFERENCES weekly_plan(id) ON DELETE CASCADE,
        type     TEXT NOT NULL CHECK(type IN ('recipe', 'ingredient')),
        ref_id   INTEGER NOT NULL,
        person   TEXT NOT NULL CHECK(person IN ('lui', 'lei')),
        qty      REAL NOT NULL DEFAULT 1.0,
        unit     TEXT NOT NULL DEFAULT 'g',
        UNIQUE(plan_id, type, ref_id, person)
      );
      INSERT OR IGNORE INTO plan_extras SELECT id, plan_id, type, ref_id, person, qty, COALESCE(unit, 'g') FROM plan_extras_old;
      DROP TABLE plan_extras_old;
      COMMIT;
    `);
    console.log('[DB] Migrazione plan_extras: unit NOT NULL + UNIQUE constraint applicati.');
  } else {
    // Assicura che l'indice UNIQUE esista anche se la tabella era già corretta
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS uq_plan_extras ON plan_extras(plan_id, type, ref_id, person)");
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

/** Ricalcola e aggiorna i valori nutrizionali del pasto a partire dalla qty base degli ingredienti. */
function calculateAndUpdateNutrition(mealOptionId) {
  const ingredients = getIngredients(mealOptionId);
  let kcal = 0, protein = 0, carbs = 0, fats = 0;
  const desc = [];

  for (const ing of ingredients) {
    const n = getIngredientNutrition(ing.ingredient);
    const qBase = parseFloat(ing.qty_base_num) || 0;
    const weightPz = n ? n.weight_per_piece : 100;

    if (qBase > 0) {
      const grams = ing.unit === 'pz' ? qBase * weightPz : qBase;
      if (n) {
        kcal    += n.kcal_per_100    * grams / 100;
        protein += n.protein_per_100 * grams / 100;
        carbs   += n.carbs_per_100   * grams / 100;
        fats    += n.fats_per_100    * grams / 100;
      }
      const label = ing.unit === 'pz'
        ? `${qBase} ${ing.ingredient}`
        : `${qBase}${ing.unit} ${ing.ingredient}`;
      desc.push(label);
    }
  }

  kcal    = Math.round(kcal);
  protein = Math.round(protein * 10) / 10;
  carbs   = Math.round(carbs   * 10) / 10;
  fats    = Math.round(fats    * 10) / 10;
  const qtyDesc = desc.join(', ');

  getDb().prepare(`
    UPDATE meal_options SET
      kcal_lui = @kcal, protein_lui = @protein,
      carbs_lui = @carbs, fats_lui = @fats,
      qty_description_lui = @qtyDesc,
      kcal_lei = @kcal, protein_lei = @protein,
      carbs_lei = @carbs, fats_lei = @fats,
      qty_description_lei = @qtyDesc
    WHERE id = @id
  `).run({ kcal, protein, carbs, fats, qtyDesc, id: mealOptionId });

  return { kcal_lui: kcal, kcal_lei: kcal };
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
    'INSERT INTO meal_ingredients (meal_option_id, ingredient, unit, qty_base_num) VALUES (?, ?, ?, ?)'
  );
  for (const ing of ingredients) {
    const qBase = parseFloat(ing.qty_base_num) || 0;
    insert.run(mealOptionId, ing.ingredient, ing.unit || 'g', qBase);
  }
}

// ─── WEEKLY PLAN ─────────────────────────────────────────────────────────────

function getWeekPlan(weekStart) {
  return getDb().prepare(`
    SELECT wp.id, wp.week_start, wp.day_of_week, wp.meal_category, wp.meal_option_id,
           wp.qty_overrides_lui, wp.qty_overrides_lei, wp.plan_kcal_lui, wp.plan_kcal_lei,
           mo.name, mo.category,
           mo.kcal_lui AS base_kcal_lui, mo.kcal_lei AS base_kcal_lei,
           mo.qty_description_lui, mo.qty_description_lei,
           (SELECT json_group_array(json_object(
               'ingredient', mi.ingredient,
               'qty_base_num', mi.qty_base_num,
               'unit', mi.unit
           )) FILTER (WHERE mi.id IS NOT NULL)
            FROM meal_ingredients mi WHERE mi.meal_option_id = wp.meal_option_id) AS ingredients_json,
           (SELECT json_group_array(json_object(
               'id', pe.id,
               'type', pe.type,
               'ref_id', pe.ref_id,
               'person', pe.person,
               'qty', pe.qty,
               'unit', pe.unit,
               'name', CASE pe.type
                 WHEN 'recipe'     THEN (SELECT name FROM meal_options        WHERE id = pe.ref_id)
                 WHEN 'ingredient' THEN (SELECT name FROM ingredient_nutrition WHERE id = pe.ref_id)
               END,
               'kcal_per_100', CASE pe.type
                 WHEN 'ingredient' THEN (SELECT kcal_per_100    FROM ingredient_nutrition WHERE id = pe.ref_id)
                 ELSE NULL
               END,
               'weight_per_piece', CASE pe.type
                 WHEN 'ingredient' THEN (SELECT weight_per_piece FROM ingredient_nutrition WHERE id = pe.ref_id)
                 ELSE NULL
               END,
               'base_kcal_lui', CASE pe.type
                 WHEN 'recipe' THEN (SELECT kcal_lui FROM meal_options WHERE id = pe.ref_id)
                 ELSE NULL
               END,
               'base_kcal_lei', CASE pe.type
                 WHEN 'recipe' THEN (SELECT kcal_lei FROM meal_options WHERE id = pe.ref_id)
                 ELSE NULL
               END
           )) FILTER (WHERE pe.id IS NOT NULL)
            FROM plan_extras pe WHERE pe.plan_id = wp.id) AS extras_json
    FROM weekly_plan wp
    LEFT JOIN meal_options mo ON mo.id = wp.meal_option_id
    WHERE wp.week_start = ?
    ORDER BY wp.day_of_week, wp.meal_category
  `).all(weekStart);
}

function updatePlanQuantities(planId, data) {
  const updates = [];
  const params = [];
  if (data.qty_overrides_lui !== undefined) {
    updates.push('qty_overrides_lui = ?');
    params.push(data.qty_overrides_lui);
  }
  if (data.qty_overrides_lei !== undefined) {
    updates.push('qty_overrides_lei = ?');
    params.push(data.qty_overrides_lei);
  }
  if (data.plan_kcal_lui !== undefined) {
    updates.push('plan_kcal_lui = ?');
    params.push(data.plan_kcal_lui);
  }
  if (data.plan_kcal_lei !== undefined) {
    updates.push('plan_kcal_lei = ?');
    params.push(data.plan_kcal_lei);
  }
  if (!updates.length) return;
  params.push(planId);
  getDb().prepare(`UPDATE weekly_plan SET ${updates.join(', ')} WHERE id = ?`).run(...params);
}

function setPlanEntry(weekStart, dayOfWeek, mealCategory, mealOptionId) {
  getDb().prepare(`
    INSERT INTO weekly_plan (week_start, day_of_week, meal_category, meal_option_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(week_start, day_of_week, meal_category)
    DO UPDATE SET meal_option_id = excluded.meal_option_id,
                  qty_overrides_lui = NULL,
                  qty_overrides_lei = NULL,
                  plan_kcal_lui = NULL,
                  plan_kcal_lei = NULL
  `).run(weekStart, dayOfWeek, mealCategory, mealOptionId);
}

function deletePlanEntry(id) {
  getDb().prepare('DELETE FROM weekly_plan WHERE id = ?').run(id);
}

// ─── PLAN EXTRAS ─────────────────────────────────────────────────────────────

function addPlanExtra(planId, type, refId, person, qty, unit) {
  const r = getDb().prepare(
    'INSERT INTO plan_extras (plan_id, type, ref_id, person, qty, unit) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(planId, type, refId, person, qty, unit || 'g');
  return getDb().prepare('SELECT * FROM plan_extras WHERE id = ?').get(r.lastInsertRowid);
}

function deletePlanExtra(id) {
  return getDb().prepare('DELETE FROM plan_extras WHERE id = ?').run(id);
}

function getPlanExtras(planId) {
  return getDb().prepare(`
    SELECT pe.*,
      CASE pe.type
        WHEN 'recipe'     THEN (SELECT name FROM meal_options       WHERE id = pe.ref_id)
        WHEN 'ingredient' THEN (SELECT name FROM ingredient_nutrition WHERE id = pe.ref_id)
      END AS name,
      CASE pe.type
        WHEN 'recipe'     THEN (SELECT kcal_lui FROM meal_options       WHERE id = pe.ref_id)
        ELSE NULL
      END AS base_kcal_lui,
      CASE pe.type
        WHEN 'recipe'     THEN (SELECT kcal_lei FROM meal_options       WHERE id = pe.ref_id)
        ELSE NULL
      END AS base_kcal_lei,
      CASE pe.type
        WHEN 'ingredient' THEN (SELECT kcal_per_100       FROM ingredient_nutrition WHERE id = pe.ref_id)
        ELSE NULL
      END AS kcal_per_100,
      CASE pe.type
        WHEN 'ingredient' THEN (SELECT weight_per_piece FROM ingredient_nutrition WHERE id = pe.ref_id)
        ELSE NULL
      END AS weight_per_piece
    FROM plan_extras pe
    WHERE pe.plan_id = ?
    ORDER BY pe.id
  `).all(planId);
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
    SELECT ingredient, unit
    FROM (
      -- Ingredienti delle ricette principali
      SELECT mi.ingredient, mi.unit
      FROM weekly_plan wp
      JOIN meal_options mo ON mo.id = wp.meal_option_id
      JOIN meal_ingredients mi ON mi.meal_option_id = mo.id
      WHERE wp.week_start = ?
        AND mi.qty_base_num > 0

      UNION

      -- Ingredienti di ricette extra (type='recipe')
      SELECT mi2.ingredient, mi2.unit
      FROM weekly_plan wp2
      JOIN plan_extras pe ON pe.plan_id = wp2.id AND pe.type = 'recipe'
      JOIN meal_ingredients mi2 ON mi2.meal_option_id = pe.ref_id
      WHERE wp2.week_start = ?
        AND mi2.qty_base_num > 0

      UNION

      -- Alimenti singoli extra (type='ingredient')
      SELECT ing.name AS ingredient, pe2.unit
      FROM weekly_plan wp3
      JOIN plan_extras pe2 ON pe2.plan_id = wp3.id AND pe2.type = 'ingredient'
      JOIN ingredient_nutrition ing ON ing.id = pe2.ref_id
      WHERE wp3.week_start = ?
    )
    GROUP BY ingredient, unit
    ORDER BY ingredient
  `).all(weekStart, weekStart, weekStart);
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

// ─── STATS: PESO ─────────────────────────────────────────────────────────────

function listWeightLogs(person, from, to) {
  return getDb().prepare(
    `SELECT id, date, weight_kg FROM weight_logs
     WHERE person = ? AND date BETWEEN ? AND ?
     ORDER BY date ASC`
  ).all(person, from, to);
}

function upsertWeightLog(date, person, weight_kg) {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO weight_logs (date, person, weight_kg) VALUES (?, ?, ?)`
  ).run(date, person, weight_kg);
  return db.prepare(
    `SELECT * FROM weight_logs WHERE date = ? AND person = ?`
  ).get(date, person);
}

function deleteWeightLog(id) {
  getDb().prepare(`DELETE FROM weight_logs WHERE id = ?`).run(id);
}

// ─── STATS: CALORIE ───────────────────────────────────────────────────────────

function getCaloriesByDay(person, from, to) {
  const col = person === 'lui' ? 'plan_kcal_lui' : 'plan_kcal_lei';
  return getDb().prepare(
    `SELECT
       DATE(week_start, '+' || day_of_week || ' days') AS day_date,
       SUM(${col}) AS total_kcal
     FROM weekly_plan
     WHERE DATE(week_start, '+' || day_of_week || ' days') BETWEEN ? AND ?
       AND ${col} IS NOT NULL AND ${col} > 0
     GROUP BY day_date
     ORDER BY day_date ASC`
  ).all(from, to);
}

module.exports = {
  getDb,
  getMeals, getMealById, createMeal, updateMeal, deleteMeal,
  getIngredients, replaceIngredients,
  getIngredientNutrition, listIngredients, calculateAndUpdateNutrition,
  getIngredientById, createIngredientNutrition, updateIngredientNutrition, deleteIngredientNutrition,
  getWeekPlan, setPlanEntry, deletePlanEntry, getWeeksWithPlan, updatePlanQuantities,
  addPlanExtra, deletePlanExtra, getPlanExtras,
  getWeekStatus, confirmWeek, markShoppingSent,
  getShoppingList,
  getSetting, getAllSettings, setSetting, setSettings,
  currentWeekStart, nextWeekStart,
  listWeightLogs, upsertWeightLog, deleteWeightLog,
  getCaloriesByDay,
};
