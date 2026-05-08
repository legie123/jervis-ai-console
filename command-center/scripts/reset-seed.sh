#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
node apps/operator/src/reset-seed.js
