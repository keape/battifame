#!/bin/bash

# BattiFame — Script di avvio per macOS
# Doppio click su questo file per avviare l'app

cd "$(dirname "$0")"

echo ""
echo "🥗 BattiFame — Avvio in corso..."
echo ""

# Verifica Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js non trovato!"
  echo ""
  echo "Per installare Node.js:"
  echo "  1. Vai su https://nodejs.org"
  echo "  2. Scarica la versione LTS"
  echo "  3. Installala e riavvia"
  echo ""
  read -p "Premi INVIO per chiudere..."
  exit 1
fi

# Installa dipendenze se necessario
if [ ! -d "node_modules" ]; then
  echo "📦 Installazione dipendenze (solo la prima volta)..."
  npm install
  echo ""
fi

# Apri browser dopo 2 secondi
(sleep 2 && open "http://localhost:3000") &

# Avvia server
node server.js
