'use strict';

const db = require('./database');

// versione del seed — incrementare quando si modifica la struttura dati
const SEED_VERSION = '3';

const MEALS = [
  // ─── COLAZIONE ────────────────────────────────────────────────────────────
  {
    name: 'Yogurt greco con frutta e noci',
    category: 'colazione',
    description: 'Mescolare yogurt greco con frutta fresca di stagione e noci spezzettate.',
    ingredients: [
      { ingredient: 'Yogurt greco 0%',            unit: 'g',  qty_lui_num: 180, qty_lei_num: 150 },
      { ingredient: 'Frutta fresca di stagione',   unit: 'g',  qty_lui_num: 100, qty_lei_num: 80  },
      { ingredient: 'Noci',                        unit: 'g',  qty_lui_num: 15,  qty_lei_num: 10  },
    ],
  },
  {
    name: 'Pane integrale con ricotta e miele',
    category: 'colazione',
    description: 'Tostare il pane, spalmare la ricotta e aggiungere un filo di miele.',
    ingredients: [
      { ingredient: 'Pane integrale',  unit: 'g',  qty_lui_num: 80, qty_lei_num: 60 },
      { ingredient: 'Ricotta',         unit: 'g',  qty_lui_num: 60, qty_lei_num: 50 },
      { ingredient: 'Miele',           unit: 'g',  qty_lui_num: 10, qty_lei_num: 8  },
    ],
  },
  {
    name: 'Porridge di avena con latte e banana',
    category: 'colazione',
    description: 'Cuocere i fiocchi di avena nel latte parzialmente scremato, aggiungere la banana a rondelle.',
    ingredients: [
      { ingredient: 'Fiocchi d\'avena',              unit: 'g',  qty_lui_num: 80,  qty_lei_num: 60  },
      { ingredient: 'Latte parzialmente scremato',   unit: 'ml', qty_lui_num: 200, qty_lei_num: 150 },
      { ingredient: 'Banana',                        unit: 'pz', qty_lui_num: 1,   qty_lei_num: 1   },
    ],
  },
  {
    name: 'Uova strapazzate con pane integrale',
    category: 'colazione',
    description: 'Strapazzare le uova in padella antiaderente con un filo d\'olio, servire con pane tostato.',
    ingredients: [
      { ingredient: 'Uova',                        unit: 'pz', qty_lui_num: 2,  qty_lei_num: 2  },
      { ingredient: 'Pane integrale',              unit: 'g',  qty_lui_num: 60, qty_lei_num: 40 },
      { ingredient: 'Olio extravergine d\'oliva',  unit: 'ml', qty_lui_num: 5,  qty_lei_num: 5  },
    ],
  },

  // ─── SPUNTINO ─────────────────────────────────────────────────────────────
  {
    name: 'Gallette di riso con hummus',
    category: 'spuntino',
    description: 'Spalmare l\'hummus sulle gallette di riso. Fonte di fibre e proteine vegetali.',
    ingredients: [
      { ingredient: 'Gallette di riso', unit: 'pz', qty_lui_num: 3,  qty_lei_num: 3  },
      { ingredient: 'Hummus',           unit: 'g',  qty_lui_num: 40, qty_lei_num: 40 },
    ],
  },
  {
    name: 'Pane integrale con burro di arachidi',
    category: 'spuntino',
    description: 'Scegliere burro di arachidi al 100%, senza zuccheri o oli aggiunti.',
    ingredients: [
      { ingredient: 'Pane integrale',                    unit: 'g', qty_lui_num: 40, qty_lei_num: 30 },
      { ingredient: 'Burro di arachidi (100% arachidi)', unit: 'g', qty_lui_num: 15, qty_lei_num: 15 },
    ],
  },

  // ─── PRANZO ──────────────────────────────────────────────────────────────
  {
    name: 'Pasta al pomodoro con insalata verde',
    category: 'pranzo',
    description: 'Pasta integrale con passata di pomodoro, basilico e un filo d\'olio. Insalata mista a parte.',
    ingredients: [
      { ingredient: 'Pasta integrale',              unit: 'g',  qty_lui_num: 90,  qty_lei_num: 75  },
      { ingredient: 'Pomodori pelati',              unit: 'g',  qty_lui_num: 200, qty_lei_num: 180 },
      { ingredient: 'Basilico fresco',              unit: 'g',  qty_lui_num: 5,   qty_lei_num: 5   },
      { ingredient: 'Olio extravergine d\'oliva',   unit: 'ml', qty_lui_num: 10,  qty_lei_num: 8   },
      { ingredient: 'Insalata mista',               unit: 'g',  qty_lui_num: 100, qty_lei_num: 100 },
    ],
  },
  {
    name: 'Pollo alla griglia con verdure e pane',
    category: 'pranzo',
    description: 'Petto di pollo grigliato con verdure di stagione al vapore e pane integrale.',
    ingredients: [
      { ingredient: 'Petto di pollo',              unit: 'g',  qty_lui_num: 180, qty_lei_num: 150 },
      { ingredient: 'Verdure miste di stagione',   unit: 'g',  qty_lui_num: 200, qty_lei_num: 200 },
      { ingredient: 'Pane integrale',              unit: 'g',  qty_lui_num: 50,  qty_lei_num: 40  },
      { ingredient: 'Olio extravergine d\'oliva',  unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
  {
    name: 'Zuppa di legumi con pane integrale',
    category: 'pranzo',
    description: 'Zuppa ricca di lenticchie, fagioli o ceci con verdure. Completare con pane tostato.',
    ingredients: [
      { ingredient: 'Legumi misti (lenticchie/fagioli/ceci)', unit: 'g',  qty_lui_num: 150, qty_lei_num: 130 },
      { ingredient: 'Brodo vegetale',                          unit: 'ml', qty_lui_num: 300, qty_lei_num: 280 },
      { ingredient: 'Carote',                                  unit: 'g',  qty_lui_num: 80,  qty_lei_num: 80  },
      { ingredient: 'Sedano',                                  unit: 'g',  qty_lui_num: 50,  qty_lei_num: 50  },
      { ingredient: 'Pane integrale',                          unit: 'g',  qty_lui_num: 80,  qty_lei_num: 60  },
      { ingredient: 'Olio extravergine d\'oliva',              unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
  {
    name: 'Riso integrale con salmone e verdure',
    category: 'pranzo',
    description: 'Riso integrale con salmone al vapore o alla piastra, verdure grigliate.',
    ingredients: [
      { ingredient: 'Riso integrale',              unit: 'g',  qty_lui_num: 90,  qty_lei_num: 75  },
      { ingredient: 'Salmone fresco',              unit: 'g',  qty_lui_num: 150, qty_lei_num: 130 },
      { ingredient: 'Verdure grigliate miste',     unit: 'g',  qty_lui_num: 150, qty_lei_num: 150 },
      { ingredient: 'Olio extravergine d\'oliva',  unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
  {
    name: 'Insalata di farro con tonno e pomodori',
    category: 'pranzo',
    description: 'Insalata fredda di farro con tonno al naturale, pomodorini e olive.',
    ingredients: [
      { ingredient: 'Farro perlato',               unit: 'g',  qty_lui_num: 80,  qty_lei_num: 65  },
      { ingredient: 'Tonno al naturale',           unit: 'g',  qty_lui_num: 120, qty_lei_num: 100 },
      { ingredient: 'Pomodorini',                  unit: 'g',  qty_lui_num: 150, qty_lei_num: 150 },
      { ingredient: 'Olive (es. taggiasche)',       unit: 'pz', qty_lui_num: 10,  qty_lei_num: 8   },
      { ingredient: 'Olio extravergine d\'oliva',  unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },

  // ─── MERENDA (lui e lei) ──────────────────────────────────────────────────
  {
    name: 'Yogurt magro con miele',
    category: 'merenda',
    description: 'Yogurt naturale magro con un tocco di dolcezza dal miele.',
    ingredients: [
      { ingredient: 'Yogurt magro naturale', unit: 'g', qty_lui_num: 150, qty_lei_num: 150 },
      { ingredient: 'Miele',                unit: 'g', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
  {
    name: 'Gallette di riso con marmellata',
    category: 'merenda',
    description: 'Gallette con marmellata senza zuccheri aggiunti.',
    ingredients: [
      { ingredient: 'Gallette di riso',          unit: 'pz', qty_lui_num: 3,  qty_lei_num: 3  },
      { ingredient: 'Marmellata senza zucchero', unit: 'g',  qty_lui_num: 20, qty_lei_num: 20 },
    ],
  },
  // ─── CENA ─────────────────────────────────────────────────────────────────
  {
    name: 'Merluzzo al forno con patate e insalata',
    category: 'cena',
    description: 'Merluzzo in forno con patate al rosmarino e insalata verde.',
    ingredients: [
      { ingredient: 'Merluzzo fresco o surgelato', unit: 'g',  qty_lui_num: 200, qty_lei_num: 180 },
      { ingredient: 'Patate',                      unit: 'g',  qty_lui_num: 200, qty_lei_num: 220 },
      { ingredient: 'Insalata verde',              unit: 'g',  qty_lui_num: 100, qty_lei_num: 100 },
      { ingredient: 'Rosmarino',                   unit: 'g',  qty_lui_num: 2,   qty_lei_num: 2   },
      { ingredient: 'Olio extravergine d\'oliva',  unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
  {
    name: 'Zuppa di verdure con legumi e pane',
    category: 'cena',
    description: 'Minestrone ricco con legumi. Piatto completo e saziante.',
    ingredients: [
      { ingredient: 'Fagioli borlotti o cannellini', unit: 'g',  qty_lui_num: 100, qty_lei_num: 100 },
      { ingredient: 'Carote',                         unit: 'g',  qty_lui_num: 80,  qty_lei_num: 80  },
      { ingredient: 'Zucchine',                       unit: 'g',  qty_lui_num: 80,  qty_lei_num: 80  },
      { ingredient: 'Patate',                         unit: 'g',  qty_lui_num: 80,  qty_lei_num: 80  },
      { ingredient: 'Pomodori pelati',                unit: 'g',  qty_lui_num: 100, qty_lei_num: 100 },
      { ingredient: 'Brodo vegetale',                 unit: 'ml', qty_lui_num: 400, qty_lei_num: 400 },
      { ingredient: 'Pane integrale',                 unit: 'g',  qty_lui_num: 60,  qty_lei_num: 60  },
      { ingredient: 'Olio extravergine d\'oliva',     unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
  {
    name: 'Tacchino al vapore con quinoa e verdure',
    category: 'cena',
    description: 'Petto di tacchino cotto al vapore con quinoa e verdure grigliate.',
    ingredients: [
      { ingredient: 'Petto di tacchino',           unit: 'g',  qty_lui_num: 180, qty_lei_num: 160 },
      { ingredient: 'Quinoa',                      unit: 'g',  qty_lui_num: 80,  qty_lei_num: 80  },
      { ingredient: 'Verdure grigliate miste',     unit: 'g',  qty_lui_num: 150, qty_lei_num: 150 },
      { ingredient: 'Olio extravergine d\'oliva',  unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
  {
    name: 'Frittata di verdure con pane integrale',
    category: 'cena',
    description: 'Frittata al forno con verdure di stagione, servita con pane integrale.',
    ingredients: [
      { ingredient: 'Uova',                                   unit: 'pz', qty_lui_num: 3,   qty_lei_num: 2   },
      { ingredient: 'Verdure miste (zucchine, peperoni...)',   unit: 'g',  qty_lui_num: 150, qty_lei_num: 150 },
      { ingredient: 'Pane integrale',                         unit: 'g',  qty_lui_num: 50,  qty_lei_num: 50  },
      { ingredient: 'Olio extravergine d\'oliva',             unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
  {
    name: 'Minestra di farro e ceci',
    category: 'cena',
    description: 'Minestra rustica italiana con farro e ceci, profumata di rosmarino.',
    ingredients: [
      { ingredient: 'Farro perlato',               unit: 'g',  qty_lui_num: 80,  qty_lei_num: 70  },
      { ingredient: 'Ceci lessi',                  unit: 'g',  qty_lui_num: 200, qty_lei_num: 220 },
      { ingredient: 'Brodo vegetale',              unit: 'ml', qty_lui_num: 400, qty_lei_num: 400 },
      { ingredient: 'Rosmarino',                   unit: 'g',  qty_lui_num: 2,   qty_lei_num: 2   },
      { ingredient: 'Aglio',                       unit: 'pz', qty_lui_num: 1,   qty_lei_num: 1   },
      { ingredient: 'Olio extravergine d\'oliva',  unit: 'ml', qty_lui_num: 8,   qty_lei_num: 8   },
    ],
  },
];

function seed() {
  const currentVersion = db.getSetting('db_seed_version');
  if (currentVersion === SEED_VERSION) {
    console.log(`[Seed] Già alla versione ${SEED_VERSION}. Skip.`);
    return;
  }

  // Cancella e reinserisce pasti (piani non toccati se confermati, ma più semplice resettarli)
  const d = db.getDb();
  d.pragma('foreign_keys = OFF');
  d.prepare('DELETE FROM weekly_plan').run();
  d.prepare('DELETE FROM week_status').run();
  d.prepare('DELETE FROM meal_ingredients').run();
  d.prepare('DELETE FROM meal_options').run();
  try {
    d.prepare("DELETE FROM sqlite_sequence WHERE name IN ('meal_options','meal_ingredients','weekly_plan','week_status')").run();
  } catch (_) { /* sqlite_sequence potrebbe non esistere */ }
  d.pragma('foreign_keys = ON');

  console.log('[Seed] Popolamento database (versione ' + SEED_VERSION + ')...');
  for (const meal of MEALS) {
    const { ingredients, ...mealData } = meal;
    const created = db.createMeal(mealData);
    if (ingredients && ingredients.length > 0) {
      db.replaceIngredients(created.id, ingredients);
      db.calculateAndUpdateNutrition(created.id);
    }
    console.log(' ✓', meal.category.padEnd(12), meal.name);
  }

  db.setSetting('db_seed_version', SEED_VERSION);
  console.log('[Seed] Completato:', MEALS.length, 'pasti inseriti.\n');
}

seed();
