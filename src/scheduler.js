'use strict';

const cron = require('node-cron');
const db = require('./database');
const { sendMealReminder, sendShoppingList } = require('./email');

function todayWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function todayDayOfWeek() {
  const day = new Date().getDay();
  // getDay: 0=dom,1=lun..6=sab → converti in 0=lun..6=dom
  return day === 0 ? 6 : day - 1;
}

function startScheduler() {
  // Reminder pranzo: 10:30 ogni giorno
  cron.schedule('30 10 * * *', async () => {
    console.log('[Scheduler] Reminder pranzo – ore 10:30');
    const weekStart = todayWeekStart();
    const dayOfWeek = todayDayOfWeek();
    await sendMealReminder('pranzo', weekStart, dayOfWeek);
  }, { timezone: 'Europe/Rome' });

  // Reminder cena: 16:30 ogni giorno
  cron.schedule('30 16 * * *', async () => {
    console.log('[Scheduler] Reminder cena – ore 16:30');
    const weekStart = todayWeekStart();
    const dayOfWeek = todayDayOfWeek();
    await sendMealReminder('cena', weekStart, dayOfWeek);
  }, { timezone: 'Europe/Rome' });

  // Reminder spesa: ogni domenica alle 20:00
  // Invia solo se il piano della settimana prossima è confermato
  cron.schedule('0 20 * * 0', async () => {
    console.log('[Scheduler] Check reminder spesa settimanale – domenica 20:00');
    const nextWeek = db.nextWeekStart();
    const status = db.getWeekStatus(nextWeek);
    if (status.confirmed && !status.shopping_sent) {
      console.log('[Scheduler] Piano confermato, invio lista spesa per', nextWeek);
      await sendShoppingList(nextWeek);
    } else if (!status.confirmed) {
      console.log('[Scheduler] Piano settimana prossima non ancora confermato, spesa non inviata.');
    } else {
      console.log('[Scheduler] Lista spesa già inviata per', nextWeek);
    }
  }, { timezone: 'Europe/Rome' });

  console.log('[Scheduler] Reminder attivi: pranzo 10:30, cena 16:30, spesa domenica 20:00 (Europe/Rome)');
}

module.exports = { startScheduler };
