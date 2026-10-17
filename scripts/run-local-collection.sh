#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
repository="$(cd "$(dirname "$0")/.." && pwd)"
runtime="$repository/.local-run"
mkdir -p "$runtime"
if ! mkdir "$runtime/lock" 2>/dev/null; then
  echo 'A local flight collection is already running.' >&2
  exit 1
fi
trap 'rm -rf "$runtime/lock"' EXIT

if [[ -z "${FLIGHT_GH_ACCOUNT:-}" ]]; then
  echo 'Set FLIGHT_GH_ACCOUNT to a GitHub account with write access to this repository.' >&2
  exit 1
fi
if [[ ! -d "$repository/node_modules/playwright" ]]; then
  echo 'Install the local browser dependency first: npm install --no-save playwright@1.58.2' >&2
  exit 1
fi

checkout="$runtime/checkout"
rm -rf "$checkout"
git clone --quiet --depth 1 'https://github.com/GagulProject/flight-price-tracker.git' "$checkout"
ln -s "$repository/node_modules" "$checkout/node_modules"
cd "$checkout"

export FLIGHT_BROWSER_HEADLESS=false
collection_status=0
node scripts/diagnose-flight-pages.mjs > "$runtime/collection.log" 2>&1 || collection_status=$?
if (( collection_status != 0 && collection_status != 2 )); then
  cat "$runtime/collection.log" >&2
  exit "$collection_status"
fi
node scripts/validate-data.mjs

# The credential helper reads the token from this process only; it is never written into the clone.
export FLIGHT_GITHUB_TOKEN="$(gh auth token -u "$FLIGHT_GH_ACCOUNT")"
export GIT_CONFIG_COUNT=2
export GIT_CONFIG_KEY_0=credential.helper
export GIT_CONFIG_VALUE_0=''
export GIT_CONFIG_KEY_1=credential.helper
export GIT_CONFIG_VALUE_1='!f() { echo username=x-access-token; echo password=$FLIGHT_GITHUB_TOKEN; }; f'
node scripts/persist-results.mjs > "$runtime/publish.log" 2>&1
unset FLIGHT_GITHUB_TOKEN GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0 GIT_CONFIG_KEY_1 GIT_CONFIG_VALUE_1

cp diagnostics/results.json "$runtime/latest-results.json"
cp diagnostics/collection-summary.json "$runtime/latest-summary.json"
node -e 'const s=require(process.argv[1]);console.log(JSON.stringify(s.map(x=>({provider:x.provider,status:x.status,priceKrw:x.quote?.priceKrw||null})),null,2))' "$runtime/latest-results.json"
if (( collection_status == 2 )); then
  echo 'No newly verified quote in this run; prior price history was preserved.' >&2
  exit 2
fi
