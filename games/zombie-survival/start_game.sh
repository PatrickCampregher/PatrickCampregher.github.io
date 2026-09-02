#!/usr/bin/env bash
# Mac / Linux launcher. Requires Node.js 18+ (https://nodejs.org)
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install the LTS version from https://nodejs.org and run again."
  exit 1
fi
echo "Starting Zombie Survival server... your browser will open automatically."
node server/index.js "$@"
