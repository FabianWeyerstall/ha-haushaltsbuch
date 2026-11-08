#!/usr/bin/env bash
# Update test: Home Assistant first runs the last normal release (0.9.2) and
# gets filled with data (upgrade-setup.mjs), then restarts with the current
# code, which must upgrade that data without loss (upgrade-check.mjs).
# Needs the git tag of the old release, hass, Node 22 and Playwright.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
FROM="${UPGRADE_FROM:-v0.9.2}"
CONFIG="$(mktemp -d)"
OLD="$(mktemp -d)"
PORT="${HA_PORT:-8123}"
export HA_URL="http://127.0.0.1:$PORT" HA_CONFIG="$CONFIG"

git -C "$REPO" archive "$FROM" custom_components/haushaltsbuch | tar -x -C "$OLD"
mkdir -p "$CONFIG/custom_components"
printf 'default_config:\nhttp:\n  server_port: %s\n' "$PORT" > "$CONFIG/configuration.yaml"

cleanup() {
  pkill -f "hass -c $CONFIG" 2>/dev/null || true
  for _ in $(seq 1 30); do pgrep -f "hass -c $CONFIG" > /dev/null || return 0; sleep 1; done
  pkill -9 -f "hass -c $CONFIG" 2>/dev/null || true
}
trap cleanup EXIT
start() {
  hass -c "$CONFIG" --skip-pip >> "$CONFIG/hass.log" 2>&1 &
  for _ in $(seq 1 120); do
    curl -s -o /dev/null "$HA_URL/api/" && return 0
    sleep 2
  done
  echo "Home Assistant did not start"; return 1
}
# Home Assistant writes its files a few seconds after a change. Wait until the
# config entry and the book are on disk, then end the old version.
saved() {
  for _ in $(seq 1 60); do
    grep -q '"domain":"haushaltsbuch"\|"domain": "haushaltsbuch"' "$CONFIG/.storage/core.config_entries" 2>/dev/null \
      && grep -q Internet "$CONFIG/.storage/haushaltsbuch.data" 2>/dev/null && break
    sleep 1
  done
  sleep 2
  cleanup
}
fail() { echo "---- Home Assistant log ----"; grep -i "haushaltsbuch\|error" "$CONFIG/hass.log" | tail -60; exit 1; }

echo "== $FROM"
ln -s "$OLD/custom_components/haushaltsbuch" "$CONFIG/custom_components/haushaltsbuch"
start
node "$REPO/tests/browser/upgrade-setup.mjs" || fail
saved

echo "== aktueller Stand"
rm "$CONFIG/custom_components/haushaltsbuch"
ln -s "$REPO/custom_components/haushaltsbuch" "$CONFIG/custom_components/haushaltsbuch"
start
node "$REPO/tests/browser/upgrade-check.mjs" || fail
