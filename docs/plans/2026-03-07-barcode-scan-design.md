# Design: Scansione Barcode Ingredienti

**Data:** 2026-03-07
**Stato:** Approvato

## Contesto

L'app BattiFame permette già di cercare i valori nutrizionali degli alimenti per nome tramite Open Food Facts. L'aggiunta della scansione del barcode EAN-13 permette di acquisire i dati nutrizionali direttamente dalla confezione, in modo più rapido e preciso (il barcode è univoco, la ricerca testuale può restituire risultati ambigui).

## Scope

Solo il tab **Ingredienti** — form aggiunta/modifica ingrediente.

## Soluzione

### Backend — nuovo endpoint barcode

Aggiungere `GET /api/ingredients/barcode/:code` in `src/routes/ingredients.js` (prima delle route `/:id` per rispettare l'ordine Express).

```
GET https://world.openfoodfacts.org/api/v0/product/{code}.json?fields=product_name,nutriments
```

Risposta attesa:
```json
{
  "name": "Pasta di Kamut Bio",
  "kcal_per_100": 340,
  "protein_per_100": 12.0,
  "carbs_per_100": 68.5,
  "fats_per_100": 2.1
}
```

Gestione errori:
- `status != 1` → 404 "Prodotto non trovato"
- `energy-kcal_100g` assente → 404 "Valori nutrizionali non disponibili"
- Timeout/rete → 503 (coerente con endpoint lookup esistente)

### Frontend HTML — `public/index.html`

Nel modal `#ingForm`, sotto il campo `name`, aggiungere:

```html
<!-- Riga barcode -->
<div class="barcode-row">
  <button type="button" id="btnScanBarcode">📷 Scansiona</button>
  <span>oppure</span>
  <input type="text" id="barcodeInput" placeholder="Codice EAN (13 cifre)"
         inputmode="numeric" maxlength="13">
  <button type="button" id="btnLookupBarcode">🔍</button>
</div>
```

Overlay camera (aggiunto a `<body>`):

```html
<div id="cameraOverlay" class="camera-overlay hidden">
  <button id="btnCloseCamera">✕ Chiudi</button>
  <video id="cameraFeed" playsinline></video>
  <p>Inquadra il barcode sulla confezione</p>
</div>
```

CDN ZXing-js (caricato solo quando serve — dynamic import):

```html
<!-- nessun tag script statico, caricato dinamicamente in app.js -->
```

### Frontend JS — `public/app.js`

Nuove funzioni da aggiungere nella sezione Ingredienti:

1. **`loadZXing()`** — carica `@zxing/browser` via CDN dinamicamente (lazy load, una sola volta)
2. **`startBarcodeScanner()`** — apre overlay, inizializza `BrowserMultiFormatReader`, avvia scan
3. **`stopBarcodeScanner()`** — ferma il reader, libera la fotocamera, chiude overlay
4. **`lookupByBarcode(code)`** — chiama `GET /api/ingredients/barcode/:code`, popola form (nome + valori nutrizionali), mostra toast

Event listeners da aggiungere:
- `btnScanBarcode` → `startBarcodeScanner()`
- `btnCloseCamera` → `stopBarcodeScanner()`
- `btnLookupBarcode` → `lookupByBarcode(barcodeInput.value)`
- `barcodeInput` keydown Enter → stessa azione

### UX Flow

```
[📷 Scansiona]
    ↓
overlay fullscreen con <video>
    ↓
ZXing rileva EAN-13
    ↓
stopBarcodeScanner()
    ↓
GET /api/ingredients/barcode/:code
    ↓
nome + kcal + proteine + carbs + grassi → form
    ↓
toast "Prodotto trovato!"
    ↓
utente verifica/modifica nome e salva
```

### HTTPS

Railway già fornisce HTTPS — nessuna configurazione aggiuntiva necessaria.

## File modificati

| File | Tipo modifica |
|---|---|
| `src/routes/ingredients.js` | Aggiunta endpoint `GET /barcode/:code` |
| `public/index.html` | Riga barcode + overlay camera nel modal |
| `public/app.js` | Funzioni scan + lookup barcode |

## Verifica end-to-end

1. Deploy su Railway → aprire tab Ingredienti su iPhone
2. Premere "+ Aggiungi ingrediente" → compare modal
3. Premere "📷 Scansiona" → Safari chiede permesso fotocamera → approvare
4. Inquadrare barcode pasta/yogurt/etc → overlay si chiude automaticamente
5. Verificare che nome, kcal, proteine, carbs, grassi siano compilati
6. Testare campo manuale: digitare un EAN-13 valido (es. 8001234567890) e premere 🔍
7. Salvare l'ingrediente → appare nella griglia
