# BattiFame — Istruzioni per Claude

## Stack tecnico
Node.js + Express + SQLite (better-sqlite3) + Vanilla HTML/CSS/JS + Nodemailer + node-cron.
Avvio: `npm start` → http://localhost:3000

## File principali
```
server.js                    — Entry point Express, porta 3000
src/database.js              — Schema SQLite + tutte le query CRUD
src/seed.js                  — 18 pasti iniziali, SEED_VERSION corrente: '4'
src/email.js                 — 3 template email HTML in italiano
src/scheduler.js             — Cron: pranzo 10:30, cena 16:30, spesa dom 20:00
src/routes/meals.js          — CRUD ricettario + GET /ingredients-list
src/routes/ingredients.js    — CRUD ingredienti + GET /lookup + GET /barcode/:code (Open Food Facts)
src/routes/planner.js        — Piano settimanale + auto-generazione + quantità
src/routes/shopping.js       — Lista spesa aggregata
src/routes/settings.js       — Impostazioni (email, SMTP)
src/routes/stats.js          — Statistiche: peso + calorie (GET/POST/DELETE /api/stats/*)
public/index.html            — SPA 6 tab (Piano, Ricettario, Ingredienti, Spesa, Impostazioni, Statistiche)
public/style.css             — UI verde, mobile-first
public/app.js                — Tutta la logica frontend (vanilla JS)
```

## Utenti
- **Lui**: 40a, 183cm, 83kg, sedentario → 1635 kcal/giorno, **4 pasti** (no merenda)
- **Lei**: 38a, 162cm, 66kg, allattamento 50% → 1686 kcal/giorno, **5 pasti** (con merenda)

## Schema DB — tabelle principali

### meal_options
Ricette con valori nutrizionali aggregati (kcal_lui, kcal_lei, protein_lui, protein_lei, carbs, fats, qty_description_lui/lei, active).

### meal_ingredients
Ingredienti di ogni ricetta. Colonne rilevanti:
- `ingredient` — nome stringa (usato come chiave per lookup in `ingredient_nutrition`)
- `unit` — 'g', 'ml', 'pz'
- `qty_base_num` — quantità base unica (non più separata lui/lei)
- `qty_lui_num`, `qty_lei_num` — colonne legacy, non usate nel codice nuovo

### ingredient_nutrition
Database alimenti semplici. Nomi colonne **esatti** (attenzione agli errori passati):
- `kcal_per_100`, `protein_per_100`, `carbs_per_100`, `fats_per_100`, `weight_per_piece`

### weekly_plan
Piano settimanale. Colonne:
- `week_start`, `day_of_week` (0=lun…6=dom), `meal_category`, `meal_option_id`
- `qty_overrides_lui`, `qty_overrides_lei` — JSON: `{"_factor": 1.5}` (moltiplicatore porzione)
- `plan_kcal_lui`, `plan_kcal_lei` — kcal calcolate con il fattore applicato

### week_status
Stato settimana: `confirmed` (1/0), `shopping_sent` (1/0).

### settings
Coppie chiave/valore: nomi, email, SMTP, `db_seed_version`.

### weight_logs
Misurazioni peso per persona. Colonne: `id`, `date` (YYYY-MM-DD), `person` ('lui'|'lei'), `weight_kg` (REAL). Vincolo UNIQUE(date, person) — INSERT OR REPLACE sovrascrive la stessa data.

## Convenzioni importanti

### Seed versioning
Incrementare `SEED_VERSION` in `src/seed.js` per forzare re-seed (cancella piani e ricette, reinserisce tutto). Versione attuale: `'4'`.

### Route ordering in Express
`GET /api/ingredients/lookup`, `GET /api/ingredients/barcode/:code` e `PUT /api/plan/quantities` devono essere registrati **prima** di `/:id` per evitare che Express li interpreti come ID.

### Quantità nel piano
Il moltiplicatore porzione è salvato come `{"_factor": 1.5}` nel JSON di `qty_overrides_lui/lei`. Factor=1 significa quantità base. Le kcal visualizzate = `base_kcal * factor`.

### getWeekPlan — query con ingredients_json
La query usa `json_group_array(json_object(...))` per aggregare gli ingredienti in un'unica colonna JSON. Il frontend la parsifica come `e._ingredients`.

### Open Food Facts Lookup
`GET /api/ingredients/lookup?q=nome` — ricerca testuale, usa native fetch Node 18+, timeout 8s. Restituisce 503 se offline (atteso).
`GET /api/ingredients/barcode/:code` — ricerca per EAN-13, chiama `https://world.openfoodfacts.org/api/v0/product/{code}.json`. Restituisce anche il campo `name` (nome prodotto). Registrata prima di `/:id`.

### Scansione Barcode (tab Ingredienti)
Libreria ZXing-js caricata via CDN (`@zxing/browser@0.1.1`, globale `ZXingBrowser`) — nessun npm install.
UI: pulsante "📷 Scansiona" + campo EAN-13 manuale nel modal ingrediente.
Funzioni JS: `startBarcodeScanner()`, `stopBarcodeScanner()`, `lookupByBarcode(code)` — definite prima di `initIngredienti()` in `public/app.js`.
`closeIngForm()` chiama `stopBarcodeScanner()` per liberare la fotocamera alla chiusura del modal.
Richiede HTTPS per accesso fotocamera da mobile — Railway lo fornisce automaticamente.

### Tab Statistiche (6° tab)
Grafico peso nel tempo (line chart) + grafico calorie giornaliere (bar chart) — differenziati per Lui/Lei.
- **Peso**: inserimento manuale → `POST /api/stats/weight` → tabella `weight_logs`. Max 1 al giorno per persona.
- **Calorie**: lette da `weekly_plan.plan_kcal_lui/lei` — pianificato = consumato. Query SQLite con `DATE(week_start, '+' || day_of_week || ' days')` per ricostruire le date reali.
- **Chart.js** `@4.4.0` via jsDelivr CDN (globale `Chart`) — caricato in `index.html` prima di ZXing.
- **Target kcal** hardcoded: 1635 Lui / 1686 Lei (costante `TARGETS_KCAL` in `app.js`).
- `initStatistiche()` in `public/app.js` — lazy load dati al click del tab (evita canvas 0×0).

### calculateAndUpdateNutrition
Legge `qty_base_num` degli ingredienti, calcola kcal/protein/carbs/fats, salva in **entrambi** `kcal_lui` e `kcal_lei` con lo stesso valore (base unificata).

### Flusso reminder spesa
Inviato solo se `week_status.confirmed = 1` per la settimana prossima.

## Errori passati da non ripetere
1. **Nomi colonne `ingredient_nutrition`**: usare sempre `kcal_per_100`, `protein_per_100`, ecc. — mai abbreviazioni.
2. **`sed` su macOS**: usare `perl -i -pe` per regex complesse invece di `sed -i ''`.
3. **`ingredients` non definito in `renderMealRow`**: ricordarsi di dichiarare `const ingredients = entry._ingredients || []` prima di usarla.
4. **Port 3000 in uso**: se il server non parte, `pkill -f "node server.js"` poi riavviare.

## Comandi utili
```bash
# Avvia
npm start

# Verifica DB
node -e "require('./src/database')"

# Test endpoint piano
curl http://localhost:3000/api/plan?week=2025-03-10

# Test endpoint barcode (Nutella)
curl http://localhost:3000/api/ingredients/barcode/3017624010701

# Test endpoint statistiche
curl -X POST http://localhost:3000/api/stats/weight -H "Content-Type: application/json" -d '{"date":"2026-03-08","person":"lui","weight_kg":83.2}'
curl "http://localhost:3000/api/stats/calories?person=lui&from=2026-03-01&to=2026-03-31"

# Forza re-seed (dopo bump SEED_VERSION): basta riavviare npm start
```
