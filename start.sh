#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

fail() {
  printf '\nErreur : %s\n' "$1" >&2
  printf 'Consultez start_faq.md pour les solutions courantes.\n' >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js est introuvable. Installez une version LTS récente puis relancez le script."
command -v npm >/dev/null 2>&1 || fail "npm est introuvable. Réinstallez Node.js avec npm inclus."

if [[ -n "${PYTHON:-}" ]]; then
  PYTHON_CMD="$PYTHON"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  fail "Python 3 est introuvable. Installez Python 3.10 ou plus récent."
fi

"$PYTHON_CMD" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)' \
  || fail "Python 3.10 ou plus récent est requis."

if [[ ! -x "$PROJECT_DIR/.venv/bin/python" ]]; then
  "$PYTHON_CMD" -m venv "$PROJECT_DIR/.venv" \
    || fail "Impossible de créer l'environnement Python. Voir start_faq.md."
fi

export PYTHON="$PROJECT_DIR/.venv/bin/python"
"$PYTHON" -m pip install --upgrade pip \
  || fail "Échec de la mise à jour de pip. Vérifiez votre connexion et les droits d'accès."
"$PYTHON" -m pip install instaloader playwright \
  || fail "Installation des dépendances Python impossible. Voir start_faq.md."
"$PYTHON" -m playwright install chromium \
  || fail "Installation de Chromium Playwright impossible. Voir start_faq.md."

if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
  npm ci || fail "Installation des dépendances Node.js impossible. Voir start_faq.md."
fi

npm start
