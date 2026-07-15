#!/usr/bin/env bash
# Usage: ./deploy.sh [testnet|public]
NETWORK=${1:-testnet}
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/*.wasm \
  --source default \
  --network "$NETWORK"
