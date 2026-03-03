'use strict';

const nodemailer = require('nodemailer');
const db = require('./database');

function getTransporter() {
  const settings = db.getAllSettings();
  return nodemailer.createTransport({
    host: settings.smtp_host || 'smtp.gmail.com',
    port: parseInt(settings.smtp_port || '587', 10),
    secure: false,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass,
    },
  });
}

function formatDate(weekStart, dayOfWeek) {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + dayOfWeek);
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function formatDateShort(weekStart, dayOfWeek) {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + dayOfWeek);
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
}

// ─── TEMPLATE BASE ────────────────────────────────────────────────────────────

function htmlWrapper(title, content) {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f7f5; margin: 0; padding: 20px; color: #2d3a2d; }
  .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #2e7d32, #66bb6a); padding: 28px 32px; text-align: center; }
  .header h1 { margin: 0; color: #fff; font-size: 26px; letter-spacing: -0.5px; }
  .header p { margin: 6px 0 0; color: rgba(255,255,255,.85); font-size: 14px; }
  .body { padding: 28px 32px; }
  .section { margin-bottom: 24px; }
  .section h2 { color: #2e7d32; font-size: 17px; margin: 0 0 12px; border-bottom: 2px solid #e8f5e9; padding-bottom: 6px; }
  .meal-card { background: #f9fbe7; border-left: 4px solid #66bb6a; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
  .meal-name { font-weight: 600; font-size: 15px; margin: 0 0 4px; }
  .meal-qty { color: #555; font-size: 14px; margin: 0; }
  .ingredient-list { list-style: none; margin: 0; padding: 0; }
  .ingredient-list li { padding: 8px 0; border-bottom: 1px solid #f0f4f0; font-size: 14px; display: flex; justify-content: space-between; }
  .ingredient-list li:last-child { border-bottom: none; }
  .ing-name { color: #333; }
  .ing-qty { color: #2e7d32; font-weight: 600; white-space: nowrap; margin-left: 12px; }
  .category-badge { display: inline-block; background: #e8f5e9; color: #2e7d32; border-radius: 20px; font-size: 12px; font-weight: 600; padding: 2px 10px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .5px; }
  .footer { background: #f5f7f5; padding: 16px 32px; text-align: center; font-size: 12px; color: #888; }
  .footer a { color: #2e7d32; }
  .highlight { background: #e8f5e9; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
  .highlight strong { color: #1b5e20; }
  table.shopping { width: 100%; border-collapse: collapse; font-size: 14px; }
  table.shopping th { background: #e8f5e9; color: #2e7d32; padding: 8px 12px; text-align: left; }
  table.shopping td { padding: 8px 12px; border-bottom: 1px solid #f0f4f0; }
  table.shopping tr:last-child td { border-bottom: none; }
  .person-label { font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🥗 BattiFame</h1>
    <p>${title}</p>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    Inviato da BattiFame · la tua app di nutrizione di coppia<br>
    <a href="http://localhost:3000">Apri l'app</a>
  </div>
</div>
</body>
</html>`;
}

// ─── EMAIL INGREDIENTI PASTO ──────────────────────────────────────────────────

async function sendMealReminder(mealCategory, weekStart, dayOfWeek) {
  const settings = db.getAllSettings();
  if (!settings.smtp_user || !settings.smtp_pass) {
    console.log('[Email] Credenziali SMTP non configurate, reminder saltato.');
    return;
  }

  const recipients = [settings.email_lui, settings.email_lei].filter(Boolean);
  if (recipients.length === 0) {
    console.log('[Email] Nessun destinatario configurato.');
    return;
  }

  const dayLabel = formatDate(weekStart, dayOfWeek);
  const planEntries = db.getWeekPlan(weekStart).filter(
    e => e.day_of_week === dayOfWeek && e.meal_category === mealCategory
  );

  if (planEntries.length === 0) {
    console.log(`[Email] Nessun pasto trovato per ${mealCategory} del ${dayLabel}`);
    return;
  }

  const entry = planEntries[0];
  const ingredients = db.getIngredients(entry.meal_option_id);

  const mealLabel = mealCategory === 'pranzo' ? 'Pranzo' : 'Cena';
  const timeLabel = mealCategory === 'pranzo' ? '10:30' : '16:30';

  const ingRowsLui = ingredients.filter(i => i.qty_lui && i.qty_lui !== '').map(i =>
    `<li><span class="ing-name">${i.ingredient}</span><span class="ing-qty">${i.qty_lui}</span></li>`
  ).join('');
  const ingRowsLei = ingredients.filter(i => i.qty_lei && i.qty_lei !== '').map(i =>
    `<li><span class="ing-name">${i.ingredient}</span><span class="ing-qty">${i.qty_lei}</span></li>`
  ).join('');

  const content = `
    <div class="highlight">
      <strong>${dayLabel}</strong> — Reminder delle ${timeLabel}
    </div>
    <div class="section">
      <h2>${mealLabel} di oggi</h2>
      <div class="meal-card">
        <p class="meal-name">${entry.name}</p>
      </div>
    </div>
    <div class="section">
      <span class="category-badge">👨 ${settings.nome_lui || 'Lui'}</span>
      <p class="meal-qty">${entry.qty_description_lui || ''}</p>
      <ul class="ingredient-list">${ingRowsLui}</ul>
    </div>
    <div class="section">
      <span class="category-badge">👩 ${settings.nome_lei || 'Lei'}</span>
      <p class="meal-qty">${entry.qty_description_lei || ''}</p>
      <ul class="ingredient-list">${ingRowsLei}</ul>
    </div>
  `;

  const html = htmlWrapper(`Reminder ${mealLabel} – ${dayLabel}`, content);

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"BattiFame" <${settings.smtp_user}>`,
      to: recipients.join(', '),
      subject: `🥗 ${mealLabel} di oggi – ${entry.name}`,
      html,
    });
    console.log(`[Email] Reminder ${mealLabel} inviato a: ${recipients.join(', ')}`);
  } catch (err) {
    console.error('[Email] Errore invio reminder:', err.message);
  }
}

// ─── EMAIL LISTA SPESA ────────────────────────────────────────────────────────

async function sendShoppingList(weekStart) {
  const settings = db.getAllSettings();
  if (!settings.smtp_user || !settings.smtp_pass) {
    console.log('[Email] Credenziali SMTP non configurate, lista spesa saltata.');
    return;
  }

  const recipients = [settings.email_lui, settings.email_lei].filter(Boolean);
  if (recipients.length === 0) return;

  const items = db.getShoppingList(weekStart);
  if (items.length === 0) {
    console.log('[Email] Lista spesa vuota per la settimana:', weekStart);
    return;
  }

  // Raggruppa per ingrediente, somma le quantità
  const d = new Date(weekStart + 'T00:00:00');
  const endDate = new Date(d);
  endDate.setDate(d.getDate() + 6);
  const weekLabel = `${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – ${endDate.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`;

  const rows = items.map(item => `
    <tr>
      <td>${item.ingredient}</td>
      <td>${item.unit}</td>
    </tr>
  `).join('');

  const content = `
    <div class="highlight">
      <strong>Lista della spesa</strong> per la settimana ${weekLabel}
    </div>
    <div class="section">
      <h2>Ingredienti da acquistare</h2>
      <table class="shopping">
        <thead><tr><th>Ingrediente</th><th>Unità</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p style="font-size:13px;color:#666;">Puoi vedere le quantità dettagliate per ciascun pasto aprendo l'app.</p>
  `;

  const html = htmlWrapper(`Lista della spesa – ${weekLabel}`, content);

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"BattiFame" <${settings.smtp_user}>`,
      to: recipients.join(', '),
      subject: `🛒 Lista della spesa – settimana del ${weekStart}`,
      html,
    });
    console.log('[Email] Lista spesa inviata per la settimana:', weekStart);
    db.markShoppingSent(weekStart);
  } catch (err) {
    console.error('[Email] Errore invio lista spesa:', err.message);
  }
}

module.exports = { sendMealReminder, sendShoppingList };
