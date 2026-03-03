'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  currentWeek: null,
  nextWeek: null,
  viewWeek: null,
  planData: null,
  weekStatus: null,
  swapContext: null, // { planEntryId, week, day, category, person }
};

const DAYS_IT = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
const CAT_LABELS = { colazione: 'Colazione', spuntino: 'Spuntino', pranzo: 'Pranzo', merenda: 'Merenda', cena: 'Cena' };
const CAT_LUI = ['spuntino','pranzo','merenda','cena'];
const CAT_LEI = ['colazione','spuntino','pranzo','merenda','cena'];

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function api(path, options = {}) {
  return fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  }).then(r => r.json());
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function formatWeekLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00');
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  const fmt = d2 => d2.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  return `${fmt(d)} – ${fmt(end)}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── NUTRITION DATA CACHE ─────────────────────────────────────────────────────

let nutritionDataCache = {}; // { name_lower: { kcal, protein, carbs, fats, weight_pz } }

async function loadNutritionData() {
  const list = await api('/meals/ingredients-list');
  nutritionDataCache = {};
  const dl = document.getElementById('ingredientSuggestions');
  dl.innerHTML = '';
  for (const ing of list) {
    nutritionDataCache[ing.name.toLowerCase()] = ing;
    const opt = document.createElement('option');
    opt.value = ing.name;
    dl.appendChild(opt);
  }
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

function initTabs() {
  const allBtns = document.querySelectorAll('.tab-btn');
  allBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      allBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.tab-content').forEach(s => {
        s.classList.toggle('active', s.id === 'tab-' + tab);
      });
      // Chiudi menu mobile
      document.getElementById('mobileNav').classList.remove('open');
      // Carica dati tab se necessario
      if (tab === 'ricettario') loadRicettario();
      if (tab === 'ingredienti') loadIngredienti();
      if (tab === 'spesa') loadSpesa();
      if (tab === 'impostazioni') loadImpostazioni();
    });
  });

  // Menu mobile
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('mobileNav').classList.toggle('open');
  });
}

// ─── TAB: PIANO SETTIMANALE ───────────────────────────────────────────────────

async function initPiano() {
  const weeks = await api('/weeks');
  state.currentWeek = weeks.current;
  state.nextWeek = weeks.next;
  state.viewWeek = weeks.current;
  await loadPiano();

  document.getElementById('prevWeek').addEventListener('click', async () => {
    state.viewWeek = addDays(state.viewWeek, -7);
    await loadPiano();
  });
  document.getElementById('nextWeek').addEventListener('click', async () => {
    state.viewWeek = addDays(state.viewWeek, 7);
    await loadPiano();
  });

  document.getElementById('btnGeneraPiano').addEventListener('click', async () => {
    if (!confirm('Genera automaticamente il piano per la settimana visualizzata? I pasti esistenti verranno sovrascritti.')) return;
    const result = await api('/plan/generate', {
      method: 'POST',
      body: JSON.stringify({ week: state.viewWeek }),
    });
    state.planData = result;
    renderPiano();
    showToast('Piano generato! Puoi modificare i singoli pasti prima di confermare.');
  });

  document.getElementById('btnConferma').addEventListener('click', async () => {
    if (!confirm('Confermare il piano? Dopo la conferma, la lista spesa sarà pronta per l\'invio.')) return;
    await api('/plan/confirm', { method: 'POST', body: JSON.stringify({ week: state.viewWeek }) });
    state.planData.status.confirmed = 1;
    renderPianoStatus();
    showToast('Piano confermato! La lista spesa sarà inviata domenica sera.');
  });
}

async function loadPiano() {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = '<div class="loading-state">Caricamento piano...</div>';
  const result = await api(`/plan?week=${state.viewWeek}`);
  state.planData = result;

  // Aggiorna label settimana
  const isCurrentWeek = state.viewWeek === state.currentWeek;
  const isNextWeek = state.viewWeek === state.nextWeek;
  const suffix = isCurrentWeek ? ' (settimana corrente)' : isNextWeek ? ' (settimana prossima)' : '';
  document.getElementById('weekLabel').textContent = formatWeekLabel(state.viewWeek);
  document.getElementById('weekSub').textContent = suffix;

  renderPianoStatus();
  renderPiano();
}

function renderPianoStatus() {
  const status = state.planData.status;
  const confirmed = status && status.confirmed;
  document.getElementById('confirmedBanner').style.display = confirmed ? 'block' : 'none';
  document.getElementById('btnConferma').disabled = confirmed;
}

function renderPiano() {
  const grid = document.getElementById('weekGrid');
  const entries = state.planData.entries || [];

  // Organizza per giorno e categoria
  const byDay = {};
  for (const e of entries) {
    if (!byDay[e.day_of_week]) byDay[e.day_of_week] = {};
    byDay[e.day_of_week][e.meal_category] = e;
  }

  let html = '';
  for (let day = 0; day < 7; day++) {
    const dayDate = addDays(state.viewWeek, day);
    const dateLabel = new Date(dayDate + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

    // Calcola kcal giornalieri
    const dayEntries = byDay[day] || {};
    let kcalLui = 0, kcalLei = 0;
    for (const cat of CAT_LUI) if (dayEntries[cat]) kcalLui += dayEntries[cat].kcal_lui || 0;
    for (const cat of CAT_LEI) if (dayEntries[cat]) kcalLei += dayEntries[cat].kcal_lei || 0;

    const kcalLuiClass = kcalLui > 0 ? (Math.abs(kcalLui - 1635) < 150 ? 'ok' : 'warn') : '';
    const kcalLeiClass = kcalLei > 0 ? (Math.abs(kcalLei - 1686) < 150 ? 'ok' : 'warn') : '';

    html += `<div class="day-card">
      <div class="day-header">
        <span class="day-name">${DAYS_IT[day]}</span>
        <span class="day-date">${dateLabel}</span>
        <span class="day-kcal">
          ${kcalLui > 0 ? `👨 ${kcalLui} kcal` : ''}
          ${kcalLei > 0 ? ` · 👩 ${kcalLei} kcal` : ''}
        </span>
      </div>
      <div class="day-body">
        <div class="person-col">
          <div class="person-label">👨 Lui</div>
          ${CAT_LUI.map(cat => renderMealRow(dayEntries[cat], cat, day, 'lui')).join('')}
        </div>
        <div class="person-col">
          <div class="person-label">👩 Lei</div>
          ${CAT_LEI.map(cat => renderMealRow(dayEntries[cat], cat, day, 'lei')).join('')}
        </div>
      </div>
    </div>`;
  }

  grid.innerHTML = html;

  // Aggiungi event listener per sostituzione pasti
  grid.querySelectorAll('.meal-row[data-clickable="1"]').forEach(row => {
    row.addEventListener('click', () => {
      const { cat, day, week } = row.dataset;
      openSwapModal(cat, parseInt(day, 10), week);
    });
  });

  // Abilita/disabilita pulsante conferma
  const totalExpected = 7 * (CAT_LUI.length + CAT_LEI.length);
  const filled = Object.values(byDay).reduce((acc, dayObj) => {
    return acc + Object.keys(dayObj).length;
  }, 0);
  document.getElementById('btnConferma').disabled =
    (state.planData.status && state.planData.status.confirmed) || filled === 0;
}

function renderMealRow(entry, cat, day, person) {
  if (!entry || !entry.meal_option_id) {
    return `<div class="meal-row" data-clickable="1" data-cat="${cat}" data-day="${day}" data-week="${state.viewWeek}">
      <span class="meal-cat-badge cat-${cat}">${CAT_LABELS[cat]}</span>
      <span class="meal-info"><span class="meal-empty">Nessun pasto — clicca per aggiungere</span></span>
    </div>`;
  }
  const kcal = person === 'lui' ? entry.kcal_lui : entry.kcal_lei;
  const qty = person === 'lui' ? entry.qty_description_lui : entry.qty_description_lei;
  return `<div class="meal-row" data-clickable="1" data-cat="${cat}" data-day="${day}" data-week="${state.viewWeek}" title="Clicca per cambiare pasto">
    <span class="meal-cat-badge cat-${cat}">${CAT_LABELS[cat]}</span>
    <span class="meal-info">
      <span class="meal-name">${entry.name}</span>
      ${kcal ? `<span class="meal-kcal">${kcal} kcal</span>` : ''}
      ${qty && qty !== 'Non previsto' ? `<span class="meal-qty">${qty}</span>` : ''}
    </span>
  </div>`;
}

// ─── SWAP MODAL ───────────────────────────────────────────────────────────────

async function openSwapModal(category, dayOfWeek, week) {
  state.swapContext = { category, dayOfWeek, week };
  document.getElementById('modalTitle').textContent =
    `Cambia ${CAT_LABELS[category]} – ${DAYS_IT[dayOfWeek]}`;
  document.getElementById('modalBody').innerHTML =
    '<div class="loading-state">Caricamento opzioni...</div>';
  document.getElementById('modalOverlay').style.display = 'flex';

  const meals = await api(`/meals?category=${category}`);
  renderSwapOptions(meals);
}

function renderSwapOptions(meals) {
  if (!meals.length) {
    document.getElementById('modalBody').innerHTML =
      '<p style="text-align:center;color:#888;padding:24px">Nessun pasto disponibile per questa categoria.</p>';
    return;
  }
  const html = meals.map(m => `
    <div class="option-item" data-id="${m.id}">
      <span class="option-item-name">${m.name}</span>
      <span class="option-item-meta">
        <span>👨 ${m.kcal_lui || 0} kcal</span>
        <span>👩 ${m.kcal_lei || 0} kcal</span>
      </span>
      ${m.qty_description_lui ? `<span style="font-size:11px;color:#888">${m.qty_description_lui}</span>` : ''}
    </div>
  `).join('');
  document.getElementById('modalBody').innerHTML = html;

  document.querySelectorAll('.option-item').forEach(item => {
    item.addEventListener('click', async () => {
      const mealId = parseInt(item.dataset.id, 10);
      const ctx = state.swapContext;
      await api('/plan/1', {
        method: 'PUT',
        body: JSON.stringify({
          week: ctx.week,
          day_of_week: ctx.dayOfWeek,
          meal_category: ctx.category,
          meal_option_id: mealId,
        }),
      });
      document.getElementById('modalOverlay').style.display = 'none';
      await loadPiano();
      showToast('Pasto aggiornato!');
    });
  });
}

function initSwapModal() {
  document.getElementById('modalClose').addEventListener('click', () => {
    document.getElementById('modalOverlay').style.display = 'none';
  });
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) {
      document.getElementById('modalOverlay').style.display = 'none';
    }
  });
}

// ─── TAB: RICETTARIO ──────────────────────────────────────────────────────────

let activeCategory = '';

async function loadRicettario() {
  document.getElementById('mealsGrid').innerHTML =
    '<div class="loading-state">Caricamento ricettario...</div>';
  const url = activeCategory ? `/meals?category=${activeCategory}` : '/meals';
  const meals = await api(url);
  renderMealsGrid(meals);
}

function renderMealsGrid(meals) {
  if (!meals.length) {
    document.getElementById('mealsGrid').innerHTML =
      '<div class="loading-state">Nessun pasto trovato.</div>';
    return;
  }
  document.getElementById('mealsGrid').innerHTML = meals.map(m => `
    <div class="meal-card">
      <div class="meal-card-header">
        <span class="meal-card-name">${m.name}</span>
        <div class="meal-card-actions">
          <button class="btn-sm" onclick="editMeal(${m.id})">Modifica</button>
          <button class="btn-sm danger" onclick="deleteMeal(${m.id}, '${m.name.replace(/'/g, "\\'")}')">Elimina</button>
        </div>
      </div>
      <div class="meal-card-cat">
        <span class="meal-cat-badge cat-${m.category}">${CAT_LABELS[m.category]}</span>
      </div>
      ${m.description ? `<p class="meal-card-desc">${m.description}</p>` : ''}
      <div class="nutrition-grid">
        <div class="nutrition-col">
          <div class="nutrition-col-label">👨 Lui</div>
          <div><span class="kcal-big">${m.kcal_lui || 0}</span> <span class="kcal-unit">kcal</span></div>
          ${m.qty_description_lui ? `<div class="qty-text">${m.qty_description_lui}</div>` : ''}
        </div>
        <div class="nutrition-col">
          <div class="nutrition-col-label">👩 Lei</div>
          <div><span class="kcal-big">${m.kcal_lei || 0}</span> <span class="kcal-unit">kcal</span></div>
          ${m.qty_description_lei ? `<div class="qty-text">${m.qty_description_lei}</div>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function initRicettario() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      await loadRicettario();
    });
  });

  document.getElementById('btnNuovoPasto').addEventListener('click', () => openMealForm(null, activeCategory));
  document.getElementById('mealFormClose').addEventListener('click', closeMealForm);
  document.getElementById('mealFormCancel').addEventListener('click', closeMealForm);
  document.getElementById('mealFormOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('mealFormOverlay')) closeMealForm();
  });

  document.getElementById('btnAddIngredient').addEventListener('click', () => addIngredientRow());

  document.getElementById('mealForm').addEventListener('submit', async e => {
    e.preventDefault();
    await saveMeal();
  });
}

function addIngredientRow(data = {}) {
  const row = document.createElement('div');
  row.className = 'ing-row';
  const units = ['g', 'ml', 'pz'];
  const selectedUnit = data.unit || 'g';
  row.innerHTML = `
    <input type="text" class="ing-name" placeholder="es. Pasta" list="ingredientSuggestions" value="${escHtml(data.ingredient || '')}">
    <input type="number" class="ing-qty-lui" placeholder="0" min="0" step="any" value="${data.qty_lui_num != null ? data.qty_lui_num : (data.qty_lui || '')}">
    <input type="number" class="ing-qty-lei" placeholder="0" min="0" step="any" value="${data.qty_lei_num != null ? data.qty_lei_num : (data.qty_lei || '')}">
    <select class="ing-unit">
      ${units.map(u => `<option value="${u}"${u === selectedUnit ? ' selected' : ''}>${u}</option>`).join('')}
    </select>
    <button type="button" class="ing-remove-btn" title="Rimuovi">✕</button>
  `;
  row.querySelector('.ing-remove-btn').addEventListener('click', () => {
    row.remove();
    updateNutritionPreview();
  });
  row.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', updateNutritionPreview);
    el.addEventListener('change', updateNutritionPreview);
  });
  document.getElementById('ingredientRows').appendChild(row);
}

function collectIngredients() {
  const rows = document.querySelectorAll('#ingredientRows .ing-row');
  const result = [];
  for (const row of rows) {
    const ingredient = row.querySelector('.ing-name').value.trim();
    if (!ingredient) continue;
    const qty_lui_num = parseFloat(row.querySelector('.ing-qty-lui').value) || 0;
    const qty_lei_num = parseFloat(row.querySelector('.ing-qty-lei').value) || 0;
    const unit = row.querySelector('.ing-unit').value;
    result.push({ ingredient, qty_lui_num, qty_lei_num, unit });
  }
  return result;
}

function updateNutritionPreview() {
  const ingredients = collectIngredients();
  let kcalLui = 0, protLui = 0, carbsLui = 0, fatsLui = 0;
  let kcalLei = 0, protLei = 0, carbsLei = 0, fatsLei = 0;

  for (const ing of ingredients) {
    const key = ing.ingredient.toLowerCase().trim();
    const nd = nutritionDataCache[key];
    if (!nd) continue;
    const kcal    = nd.kcal_per_100;
    const protein = nd.protein_per_100;
    const carbs   = nd.carbs_per_100;
    const fats    = nd.fats_per_100;
    const wpz     = nd.weight_per_piece || 100;
    // For 'pz' (pieces), convert to grams using weight_per_piece
    const gramsLui = ing.unit === 'pz' ? ing.qty_lui_num * wpz : ing.qty_lui_num;
    const gramsLei = ing.unit === 'pz' ? ing.qty_lei_num * wpz : ing.qty_lei_num;
    kcalLui  += (gramsLui * kcal) / 100;
    protLui  += (gramsLui * protein) / 100;
    carbsLui += (gramsLui * carbs) / 100;
    fatsLui  += (gramsLui * fats) / 100;
    kcalLei  += (gramsLei * kcal) / 100;
    protLei  += (gramsLei * protein) / 100;
    carbsLei += (gramsLei * carbs) / 100;
    fatsLei  += (gramsLei * fats) / 100;
  }

  const r = v => Math.round(v);
  document.getElementById('prevKcalLui').textContent  = r(kcalLui);
  document.getElementById('prevProtLui').textContent  = r(protLui);
  document.getElementById('prevCarbsLui').textContent = r(carbsLui);
  document.getElementById('prevFatsLui').textContent  = r(fatsLui);
  document.getElementById('prevKcalLei').textContent  = r(kcalLei);
  document.getElementById('prevProtLei').textContent  = r(protLei);
  document.getElementById('prevCarbsLei').textContent = r(carbsLei);
  document.getElementById('prevFatsLei').textContent  = r(fatsLei);
}

function openMealForm(meal, presetCategory) {
  const form = document.getElementById('mealForm');
  form.reset();
  document.getElementById('mealFormTitle').textContent = meal ? 'Modifica pasto' : 'Nuovo pasto';
  document.getElementById('ingredientRows').innerHTML = '';

  if (meal) {
    for (const [key, val] of Object.entries(meal)) {
      const input = form.elements[key];
      if (input) input.value = val || '';
    }
    for (const ing of meal.ingredients || []) {
      addIngredientRow(ing);
    }
  } else if (presetCategory) {
    // Pre-seleziona la categoria attiva nel filtro
    const catSelect = form.elements['category'];
    if (catSelect) catSelect.value = presetCategory;
  }

  updateNutritionPreview();
  document.getElementById('mealFormOverlay').style.display = 'flex';
}

function closeMealForm() {
  document.getElementById('mealFormOverlay').style.display = 'none';
}

async function editMeal(id) {
  const meal = await api(`/meals/${id}`);
  openMealForm(meal);
}

async function deleteMeal(id, name) {
  if (!confirm(`Eliminare il pasto "${name}"?`)) return;
  await api(`/meals/${id}`, { method: 'DELETE' });
  showToast('Pasto eliminato.');
  await loadRicettario();
}

async function saveMeal() {
  const form = document.getElementById('mealForm');
  const data = Object.fromEntries(new FormData(form));

  const id = data.id ? parseInt(data.id, 10) : null;
  delete data.id;

  // Raccoglie gli ingredienti — i valori nutrizionali vengono calcolati dal server
  data.ingredients = collectIngredients();

  if (id) {
    await api(`/meals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    showToast('Pasto aggiornato!');
  } else {
    await api('/meals', { method: 'POST', body: JSON.stringify(data) });
    showToast('Pasto aggiunto!');
  }
  closeMealForm();
  await loadRicettario();
}

// ─── TAB: INGREDIENTI ─────────────────────────────────────────────────────────

let allIngredients = []; // cache per la ricerca locale

async function loadIngredienti() {
  document.getElementById('ingredientsGrid').innerHTML =
    '<div class="loading-state">Caricamento ingredienti...</div>';
  allIngredients = await api('/ingredients');
  renderIngredientiGrid(allIngredients);
}

function renderIngredientiGrid(list) {
  const grid = document.getElementById('ingredientsGrid');
  if (!list.length) {
    grid.innerHTML = '<div class="loading-state">Nessun ingrediente trovato.</div>';
    return;
  }
  grid.innerHTML = list.map(ing => `
    <div class="ingredient-card">
      <div class="ingredient-card-header">
        <span class="ingredient-card-name">${ing.name}</span>
        <div class="ingredient-card-actions">
          <button class="btn-sm" onclick="editIngrediente(${ing.id})">Modifica</button>
          <button class="btn-sm danger" onclick="deleteIngrediente(${ing.id}, '${ing.name.replace(/'/g, "\\'")}')">Elimina</button>
        </div>
      </div>
      <div class="ingredient-macros">
        <span class="macro-chip">⚡ ${ing.kcal_per_100} kcal</span>
        <span class="macro-chip">🥩 ${ing.protein_per_100}g prot</span>
        <span class="macro-chip">🌾 ${ing.carbs_per_100}g carb</span>
        <span class="macro-chip">🥑 ${ing.fats_per_100}g grassi</span>
        ${ing.weight_per_piece && ing.weight_per_piece !== 100 ? `<span class="macro-chip">📏 1 pz = ${ing.weight_per_piece}g</span>` : ''}
      </div>
      <div class="ingredient-card-meta">per 100g</div>
    </div>
  `).join('');
}

function openIngForm(ing) {
  const form = document.getElementById('ingForm');
  form.reset();
  document.getElementById('ingFormTitle').textContent = ing ? 'Modifica ingrediente' : 'Nuovo ingrediente';
  if (ing) {
    for (const [key, val] of Object.entries(ing)) {
      const input = form.elements[key];
      if (input) input.value = val ?? '';
    }
  }
  document.getElementById('ingFormOverlay').style.display = 'flex';
}

function closeIngForm() {
  document.getElementById('ingFormOverlay').style.display = 'none';
}

async function editIngrediente(id) {
  const ing = allIngredients.find(i => i.id === id);
  if (ing) openIngForm(ing);
}

async function deleteIngrediente(id, name) {
  if (!confirm(`Eliminare l'ingrediente "${name}"?`)) return;
  await api(`/ingredients/${id}`, { method: 'DELETE' });
  showToast('Ingrediente eliminato.');
  await loadIngredienti();
  await loadNutritionData(); // aggiorna cache autocomplete
}

function initIngredienti() {
  document.getElementById('btnNuovoIngrediente').addEventListener('click', () => openIngForm(null));
  document.getElementById('ingFormClose').addEventListener('click', closeIngForm);
  document.getElementById('ingFormCancel').addEventListener('click', closeIngForm);

  document.getElementById('btnLookupNutrition').addEventListener('click', async () => {
    const form = document.getElementById('ingForm');
    const name = form.elements['name'].value.trim();
    if (!name) {
      alert('Inserisci prima il nome dell\'ingrediente da cercare.');
      return;
    }
    const btn = document.getElementById('btnLookupNutrition');
    const origText = btn.textContent;
    btn.textContent = '⏳ Cercando...';
    btn.disabled = true;
    try {
      const result = await api(`/ingredients/lookup?q=${encodeURIComponent(name)}`);
      if (result.error) {
        alert(result.error);
      } else {
        form.elements['kcal_per_100'].value    = result.kcal_per_100;
        form.elements['protein_per_100'].value = result.protein_per_100;
        form.elements['carbs_per_100'].value   = result.carbs_per_100;
        form.elements['fats_per_100'].value    = result.fats_per_100;
        showToast('Valori nutrizionali trovati!');
      }
    } finally {
      btn.textContent = origText;
      btn.disabled = false;
    }
  });
  document.getElementById('ingFormOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('ingFormOverlay')) closeIngForm();
  });

  // Ricerca locale (filtra senza chiamate API)
  document.getElementById('ingredientSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = q ? allIngredients.filter(i => i.name.toLowerCase().includes(q)) : allIngredients;
    renderIngredientiGrid(filtered);
  });

  document.getElementById('ingForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    const id = data.id ? parseInt(data.id, 10) : null;
    delete data.id;
    ['kcal_per_100', 'protein_per_100', 'carbs_per_100', 'fats_per_100', 'weight_per_piece'].forEach(k => {
      data[k] = parseFloat(data[k]) || 0;
    });
    if (!data.weight_per_piece) data.weight_per_piece = 100;

    const result = id
      ? await api(`/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      : await api('/ingredients', { method: 'POST', body: JSON.stringify(data) });

    if (result.error) {
      alert(result.error);
      return;
    }
    showToast(id ? 'Ingrediente aggiornato!' : 'Ingrediente aggiunto!');
    closeIngForm();
    await loadIngredienti();
    await loadNutritionData(); // aggiorna cache autocomplete
  });
}

// ─── TAB: SPESA ───────────────────────────────────────────────────────────────

let shoppingWeek = null;
const checkedItems = new Set();

async function loadSpesa() {
  const list = document.getElementById('shoppingList');
  list.innerHTML = '<div class="loading-state">Caricamento lista...</div>';

  // Recupera le settimane che hanno un piano, con stato di conferma
  const weeksList = await api('/shopping/weeks');
  const select = document.getElementById('shoppingWeekSelect');
  select.innerHTML = '';

  if (!weeksList.length) {
    select.innerHTML = '<option value="">Nessun piano disponibile</option>';
    list.innerHTML = `<div class="shopping-empty">
      <span class="empty-icon">🛒</span>
      Nessun piano trovato.<br>
      Genera e conferma prima il piano settimanale.
    </div>`;
    return;
  }

  // Preferisce la settimana confermata come default
  const confirmedWeek = weeksList.find(w => w.confirmed);
  const fallback = weeksList[weeksList.length - 1].week;
  // Mantiene la selezione corrente se ancora valida
  const validCurrent = shoppingWeek && weeksList.find(w => w.week === shoppingWeek);
  if (!validCurrent) {
    shoppingWeek = confirmedWeek ? confirmedWeek.week : fallback;
  }

  for (const w of weeksList) {
    const opt = document.createElement('option');
    opt.value = w.week;
    opt.textContent = formatWeekLabel(w.week) + (w.confirmed ? ' ✓' : '');
    opt.selected = w.week === shoppingWeek;
    select.appendChild(opt);
  }

  const result = await api(`/shopping?week=${shoppingWeek}`);
  renderShoppingList(result.items || [], result.week);
}

function renderShoppingList(items, week) {
  const list = document.getElementById('shoppingList');
  if (!items.length) {
    list.innerHTML = `<div class="shopping-empty">
      <span class="empty-icon">🛒</span>
      Nessun ingrediente trovato per questa settimana.<br>
      Genera e conferma prima il piano settimanale.
    </div>`;
    return;
  }

  const weekLabel = formatWeekLabel(week);
  const rows = items.map(item => {
    const key = item.ingredient.toLowerCase();
    const isChecked = checkedItems.has(key);
    return `<div class="shopping-item ${isChecked ? 'checked' : ''}" data-key="${key}">
      <div class="shopping-check">${isChecked ? '✓' : ''}</div>
      <span class="shopping-name">${item.ingredient}</span>
      <span class="shopping-occ">${item.unit || ''}</span>
    </div>`;
  }).join('');

  list.innerHTML = `
    <div style="padding:12px 16px;font-size:13px;color:var(--text-muted);border-bottom:1px solid var(--border)">
      Settimana: <strong>${weekLabel}</strong> · ${items.length} ingredienti
    </div>
    <div class="shopping-list-inner">${rows}</div>
  `;

  list.querySelectorAll('.shopping-item').forEach(item => {
    item.addEventListener('click', () => {
      const key = item.dataset.key;
      if (checkedItems.has(key)) {
        checkedItems.delete(key);
      } else {
        checkedItems.add(key);
      }
      item.classList.toggle('checked');
      const check = item.querySelector('.shopping-check');
      check.textContent = checkedItems.has(key) ? '✓' : '';
    });
  });
}

function initSpesa() {
  document.getElementById('shoppingWeekSelect').addEventListener('change', async e => {
    shoppingWeek = e.target.value;
    checkedItems.clear();
    const list = document.getElementById('shoppingList');
    list.innerHTML = '<div class="loading-state">Caricamento lista...</div>';
    const result = await api(`/shopping?week=${shoppingWeek}`);
    renderShoppingList(result.items || [], result.week);
  });

  document.getElementById('btnInviaSpesa').addEventListener('click', async () => {
    if (!confirm('Inviare la lista spesa per email?')) return;
    const week = shoppingWeek || state.nextWeek;
    const result = await api('/shopping/send-email', {
      method: 'POST',
      body: JSON.stringify({ week }),
    });
    if (result.ok) {
      showToast('Lista spesa inviata via email!');
    } else {
      alert('Errore nell\'invio email. Controlla le impostazioni SMTP.');
    }
  });

  document.getElementById('btnStampa').addEventListener('click', () => window.print());
}

// ─── TAB: IMPOSTAZIONI ───────────────────────────────────────────────────────

async function loadImpostazioni() {
  const settings = await api('/settings');
  const form = document.getElementById('settingsForm');
  for (const [key, val] of Object.entries(settings)) {
    const input = form.elements[key];
    if (input) input.value = val;
  }
}

function initImpostazioni() {
  document.getElementById('settingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    const result = await api('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const feedback = document.getElementById('saveFeedback');
    feedback.textContent = result.ok ? '✓ Impostazioni salvate!' : '✗ Errore nel salvataggio';
    setTimeout(() => (feedback.textContent = ''), 3000);
    showToast('Impostazioni salvate!');
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  initTabs();
  initSwapModal();
  initRicettario();
  initIngredienti();
  initSpesa();
  initImpostazioni();
  await Promise.all([initPiano(), loadNutritionData()]);
}

document.addEventListener('DOMContentLoaded', init);
