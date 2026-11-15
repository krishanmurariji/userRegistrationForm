#!/usr/bin/env bash
# Gets the newest code and restarts the API. Run on the server from the repository: bash deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
cd deploy
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
