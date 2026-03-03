'use strict';

// Valori nutrizionali per 100g (o 100ml) di alimento.
// weight_pz: peso in grammi di 1 pezzo (usato quando unit = 'pz')

module.exports = [
  // ─── LATTICINI / UOVA ────────────────────────────────────────────────────
  { name: 'Yogurt greco 0%',          kcal: 57,  protein: 10,  carbs: 4,    fats: 0.5, weight_pz: 100 },
  { name: 'Yogurt magro naturale',    kcal: 50,  protein: 5,   carbs: 5,    fats: 1,   weight_pz: 100 },
  { name: 'Kefir di latte',           kcal: 61,  protein: 3.3, carbs: 5,    fats: 3.5, weight_pz: 100 },
  { name: 'Ricotta',                  kcal: 174, protein: 11,  carbs: 2,    fats: 13,  weight_pz: 100 },
  { name: 'Latte parzialmente scremato', kcal: 46, protein: 3.6, carbs: 5,  fats: 1.6, weight_pz: 100 },
  { name: 'Uova',                     kcal: 155, protein: 13,  carbs: 1.1,  fats: 11,  weight_pz: 60  },
  // ─── CEREALI / PANE ──────────────────────────────────────────────────────
  { name: 'Pane integrale',           kcal: 247, protein: 9,   carbs: 45,   fats: 3,   weight_pz: 30  },
  { name: 'Fiocchi d\'avena',         kcal: 375, protein: 13,  carbs: 67,   fats: 7,   weight_pz: 100 },
  { name: 'Gallette di riso',         kcal: 387, protein: 8,   carbs: 82,   fats: 2,   weight_pz: 10  },
  { name: 'Pasta integrale',          kcal: 350, protein: 13,  carbs: 66,   fats: 2.5, weight_pz: 100 },
  { name: 'Riso integrale',           kcal: 362, protein: 8,   carbs: 75,   fats: 2.9, weight_pz: 100 },
  { name: 'Farro perlato',            kcal: 338, protein: 15,  carbs: 67,   fats: 2.3, weight_pz: 100 },
  { name: 'Quinoa',                   kcal: 368, protein: 14,  carbs: 64,   fats: 6,   weight_pz: 100 },
  // ─── FRUTTA ──────────────────────────────────────────────────────────────
  { name: 'Frutta fresca di stagione', kcal: 52, protein: 0.6, carbs: 13,   fats: 0.2, weight_pz: 150 },
  { name: 'Frutta fresca mista',      kcal: 52,  protein: 0.6, carbs: 13,   fats: 0.2, weight_pz: 150 },
  { name: 'Banana',                   kcal: 89,  protein: 1.1, carbs: 23,   fats: 0.3, weight_pz: 110 },
  // ─── VERDURE ─────────────────────────────────────────────────────────────
  { name: 'Insalata mista',           kcal: 20,  protein: 1.5, carbs: 3,    fats: 0.3, weight_pz: 100 },
  { name: 'Insalata verde',           kcal: 20,  protein: 1.5, carbs: 3,    fats: 0.3, weight_pz: 100 },
  { name: 'Pomodori pelati',          kcal: 24,  protein: 1.2, carbs: 4,    fats: 0.3, weight_pz: 100 },
  { name: 'Pomodorini',               kcal: 18,  protein: 0.9, carbs: 3.5,  fats: 0.2, weight_pz: 15  },
  { name: 'Carote',                   kcal: 41,  protein: 0.9, carbs: 10,   fats: 0.2, weight_pz: 100 },
  { name: 'Sedano',                   kcal: 16,  protein: 0.7, carbs: 3,    fats: 0.2, weight_pz: 100 },
  { name: 'Zucchine',                 kcal: 17,  protein: 1.2, carbs: 3.1,  fats: 0.3, weight_pz: 100 },
  { name: 'Patate',                   kcal: 77,  protein: 2,   carbs: 17,   fats: 0.1, weight_pz: 100 },
  { name: 'Verdure miste di stagione', kcal: 35, protein: 2,   carbs: 6,    fats: 0.5, weight_pz: 100 },
  { name: 'Verdure miste (zucchine, peperoni...)', kcal: 25, protein: 1.5, carbs: 5, fats: 0.3, weight_pz: 100 },
  { name: 'Verdure grigliate miste',  kcal: 40,  protein: 1.8, carbs: 7,    fats: 0.8, weight_pz: 100 },
  { name: 'Basilico fresco',          kcal: 22,  protein: 3.2, carbs: 2.7,  fats: 0.6, weight_pz: 5   },
  { name: 'Rosmarino',                kcal: 131, protein: 3.3, carbs: 21,   fats: 5.9, weight_pz: 2   },
  { name: 'Aglio',                    kcal: 149, protein: 6.4, carbs: 33,   fats: 0.5, weight_pz: 5   },
  // ─── PROTEINE ANIMALI ────────────────────────────────────────────────────
  { name: 'Petto di pollo',           kcal: 165, protein: 31,  carbs: 0,    fats: 3.6, weight_pz: 100 },
  { name: 'Petto di tacchino',        kcal: 147, protein: 29,  carbs: 0,    fats: 2.5, weight_pz: 100 },
  { name: 'Salmone fresco',           kcal: 208, protein: 20,  carbs: 0,    fats: 13,  weight_pz: 100 },
  { name: 'Merluzzo fresco o surgelato', kcal: 82, protein: 18, carbs: 0,   fats: 0.7, weight_pz: 100 },
  { name: 'Tonno al naturale',        kcal: 130, protein: 29,  carbs: 0,    fats: 1,   weight_pz: 100 },
  // ─── LEGUMI ──────────────────────────────────────────────────────────────
  { name: 'Legumi misti (lenticchie/fagioli/ceci)', kcal: 130, protein: 9, carbs: 22, fats: 0.5, weight_pz: 100 },
  { name: 'Ceci lessi',               kcal: 164, protein: 9,   carbs: 27,   fats: 2.6, weight_pz: 100 },
  { name: 'Fagioli borlotti o cannellini', kcal: 110, protein: 8, carbs: 19, fats: 0.5, weight_pz: 100 },
  { name: 'Fagioli borlotti cotti',   kcal: 110, protein: 8,   carbs: 19,   fats: 0.5, weight_pz: 100 },
  { name: 'Brodo vegetale',           kcal: 5,   protein: 0.2, carbs: 1,    fats: 0.1, weight_pz: 100 },
  // ─── FRUTTA SECCA / SEMI ─────────────────────────────────────────────────
  { name: 'Noci',                     kcal: 654, protein: 15,  carbs: 14,   fats: 65,  weight_pz: 5   },
  { name: 'Mandorle',                 kcal: 579, protein: 21,  carbs: 22,   fats: 50,  weight_pz: 1.2 },
  { name: 'Olive (es. taggiasche)',   kcal: 145, protein: 1,   carbs: 6,    fats: 13,  weight_pz: 5   },
  // ─── CONDIMENTI / VARIE ──────────────────────────────────────────────────
  { name: 'Olio extravergine d\'oliva', kcal: 884, protein: 0, carbs: 0,    fats: 100, weight_pz: 10  },
  { name: 'Miele',                    kcal: 304, protein: 0.3, carbs: 82,   fats: 0,   weight_pz: 100 },
  { name: 'Marmellata senza zucchero', kcal: 150, protein: 0.5, carbs: 35,  fats: 0.1, weight_pz: 100 },
  { name: 'Hummus',                   kcal: 177, protein: 8,   carbs: 14,   fats: 10,  weight_pz: 100 },
  { name: 'Burro di arachidi (100% arachidi)', kcal: 588, protein: 25, carbs: 20, fats: 50, weight_pz: 100 },
];
