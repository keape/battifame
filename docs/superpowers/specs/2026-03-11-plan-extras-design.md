# Design: Extra per slot del piano settimanale

**Data:** 2026-03-11

## Problema

Ogni slot del piano (`weekly_plan`) supporta una sola ricetta (`meal_option_id`). Non è possibile aggiungere alimenti extra a un pasto (es. una mela a cena oltre alla ricetta principale).

## Requisiti

- Ogni slot del piano può avere zero o più extra, in aggiunta alla ricetta principale
- Un extra può essere una ricetta completa (`meal_options`) o un alimento singolo (`ingredient_nutrition`)
- Ogni extra è specifico per persona: `lui` o `lei`
- Gli extra contribuiscono al conteggio delle kcal giornaliere
- Gli extra compaiono nella lista della spesa aggregata

## Approccio scelto

**Nuova tabella `plan_extras`** agganciata a `weekly_plan.id` — estende il modello senza toccare lo schema esistente.

## Schema DB

```sql
CREATE TABLE plan_extras (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id  INTEGER NOT NULL REFERENCES weekly_plan(id) ON DELETE CASCADE,
  type     TEXT NOT NULL CHECK(type IN ('recipe', 'ingredient')),
  ref_id   INTEGER NOT NULL,   -- meal_options.id oppure ingredient_nutrition.id
  person   TEXT NOT NULL CHECK(person IN ('lui', 'lei')),
  qty      REAL NOT NULL DEFAULT 1.0,  -- ricetta: moltiplicatore; ingrediente: grammi/ml/pz
  unit     TEXT DEFAULT 'g'            -- 'g', 'ml', 'pz' — solo per type='ingredient'
);
```

`ON DELETE CASCADE`: gli extra si eliminano automaticamente quando lo slot viene rimosso o sostituito.

## Backend API

### Nuovi endpoint in `src/routes/planner.js`

| Metodo | Path | Descrizione |
|--------|------|-------------|
| `POST` | `/api/plan/extras` | Aggiunge un extra `{ plan_id, type, ref_id, person, qty, unit }` |
| `DELETE` | `/api/plan/extras/:id` | Rimuove un extra |
| `GET` | `/api/plan/extras?plan_id=X` | Lista extra per uno slot |

### Modifiche a `src/database.js`

- **`getWeekPlan`**: aggiunge subquery `extras_json` (come già avviene per `ingredients_json`) — ogni slot viene restituito con gli extra già inclusi
- **`getShoppingList`**: estesa con `UNION`:
  - `type='recipe'` → JOIN su `meal_ingredients` della ricetta extra
  - `type='ingredient'` → include il nome da `ingredient_nutrition` direttamente

### Calcolo kcal

Avviene nel frontend al momento dell'aggiunta:
- `type='recipe'` → `meal_options.kcal_lui/lei * qty`
- `type='ingredient'` → `ingredient_nutrition.kcal_per_100 * qty_grams / 100` (se pz: `* weight_per_piece / 100`)

Il totale aggiornato viene salvato via `PUT /api/plan/quantities` (endpoint già esistente).

## Frontend UI

### Pulsante "+ Extra" su ogni card pasto

Apre un mini-modal inline con:

1. **Per chi**: bottoni Lui / Lei
2. **Tipo**: toggle Ricetta / Ingrediente
3. **Cerca**: autocomplete su `meal_options` o `ingredient_nutrition`
4. **Quantità**: se ricetta → moltiplicatore (es. ×0.5); se ingrediente → numero + unità (g/ml/pz)
5. **Aggiungi** → `POST /api/plan/extras` → aggiorna la card

### Visualizzazione nella card

Gli extra aggiunti appaiono come lista sotto la ricetta principale:
- Nome extra
- Persona (Lui / Lei)
- Kcal aggiuntive
- Pulsante `×` per eliminare (`DELETE /api/plan/extras/:id`)

Le kcal totali dello slot vengono aggiornate live.

## File coinvolti

| File | Modifica |
|------|----------|
| `src/database.js` | Nuova tabella in `initSchema()` + migrazione; nuove funzioni CRUD `plan_extras`; `getWeekPlan` + `getShoppingList` estese |
| `src/routes/planner.js` | 3 nuovi endpoint POST/DELETE/GET per extras |
| `public/app.js` | Pulsante "+ Extra", mini-modal, calcolo kcal, render extra nella card |
| `public/style.css` | Stili mini-modal e lista extra nella card |
| `public/index.html` | Nessuna modifica prevista |
