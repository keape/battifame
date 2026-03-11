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

  // Pre-processa le entry: parse JSON
  for (const e of entries) {
    e._ingredients = e.ingredients_json ? JSON.parse(e.ingredients_json) : [];
    e._overrides_lui = e.qty_overrides_lui ? JSON.parse(e.qty_overrides_lui) : {};
    e._overrides_lei = e.qty_overrides_lei ? JSON.parse(e.qty_overrides_lei) : {};
    e._extras = e.extras_json ? JSON.parse(e.extras_json) : [];
  }

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

    // Calcola kcal giornalieri (usa plan_kcal se disponibile, altrimenti base)
    const dayEntries = byDay[day] || {};
    let kcalLui = 0, kcalLei = 0;
    for (const cat of CAT_LUI) {
      if (dayEntries[cat]) {
        const e = dayEntries[cat];
        let slotKcal = e.plan_kcal_lui ?? e.base_kcal_lui ?? 0;
        for (const ex of (e._extras || []).filter(ex => ex.person === 'lui')) {
          slotKcal += calcExtraKcal(ex, 'lui');
        }
        kcalLui += slotKcal;
      }
    }
    for (const cat of CAT_LEI) {
      if (dayEntries[cat]) {
        const e = dayEntries[cat];
        let slotKcal = e.plan_kcal_lei ?? e.base_kcal_lei ?? 0;
        for (const ex of (e._extras || []).filter(ex => ex.person === 'lei')) {
          slotKcal += calcExtraKcal(ex, 'lei');
        }
        kcalLei += slotKcal;
      }
    }

    html += `<div class="day-card">
      <div class="day-header">
        <span class="day-name">${DAYS_IT[day]}</span>
        <span class="day-date">${dateLabel}</span>
        <span class="day-kcal">${kcalLui > 0 ? `👨 ${kcalLui} kcal` : ''}${kcalLei > 0 ? ` · 👩 ${kcalLei} kcal` : ''}</span>
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

  // Slot vuoti — clic per aggiungere pasto
  grid.querySelectorAll('.meal-row-empty').forEach(row => {
    row.addEventListener('click', () => {
      const { cat, day, week } = row.dataset;
      openSwapModal(cat, parseInt(day, 10), week);
    });
  });

  // Pulsanti swap nei slot pieni
  grid.querySelectorAll('.meal-swap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const { cat, day, week } = btn.dataset;
      openSwapModal(cat, parseInt(day, 10), week);
    });
  });

  // Qty inputs — aggiorna kcal in tempo reale e auto-save
  grid.querySelectorAll('.plan-qty-input').forEach(inp => {
    inp.addEventListener('input', () => updateSlotKcal(inp));
    inp.addEventListener('change', () => savePlanQty(inp));
  });

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

  // Abilita/disabilita pulsante conferma
  const filled = Object.values(byDay).reduce((acc, dayObj) => acc + Object.keys(dayObj).length, 0);
  document.getElementById('btnConferma').disabled =
    (state.planData.status && state.planData.status.confirmed) || filled === 0;
}

function calcExtraKcal(extra, person) {
  if (extra.type === 'recipe') {
    const base = person === 'lui' ? (extra.base_kcal_lui || 0) : (extra.base_kcal_lei || 0);
    return Math.round(base * extra.qty);
  } else {
    const kcalPer100 = extra.kcal_per_100 || 0;
    const grams = extra.unit === 'pz'
      ? extra.qty * (extra.weight_per_piece || 100)
      : extra.qty;
    return Math.round(kcalPer100 * grams / 100);
  }
}

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

function renderMealRow(entry, cat, day, person) {
  if (!entry || !entry.meal_option_id) {
    return `<div class="meal-row-empty" data-cat="${cat}" data-day="${day}" data-week="${state.viewWeek}">
      <span class="meal-cat-badge cat-${cat}">${CAT_LABELS[cat]}</span>
      <span class="meal-info"><span class="meal-empty">Nessun pasto — clicca per aggiungere</span></span>
    </div>`;
  }

  const baseKcal = person === 'lui'
    ? (entry.base_kcal_lui ?? 0)
    : (entry.base_kcal_lei ?? 0);

  const overrides = person === 'lui' ? (entry._overrides_lui || {}) : (entry._overrides_lei || {});
  const factor = overrides._factor != null ? overrides._factor : 1;
  const kcal = Math.round(baseKcal * factor);
  const ingredients = entry._ingredients || [];

  const ingRowsHtml = ingredients.map(ing => {
    const qty = Math.round(ing.qty_base_num * factor * 10) / 10;
    return `<div class="plan-qty-row plan-ing-row">
      <span class="plan-qty-label" title="${escHtml(ing.ingredient)}">${escHtml(ing.ingredient)}</span>
      <span class="plan-qty-ing-val" data-base="${ing.qty_base_num}">${qty}</span>
      <span class="plan-qty-unit">${ing.unit}</span>
    </div>`;
  }).join('');

  const qtyInputHtml = `<div class="plan-qty-inputs">
    <div class="plan-qty-row">
      <span class="plan-qty-label">Porzione</span>
      <input type="number" class="plan-qty-input" min="0" step="0.1"
             data-plan-id="${entry.id}" data-person="${person}"
             data-base-kcal="${baseKcal}"
             value="${factor}">
      <span class="plan-qty-unit">×</span>
    </div>
    ${ingRowsHtml ? `<div class="plan-ing-list">${ingRowsHtml}</div>` : ''}
  </div>`;

  return `<div class="meal-slot" data-plan-id="${entry.id}">
    <div class="meal-slot-header">
      <span class="meal-cat-badge cat-${cat}">${CAT_LABELS[cat]}</span>
      <div class="meal-slot-name-area">
        <span class="meal-name">${escHtml(entry.name)}</span>
        <span class="meal-kcal"><span class="plan-kcal" data-person="${person}">${kcal > 0 ? kcal : 0}</span> kcal</span>
      </div>
      <button class="btn-sm meal-swap-btn" data-cat="${cat}" data-day="${day}" data-week="${state.viewWeek}" title="Cambia pasto">↔</button>
    </div>
    ${baseKcal > 0 ? qtyInputHtml : ''}
    ${renderExtrasHtml(entry._extras, person)}
    <button class="btn-add-extra" data-plan-id="${entry.id}" data-person="${person}">+ Extra</button>
  </div>`;
}

function findPlanEntry(planId) {
  return (state.planData?.entries || []).find(e => e.id === planId) || null;
}

function updateSlotKcal(changedInput) {
  const person = changedInput.dataset.person;
  const slot = changedInput.closest('.meal-slot');
  if (!slot) return;

  const baseKcal = parseFloat(changedInput.dataset.baseKcal) || 0;
  const factor = parseFloat(changedInput.value) || 0;
  let kcal = Math.round(baseKcal * factor);

  // Somma kcal extra
  const planId = parseInt(slot.dataset.planId, 10);
  const entry = findPlanEntry(planId);
  if (entry) {
    for (const ex of (entry._extras || []).filter(ex => ex.person === person)) {
      kcal += calcExtraKcal(ex, person);
    }
  }

  const kcalEl = slot.querySelector(`.plan-kcal[data-person="${person}"]`);
  if (kcalEl) kcalEl.textContent = kcal > 0 ? kcal : 0;

  slot.querySelectorAll('.plan-qty-ing-val').forEach(el => {
    const base = parseFloat(el.dataset.base) || 0;
    el.textContent = Math.round(base * factor * 10) / 10;
  });

  const dayCard = slot.closest('.day-card');
  if (dayCard) updateDayKcalHeader(dayCard);
}

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

function updateDayKcalHeader(dayCard) {
  let kcalLui = 0, kcalLei = 0;
  dayCard.querySelectorAll('.plan-kcal[data-person="lui"]').forEach(el => {
    kcalLui += parseInt(el.textContent, 10) || 0;
  });
  dayCard.querySelectorAll('.plan-kcal[data-person="lei"]').forEach(el => {
    kcalLei += parseInt(el.textContent, 10) || 0;
  });
  const dayKcalEl = dayCard.querySelector('.day-kcal');
  if (dayKcalEl) {
    dayKcalEl.textContent =
      (kcalLui > 0 ? `👨 ${kcalLui} kcal` : '') +
      (kcalLei > 0 ? ` · 👩 ${kcalLei} kcal` : '');
  }
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
        <span>⚡ ${m.kcal_lui || 0} kcal (base)</span>
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

// ─── EXTRA MODAL ──────────────────────────────────────────────────────────────

const extraModalState = {
  planId: null,
  person: 'lui',
  type: 'ingredient',
  refId: null,
};

let _mealsCache = null;
let _ingredientsCache = null;

async function ensureExtraSearchCache() {
  if (!_ingredientsCache) {
    _ingredientsCache = await api('/ingredients');
  }
  if (!_mealsCache) {
    const all = await api('/meals');
    _mealsCache = Array.isArray(all) ? all : [];
  }
}

function openExtraModal(planId, person) {
  extraModalState.planId = planId;
  extraModalState.person = person;
  extraModalState.refId = null;
  extraModalState.type = 'ingredient';

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
  document.getElementById('extraSearchInput').placeholder = 'Cerca alimento...';

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
      .map(i => ({ id: i.id, name: i.name, meta: `${i.kcal_per_100} kcal/100g` }));
  } else {
    items = (_mealsCache || [])
      .filter(m => m.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map(m => ({ id: m.id, name: m.name, meta: `${m.kcal_lui || 0} kcal (base)` }));
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
  if (extra.error) { alert(extra.error); return; }

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
  const result = await api(`/plan/extras/${extraId}`, { method: 'DELETE' });
  if (result && result.error) { alert(result.error); return; }

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

    // Ricalcola e salva kcal slot
    const qtyInput = slot.querySelector('.plan-qty-input');
    if (qtyInput) {
      updateSlotKcal(qtyInput);
      savePlanQty(qtyInput);
    } else {
      // Slot senza ricetta con kcal base (slot vuoto o colazione senza valori)
      let kcal = 0;
      for (const ex of (entry._extras || []).filter(e => e.person === person)) {
        kcal += calcExtraKcal(ex, person);
      }
      const kcalEl = slot.querySelector(`.plan-kcal[data-person="${person}"]`);
      if (kcalEl) kcalEl.textContent = kcal;

      const body = { plan_id: planId };
      if (person === 'lui') body.plan_kcal_lui = kcal;
      else body.plan_kcal_lei = kcal;
      api('/plan/quantities', { method: 'PUT', body: JSON.stringify(body) });

      const dayCard = slot.closest('.day-card');
      if (dayCard) updateDayKcalHeader(dayCard);
    }

    // Re-wire remove buttons on the updated list
    slot.querySelectorAll('.extra-item-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        removeExtra(parseInt(btn.dataset.extraId, 10), planId);
      });
    });
  });
}

function initExtraModal() {
  document.getElementById('extraPersonGroup').addEventListener('click', e => {
    const btn = e.target.closest('button[data-val]');
    if (!btn) return;
    extraModalState.person = btn.dataset.val;
    document.querySelectorAll('#extraPersonGroup button').forEach(b =>
      b.classList.toggle('active', b.dataset.val === extraModalState.person));
  });

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
    document.getElementById('extraSearchInput').placeholder =
      extraModalState.type === 'ingredient' ? 'Cerca alimento...' : 'Cerca ricetta...';
    await ensureExtraSearchCache();
  });

  document.getElementById('extraSearchInput').addEventListener('input', async e => {
    await ensureExtraSearchCache();
    updateExtraSearchResults(e.target.value);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.extra-modal')) {
      document.getElementById('extraSearchResults')?.classList.remove('open');
    }
  });

  document.getElementById('extraModalCancel').addEventListener('click', closeExtraModal);
  document.getElementById('extraModalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('extraModalOverlay')) closeExtraModal();
  });

  document.getElementById('extraModalConfirm').addEventListener('click', confirmAddExtra);
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
      <div class="nutrition-grid" style="grid-template-columns:1fr">
        <div class="nutrition-col">
          <div class="nutrition-col-label">⚡ Kcal base</div>
          <div><span class="kcal-big">${m.kcal_lui || 0}</span> <span class="kcal-unit">kcal</span></div>
          ${m.qty_description_lui ? `<div class="qty-text">${m.qty_description_lui}</div>` : ''}
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
  const qtyBase = data.qty_base_num != null ? data.qty_base_num : (data.qty_lui_num != null ? data.qty_lui_num : '');
  row.innerHTML = `
    <input type="text" class="ing-name" placeholder="es. Pasta" list="ingredientSuggestions" value="${escHtml(data.ingredient || '')}">
    <input type="number" class="ing-qty" placeholder="0" min="0" step="any" value="${qtyBase}">
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
    const qty_base_num = parseFloat(row.querySelector('.ing-qty').value) || 0;
    const unit = row.querySelector('.ing-unit').value;
    result.push({ ingredient, qty_base_num, unit });
  }
  return result;
}

function updateNutritionPreview() {
  const ingredients = collectIngredients();
  let kcal = 0, prot = 0, carbs = 0, fats = 0;

  for (const ing of ingredients) {
    const key = ing.ingredient.toLowerCase().trim();
    const nd = nutritionDataCache[key];
    if (!nd) continue;
    const wpz = nd.weight_per_piece || 100;
    const grams = ing.unit === 'pz' ? ing.qty_base_num * wpz : ing.qty_base_num;
    kcal += (grams * nd.kcal_per_100)    / 100;
    prot += (grams * nd.protein_per_100) / 100;
    carbs += (grams * nd.carbs_per_100)  / 100;
    fats += (grams * nd.fats_per_100)    / 100;
  }

  const r = v => Math.round(v);
  document.getElementById('prevKcalBase').textContent  = r(kcal);
  document.getElementById('prevProtBase').textContent  = r(prot);
  document.getElementById('prevCarbsBase').textContent = r(carbs);
  document.getElementById('prevFatsBase').textContent  = r(fats);
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
  stopBarcodeScanner();
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

// ─── BARCODE SCAN ─────────────────────────────────────────────────────────────
let zxingReader = null;

async function lookupByBarcode(code) {
  code = (code || '').trim();
  if (!code) { alert('Inserisci un codice a barre.'); return; }
  const result = await api(`/ingredients/barcode/${encodeURIComponent(code)}`);
  if (result.error) { alert(result.error); return; }
  const form = document.getElementById('ingForm');
  if (result.name) form.elements['name'].value = result.name;
  form.elements['kcal_per_100'].value    = result.kcal_per_100;
  form.elements['protein_per_100'].value = result.protein_per_100;
  form.elements['carbs_per_100'].value   = result.carbs_per_100;
  form.elements['fats_per_100'].value    = result.fats_per_100;
  showToast('Prodotto trovato!');
}

function stopBarcodeScanner() {
  if (zxingReader) { try { zxingReader.reset(); } catch (_) {} zxingReader = null; }
  document.getElementById('cameraOverlay').classList.add('hidden');
}

async function startBarcodeScanner() {
  document.getElementById('cameraOverlay').classList.remove('hidden');
  try {
    zxingReader = new ZXingBrowser.BrowserMultiFormatReader();
    await zxingReader.decodeFromVideoDevice(
      undefined,
      document.getElementById('cameraFeed'),
      (result, err) => {
        if (result) {
          const code = result.getText();
          stopBarcodeScanner();
          document.getElementById('barcodeInput').value = code;
          lookupByBarcode(code);
        }
        // err durante scan continuo è normale — ignorare
      }
    );
  } catch (err) {
    stopBarcodeScanner();
    alert('Impossibile accedere alla fotocamera. Digita il codice manualmente.');
  }
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
  document.getElementById('btnScanBarcode').addEventListener('click', startBarcodeScanner);
  document.getElementById('btnCloseCamera').addEventListener('click', stopBarcodeScanner);
  document.getElementById('btnLookupBarcode').addEventListener('click', () => {
    lookupByBarcode(document.getElementById('barcodeInput').value);
  });
  document.getElementById('barcodeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); lookupByBarcode(e.target.value); }
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

// ─── STATISTICHE ─────────────────────────────────────────────────────────────

const TARGETS_KCAL = { lui: 1635, lei: 1686 };
let chartWeight   = null;
let chartCalories = null;

function initStatistiche() {
  let currentPerson = 'lui';
  let currentFrom, currentTo;

  function isoDate(d) { return d.toISOString().slice(0, 10); }

  function setRange(days) {
    const to   = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    currentFrom = isoDate(from);
    currentTo   = isoDate(to);
    document.getElementById('statsFrom').value = currentFrom;
    document.getElementById('statsTo').value   = currentTo;
  }

  // Default: ultime 4 settimane
  setRange(28);
  document.getElementById('weightDate').value = isoDate(new Date());

  // ── Persona ──────────────────────────────────────────────────────────────
  document.querySelectorAll('.stats-person-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-person-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPerson = btn.dataset.person;
      loadStats();
    });
  });

  // ── Periodo preimpostato ─────────────────────────────────────────────────
  const customRangeEl = document.querySelector('.stats-custom-range');
  document.querySelectorAll('.stats-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = parseInt(btn.dataset.days, 10);
      if (days === 0) {
        customRangeEl.classList.remove('hidden');
      } else {
        customRangeEl.classList.add('hidden');
        setRange(days);
        loadStats();
      }
    });
  });

  // ── Periodo personalizzato ───────────────────────────────────────────────
  document.getElementById('btnStatsApply').addEventListener('click', () => {
    currentFrom = document.getElementById('statsFrom').value;
    currentTo   = document.getElementById('statsTo').value;
    if (currentFrom && currentTo) loadStats();
  });

  // ── Inserimento peso ─────────────────────────────────────────────────────
  document.getElementById('btnAddWeight').addEventListener('click', async () => {
    const date      = document.getElementById('weightDate').value;
    const weight_kg = parseFloat(document.getElementById('weightValue').value);
    if (!date || !weight_kg || weight_kg <= 0) {
      alert('Inserisci data e peso validi.');
      return;
    }
    const result = await api('/stats/weight', {
      method: 'POST',
      body:   JSON.stringify({ date, person: currentPerson, weight_kg }),
    });
    if (result.error) { alert(result.error); return; }
    document.getElementById('weightValue').value = '';
    loadStats();
  });

  // ── Carica dati e aggiorna grafici ────────────────────────────────────────
  async function loadStats() {
    const qs = `person=${currentPerson}&from=${currentFrom}&to=${currentTo}`;
    const [weightData, calorieData] = await Promise.all([
      api(`/stats/weight?${qs}`),
      api(`/stats/calories?${qs}`),
    ]);
    if (!Array.isArray(weightData) || !Array.isArray(calorieData)) return;
    renderWeightChart(weightData);
    renderWeightList(weightData);
    renderCalorieChart(calorieData);
  }

  function renderWeightChart(data) {
    const ctx     = document.getElementById('chartWeight').getContext('2d');
    const emptyEl = document.getElementById('chartWeightEmpty');
    if (chartWeight) { chartWeight.destroy(); chartWeight = null; }
    if (!data.length) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';
    chartWeight = new Chart(ctx, {
      type: 'line',
      data: {
        labels:   data.map(e => e.date),
        datasets: [{
          label:           'Peso (kg)',
          data:            data.map(e => e.weight_kg),
          borderColor:     '#388e3c',
          backgroundColor: 'rgba(56,142,60,.1)',
          tension:         0.3,
          pointRadius:     4,
          fill:            true,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { title: { display: true, text: 'kg' } },
          x: { ticks: { maxTicksLimit: 8 } },
        },
      },
    });
  }

  function renderWeightList(data) {
    const list   = document.getElementById('weightList');
    const recent = [...data].reverse().slice(0, 10);
    list.innerHTML = recent.map(e =>
      `<div class="stats-weight-item">
         <span>${e.date}</span>
         <strong>${e.weight_kg} kg</strong>
         <button class="stats-del-btn" data-id="${e.id}" title="Elimina">🗑</button>
       </div>`
    ).join('') || '<p style="color:var(--text-muted);font-size:13px;margin:0">Nessuna misurazione registrata.</p>';

    list.querySelectorAll('.stats-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await api(`/stats/weight/${btn.dataset.id}`, { method: 'DELETE' });
        loadStats();
      });
    });
  }

  function renderCalorieChart(data) {
    const ctx     = document.getElementById('chartCalories').getContext('2d');
    const emptyEl = document.getElementById('chartCaloriesEmpty');
    if (chartCalories) { chartCalories.destroy(); chartCalories = null; }
    if (!data.length) {
      emptyEl.style.display = '';
      return;
    }
    emptyEl.style.display = 'none';
    const target = TARGETS_KCAL[currentPerson];
    chartCalories = new Chart(ctx, {
      type: 'bar',
      data: {
        labels:   data.map(e => e.day_date),
        datasets: [
          {
            label:           'Kcal giornaliere',
            data:            data.map(e => e.total_kcal),
            backgroundColor: 'rgba(56,142,60,.7)',
            borderRadius:    4,
          },
          {
            label:       `Target (${target} kcal)`,
            data:        Array(data.length).fill(target),
            type:        'line',
            borderColor: '#f57f17',
            borderDash:  [6, 4],
            borderWidth: 2,
            pointRadius: 0,
            fill:        false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          y: { title: { display: true, text: 'kcal' }, beginAtZero: false },
          x: { ticks: { maxTicksLimit: 10 } },
        },
      },
    });
  }

  // Carica quando si apre il tab Statistiche (lazy: evita canvas 0x0)
  document.querySelectorAll('[data-tab="statistiche"]').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(loadStats, 50));
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
  initTabs();
  initSwapModal();
  initExtraModal();
  initRicettario();
  initIngredienti();
  initSpesa();
  initImpostazioni();
  initStatistiche();
  await Promise.all([initPiano(), loadNutritionData()]);
}

document.addEventListener('DOMContentLoaded', init);
