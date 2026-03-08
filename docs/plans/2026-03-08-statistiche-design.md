# Design: Tab Statistiche (Peso + Calorie)

**Data:** 2026-03-08
**Stato:** Approvato

## Contesto

BattiFame gestisce già pasti pianificati per settimana con calorie calcolate (`plan_kcal_lui/lei` in `weekly_plan`), ma non offre nessuna vista sull'andamento nel tempo. L'utente vuole:
1. Tracciare l'evoluzione del peso di "Lui" e "Lei" nel tempo
2. Visualizzare le calorie assunte giorno per giorno (proxy = pasti pianificati)

## Scope

Nuovo 6° tab **Statistiche** nella navbar esistente.

## Approccio scelto

Tab unico con due grafici impilati verticalmente + selettore persona + selettore periodo.

## Layout UI

```
┌─────────────────────────────────────────────────────┐
│ [ Lui ]  [ Lei ]          Dal: [____]  Al: [____]   │
│                  [ 7gg ] [ 4sett ] [ 3mesi ] [ Date]│
├─────────────────────────────────────────────────────┤
│  Peso nel tempo (kg)                                │
│  Line chart Chart.js — ~~___~~~                     │
├─────────────────────────────────────────────────────┤
│  [ Data: oggi ]  [ Peso: __kg ]  [+ Aggiungi]       │
│  Tabella compatta: data | kg | 🗑                   │
├─────────────────────────────────────────────────────┤
│  Calorie giornaliere (kcal)  - - - target           │
│  Bar chart Chart.js — ▐▐ ▐▐ ▐▐ ▐▐                 │
└─────────────────────────────────────────────────────┘
```

## Architettura

### Database — `src/database.js`

**Nuova tabella:**
```sql
CREATE TABLE IF NOT EXISTS weight_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,     -- YYYY-MM-DD
  person     TEXT NOT NULL,     -- 'lui' | 'lei'
  weight_kg  REAL NOT NULL,
  UNIQUE(date, person)          -- max 1 misurazione/giorno/persona (INSERT OR REPLACE)
)
```

**Nuove funzioni:**
- `listWeightLogs(person, from, to)` → `SELECT * FROM weight_logs WHERE person=? AND date BETWEEN ? AND ? ORDER BY date`
- `upsertWeightLog(date, person, weight_kg)` → `INSERT OR REPLACE INTO weight_logs ...`
- `deleteWeightLog(id)` → `DELETE FROM weight_logs WHERE id=?`
- `getCaloriesByDay(person, from, to)` → somma `plan_kcal_lui` o `plan_kcal_lei` per data reale

**Query calorie** (ricostruisce date reali dal piano):
```sql
SELECT
  DATE(week_start, '+' || day_of_week || ' days') AS day_date,
  SUM(plan_kcal_X) AS total_kcal
FROM weekly_plan
WHERE DATE(week_start, '+' || day_of_week || ' days') BETWEEN ? AND ?
  AND plan_kcal_X IS NOT NULL AND plan_kcal_X > 0
GROUP BY day_date
ORDER BY day_date
```
(sostituire `plan_kcal_X` con `plan_kcal_lui` o `plan_kcal_lei` in base alla persona)

### Backend — `src/routes/stats.js` (nuovo file)

| Method | Path | Body/Query | Risposta |
|---|---|---|---|
| `GET` | `/api/stats/weight` | `?person=lui&from=YYYY-MM-DD&to=YYYY-MM-DD` | Array `[{id, date, weight_kg}]` |
| `POST` | `/api/stats/weight` | `{ date, person, weight_kg }` | `{ id, date, person, weight_kg }` |
| `DELETE` | `/api/stats/weight/:id` | — | `{ ok: true }` |
| `GET` | `/api/stats/calories` | `?person=lui&from=...&to=...` | Array `[{day_date, total_kcal}]` |

**Validazioni:**
- `person` deve essere `lui` o `lei`
- `weight_kg` > 0
- `date` formato YYYY-MM-DD
- `from`/`to` obbligatori

Registrato in `server.js`: `app.use('/api/stats', require('./src/routes/stats'));`

### Frontend HTML — `public/index.html`

**Tab button** (aggiungere in `.tab-nav` e `.mobile-nav`):
```html
<button class="tab-btn" data-tab="statistiche">Statistiche</button>
```

**Tab panel** (aggiungere dopo `#tab-impostazioni`):
```html
<div class="tab-content" id="tab-statistiche">
  <!-- Controlli: persona + periodo -->
  <div class="stats-controls">
    <div class="stats-person-toggle">
      <button class="btn stats-person-btn active" data-person="lui">Lui</button>
      <button class="btn stats-person-btn" data-person="lei">Lei</button>
    </div>
    <div class="stats-period-btns">
      <button class="stats-period-btn active" data-days="7">7gg</button>
      <button class="stats-period-btn" data-days="28">4 sett</button>
      <button class="stats-period-btn" data-days="90">3 mesi</button>
      <button class="stats-period-btn" data-days="custom">Personalizzato</button>
    </div>
    <div class="stats-custom-range hidden">
      <input type="date" id="statsFrom">
      <span>–</span>
      <input type="date" id="statsTo">
    </div>
  </div>

  <!-- Grafico peso -->
  <div class="card">
    <h3>Peso nel tempo (kg)</h3>
    <canvas id="chartWeight"></canvas>
  </div>

  <!-- Form inserimento peso -->
  <div class="card stats-weight-form">
    <div class="stats-add-weight">
      <input type="date" id="weightDate">
      <input type="number" id="weightValue" placeholder="kg" step="0.1" min="1" max="500">
      <button class="btn btn-primary" id="btnAddWeight">+ Aggiungi</button>
    </div>
    <div id="weightList" class="stats-weight-list"></div>
  </div>

  <!-- Grafico calorie -->
  <div class="card">
    <h3>Calorie giornaliere (kcal)</h3>
    <canvas id="chartCalories"></canvas>
  </div>
</div>
```

**CDN Chart.js** (prima di `app.js`):
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

### Frontend CSS — `public/style.css`

Nuovi stili da aggiungere prima del blocco `/* ─── PRINT ─── */`:
```css
/* ─── STATISTICHE ──────────────────────────────────────────────────── */
.stats-controls { ... }
.stats-person-toggle { ... }
.stats-person-btn.active { background: var(--green-mid); color: #fff; }
.stats-period-btns { ... }
.stats-period-btn.active { ... }
.stats-custom-range { ... }
.stats-custom-range.hidden { display: none; }
.stats-add-weight { display: flex; gap: 8px; align-items: center; }
.stats-weight-list { ... tabella compatta con border-bottom ... }
```

### Frontend JS — `public/app.js`

**Nuova funzione `initStatistiche()`** da aggiungere prima di `init()`:

```javascript
let chartWeight = null;
let chartCalories = null;

async function initStatistiche() {
  // Stato locale
  let currentPerson = 'lui';
  let currentFrom = /* oggi - 28 giorni */;
  let currentTo = /* oggi */;

  // Listener persona
  document.querySelectorAll('.stats-person-btn').forEach(btn => { ... });

  // Listener periodo preimpostati
  document.querySelectorAll('.stats-period-btn').forEach(btn => { ... });

  // Listener date custom
  document.getElementById('statsFrom').addEventListener('change', ...);
  document.getElementById('statsTo').addEventListener('change', ...);

  // Listener form peso
  document.getElementById('btnAddWeight').addEventListener('click', addWeight);

  // Funzione principale: carica dati e aggiorna grafici
  async function loadStats() {
    const [weightData, calorieData] = await Promise.all([
      api(`/stats/weight?person=${currentPerson}&from=${currentFrom}&to=${currentTo}`),
      api(`/stats/calories?person=${currentPerson}&from=${currentFrom}&to=${currentTo}`)
    ]);
    renderWeightChart(weightData);
    renderWeightList(weightData);
    renderCalorieChart(calorieData);
  }

  function renderWeightChart(data) { /* Chart.js line chart */ }
  function renderCalorieChart(data) {
    /* Chart.js bar chart + annotation target kcal */
    /* Target: currentPerson === 'lui' ? 1635 : 1686 */
  }
  function renderWeightList(data) { /* lista compatta con bottone elimina */ }

  async function addWeight() { /* POST /api/stats/weight → reload */ }

  // Init: impostare date default, caricare dati
  loadStats();
}
```

**Registrazione in `init()`**: aggiungere `initStatistiche();` nella funzione `init()`.

**Caricamento lazy**: `initStatistiche()` può caricare i dati solo quando il tab Statistiche viene attivato (listener su `data-tab="statistiche"`) per evitare fetch inutili all'avvio.

## Target kcal

Hardcoded per ora (coerente con il resto del progetto):
- Lui: **1635 kcal/giorno**
- Lei: **1686 kcal/giorno**

## File modificati

| File | Tipo |
|---|---|
| `src/database.js` | Modifica — tabella + 4 funzioni |
| `src/routes/stats.js` | Nuovo file |
| `server.js` | Modifica — registra `/api/stats` |
| `public/index.html` | Modifica — tab button + panel + CDN Chart.js |
| `public/style.css` | Modifica — stili sezione statistiche |
| `public/app.js` | Modifica — `initStatistiche()` + registrazione in `init()` |

## Verifica end-to-end

1. `npm start` → aprire `http://localhost:3000`
2. Cliccare tab **Statistiche** → pagina vuota con i due grafici (senza dati inizialmente)
3. Tab Statistiche → inserire peso (es. `83.0`) per oggi → grafico peso aggiornato
4. Inserire altri pesi in date diverse → line chart mostra andamento
5. Cambiare persona (Lui/Lei) → entrambi i grafici si aggiornano
6. Cambiare periodo (7gg, 4sett, 3mesi, Personalizzato) → grafici filtrati
7. Test calorie: andare su tab Piano → verificare settimane con pasti pianificati → tornare su Statistiche → grafico calorie mostra barre per quei giorni
8. Eliminare una misurazione peso → scompare da lista e grafico
9. ```bash
   curl "http://localhost:3000/api/stats/weight?person=lui&from=2026-01-01&to=2026-03-31"
   curl -X POST http://localhost:3000/api/stats/weight \
     -H "Content-Type: application/json" \
     -d '{"date":"2026-03-08","person":"lui","weight_kg":83.2}'
   curl "http://localhost:3000/api/stats/calories?person=lui&from=2026-03-01&to=2026-03-31"
   ```
