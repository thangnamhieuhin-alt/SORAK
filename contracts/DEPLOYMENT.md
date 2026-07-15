# SorakMilestone — Testnet deployment record

Live, verified deployment of the `sorak-milestone` Soroban contract on **Stellar Testnet**.
It is the on-chain core of Sorak: every XLM tip is recorded through `record_tip`, which moves the
funds supporter → contract → creator and tracks each supporter's cumulative lifetime total.
When a supporter crosses a 50 / 100 / 500 threshold the contract returns the tier just crossed,
so badge-minting is driven by verifiable on-chain state instead of an off-chain counter.

## Addresses

| Item | Value |
|---|---|
| **Contract ID** | `CCEP2O7CHXACVJA56XOERMVH65BQJKCGIKMPQIDUF5QMQVJL7EEYWJ4B` |
| Admin | `GBL5RJKF4QNJ4ZPLJZ7PS7K5A4J44VEZJRV2CRTFFDRVSY2N76AIIE47` |
| Token (moved asset) | native XLM SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Network | Test SDF Network ; September 2015 |
| RPC | https://soroban-testnet.stellar.org |

Explorer: https://stellar.expert/explorer/testnet/contract/CCEP2O7CHXACVJA56XOERMVH65BQJKCGIKMPQIDUF5QMQVJL7EEYWJ4B

## On-chain proof (end-to-end)

| Step | Tx |
|---|---|
| Deploy | [`9b7eb774…`](https://stellar.expert/explorer/testnet/tx/9b7eb7744a15c2f61903f008eac729bb96bb541a9f01ef7d79267865f9b1627f) |
| `initialize(admin, token=XLM SAC)` | [`b1480c57…`](https://stellar.expert/explorer/testnet/tx/b1480c57ecece0375938f5eacf7a9d929ed4431a0ca2f3225bda5eefd7e66fe6) |
| `record_tip` (1 XLM, transfer-through-contract) | [`271f87f3…`](https://stellar.expert/explorer/testnet/tx/271f87f388bf0dc93034e33d3381c261270acea57a44ed9ba545ca4b9342c059) |

Reading the live contract after the proof `record_tip` settles deterministically:
`get_token = CDLZFC3S…CYSC` (native XLM SAC), `get_admin = GBL5…IE47`, and
`total_given(creator, supporter)` accumulates by the tipped amount. The `record_tip` invocation
emits two SAC `transfer` events (supporter → contract, then contract → creator), proving the
contract is the actual mover of funds, not just an observer.

## Entrypoints

| Fn | Auth | Effect |
|---|---|---|
| `initialize(admin, token)` | admin | one-time setup; records admin + moved token |
| `record_tip(creator, supporter, amount) -> u32` | supporter | XLM supporter → contract → creator; `total += amount`; returns the tier just crossed (0 = none) |
| `total_given(creator, supporter) -> i128` | — | cumulative amount for a pair |
| `list_milestones(creator) -> Vec<(Address, u32)>` | — | each supporter and their highest tier |
| `get_admin / get_token` | — | views |

Tier thresholds (7-decimal stroops): tier 1 = 50_0000000, tier 2 = 100_0000000,
tier 3 = 500_0000000. On testnet the moved token is the native XLM SAC (no trustline needed),
so thresholds read as XLM units for the demo; the logic is asset-agnostic.

## Source

The Rust source for this contract is in `contracts/sorak-milestone/`. The full test suite
(`cd contracts && make test`) passes 9/9, covering all seven spec cases plus initialize and a
zero-amount rejection.

## Toolchain

- Rust `1.89.0`, target `wasm32v1-none`.
- Stellar CLI `27.0.0`.
- `soroban-sdk 22` (locked to 22.0.11 via Cargo.lock).

## Reproduce

```bash
cd contracts
make test                                                    # 9/9 pass
stellar contract build
stellar contract optimize --wasm target/wasm32v1-none/release/sorak_milestone.wasm
stellar contract deploy --wasm target/wasm32v1-none/release/sorak_milestone.optimized.wasm \
  --source deployer --network testnet
stellar contract invoke --id <CID> --source deployer --network testnet -- \
  initialize --admin <ADMIN_G...> --token CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

## App wiring

The app's tip flow (`POST /api/tips/record` → `tipService.recordTip`) invokes the deployed
contract's `record_tip` entrypoint for XLM tips (see `src/server/stellar/milestone-contract.ts`).
The tier the contract returns drives milestone badge-minting in `milestoneService.evaluate`.
Set `SOROBAN_CONTRACT_ID` in the app env to enable the contract path; when unset the app falls
back to the original classic payment / claimable-balance flow.
