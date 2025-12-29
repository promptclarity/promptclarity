#!/usr/bin/env bash
set -e

echo "Updating Prompt Clarity..."
git pull
docker compose down
docker compose up -d --build
echo "Done! Prompt Clarity is running at http://localhost:3000"