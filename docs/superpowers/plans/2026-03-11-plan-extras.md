# Plan Extras Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettere di aggiungere alimenti o ricette extra a uno slot del piano settimanale, con kcal e lista spesa aggiornati di conseguenza.

**Architecture:** Nuova tabella `plan_extras` agganciata a `weekly_plan.id`. Il backend espone 3 endpoint REST per gestirla e aggiorna `getWeekPlan`/`getShoppingList` per includerla. Il frontend aggiunge un pulsante "+ Extra" per slot che apre un mini-modal.

**Tech Stack:** Node.js + Express + better-sqlite3 + Vanilla JS/HTML/CSS

**Spec:** `docs/superpowers/specs/2026-03-11-plan-extras-design.md`

---

## Chunk 1: DB schema + CRUD

**File coinvolti:**
- Modify: `src/database.js`

### Task 1: Aggiungi tabella plan_extras a initSchema()

**Files:**
- Modify: `src/database.js:23-89` (funzione `initSchema`)

- [ ] **Step 1: Aggiungi CREATE TABLE e migrazione in initSchema()**

  In `initSchema()`, subito dopo il blocco `CREATE TABLE IF NOT EXISTS weight_logs ...` (riga ~88), aggiungi:

  ```js
  CREATE TABLE IF NOT EXISTS plan_extras (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id  INTEGER NOT NULL REFERENCES weekly_plan(id) ON DELETE CASCADE,
    type     TEXT NOT NULL CHECK(type IN ('recipe', 'ingredient')),
    ref_id   INTEGER NOT NULL,
    person   TEXT NOT NULL CHECK(person IN ('lui', 'lei')),
    qty      REAL NOT NULL DEFAULT 1.0,
    unit     TEXT DEFAULT 'g'
  );
  ```

  Subito dopo il blocco di migrazione esistente (dopo le ALTER TABLE per weekly_plan, ~riga 116), aggiungi la migrazione per chi ha già il DB:

  ```js
  // Migrazione: crea plan_extras se non esiste (già gestita da CREATE TABLE IF NOT EXISTS)
  // Nessuna ALTER TABLE necessaria — tabella nuova
  ```

  (La `CREATE TABLE IF NOT EXISTS` è già idempotente, nessuna ALTER è necessaria per questa tabella.)

- [ ] **Step 2: Verifica che il server si avvii senza errori**

  ```bash
  cd "/Users/keape/Library/Mobile Documents/com~apple~CloudDocs/app sviluppate e html/BattiFame"
  npm start
  ```

  Atteso: server avviato su porta 3000, nessun errore nel log.

- [ ] **Step 3: Verifica che la tabella esista nel DB**

  ```bash
  node -e "const db = require('./src/database'); console.log(db.getDb().prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='plan_extras'\").get())"
  ```

  Atteso: `{ name: 'plan_extras' }`

- [ ] **Step 4: Commit**

  ```bash
  git add src/database.js
  git commit -m "feat: add plan_extras table to DB schema"
  ```

---

### Task 2: Aggiungi funzioni CRUD per plan_extras

**Files:**
- Modify: `src/database.js` — sezione `// ─── WEEKLY PLAN` (dopo `deletePlanEntry`, ~riga 370)

- [ ] **Step 1: Aggiungi le 3 funzioni CRUD**

  Inserisci subito dopo la funzione `deletePlanEntry`:

  ```js
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
  ```

- [ ] **Step 2: Esporta le nuove funzioni in fondo al file**

  Nel blocco `module.exports` (~riga 498), aggiungi `addPlanExtra, deletePlanExtra, getPlanExtras`:

  ```js
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
  ```

- [ ] **Step 3: Verifica con node**

  ```bash
  node -e "
    const db = require('./src/database');
    // Trova un plan_id valido
    const plans = db.getDb().prepare('SELECT id FROM weekly_plan LIMIT 1').all();
    if (!plans.length) { console.log('Nessun piano — OK, tabella vuota'); process.exit(0); }
    const pid = plans[0].id;
    const extra = db.addPlanExtra(pid, 'ingredient', 1, 'lui', 150, 'g');
    console.log('created:', extra);
    const list = db.getPlanExtras(pid);
    console.log('list:', list);
    db.deletePlanExtra(extra.id);
    console.log('deleted OK');
  "
  ```

  Atteso: oggetto extra stampato con tutti i campi, poi `deleted OK`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/database.js
  git commit -m "feat: add CRUD functions for plan_extras"
  ```

---

### Task 3: Estendi getWeekPlan per includere extras_json

**Files:**
- Modify: `src/database.js:312-329` (funzione `getWeekPlan`)

- [ ] **Step 1: Aggiungi subquery extras_json alla SELECT**

  La query attuale seleziona `ingredients_json` come subquery. Aggiungi analogamente `extras_json`.

  **Nota SQLite:** `json_group_array` senza `FILTER` restituisce `[null]` quando non ci sono righe. Usa `FILTER (WHERE ... IS NOT NULL)` per entrambe le subquery.

  ```js
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
  ```

- [ ] **Step 2: Test endpoint GET /api/plan**

  Con il server attivo:

  ```bash
  curl -s "http://localhost:3000/api/plan?week=$(date +%Y-%m-%d)" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      const r=JSON.parse(d);
      const e=r.entries[0];
      console.log('extras_json field present:', 'extras_json' in e || Object.keys(e));
    });
  "
  ```

  Atteso: `extras_json` presente nelle entry (può essere `null` se non ci sono extra).

- [ ] **Step 3: Commit**

  ```bash
  git add src/database.js
  git commit -m "feat: include extras_json in getWeekPlan response"
  ```

---

### Task 4: Estendi getShoppingList per includere gli extra

**Files:**
- Modify: `src/database.js:402-413` (funzione `getShoppingList`)

- [ ] **Step 1: Aggiungi UNION per gli extra**

  **Nota SQL:** Il `GROUP BY` e `ORDER BY` finali si applicano all'intero risultato della UNION solo se la UNION è avvolta in una subquery. La struttura corretta è `SELECT ... FROM (UNION ...) GROUP BY ... ORDER BY ...`.

  ```js
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
  ```

- [ ] **Step 2: Verifica endpoint spesa**

  ```bash
  curl -s "http://localhost:3000/api/shopping?week=$(date +%Y-%m-%d)" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      const r=JSON.parse(d);
      console.log('items count:', r.items.length, '— OK');
    });
  "
  ```

  Atteso: risposta JSON con `items` (stessa struttura di prima, nessun errore).

- [ ] **Step 3: Commit**

  ```bash
  git add src/database.js
  git commit -m "feat: include plan_extras in shopping list aggregation"
  ```

---

## Chunk 2: Backend API

**File coinvolti:**
- Modify: `src/routes/planner.js`

### Task 5: Aggiungi i 3 endpoint REST per plan_extras

**Files:**
- Modify: `src/routes/planner.js`

- [ ] **Step 1: Aggiungi i 3 endpoint PRIMA della route `PUT /:id` (riga ~80)**

  Inserisci subito dopo `PUT /api/plan/quantities` (~riga 78) e prima di `PUT /:id`:

  ```js
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
    const extra = db.addPlanExtra(
      parseInt(plan_id, 10), type, parseInt(ref_id, 10),
      person, parseFloat(qty), unit || 'g'
    );
    res.status(201).json(extra);
  });

  // DELETE /api/plan/extras/:id
  router.delete('/extras/:id', (req, res) => {
    db.deletePlanExtra(parseInt(req.params.id, 10));
    res.json({ ok: true });
  });
  ```

  **Attenzione:** queste 3 route devono stare PRIMA di `router.put('/:id', ...)` altrimenti Express interpreterebbe `/extras` come un ID.

- [ ] **Step 2: Verifica che le route siano nell'ordine corretto**

  Nel file `src/routes/planner.js` l'ordine deve essere:
  1. `GET /` — lista piano
  2. `POST /generate`
  3. `PUT /quantities`
  4. `GET /extras` ← nuovo
  5. `POST /extras` ← nuovo
  6. `DELETE /extras/:id` ← nuovo
  7. `PUT /:id`
  8. `POST /confirm`
  9. `GET /status`

- [ ] **Step 3: Test POST /api/plan/extras**

  Prima trova un plan_id valido dal piano corrente:

  ```bash
  PLAN_ID=$(curl -s "http://localhost:3000/api/plan?week=$(date +%Y-%m-%d)" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).entries[0]?.id || 'nessuno'))")
  echo "plan_id: $PLAN_ID"
  ```

  Poi aggiungi un extra ingrediente (id=1 = primo ingrediente disponibile):

  ```bash
  curl -s -X POST http://localhost:3000/api/plan/extras \
    -H "Content-Type: application/json" \
    -d "{\"plan_id\":$PLAN_ID,\"type\":\"ingredient\",\"ref_id\":1,\"person\":\"lui\",\"qty\":150,\"unit\":\"g\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const r=JSON.parse(d);console.log(r);})"
  ```

  Atteso: oggetto extra con `id` assegnato.

- [ ] **Step 4: Test GET /api/plan/extras**

  ```bash
  curl -s "http://localhost:3000/api/plan/extras?plan_id=$PLAN_ID" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)))"
  ```

  Atteso: array con l'extra appena creato (con `name` e valori nutrizionali).

- [ ] **Step 5: Test DELETE /api/plan/extras/:id**

  ```bash
  EXTRA_ID=$(curl -s "http://localhost:3000/api/plan/extras?plan_id=$PLAN_ID" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0]?.id))")
  curl -s -X DELETE "http://localhost:3000/api/plan/extras/$EXTRA_ID"
  ```

  Atteso: `{"ok":true}`

- [ ] **Step 6: Verifica che GET /api/plan includa extras_json**

  ```bash
  curl -s "http://localhost:3000/api/plan?week=$(date +%Y-%m-%d)" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c).on('end',()=>{
      const e = JSON.parse(d).entries[0];
      console.log('has extras_json:', 'extras_json' in e);
    });
  "
  ```

  Atteso: `has extras_json: true`

- [ ] **Step 7: Commit**

  ```bash
  git add src/routes/planner.js
  git commit -m "feat: add REST endpoints for plan_extras (GET/POST/DELETE)"
  ```

---

## Chunk 3: Frontend CSS

**File coinvolti:**
- Modify: `public/style.css`

### Task 6: Aggiungi stili per extra nella card e mini-modal

**Files:**
- Modify: `public/style.css` — aggiungi in fondo al file

- [ ] **Step 1: Aggiungi le regole CSS**

  In fondo a `public/style.css`:

  ```css
  /* ─── PLAN EXTRAS ────────────────────────────────────────────────────────── */
  .extras-list {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .extra-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-muted);
    background: var(--green-xpale);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 3px 8px;
  }

  .extra-item-name { flex: 1; font-weight: 500; }
  .extra-item-kcal { color: var(--green-dark); font-size: 11px; }
  .extra-item-remove {
    background: none;
    border: none;
    cursor: pointer;
    color: #c62828;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
  }

  .btn-add-extra {
    margin-top: 8px;
    width: 100%;
    background: none;
    border: 1px dashed var(--green-light);
    border-radius: var(--radius-sm);
    color: var(--green-mid);
    font-size: 12px;
    padding: 4px 8px;
    cursor: pointer;
  }
  .btn-add-extra:hover { background: var(--green-pale); }

  /* Mini-modal extra */
  .extra-modal-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.45);
    z-index: 300;
    align-items: center;
    justify-content: center;
  }
  .extra-modal-overlay.open { display: flex; }

  .extra-modal {
    background: var(--surface);
    border-radius: var(--radius-lg);
    padding: 20px;
    width: min(360px, 94vw);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .extra-modal h3 { font-size: 16px; color: var(--green-dark); }

  .extra-modal-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .extra-modal-row label { font-size: 13px; font-weight: 600; color: var(--text-muted); }

  .extra-toggle-group {
    display: flex;
    gap: 8px;
  }
  .extra-toggle-group button {
    flex: 1;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--green-xpale);
    cursor: pointer;
    font-size: 13px;
  }
  .extra-toggle-group button.active {
    background: var(--green-dark);
    color: #fff;
    border-color: var(--green-dark);
  }

  .extra-modal input[type=text],
  .extra-modal input[type=number] {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
  }

  .extra-qty-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .extra-qty-row input { flex: 1; }
  .extra-qty-row select {
    padding: 7px 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 14px;
  }

  .extra-modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .extra-search-results {
    max-height: 160px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    display: none;
  }
  .extra-search-results.open { display: block; }

  .extra-search-item {
    padding: 8px 10px;
    cursor: pointer;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
  }
  .extra-search-item:last-child { border-bottom: none; }
  .extra-search-item:hover { background: var(--green-pale); }
  .extra-search-item-name { font-weight: 500; }
  .extra-search-item-meta { font-size: 11px; color: var(--text-muted); }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add public/style.css
  git commit -m "feat: add CSS styles for plan extras list and modal"
  ```

---

## Chunk 4: Frontend JS

**File coinvolti:**
- Modify: `public/app.js`
- Modify: `public/index.html` — aggiungere il markup del mini-modal

### Task 7: Aggiungi il markup del mini-modal in index.html

**Files:**
- Modify: `public/index.html` — subito prima del tag `</body>`

- [ ] **Step 1: Aggiungi il mini-modal HTML**

  Subito prima del `</body>` (in fondo al file, dopo gli altri modal esistenti):

  ```html
  <!-- EXTRA MODAL -->
  <div class="extra-modal-overlay" id="extraModalOverlay">
    <div class="extra-modal">
      <h3>Aggiungi extra</h3>

      <div class="extra-modal-row">
        <label>Per chi?</label>
        <div class="extra-toggle-group" id="extraPersonGroup">
          <button data-val="lui" class="active">👨 Lui</button>
          <button data-val="lei">👩 Lei</button>
        </div>
      </div>

      <div class="extra-modal-row">
        <label>Tipo</label>
        <div class="extra-toggle-group" id="extraTypeGroup">
          <button data-val="ingredient" class="active">Alimento</button>
          <button data-val="recipe">Ricetta</button>
        </div>
      </div>

      <div class="extra-modal-row">
        <label>Cerca</label>
        <input type="text" id="extraSearchInput" placeholder="Cerca alimento o ricetta..." autocomplete="off">
        <div class="extra-search-results" id="extraSearchResults"></div>
      </div>

      <div class="extra-modal-row" id="extraQtyRow">
        <label id="extraQtyLabel">Quantità</label>
        <div class="extra-qty-row">
          <input type="number" id="extraQtyInput" min="0.1" step="0.1" value="100" placeholder="100">
          <select id="extraUnitSelect">
            <option value="g">g</option>
            <option value="ml">ml</option>
            <option value="pz">pz</option>
          </select>
        </div>
      </div>

      <div class="extra-modal-actions">
        <button class="btn btn-secondary" id="extraModalCancel">Annulla</button>
        <button class="btn btn-primary" id="extraModalConfirm" disabled>Aggiungi</button>
      </div>
    </div>
  </div>
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add public/index.html
  git commit -m "feat: add extra modal HTML markup"
  ```

---

### Task 8: Aggiungi logica extra in app.js

**Files:**
- Modify: `public/app.js`

Tutte le modifiche a `app.js` sono in questo task, eseguite in ordine.

#### 8a — Parse extras in renderPiano()

- [ ] **Step 1: Nel loop di pre-processing in `renderPiano()` (~riga 167-171), aggiungi il parse di `extras_json`**

  ```js
  // Prima (esistente):
  e._ingredients = e.ingredients_json ? JSON.parse(e.ingredients_json) : [];
  e._overrides_lui = e.qty_overrides_lui ? JSON.parse(e.qty_overrides_lui) : {};
  e._overrides_lei = e.qty_overrides_lei ? JSON.parse(e.qty_overrides_lei) : {};

  // Aggiungi dopo:
  e._extras = e.extras_json ? JSON.parse(e.extras_json) : [];
  ```

#### 8b — Helper calcolo kcal extra

- [ ] **Step 2: Aggiungi la funzione `calcExtraKcal()` subito prima di `renderMealRow()` (~riga 250)**

  ```js
  function calcExtraKcal(extra, person) {
    if (extra.type === 'recipe') {
      const base = person === 'lui' ? (extra.base_kcal_lui || 0) : (extra.base_kcal_lei || 0);
      return Math.round(base * extra.qty);
    } else {
      // type='ingredient': qty in g/ml oppure pz
      const kcalPer100 = extra.kcal_per_100 || 0;
      const grams = extra.unit === 'pz'
        ? extra.qty * (extra.weight_per_piece || 100)
        : extra.qty;
      return Math.round(kcalPer100 * grams / 100);
    }
  }
  ```

#### 8c — Render extra nella card

- [ ] **Step 3: Aggiungi `renderExtrasHtml()` subito prima di `renderMealRow()`**

  ```js
  function renderExtrasHtml(extras, person) {
    const mine = (extras || []).filter(ex => ex.person === person);
    const items = mine.map(ex => {
      const kcal = calcExtraKcal(ex, person);
      return `<div class="extra-item" data-extra-id="${ex.id}">
        <span class="extra-item-name">${escHtml(ex.name || '?')}</span>
        ${ex.type === 'ingredient'
          ? `<span class="extra-item-kcal">${ex.qty}${ex.unit} · ${kcal} kcal</span>`
          : `<span class="extra-item-kcal">×${ex.qty} · ${kcal} kcal</span>`}
        <button class="extra-item-remove" data-extra-id="${ex.id}" title="Rimuovi extra">×</button>
      </div>`;
    }).join('');
    return `<div class="extras-list">${items}</div>`;
  }
  ```

- [ ] **Step 4: In `renderMealRow()` (riga 297-298), sostituisci le ultime due righe del return con la versione estesa**

  Usa Edit con questo `old_string` esatto (le 2 righe finali del return a riga 297-299):

  ```
  old_string:
      ${baseKcal > 0 ? qtyInputHtml : ''}
    </div>`;
  }

  new_string:
      ${baseKcal > 0 ? qtyInputHtml : ''}
      ${renderExtrasHtml(entry._extras, person)}
      <button class="btn-add-extra" data-plan-id="${entry.id}" data-person="${person}">+ Extra</button>
    </div>`;
  }
  ```

  Questo ancora esattamente su riga 297 di `public/app.js` (linea `${baseKcal > 0 ? qtyInputHtml : ''}` seguita da `</div>\`;\n}`), che è unica nel file.

#### 8d — updateSlotKcal include extra

- [ ] **Step 5: Aggiorna `updateSlotKcal()` per sommare anche le kcal degli extra**

  Sostituisci la funzione `updateSlotKcal` (~riga 301-321) con:

  ```js
  function updateSlotKcal(changedInput) {
    const person = changedInput.dataset.person;
    const slot = changedInput.closest('.meal-slot');
    if (!slot) return;

    const baseKcal = parseFloat(changedInput.dataset.baseKcal) || 0;
    const factor = parseFloat(changedInput.value) || 0;
    let kcal = Math.round(baseKcal * factor);

    // Somma kcal extra
    slot.querySelectorAll('.extra-item').forEach(el => {
      const extraId = parseInt(el.dataset.extraId, 10);
      const planId = parseInt(slot.dataset.planId, 10);
      const entry = findPlanEntry(planId);
      if (!entry) return;
      const extra = (entry._extras || []).find(ex => ex.id === extraId && ex.person === person);
      if (extra) kcal += calcExtraKcal(extra, person);
    });

    const kcalEl = slot.querySelector(`.plan-kcal[data-person="${person}"]`);
    if (kcalEl) kcalEl.textContent = kcal > 0 ? kcal : 0;

    slot.querySelectorAll('.plan-qty-ing-val').forEach(el => {
      const base = parseFloat(el.dataset.base) || 0;
      el.textContent = Math.round(base * factor * 10) / 10;
    });

    const dayCard = slot.closest('.day-card');
    if (dayCard) updateDayKcalHeader(dayCard);
  }
  ```

- [ ] **Step 6: Aggiungi helper `findPlanEntry()` subito prima di `updateSlotKcal()`**

  ```js
  function findPlanEntry(planId) {
    return (state.planData?.entries || []).find(e => e.id === planId) || null;
  }
  ```

#### 8e — savePlanQty include extra kcal

- [ ] **Step 7: Aggiorna `savePlanQty()` per includere le kcal degli extra nel totale salvato**

  Sostituisci `savePlanQty` (~riga 323-336):

  ```js
  function savePlanQty(changedInput) {
    const planId = parseInt(changedInput.dataset.planId, 10);
    const person = changedInput.dataset.person;

    const baseKcal = parseFloat(changedInput.dataset.baseKcal) || 0;
    const factor = parseFloat(changedInput.value) || 0;
    let kcal = Math.round(baseKcal * factor);

    // Aggiungi kcal extra per questa persona
    const entry = findPlanEntry(planId);
    if (entry) {
      for (const ex of (entry._extras || []).filter(e => e.person === person)) {
        kcal += calcExtraKcal(ex, person);
      }
    }

    const body = { plan_id: planId };
    if (person === 'lui') { body.qty_overrides_lui = { _factor: factor }; body.plan_kcal_lui = kcal; }
    else                  { body.qty_overrides_lei = { _factor: factor }; body.plan_kcal_lei = kcal; }

    api('/plan/quantities', { method: 'PUT', body: JSON.stringify(body) });
  }
  ```

#### 8f — Extra modal: stato e funzioni

- [ ] **Step 8: Aggiungi lo stato del modal e le funzioni di apertura/chiusura**

  Subito dopo la sezione `// ─── SWAP MODAL` (~riga 354), aggiungi una nuova sezione:

  ```js
  // ─── EXTRA MODAL ──────────────────────────────────────────────────────────────

  const extraModalState = {
    planId: null,
    person: 'lui',
    type: 'ingredient',
    refId: null,
    qty: 100,
    unit: 'g',
  };

  // Cache locale delle ricette per la ricerca
  let _mealsCache = null;
  let _ingredientsCache = null;

  async function ensureExtraSearchCache() {
    if (!_ingredientsCache) {
      _ingredientsCache = await api('/ingredients');
    }
    if (!_mealsCache) {
      const cats = ['colazione','spuntino','pranzo','merenda','cena'];
      _mealsCache = [];
      for (const cat of cats) {
        const meals = await api(`/meals?category=${cat}`);
        _mealsCache.push(...meals);
      }
    }
  }

  function openExtraModal(planId, person) {
    extraModalState.planId = planId;
    extraModalState.person = person;
    extraModalState.refId = null;
    extraModalState.type = 'ingredient';
    extraModalState.qty = 100;
    extraModalState.unit = 'g';

    // Reset UI
    document.querySelectorAll('#extraPersonGroup button').forEach(b => {
      b.classList.toggle('active', b.dataset.val === person);
    });
    document.querySelectorAll('#extraTypeGroup button').forEach(b => {
      b.classList.toggle('active', b.dataset.val === 'ingredient');
    });
    document.getElementById('extraSearchInput').value = '';
    document.getElementById('extraSearchResults').innerHTML = '';
    document.getElementById('extraSearchResults').classList.remove('open');
    document.getElementById('extraQtyInput').value = 100;
    document.getElementById('extraUnitSelect').value = 'g';
    document.getElementById('extraUnitSelect').style.display = '';
    document.getElementById('extraQtyLabel').textContent = 'Quantità';
    document.getElementById('extraModalConfirm').disabled = true;

    document.getElementById('extraModalOverlay').classList.add('open');
  }

  function closeExtraModal() {
    document.getElementById('extraModalOverlay').classList.remove('open');
    document.getElementById('extraSearchResults').classList.remove('open');
  }

  function updateExtraSearchResults(query) {
    const resultsEl = document.getElementById('extraSearchResults');
    if (!query.trim()) { resultsEl.classList.remove('open'); return; }

    const q = query.toLowerCase();
    let items = [];
    if (extraModalState.type === 'ingredient') {
      items = (_ingredientsCache || [])
        .filter(i => i.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map(i => ({
          id: i.id,
          name: i.name,
          meta: `${i.kcal_per_100} kcal/100g`,
        }));
    } else {
      items = (_mealsCache || [])
        .filter(m => m.name.toLowerCase().includes(q))
        .slice(0, 8)
        .map(m => ({
          id: m.id,
          name: m.name,
          meta: `${m.kcal_lui || 0} kcal (base)`,
        }));
    }

    if (!items.length) { resultsEl.classList.remove('open'); return; }

    resultsEl.innerHTML = items.map(item => `
      <div class="extra-search-item" data-id="${item.id}" data-name="${escHtml(item.name)}">
        <div class="extra-search-item-name">${escHtml(item.name)}</div>
        <div class="extra-search-item-meta">${escHtml(item.meta)}</div>
      </div>
    `).join('');
    resultsEl.classList.add('open');

    resultsEl.querySelectorAll('.extra-search-item').forEach(el => {
      el.addEventListener('click', () => {
        extraModalState.refId = parseInt(el.dataset.id, 10);
        document.getElementById('extraSearchInput').value = el.dataset.name;
        resultsEl.classList.remove('open');
        document.getElementById('extraModalConfirm').disabled = false;

        // Se type=recipe: nascondi select unità, mostra "× Porzione"
        if (extraModalState.type === 'recipe') {
          document.getElementById('extraQtyLabel').textContent = 'Porzione (moltiplicatore)';
          document.getElementById('extraUnitSelect').style.display = 'none';
          document.getElementById('extraQtyInput').value = 1;
          document.getElementById('extraQtyInput').step = '0.1';
          document.getElementById('extraQtyInput').min = '0.1';
        } else {
          document.getElementById('extraQtyLabel').textContent = 'Quantità';
          document.getElementById('extraUnitSelect').style.display = '';
          document.getElementById('extraQtyInput').value = 100;
        }
      });
    });
  }

  async function confirmAddExtra() {
    const { planId, person, type, refId } = extraModalState;
    if (!refId) return;
    const qty = parseFloat(document.getElementById('extraQtyInput').value) || 1;
    const unit = type === 'recipe' ? 'x' : document.getElementById('extraUnitSelect').value;

    const extra = await api('/plan/extras', {
      method: 'POST',
      body: JSON.stringify({ plan_id: planId, type, ref_id: refId, person, qty, unit }),
    });

    // Aggiorna lo stato locale
    const entry = findPlanEntry(planId);
    if (entry) {
      entry._extras = entry._extras || [];
      entry._extras.push(extra);
    }

    closeExtraModal();
    refreshSlotExtras(planId);
    showToast('Extra aggiunto!');
  }

  async function removeExtra(extraId, planId) {
    await api(`/plan/extras/${extraId}`, { method: 'DELETE' });

    // Aggiorna stato locale
    const entry = findPlanEntry(planId);
    if (entry) {
      entry._extras = (entry._extras || []).filter(ex => ex.id !== extraId);
    }

    refreshSlotExtras(planId);
    showToast('Extra rimosso');
  }

  function refreshSlotExtras(planId) {
    const entry = findPlanEntry(planId);
    if (!entry) return;

    document.querySelectorAll(`.meal-slot[data-plan-id="${planId}"]`).forEach(slot => {
      // Determina la persona di questo slot dal data-person dell'input qty o del pulsante extra
      const addBtn = slot.querySelector('.btn-add-extra');
      if (!addBtn) return;
      const person = addBtn.dataset.person;

      // Aggiorna lista extra
      const existingList = slot.querySelector('.extras-list');
      const newListHtml = renderExtrasHtml(entry._extras, person);
      if (existingList) {
        existingList.outerHTML = newListHtml;
      } else {
        addBtn.insertAdjacentHTML('beforebegin', newListHtml);
      }

      // Ricalcola kcal slot
      const qtyInput = slot.querySelector('.plan-qty-input');
      if (qtyInput) {
        updateSlotKcal(qtyInput);
        savePlanQty(qtyInput);
      } else {
        // Slot senza input qty (es. colazione senza kcal base): aggiorna solo il display
        const entry2 = findPlanEntry(planId);
        if (!entry2) return;
        let kcal = 0;
        for (const ex of (entry2._extras || []).filter(e => e.person === person)) {
          kcal += calcExtraKcal(ex, person);
        }
        const kcalEl = slot.querySelector(`.plan-kcal[data-person="${person}"]`);
        if (kcalEl) kcalEl.textContent = kcal;

        // Salva il totale
        const body = { plan_id: planId };
        if (person === 'lui') body.plan_kcal_lui = kcal;
        else body.plan_kcal_lei = kcal;
        api('/plan/quantities', { method: 'PUT', body: JSON.stringify(body) });

        const dayCard = slot.closest('.day-card');
        if (dayCard) updateDayKcalHeader(dayCard);
      }

      // Ri-wira i pulsanti remove nella lista aggiornata
      slot.querySelectorAll('.extra-item-remove').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          removeExtra(parseInt(btn.dataset.extraId, 10), planId);
        });
      });
    });
  }
  ```

#### 8g — Inizializzazione event listener del modal

- [ ] **Step 9: Aggiungi `initExtraModal()` subito dopo le funzioni appena scritte**

  ```js
  function initExtraModal() {
    // Toggle persona
    document.getElementById('extraPersonGroup').addEventListener('click', e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      extraModalState.person = btn.dataset.val;
      document.querySelectorAll('#extraPersonGroup button').forEach(b =>
        b.classList.toggle('active', b.dataset.val === extraModalState.person));
    });

    // Toggle tipo
    document.getElementById('extraTypeGroup').addEventListener('click', async e => {
      const btn = e.target.closest('button[data-val]');
      if (!btn) return;
      extraModalState.type = btn.dataset.val;
      extraModalState.refId = null;
      document.querySelectorAll('#extraTypeGroup button').forEach(b =>
        b.classList.toggle('active', b.dataset.val === extraModalState.type));
      document.getElementById('extraSearchInput').value = '';
      document.getElementById('extraSearchResults').classList.remove('open');
      document.getElementById('extraModalConfirm').disabled = true;

      // Aggiorna placeholder
      document.getElementById('extraSearchInput').placeholder =
        extraModalState.type === 'ingredient' ? 'Cerca alimento...' : 'Cerca ricetta...';

      await ensureExtraSearchCache();
    });

    // Ricerca
    document.getElementById('extraSearchInput').addEventListener('input', async e => {
      await ensureExtraSearchCache();
      updateExtraSearchResults(e.target.value);
    });

    // Chiudi risultati al click fuori
    document.addEventListener('click', e => {
      if (!e.target.closest('.extra-modal')) {
        document.getElementById('extraSearchResults')?.classList.remove('open');
      }
    });

    // Annulla
    document.getElementById('extraModalCancel').addEventListener('click', closeExtraModal);
    document.getElementById('extraModalOverlay').addEventListener('click', e => {
      if (e.target === document.getElementById('extraModalOverlay')) closeExtraModal();
    });

    // Conferma
    document.getElementById('extraModalConfirm').addEventListener('click', confirmAddExtra);
  }
  ```

#### 8h — Wire up delegated events in renderPiano()

- [ ] **Step 10: In `renderPiano()`, dopo il blocco listener esistente, aggiungi i listener per i pulsanti extra**

  Nel blocco event listener in `renderPiano()` (~riga 222-248), aggiungi alla fine:

  ```js
  // Pulsanti "+ Extra"
  grid.querySelectorAll('.btn-add-extra').forEach(btn => {
    btn.addEventListener('click', () => {
      openExtraModal(parseInt(btn.dataset.planId, 10), btn.dataset.person);
    });
  });

  // Pulsanti rimozione extra
  grid.querySelectorAll('.extra-item-remove').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      removeExtra(parseInt(btn.dataset.extraId, 10), parseInt(btn.closest('.meal-slot').dataset.planId, 10));
    });
  });
  ```

#### 8i — Chiama initExtraModal() al DOMContentLoaded

- [ ] **Step 11: Nel blocco `DOMContentLoaded` (in fondo ad `app.js`), aggiungi la chiamata a `initExtraModal()`**

  Trova il blocco `document.addEventListener('DOMContentLoaded', ...)` e aggiungi:

  ```js
  initExtraModal();
  ```

- [ ] **Step 12: Verifica avvio app senza errori nella console del browser**

  Apri `http://localhost:3000`, apri DevTools → Console. Non devono esserci errori.

- [ ] **Step 13: Test manuale — aggiungi una mela a cena**

  1. Vai al tab Piano
  2. Trova uno slot con un pasto assegnato
  3. Clicca "+" Extra
  4. Seleziona "Alimento", cerca "mela", inserisci 150g
  5. Clicca Aggiungi
  6. Verifica che compaia nella card con le kcal
  7. Verifica che le kcal totali del giorno si aggiornino

- [ ] **Step 14: Test manuale — verifica spesa**

  1. Vai al tab Lista Spesa
  2. Verifica che la mela compaia nella lista aggregata

- [ ] **Step 15: Commit finale**

  ```bash
  git add public/app.js
  git commit -m "feat: add plan extras UI — modal, render, kcal calculation"
  ```
