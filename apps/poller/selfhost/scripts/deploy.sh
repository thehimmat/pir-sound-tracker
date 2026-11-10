#!/bin/sh
# Updates /opt/pir to main, builds the poller image on the VM (arm64), starts it and checks /health.
# Run on the server:  sh /opt/pir/apps/poller/selfhost/scripts/deploy.sh
# PIR_DEPLOY_DRY_RUN=1 prints the steps instead of running them (tests).
set -eu

poller=$(cd "$(dirname "$0")/../.." && pwd)

# Gitignored (*.traineddata), so a fresh clone doesn't have it: copy it over once (README.md).
if [ ! -f "$poller/eng.traineddata" ]; then
  echo "Missing $poller/eng.traineddata. Copy it from a checkout that has it (README.md)." >&2
  exit 1
fi

run() {
  if [ "${PIR_DEPLOY_DRY_RUN:-}" = 1 ]; then echo "$*"; else "$@"; fi
}

run git -C "$poller" pull -q --ff-only origin main
cd "$poller/selfhost"
run docker compose up -d --build --wait
run curl -fsS --retry 5 --retry-delay 5 --retry-all-errors http://127.0.0.1:3003/health
