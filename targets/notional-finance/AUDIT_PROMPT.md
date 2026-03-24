# Security Audit — Notional Finance Leveraged Vault Strategies

## Target

- **Repository:** `targets/notional-finance/repo`
- **Commit:** `0096f1f64071cafbf20062a7c092c6ec89c28275`

## Scope

All Solidity files under `src/` — **1,959 nSLOC** across 27 contracts:

| Directory | File | nSLOC |
|-----------|------|-------|
| src/ | AbstractYieldStrategy.sol | 259 |
| src/oracles/ | AbstractCustomOracle.sol | 42 |
| src/oracles/ | AbstractLPOracle.sol | 64 |
| src/oracles/ | Curve2TokenOracle.sol | 76 |
| src/oracles/ | PendlePTOracle.sol | 41 |
| src/proxy/ | AddressRegistry.sol | 97 |
| src/proxy/ | Initializable.sol | 14 |
| src/proxy/ | TimelockUpgradeableProxy.sol | 54 |
| src/rewards/ | AbstractRewardManager.sol | 176 |
| src/rewards/ | ConvexRewardManager.sol | 24 |
| src/rewards/ | RewardManagerMixin.sol | 109 |
| src/routers/ | AbstractLendingRouter.sol | 140 |
| src/routers/ | MorphoLendingRouter.sol | 179 |
| src/single-sided-lp/ | AbstractSingleSidedLP.sol | 232 |
| src/single-sided-lp/ | CurveConvex2Token.sol | 229 |
| src/staking/ | AbstractStakingStrategy.sol | 99 |
| src/staking/ | PendlePTLib.sol | 54 |
| src/staking/ | PendlePT.sol | 102 |
| src/staking/ | PendlePT_sUSDe.sol | 52 |
| src/staking/ | StakingStrategy.sol | 12 |
| src/utils/ | Constants.sol | 12 |
| src/utils/ | TokenUtils.sol | 42 |
| src/utils/ | TypeConvert.sol | 19 |
| src/withdraws/ | AbstractWithdrawRequestManager.sol | 191 |
| src/withdraws/ | ClonedCooldownHolder.sol | 18 |
| src/withdraws/ | Dinero.sol | 58 |
| src/withdraws/ | Ethena.sol | 58 |
| src/withdraws/ | EtherFi.sol | 39 |
| src/withdraws/ | GenericERC20.sol | 22 |
| src/withdraws/ | GenericERC4626.sol | 27 |
| src/withdraws/ | Origin.sol | 34 |

**Exclude:** `tests/`, `interfaces/`, `lib/`, `mocks/`

## External Integrations Context

This codebase integrates with **Morpho Blue** (lending), **Curve** (AMM/stableswap), **Pendle V2** (yield tokenization), and **Convex** (reward staking). Detailed protocol internals, system architecture, deployment context, and targeted audit questions are provided in:

**`targets/notional-finance/integrations-context/INTEGRATIONS_CONTEXT.md`**

**Read that file THOROUGHLY before auditing.** It contains:
- **Section 0:** System architecture diagram, deployment context (Mainnet + Arbitrum), expected token list with known quirks, and ETH/WETH handling pitfalls
- **Sections 1-4:** Protocol internals for Morpho Blue, Curve, Pendle V2, and Convex — data structures, core operations, rounding behavior, callback patterns, liquidation math, fee mechanics
- **Section 7:** Position lifecycle and withdraw state machine — critical for understanding multi-token withdrawal edge cases, Dinero batch nonce overflow, Ethena cooldown=0 behavior, and LST valuation issues
- **Section 8:** User-controlled inputs and attack surfaces — trade parameter manipulation, direct Morpho access bypassing the router, reward claiming abuse, frontrunning vectors
- **Section 9:** 20 targeted audit questions mapping to specific code paths — work through these systematically

Understanding these integration surfaces and attack vectors is critical for finding real bugs rather than generic concerns.

## Audit Focus

**Severity targets:** Critical, High, and Medium findings only. Skip Low/Informational unless they directly enable a higher-severity exploit chain.

**Priority audit areas (highest signal for real bugs):**

1. **Collateral price manipulation via the vault's `price()` function** — the vault IS Morpho's oracle. Can it be inflated via donation, effectiveSupply manipulation, or incorrect fallback when `t_CurrentAccount` is unset?

2. **Withdraw flow completeness** — trace every WithdrawRequestManager implementation (Dinero, Ethena, EtherFi, Origin, GenericERC20, GenericERC4626) through initiate → finalize → redeem. Check edge cases: zero exit balances, uint16 overflow, cooldown=0, batch overlap, partial finalization.

3. **ETH/WETH handling consistency** — every Curve pool interaction that touches ETH must correctly handle the `use_eth` parameter, `address(0)` vs WETH comparisons, and WETH.withdraw/deposit sequences. See Section 0.5 of the integrations context.

4. **User-controlled trade parameters** — decode how `bytes calldata data` flows through exitPosition/enterPosition into Trade structs. Can `tradeType`, `dexId`, or `exchangeData` be set to values that steal funds or break invariants?

5. **Reward accounting correctness** — trace `updateAccountRewards` through liquidation, migration, empty vault, escrow, and cooldown scenarios. Check for stale memory vs storage issues, incorrect `sharesInEscrow` flags, and reward misdirection.

6. **Rounding direction mismatches** — Morpho uses `toAssetsUp` for borrower debt. Does `healthFactor()` match? Do share/asset conversions round in the direction that favors the protocol?

7. **Cross-chain compatibility** — hardcoded addresses, Convex Booster interface differences, L2 sequencer checks. Verify on both Mainnet and Arbitrum.

8. **Token-specific behaviors** — USDT approve, OETH rebase opt-in, Pendle SY != yield token, sDAI→sUSDS migration. See the token table in Section 0.4.

**What NOT to focus on:**
- Generic best practices (naming, gas optimization, code style)
- Centralization risks that require admin key compromise (these are accepted by design)
- Theoretical reentrancy without a concrete callback path in this codebase
- Generic "missing slippage protection" without identifying a specific exploitable path
- Issues in out-of-scope files (tests, interfaces, libraries, mocks)
