#!/usr/bin/env bash
# Starts a fresh Home Assistant with the Haushaltsbuch and clicks through the
# panel in Chromium (smoke.mjs). Needs: hass (pip install -r requirements_test.txt),
# Node 22 and Playwright with Chromium.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CONFIG="$(mktemp -d)"
PORT="${HA_PORT:-8123}"
mkdir -p "$CONFIG/custom_components"
ln -s "$REPO/custom_components/haushaltsbuch" "$CONFIG/custom_components/haushaltsbuch"
# A normal setup: default_config (its packages come from tests/browser/ha_requirements.py).
printf 'default_config:\nhttp:\n  server_port: %s\n' "$PORT" > "$CONFIG/configuration.yaml"
hass -c "$CONFIG" --skip-pip > "$CONFIG/hass.log" 2>&1 &
HASS=$!
trap 'kill $HASS 2>/dev/null || true; wait $HASS 2>/dev/null || true' EXIT
for _ in $(seq 1 120); do
  curl -sf "http://127.0.0.1:$PORT/api/onboarding" > /dev/null && break
  sleep 2
done
if ! HA_URL="http://127.0.0.1:$PORT" HA_CONFIG="$CONFIG" node "$REPO/tests/browser/${SCRIPT:-smoke.mjs}"; then
  echo "---- Home Assistant log ----"; grep -i "haushaltsbuch\|error" "$CONFIG/hass.log" | tail -60
  exit 1
fi
