# BattiFame — Guida all'uso

## Come avviare l'app

### Metodo 1: Doppio click (più semplice)
Fai doppio click sul file **`avvia.command`** nella cartella BattiFame.
Si aprirà un terminale e il browser automaticamente su `http://localhost:3000`.

### Metodo 2: Terminale
```
cd BattiFame
npm start
```
Poi apri il browser su: **http://localhost:3000**

---

## Prima configurazione (obbligatoria per le email)

1. Apri l'app nel browser
2. Clicca su **"Impostazioni"** (tab in alto)
3. Inserisci i **nomi** tuoi e del tuo partner
4. Inserisci gli **indirizzi email** per ricevere i reminder
5. Configura Gmail per l'invio automatico (vedi sotto)
6. Clicca **"Salva impostazioni"**

---

## Configurazione Gmail per le email automatiche

Per ricevere le email di reminder devi configurare Gmail con una "App Password":

1. Vai su **https://myaccount.google.com** con il tuo account Gmail
2. Clicca su **"Sicurezza"** nel menu a sinistra
3. In "Accesso a Google", abilita la **"Verifica in 2 passaggi"** (se non è già attiva)
4. Torna su "Sicurezza" → cerca **"Password per le app"**
5. Crea una nuova password app, chiamala "BattiFame"
6. Copia la password di 16 caratteri generata
7. Torna su BattiFame → Impostazioni e inserisci:
   - **Account Gmail**: il tuo indirizzo Gmail (es. nome@gmail.com)
   - **App Password**: la password di 16 caratteri copiata
8. Clicca "Salva impostazioni"

---

## Come usare l'app

### Piano Settimanale
- **Frecce ← →** : naviga tra le settimane
- **"Genera piano"** : crea automaticamente il piano settimanale con pasti casuali
- **Clicca su un pasto** : sostituiscilo con un'altra opzione disponibile
- **"Conferma piano"** : quando sei soddisfatta/o, conferma il piano
  → Questo sblocca l'invio automatico della lista spesa domenica sera

### Ricettario
- Visualizza tutti i pasti disponibili, filtrati per categoria
- **Aggiungi** nuovi pasti con le quantità per lui e per lei
- **Modifica** o **Elimina** pasti esistenti

### Lista della Spesa
- Si genera automaticamente dalla settimana selezionata
- **Spunta** gli ingredienti già acquistati
- **"Invia per email"** : manda subito la lista alle email configurate
- **"Stampa"** : stampa la lista

### Impostazioni
- Configura nomi, email e credenziali Gmail
- Visualizza i reminder attivi

---

## Reminder automatici

L'app invia email automaticamente:

| Orario | Contenuto |
|--------|-----------|
| **10:30 ogni giorno** | Ingredienti per il pranzo |
| **16:30 ogni giorno** | Ingredienti per la cena |
| **Domenica alle 20:00** | Lista spesa per la settimana successiva (solo se il piano è confermato) |

> **Nota**: i reminder funzionano solo mentre l'app è in esecuzione.
> Lascia il terminale aperto in background per riceverli.

---

## Obiettivi nutrizionali

| | Lui | Lei |
|---|---|---|
| Calorie/giorno | **1.635 kcal** | **1.686 kcal** |
| Pasti/giorno | **4** | **5** |
| Obiettivo | -4 kg | -10 kg |

---

## Struttura dell'app

```
BattiFame/
├── avvia.command     ← Script avvio macOS
├── server.js         ← Server backend
├── src/              ← Logica server
├── public/           ← Interfaccia web
├── data/             ← Database (creato automaticamente)
└── LEGGIMI.md        ← Questa guida
```

---

## Problemi comuni

**"Il browser non si apre automaticamente"**
→ Apri manualmente http://localhost:3000

**"Le email non arrivano"**
→ Controlla le impostazioni SMTP nelle Impostazioni
→ Verifica che l'App Password Gmail sia corretta

**"L'app non parte"**
→ Assicurati di aver installato Node.js da https://nodejs.org
→ Nella cartella BattiFame, esegui: `npm install` poi `npm start`
