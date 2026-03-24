# External Integrations Context — Morpho Blue, Curve Core, Pendle V2, Convex

> Compact reference for AI-assisted security auditing of protocols integrating with these DeFi primitives.

---

## 0. SYSTEM ARCHITECTURE & DEPLOYMENT CONTEXT

### 0.1 High-Level Architecture

```
                        ┌─────────────────────┐
    User ──────────────►│  MorphoLendingRouter │──────► Morpho Blue (borrow/repay/liquidate)
    (enterPosition,     │  (LendingRouter)     │           │
     exitPosition,      └──────────┬──────────┘           │ supplyCollateral / withdrawCollateral
     migrate, etc.)                │                       │
                                   │                       ▼
                        ┌──────────▼──────────┐    ┌──────────────┐
                        │  YieldStrategy      │◄───│ Morpho calls │
                        │  (AbstractYield-    │    │ vault.price()│
                        │   Strategy.sol)     │    │ as oracle    │
                        │                     │    └──────────────┘
                        │  = Morpho's         │
                        │    collateralToken   │
                        └──┬──────────┬───────┘
                           │          │
              ┌────────────▼──┐  ┌────▼─────────────────┐
              │ LP Strategy   │  │ Staking Strategy      │
              │ (SingleSided- │  │ (PendlePT, PendlePT_  │
              │  LP + Curve)  │  │  sUSDe, StakingStrat) │
              └───────┬───────┘  └────┬──────────────────┘
                      │               │
              ┌───────▼───────┐  ┌────▼──────────────┐
              │ Convex/Gauge  │  │ WithdrawRequest-   │
              │ (reward       │  │ Manager            │
              │  staking)     │  │ (Dinero, Ethena,   │
              └───────┬───────┘  │  EtherFi, Origin,  │
                      │          │  GenericERC20/4626) │
              ┌───────▼───────┐  └───────────────────┘
              │ RewardManager │
              │ (rewards      │
              │  accounting)  │
              └───────────────┘
```

### 0.2 Critical: The Vault IS Morpho's Collateral Token

The YieldStrategy vault is deployed as the `collateralToken` in a Morpho market. This means:

1. **Morpho calls `vault.price(borrower)` as its oracle** — the vault's `price()` function returns the collateral-to-loan-token ratio scaled to 1e36. Any manipulation of `price()` directly affects borrowing capacity and liquidation thresholds.

2. **ANYONE can interact with the vault's Morpho market directly** — Morpho has no access control on `supply`, `repay`, `supplyCollateral`, `borrow`, `liquidate`. Users CAN bypass the LendingRouter entirely and call Morpho functions directly against the vault's market. Verify that all code paths work correctly whether accessed via the router OR directly through Morpho.

3. **The vault holds collateral on behalf of users via Morpho** — when a user enters a position via the router, the router mints vault shares and supplies them as collateral to Morpho. The MORPHO contract address therefore holds most of the vault's token supply as collateral on behalf of all borrowers.

4. **`t_CurrentAccount` transient storage** — the vault uses transient storage (`t_CurrentAccount`) to communicate the current borrower to `price()` during router operations. When Morpho calls `price()` directly (e.g., during a direct borrow), `t_CurrentAccount` is NOT set — the vault falls back to `super.convertToAssets()`. Verify this fallback is correct in all states.

### 0.3 Deployment Context

- **Target chains:** Ethereum Mainnet and Arbitrum
- **Chain-specific differences to audit:**
  - `Constants.sol` may hardcode Ethereum mainnet addresses (WETH, etc.) — verify they work on Arbitrum
  - Convex Booster interface differs between chains: Mainnet `deposit(pid, amount, stake)` vs Arbitrum `deposit(pid, amount)` (2 params only)
  - Arbitrum has an L2 sequencer that can go down — oracle integrations should check sequencer uptime
  - Chainlink feed addresses and heartbeat intervals differ per chain

### 0.4 Expected Asset Tokens & Known Behaviors

| Token | Type | Known Quirks |
|-------|------|-------------|
| WETH | Standard ERC20 | Often paired with Native ETH (address(0)) in Curve pools — see ETH/WETH section |
| USDT | Non-standard ERC20 | `approve()` has no return value on mainnet; requires allowance set to 0 before changing to non-zero |
| USDe / sUSDe | Ethena stablecoin / staked | sUSDe has a `cooldownDuration` that can be 0 (instant redeem to USDe) or >0 (delayed). When cooldown=0, shares are burned immediately on initiation, not finalization |
| OETH | Rebasing token (Origin) | Smart contracts do NOT receive rebases by default — must explicitly opt in via `rebaseOptIn()`. If not opted in, the vault forfeits all yield |
| apxETH / weETH | Liquid staking tokens | Once LSTs enter a validator withdrawal queue, they stop earning yield, but oracle rates may continue increasing. Withdrawal request valuation should account for this |
| sDAI / sUSDS | ERC4626 vaults | sDAI liquidity is migrating to sUSDS over time — hardcoded pool references may degrade |
| stETH / wstETH | Rebasing / wrapped | stETH rebases; wstETH does not. Curve pools must use correct `asset_type` |

### 0.5 ETH vs WETH Handling — Common Pitfall

This codebase frequently converts between Native ETH (`address(0)` or `ETH_ADDRESS`) and WETH. This is a **high-frequency bug source**. Audit every path that involves ETH/WETH:

- **Curve V2 pools:** `remove_liquidity` and `remove_liquidity_one_coin` accept a `use_eth` parameter. If the pool was entered with WETH (not native ETH), exit must also use `use_eth=false`. Hardcoding `use_eth=true` on exit when entry used WETH will return Native ETH that gets stuck in the vault (the vault only handles WETH).
- **TOKENS() array:** For Curve pools with Native ETH, `TOKENS()` returns `address(0)` for the ETH slot. Token comparisons like `address(tokens[i]) == address(asset)` will fail when `asset=WETH` because `address(0) != WETH`.
- **Trade module:** The TRADING_MODULE may return Native ETH from swaps. If subsequent code calls `WETH.withdraw()` expecting to unwrap WETH that's already native ETH, it will revert.
- **WithdrawRequestManager:** Functions like `getWithdrawRequestValue` look up a WithdrawRequestManager per token address. If the token is `address(0)` (Native ETH), the lookup will fail because no manager is registered for `address(0)`.

**Audit checklist for ETH/WETH:**
1. For every Curve pool interaction, verify `use_eth` matches the entry method
2. For every token comparison, verify ETH_ADDRESS and WETH are treated equivalently
3. For every trade result, verify the output token type matches what downstream code expects
4. For every WRM lookup, verify it handles the `address(0)` case

---

## 1. MORPHO BLUE (Isolated Lending)

**Commit:** `e56ec3003b96f2ed1051090ce974166060c97618`
**Entrypoint:** `src/Morpho.sol` — monolithic singleton, all logic in one contract, no proxies.

### 1.1 Data Structures

```solidity
type Id is bytes32; // keccak256(abi.encode(MarketParams))

struct MarketParams {
    address loanToken;        // ERC20 being lent/borrowed
    address collateralToken;  // ERC20 collateral
    address oracle;           // IOracle — returns price scaled to 1e36
    address irm;              // IIrm — returns borrow rate per second (WAD)
    uint256 lltv;             // Liquidation LTV (WAD, must be < 1e18)
}

struct Position {
    uint256 supplyShares;     // unbounded
    uint128 borrowShares;     // packed
    uint128 collateral;       // packed
}

struct Market {
    uint128 totalSupplyAssets;
    uint128 totalSupplyShares;
    uint128 totalBorrowAssets;
    uint128 totalBorrowShares;
    uint128 lastUpdate;       // timestamp of last interest accrual
    uint128 fee;              // protocol fee on interest (WAD, max 25%)
}
```

### 1.2 Core Operations

| Function | Flow | Rounding |
|----------|------|----------|
| `supply(params, assets/shares, onBehalf, data)` | accrueInterest → mint shares → callback → transferFrom | assets→shares: **down** |
| `withdraw(params, assets/shares, onBehalf, receiver)` | accrueInterest → burn shares → transfer out | assets→shares: **up** |
| `borrow(params, assets/shares, onBehalf, receiver)` | accrueInterest → mint borrow shares → healthCheck → liquidityCheck → transfer out | assets→shares: **up** |
| `repay(params, assets/shares, onBehalf, data)` | accrueInterest → burn borrow shares → callback → transferFrom | assets→shares: **down** |
| `supplyCollateral(params, assets, onBehalf, data)` | **no** accrueInterest → add collateral → callback → transferFrom | — |
| `withdrawCollateral(params, assets, onBehalf, receiver)` | accrueInterest → sub collateral → healthCheck → transfer out | — |
| `liquidate(params, borrower, seizedAssets/repaidShares, data)` | accrueInterest → verify unhealthy → seize collateral → realize bad debt if collateral=0 → transfer collateral out → callback → transferFrom repaid | see below |
| `flashLoan(token, assets, data)` | transfer out → callback → transferFrom back (zero-fee, any token) | — |

**Input convention:** Exactly one of `assets` or `shares` must be zero (XOR).

### 1.3 Shares Math (Virtual Shares Anti-Inflation)

```
VIRTUAL_SHARES = 1e6
VIRTUAL_ASSETS = 1

toSharesDown(assets, totalAssets, totalShares) = assets * (totalShares + 1e6) / (totalAssets + 1)
toAssetsDown(shares, totalAssets, totalShares) = shares * (totalAssets + 1) / (totalShares + 1e6)
toSharesUp / toAssetsUp = same but with rounding up: (x * y + d - 1) / d
```

### 1.4 Interest Accrual

```
elapsed = block.timestamp - market.lastUpdate
if elapsed > 0 && irm != address(0):
    borrowRate = IIrm(irm).borrowRate(marketParams, market)  // rate per second (WAD)
    interest = totalBorrowAssets * wTaylorCompounded(borrowRate, elapsed)
    // Taylor: firstTerm=x*n, secondTerm=(x*n)^2/(2*WAD), thirdTerm=secondTerm*(x*n)/(3*WAD)
    totalBorrowAssets += interest
    totalSupplyAssets += interest
    if fee > 0:
        feeAmount = interest * fee / WAD
        feeShares = toSharesDown(feeAmount, totalSupplyAssets - feeAmount, totalSupplyShares)
        position[feeRecipient].supplyShares += feeShares
```

### 1.5 Health Check

```
maxBorrow = collateral * oraclePrice / 1e36 * lltv / WAD
borrowed = borrowShares.toAssetsUp(totalBorrowAssets, totalBorrowShares)  // rounds UP against borrower
healthy = maxBorrow >= borrowed
```

Oracle: `IOracle.price()` returns `collateralToken / loanToken` scaled to **1e36**.

### 1.6 Liquidation

```
incentiveFactor = min(1.15e18, WAD / (WAD - 0.3e18 * (WAD - lltv)))
// LIQUIDATION_CURSOR = 0.3e18, MAX_LIQUIDATION_INCENTIVE_FACTOR = 1.15e18

if seizedAssets > 0:
    seizedQuoted = seizedAssets * price / 1e36  (rounded UP)
    repaidShares = (seizedQuoted / incentiveFactor).toSharesUp(...)
else:
    seizedAssets = repaidShares.toAssetsDown(...) * incentiveFactor * 1e36 / price  (rounded DOWN)

// Bad debt socialization: if borrower.collateral == 0 after seizure:
//   remaining borrowShares are wiped, bad debt subtracted from totalSupplyAssets
```

### 1.7 Callback Interfaces

```solidity
IMorphoSupplyCallback.onMorphoSupply(uint256 assets, bytes data)
IMorphoRepayCallback.onMorphoRepay(uint256 assets, bytes data)
IMorphoSupplyCollateralCallback.onMorphoSupplyCollateral(uint256 assets, bytes data)
IMorphoLiquidateCallback.onMorphoLiquidate(uint256 repaidAssets, bytes data)
IMorphoFlashLoanCallback.onMorphoFlashLoan(uint256 assets, bytes data)
```

Pattern: state updated first → callback → `safeTransferFrom`. The callback enables composable one-tx flows (e.g., flash-borrow collateral to repay).

### 1.8 Authorization

- `setAuthorization(authorized, bool)` — direct
- `setAuthorizationWithSig(Authorization, Signature)` — EIP-712, nonce-based replay protection
- Checked for: `withdraw`, `borrow`, `withdrawCollateral` (sender must be `onBehalf` or authorized)
- **Not checked for:** `supply`, `repay`, `supplyCollateral` (anyone can supply/repay on behalf)

### 1.9 Integration Caveats

- **No reentrancy guard** — state is updated before external calls (CEI pattern), but integrators must not rely on callback ordering.
- **No oracle staleness check** — Morpho trusts the oracle unconditionally; integrating protocols must validate freshness.
- **IRM is stateful** — `borrowRate()` (not `view`) is called during `accrueInterest`, allowing adaptive rate models.
- **Fee on interest only** — max 25%, charged as supply share dilution.
- **Bad debt** is socialized across all suppliers in the market.
- **`uint128` packing** — borrowShares and collateral overflow at ~3.4e38.
- **`supplyCollateral` skips interest accrual** — gas optimization, safe because collateral doesn't earn interest.
- **Flash loans are free** and can borrow any token the contract holds (not limited to market tokens).

### 1.10 Constants

```
WAD = 1e18
ORACLE_PRICE_SCALE = 1e36
MAX_FEE = 0.25e18
LIQUIDATION_CURSOR = 0.3e18
MAX_LIQUIDATION_INCENTIVE_FACTOR = 1.15e18
```

---

## 2. CURVE CORE (AMM)

**Commit:** `7fd4e793cd2c1f857980fd15da0b7ab40e3d7978`
**Pool types:** Stableswap (pegged assets), TwoCryptoSwap (2 unpegged), TriCryptoSwap (3 unpegged). All written in Vyper.

### 2.1 Architecture

```
contracts/amm/
├── stableswap/     — pegged assets (USDC/USDT, stETH/WETH), up to 8 coins
│   ├── implementation/implementation_v_700.vy   (pool logic + LP token)
│   ├── math/math_v_100.vy                       (invariant solver)
│   ├── factory/factory_v_100.vy                 (deploy pools)
│   └── views/views_v_120.vy                     (read-only helpers)
├── twocryptoswap/  — 2 unpegged assets (ETH/USD)
│   ├── implementation/implementation_v_210.vy
│   ├── math/math_v_210.vy
│   └── factory/factory_v_200.vy
└── tricryptoswap/  — 3 unpegged assets (ETH/BTC/USD)
    ├── implementation/implementation_v_200.vy
    ├── math/math_v_200.vy
    └── factory/factory_v_200.vy
```

Each pool IS the LP token (ERC20). Factory deploys via blueprint pattern.

### 2.2 Stableswap Invariant

```
A * sum(x_i) * n^n + D = A * D * n^n + D^(n+1) / (n^n * prod(x_i))
```

- **A** = amplification coefficient (controls concentration around peg)
- **D** = invariant (represents total value in "balanced" units)
- Solved iteratively via Newton's method (converges in ~4 rounds)
- `A_PRECISION = 100` — A is stored as `A * 100`

**get_y(i, j, x, xp, amp, D, n_coins):** Solves for `x[j]` given `x[i]=x`:
```
x_1^2 + b*x_1 = c
x_1 = (x_1^2 + c) / (2*x_1 + b)   // Newton iteration, max 255 rounds
```

### 2.3 Crypto (TwoCrypto/TriCrypto) Invariant

Extended with `gamma` parameter for non-pegged assets:
```
newton_D(ANN, gamma, x_unsorted, K0_prev) -> D
```

Additional state:
- `cached_price_scale` — internal price oracle (dynamic)
- `cached_price_oracle` — EMA price target
- `xcp_profit` / `xcp_profit_a` — fee accrual tracking

**A/gamma ranges:**
| Param | TwoCrypto | TriCrypto |
|-------|-----------|-----------|
| MIN_A | 4 * 10000 / 10 | 27 * 10000 / 100 |
| MAX_A | 4 * 10000 * 1000 | 27 * 10000 * 1000 |
| MIN_GAMMA | 10^10 | 10^10 |
| MAX_GAMMA | 199 * 10^15 | 5 * 10^16 |

### 2.4 Core Functions

**Stableswap:**
```vyper
exchange(i, j, _dx, _min_dy, _receiver) -> uint256            # @nonreentrant('lock')
exchange_received(i, j, _dx, _min_dy, _receiver) -> uint256   # disabled for rebasing tokens
add_liquidity(_amounts, _min_mint_amount, _receiver) -> uint256
remove_liquidity(_burn_amount, _min_amounts, _receiver) -> DynArray[uint256]
remove_liquidity_one_coin(_burn_amount, i, _min_received, _receiver) -> uint256
remove_liquidity_imbalance(_amounts, _max_burn_amount, _receiver) -> uint256
```

**TwoCrypto/TriCrypto (additional):**
```vyper
ramp_A_gamma(future_A, future_gamma, future_time)  # admin: linear ramp over time
stop_ramp_A_gamma()                                  # admin: freeze current values
```

### 2.5 Asset Types (Stableswap)

```
0 = Standard ERC20
1 = Oracle (wstETH) — external rate oracle, precision must be 1e18
2 = Rebasing (stETH) — tracks balance changes; exchange_received DISABLED
3 = ERC4626 (sDAI) — calls convertToAssets() for rate
```

### 2.6 Fee Mechanism

**Stableswap:**
```
base_fee = (fee * N_COINS) / (4 * (N_COINS - 1))
dynamic_fee = adjusts higher when pool depegs (offpeg_fee_multiplier)
admin_fee = 50% of trade fees (constant = 5000000000, base 1e10)
```

**TwoCrypto/TriCrypto:**
```
mid_fee + (out_fee - mid_fee) * fee_reduction_factor
ADMIN_FEE = 5 * 10^9 (50%)
```

### 2.7 Price Oracles

- **EMA (Exponential Moving Average)** — updated on every state-changing operation
- `ma_exp_time` controls smoothing window
- Based on AMM **state price** (not last trade price)
- Stored packed for gas efficiency

### 2.8 Integration Caveats

- **Reentrancy:** All state-changing functions use `@nonreentrant('lock')`.
- **`exchange_received`:** Tokens must be sent to pool BEFORE calling. Reverts if pool contains rebasing tokens (asset type 2). Critical for aggregator integrations.
- **Rebasing tokens:** If pool contains rebasing token but `asset_type` is NOT set to 2, rebases can be stolen. Integrators must verify asset type configuration.
- **Dynamic fees:** Actual fee may differ slightly from quoted fee due to state changes between quote and execution.
- **A parameter ramping:** `ramp_A` changes A linearly over time (MIN_RAMP_TIME = 86400s). During ramp, swap calculations use interpolated A value.
- **Virtual price:** Can temporarily decrease in edge cases (crypto pools). Don't use as a monotonically increasing oracle.
- **Donation attacks:** For pools with `exchange_received`, tokens can be donated. Pool tracks `stored_balances` separately from actual balances.
- **ERC4626 tokens:** Some implementations susceptible to donation/inflation attacks (documented in contract header).
- **Decimal normalization:** `rate_multipliers` normalize all coins to 1e18 internally.
- **Pool IS the LP token:** No separate LP token contract; pool address = token address.
- **MAX_COINS = 8** (stableswap), **N_COINS = 2** (twocrypto), **N_COINS = 3** (tricrypto).

---

## 3. PENDLE V2 (Yield Tokenization + AMM)

**Commit:** `3743c6a97f452468ec2c8aee67e6895476911c12`

### 3.1 Architecture

```
contracts/
├── core/
│   ├── YieldContracts/
│   │   ├── PendleYieldToken.sol        (YT — yield token, owns minting logic)
│   │   ├── PendlePrincipalToken.sol    (PT — simple ERC20, minted/burned by YT only)
│   │   ├── PendleYieldContractFactory.sol
│   │   └── InterestManagerYT.sol       (index-based interest tracking)
│   ├── Market/
│   │   ├── v3/PendleMarketV3.sol       (AMM for PT <-> SY trading)
│   │   ├── MarketMathCore.sol          (AMM pricing math)
│   │   └── OracleLib.sol               (TWAP oracle, Uniswap V3-style)
│   ├── StandardizedYield/
│   │   ├── SYUtils.sol                 (SY <-> asset conversion)
│   │   └── PYIndex.sol                 (typed wrapper for exchange rate)
│   ├── libraries/math/
│   │   ├── LogExpMath.sol              (exp/ln with 1e18 precision)
│   │   └── PMath.sol                   (mulDown/divDown/sqrt utilities)
│   └── RewardManager/
│       └── RewardManagerAbstract.sol   (index-based reward distribution)
├── router/
│   ├── PendleRouterV4.sol              (Diamond proxy entrypoint)
│   ├── base/ActionBase.sol             (core swap/mint/redeem primitives)
│   ├── ActionAddRemoveLiqV3.sol
│   ├── ActionSwapPTV3.sol
│   ├── ActionSwapYTV3.sol
│   └── math/MarketApproxLibV2.sol      (binary search for swap amounts)
└── oracles/                            (TWAP consumers for PT/YT/LP pricing)
```

### 3.2 Yield Tokenization

**Concept:** Split yield-bearing asset (wrapped as SY) into PT (principal) + YT (yield).

```
User deposits SY → mintPY() → receives equal PT + YT
At expiry: PT redeems 1:1 for underlying, YT redeems accrued interest
```

**SY (Standardized Yield):** Unified wrapper for any yield-bearing token.
```solidity
interface IStandardizedYield {
    function deposit(receiver, tokenIn, amount, minSharesOut) external returns (uint256);
    function redeem(receiver, shares, tokenOut, minTokenOut, burnInternal) external returns (uint256);
    function exchangeRate() external view returns (uint256);  // grows over time, >= 1e18
}
```

**Conversion:**
```solidity
syToAsset(exchangeRate, syAmount) = syAmount * exchangeRate / 1e18
assetToSy(exchangeRate, assetAmount) = assetAmount * 1e18 / exchangeRate
```

### 3.3 PY Index & Interest

```solidity
// PendleYieldToken._pyIndexCurrent():
currentIndex = max(SY.exchangeRate(), _pyIndexStored)  // monotonically non-decreasing

// InterestManagerYT._distributeInterestPrivate():
interestFromYT = (principal * (currentIndex - prevIndex)) / (prevIndex * currentIndex)
userInterest[user].accrued += interestFromYT

// Interest fee: treasury takes interestFeeRate (max ~20%) of accrued interest
```

**Post-expiry:** `firstPYIndex` frozen. All subsequent interest/rewards go to treasury.

### 3.4 Market AMM (PT <-> SY)

**State:**
```solidity
struct MarketState {
    int256 totalPt, totalSy, totalLp;
    address treasury;
    int256 scalarRoot;          // price sensitivity parameter
    uint256 expiry;
    uint256 lnFeeRateRoot;     // ln(1 + fee), e.g. ln(1.003)
    uint256 reserveFeePercent;  // treasury share of fees (base 100)
    uint256 lastLnImpliedRate;  // TWAP anchor
}

struct MarketStorage {  // packed on-chain
    int128 totalPt;
    int128 totalSy;
    uint96 lastLnImpliedRate;
    uint16 observationIndex;
    uint16 observationCardinality;
    uint16 observationCardinalityNext;
}
```

**Pricing formula:**
```
exchangeRate = ln(proportion) / rateScalar + rateAnchor

where:
  proportion = totalPt / (totalPt + totalAsset)     // totalAsset = syToAsset(totalSy)
  rateScalar = scalarRoot * IMPLIED_RATE_TIME / timeToExpiry   // 365 days
  rateAnchor = derived from lastLnImpliedRate

impliedRate = ln(exchangeRate) * IMPLIED_RATE_TIME / timeToExpiry
exchangeRateFromImpliedRate = e^(lnImpliedRate * timeToExpiry / IMPLIED_RATE_TIME)
```

**Constraints:**
- `exchangeRate >= 1.0` (IONE) — PT always worth >= SY at current rates
- `proportion <= 96%` (MAX_MARKET_PROPORTION) — prevents extreme imbalance
- `totalPt > netPtToAccount` — can't over-trade

### 3.5 Market Operations

```solidity
// Add liquidity: transfer PT + SY first, then call
mint(receiver, netSyDesired, netPtDesired) → (lpOut, syUsed, ptUsed)
// Proportional to existing ratio; first mint uses sqrt(sy * pt) - MINIMUM_LIQUIDITY

// Remove liquidity
burn(receiverSy, receiverPt, netLpToBurn) → (netSyOut, netPtOut)
// Proportional withdrawal

// Swap (callback pattern)
swapExactPtForSy(receiver, exactPtIn, data) → (netSyOut, netSyFee)
// 1. Calculate SY output  2. Transfer SY out  3. Callback  4. Verify PT received

swapSyForExactPt(receiver, exactPtOut, data) → (netSyIn, netSyFee)
// 1. Calculate SY needed  2. Transfer PT out  3. Callback  4. Verify SY received
```

### 3.6 Fee Calculation

```solidity
feeRate = e^(lnFeeRateRoot * timeToExpiry / IMPLIED_RATE_TIME)

// Sell PT (netPtToAccount < 0): user receives SY
netAssetToAccount = -netPt / preFeeExchangeRate
fee = netAssetToAccount * (1 - feeRate)

// Buy PT (netPtToAccount > 0): user sends SY
postFeeRate = preFeeRate / feeRate   // must be >= 1.0
fee = -(preFeeAssetToAccount * (1 - feeRate)) / feeRate

reserveFee = fee * reserveFeePercent / 100  // goes to treasury
```

### 3.7 TWAP Oracle

Uniswap V3-style observation buffer:
```solidity
struct Observation {
    uint32 blockTimestamp;
    uint216 lnImpliedRateCumulative;
    bool initialized;
}
// Circular buffer up to 65535 observations
// Updated once per block in _writeState()
// Query: observe(secondsAgos[]) → lnImpliedRateCumulative[]
```

### 3.8 Reward System

Index-based distribution (similar to Compound/Aave):
```solidity
// Reward shares for YT holder = SY equivalent of YT + accrued interest
_rewardSharesUser(user) = assetToSy(userInterest[user].index, balanceOf(user)) + userInterest[user].accrued

// Accrued = userShares * (globalIndex - userIndex)
// Fee: treasury takes rewardFeeRate (~20% max)
```

### 3.9 Integration Caveats

- **Expiry is hard:** PT/YT expire. Post-expiry: market swaps revert, YT interest frozen, all new rewards → treasury. Integrators must handle expiry transitions.
- **Exchange rate assumption:** `SY.exchangeRate() >= 1e18` always. If underlying gets hacked/depegs and rate drops, `_pyIndexCurrent` uses `max()` to freeze at last known rate — this masks losses.
- **Callback pattern:** Market sends tokens BEFORE callback, then checks balances AFTER. Router implements callbacks to handle complex multi-step swaps (e.g., SY→PT via mint PT+YT then sell YT).
- **Reentrancy:** All state-mutating functions use `nonReentrant`. Market state is written to storage BEFORE callbacks.
- **`_beforeTokenTransfer` hook:** Updates rewards + interest on every PT/YT/LP transfer. This means transfer gas costs are non-trivial and vary.
- **Pull pattern (SY/PT must be sent before calling):** `mintPY`, `mint` (market), `redeemPY` all require tokens transferred to contract first, then detect via `_getFloatingSyAmount()` or balance diff.
- **Binary search in router:** `MarketApproxLibV2` uses iterative binary search for complex swaps (e.g., swap SY→YT). `ApproxParams.eps` controls precision — too loose = bad price, too tight = gas waste/revert.
- **Factory fee overrides:** Router-specific fees can be set per market via factory, allowing different fee tiers for different routers.
- **Limit orders:** Router supports limit order fills that can partially bypass the AMM.
- **Index caching:** If `doCacheIndexSameBlock=true`, PY index is cached per block — multiple txs in same block see same rate. This prevents sandwich attacks on index but means index updates lag.

---

## 4. CONVEX FINANCE (Reward Staking)

### 4.1 Overview

Convex allows users to stake Curve LP tokens to earn boosted CRV rewards plus CVX rewards, without locking CRV themselves. This protocol uses Convex to stake Curve LP tokens from the single-sided LP strategies.

### 4.2 Architecture

```
Curve LP Token → Convex Booster.deposit(pid, amount, stake) → BaseRewardPool (staking)
                                                                    │
                                                          ┌─────────┴──────────┐
                                                          │ CRV rewards        │
                                                          │ CVX rewards        │
                                                          │ Extra rewards      │
                                                          │ (via addExtraReward)│
                                                          └────────────────────┘
```

### 4.3 Key Contracts

- **Booster:** Entry point for depositing LP tokens. `deposit(pid, amount, stake)` on mainnet; `deposit(pid, amount)` on Arbitrum (different interface!).
- **BaseRewardPool:** Holds staked LP tokens, distributes CRV + extra rewards. `getReward()` claims all pending rewards. `withdrawAndUnwrap(amount, claim)` exits and optionally claims.
- **CvxRewardPool:** Distributes CVX rewards proportional to CRV earned.

### 4.4 Integration Caveats

- **Chain-specific Booster interface:** Mainnet Booster.deposit takes 3 params `(pid, amount, stake)`. Arbitrum Booster.deposit takes 2 params `(pid, amount)`. Using the wrong interface reverts the call. The code must branch on `block.chainid`.
- **Reward pool address is immutable in delegatecall libraries:** If LP_LIB (CurveConvexLib) stores the reward pool address as an immutable, it CANNOT be changed via `migrateRewardPool`. The migration function writes to storage, but the immutable in the library shadows it — LP tokens always go to the original pool. This breaks migration entirely.
- **Gauge staking alternative:** When `CONVEX_BOOSTER` is `address(0)`, LP tokens are staked directly to a Curve Gauge instead of Convex. In this case, `_claimVaultRewards` must claim from the Gauge, not from a Convex reward pool. If `rewardPool == address(0)` causes an early return, Gauge rewards become permanently unclaimed.
- **Reward token claiming with cooldowns:** Some external reward pools have cooldown periods. If `_claimVaultRewards` skips claiming due to cooldown, the `accumulatedRewardPerVaultShare` is NOT updated for that interval. Users who exit during this interval lose their share of unclaimed rewards.
- **Token allowance management:** Some DEX interactions (e.g., CURVE_V2 dexId on the TradingModule) revoke token allowances to 0 after a swap. If the swap pool happens to be the same pool the strategy LPs into, future deposits will fail because the strategy needs infinite allowance to the pool.

### 4.5 Reward Accounting Model

The protocol uses its own reward accumulator (not Convex's):

```
accumulatedRewardPerVaultShare += claimedRewards / effectiveSupply

rewardDebt[account] = accountShares * accumulatedRewardPerVaultShare / PRECISION
rewardToClaim = (accountShares * accumulatedRewardPerVaultShare / PRECISION) - rewardDebt
```

Key audit points:
- `effectiveSupply` includes VIRTUAL_SHARES (1e6) even when no real depositors exist. Emission-based rewards accumulate to `rewardsPerVaultShare` even on an empty vault — these rewards are unclaimable and effectively burned.
- Rewards can come from two sources simultaneously: vault claims (from Convex/Gauge) AND emission rates. Both update `accumulatedRewardPerVaultShare`. If one source updates storage but the other reads from a stale memory copy, the update from the first source gets overwritten.
- During liquidation, the `sharesInEscrow` flag affects whether reward debt is updated. Verify that this flag is correct for BOTH the liquidator (whose shares are NOT in escrow) and the liquidated account (whose shares MAY be in escrow).

---

## 5. CROSS-PROTOCOL INTEGRATION RISK MATRIX

| Risk | Morpho | Curve | Pendle |
|------|--------|-------|--------|
| Oracle manipulation | External oracle trusted blindly | Internal EMA, manipulation-resistant | TWAP oracle (1 obs/block) |
| Reentrancy | CEI pattern, no guard | `@nonreentrant('lock')` | `nonReentrant` modifier |
| Flash loan exposure | Free flash loans on any held token | No native flash loans | Callback-based flash swaps |
| Rounding direction | Favors protocol consistently | Newton convergence (precision=1) | Rounds against user on SY conversions |
| Fee-on-transfer tokens | Not supported (safeTransferFrom assumes full amount) | Handled via balance diff in `_transfer_in` | Handled via balance diff pattern |
| Rebasing tokens | Not explicitly handled | Supported with asset_type=2, disables `exchange_received` | Abstracted via SY wrapper |
| Admin risk | Owner: enable IRM/LLTV (irreversible), set fees | Factory admin: set fee receiver | Factory owner: set fee rates, treasury |
| Upgrade risk | None (immutable) | Implementation via factory blueprints | Router uses diamond proxy |
| Bad debt | Socialized to suppliers per-market | N/A (AMM) | N/A (no lending) |
| Value extraction | Liquidation incentive (up to 15%) | MEV on swaps | MEV on swaps + expiry arb |

---

## 6. KEY CONSTANTS QUICK REFERENCE

### Morpho
```
WAD = 1e18                          ORACLE_PRICE_SCALE = 1e36
MAX_FEE = 0.25e18                   LIQUIDATION_CURSOR = 0.3e18
MAX_LIQUIDATION_INCENTIVE = 1.15e18 VIRTUAL_SHARES = 1e6, VIRTUAL_ASSETS = 1
```

### Curve
```
A_PRECISION = 100                   MAX_COINS = 8 (stableswap)
N_COINS = 2 (twocrypto)            N_COINS = 3 (tricrypto)
ADMIN_FEE = 5e9 (50%)              FEE_DENOMINATOR = 1e10
```

### Pendle
```
IMPLIED_RATE_TIME = 365 days        MINIMUM_LIQUIDITY = 1e3
MAX_MARKET_PROPORTION = 0.96e18     PERCENTAGE_DECIMALS = 100
IONE = 1e18                         DAY = 86400
```

---

## 7. POSITION LIFECYCLE & WITHDRAW STATE MACHINE

Understanding the full lifecycle of a user position is critical for finding bugs in state transitions.

### 7.1 Position States

```
                  enterPosition()
    ─────────────────────────────────────►  ACTIVE
                                              │
                                              │ initiateWithdraw()
                                              ▼
                                         PENDING_WITHDRAW
                                              │
                                              │ (external cooldown / queue)
                                              ▼
                                         FINALIZABLE
                                              │
                                              │ finalizeAndRedeem()
                                              ▼
                                         REDEEMED ──► exitPosition()
```

### 7.2 Key Constraints Per State

**ACTIVE:**
- User can: enter more collateral, borrow, repay, exit
- Vault shares represent yield-bearing tokens (LP tokens or PT tokens)
- `price()` returns valuation based on yield token holdings

**PENDING_WITHDRAW:**
- Shares are "escrowed" — still counted in total supply but flagged
- `effectiveSupply` decreases (escrowed shares excluded)
- User CANNOT mint new shares or add collateral while a withdraw is pending
- `price()` switches to `getWithdrawRequestValue()` for the escrowed portion
- Liquidation CAN still occur — liquidator receives the withdraw request via `tokenizeWithdrawRequest`

**FINALIZABLE:**
- External protocol has completed cooldown (Ethena, EtherFi) or batch processing (Dinero)
- `canFinalizeWithdrawRequest()` returns true

**REDEEMED:**
- Tokens claimed from external protocol
- User can call `exitPosition()` to repay debt and receive remaining assets

### 7.3 LP Strategy: Multi-Token Withdrawals

For single-sided LP strategies (Curve), withdrawal creates SEPARATE WithdrawRequests per pool token:

```
initiateWithdraw(shares)
    │
    ├─► remove_liquidity(proportional) → exitBalances[0], exitBalances[1]
    │
    ├─► For each token i:
    │       if exitBalances[i] > 0:
    │           withdrawRequestManagers[i].initiateWithdraw(exitBalances[i])
    │       else:
    │           NO withdraw request created for this token
    │
    └─► Store total sharesAmount across all requests
```

**Critical edge cases:**
1. If `exitBalances[i]` rounds to 0 for one token (dust positions, pool imbalance), no WithdrawRequest is created for that token. But `getWithdrawRequestValue` requires ALL tokens to have a request (`require(hasRequest)`), bricking the account's valuation and making it unliquidatable.
2. ALL token WithdrawRequests must finalize before redemption. If one token's external protocol fails/delays, the other token's funds are stuck too.
3. Each token may use a DIFFERENT WithdrawRequestManager (e.g., token0=Ethena with 7-day cooldown, token1=GenericERC20 with instant finalization). Mixed timelines create complex partial-finalization scenarios.

### 7.4 Dinero Withdraw Manager Specifics

The Dinero (pxETH/apxETH) withdraw manager uses batch-based processing:

```solidity
uint16 private s_batchNonce;  // WARNING: uint16 overflows at 65535
```

- `requestId` encodes: `nonce << 240 | initialBatchId << 120 | finalBatchId`
- `s_batchNonce` increments on every `_initiateWithdrawImpl` call
- At 65536 calls, `++s_batchNonce` reverts (checked arithmetic), permanently bricking all Dinero withdrawals
- Batch IDs can overlap between different users' withdrawal requests. If one user finalizes, they can claim upxETH from overlapping batches, leaving subsequent users with nothing for those batch IDs.

### 7.5 Ethena Withdraw Manager Specifics

- `cooldownDuration` can be 0 (instant) or >0 (delayed)
- When `cooldownDuration == 0`: sUSDe is redeemed to USDe immediately during `_initiateWithdrawImpl`. During finalization, `balanceAfter - balanceBefore == 0` because the USDe was already claimed, causing `tokensClaimed = 0` and permanently locking user funds.
- Withdrawal request valuation uses sUSDe yield token rate, but once sUSDe is burned (cooldown initiated), the actual value is fixed in USDe terms. The sUSDe rate continues increasing, so the withdrawal is overpriced, allowing excess borrowing.

### 7.6 LST Withdrawal Valuation

For liquid staking tokens (OETH, apxETH, weETH):
- Once an LST enters the validator withdrawal queue, it **stops earning yield**
- However, the oracle rate for the LST may continue increasing (it reflects the global rate, not the specific tokens in the queue)
- This means withdrawal requests are **overpriced** relative to their actual value
- Impact: users can borrow more than their collateral is actually worth during the withdrawal period

---

## 8. USER-CONTROLLED INPUTS & ATTACK SURFACES

### 8.1 Trade Parameters (calldata)

In `exitPosition` and `enterPosition`, the user supplies `bytes calldata data` that is decoded into trade parameters. These are partially or fully user-controlled:

| Parameter | User-controlled? | Risk |
|-----------|-----------------|------|
| `tradeType` | YES — decoded from calldata | If changed from `EXACT_IN_SINGLE` to `EXACT_OUT_SINGLE`, the trade semantics flip: instead of selling a fixed amount, it buys a fixed amount. The "excess" tokens remain in the vault or withdraw manager, allowing theft. |
| `dexId` | YES — decoded from calldata | Certain dexIds (e.g., CURVE_V2) revoke token allowances after swap. If the swap pool is the same as the strategy's LP pool, future deposits break permanently. |
| `exchangeData` | YES — decoded from calldata | Contains DEX-specific routing. Can route through malicious intermediate contracts if not validated. |
| `minPurchaseAmount` | YES — user sets slippage tolerance | Can be set to 0, but this is the user's own risk. Check that the protocol enforces it on ALL trade legs, not just the final one. |
| `deadline` | Typically `block.timestamp` | Using `block.timestamp` provides zero MEV protection since it always passes at inclusion time. |

### 8.2 Direct Morpho Access (Bypassing Router)

Since Morpho has no access control on most operations, users can:

1. **Borrow directly** — `Morpho.borrow(marketParams, assets, shares, onBehalf, receiver)`. The `onBehalf` must have authorized the caller OR be the caller. When this happens, `vault.price()` is called by Morpho but `t_CurrentAccount` is never set by the router.

2. **Supply collateral directly** — anyone can `supplyCollateral` on behalf of any account.

3. **Liquidate directly** — anyone can call `Morpho.liquidate()` without going through the router.

4. **Repay directly** — anyone can `repay` on behalf of any account.

5. **Flash loan against the vault** — Morpho flash loans are free and can borrow any token the Morpho contract holds.

**Key audit question:** For each vault function called by Morpho (price, convertToAssets, etc.), does it behave correctly when called outside the router's context (no transient state set)?

### 8.3 Reward Claiming Attack Surface

`claimAccountRewards(vault, account)` in RewardManagerMixin can be called by ANYONE with ANY account address:
- If `account == MORPHO` address, rewards are transferred to the Morpho contract (which holds vault tokens as collateral). These rewards become inaccessible to the actual users.
- Verify: can an attacker trigger `claimAccountRewards(vault, MORPHO)` to redirect a large share of rewards?

### 8.4 Frontrunning Surfaces

| Function | Frontrun risk |
|----------|--------------|
| `Morpho.liquidate()` | Borrower can frontrun by repaying as little as 1 share via `exitPosition`, causing the liquidation to revert with arithmetic overflow when subtracting repaidShares |
| `MorphoLendingRouter.initializeMarket()` | Anyone can frontrun by calling `Morpho.createMarket()` directly with the same params. Since Morpho only creates a market once, the router's initialization fails and `s_morphoParams` is never written |
| `exitPosition()` with pending withdrawal | Cannot be frontrun to steal funds, but the 5-minute cooldown (`lastEntryTime`) can be griefed: an approved operator can call `enterPosition` with zero amounts to reset the cooldown timer indefinitely |

---

## 9. TARGETED AUDIT QUESTIONS

These questions are derived from common integration bugs. Each maps to a concrete code path to verify.

### 9.1 Collateral Price Manipulation

1. Can a user donate yield tokens to the vault (not through the router) to inflate `convertToAssets()` and thus `price()`? If `effectiveSupply` decreases when shares are escrowed but the yield token balance stays the same, does this inflate per-share value?
2. When `price(borrower)` is called by Morpho directly (not via the router), does `t_CurrentAccount == address(0)` cause an incorrect valuation? Specifically, does the vault use `convertToAssets()` instead of `getWithdrawRequestValue()` for an account that has a pending withdrawal?
3. Can flash loans be used to temporarily inflate yield token balances, borrow against inflated collateral, and exit in one tx?

### 9.2 Withdrawal Flow Completeness

4. For LP strategies: what happens when `remove_liquidity(proportional)` returns `exitBalances[i] == 0` for one token? Is a withdraw request still created? If not, does `getWithdrawRequestValue` revert?
5. For Dinero: at what `s_batchNonce` value does `++s_batchNonce` overflow `uint16`? What happens to all subsequent withdrawal initiations?
6. For Ethena: what happens when `sUSDe.cooldownDuration() == 0`? Is the USDe claimed during initiation or finalization? Does the balance-diff pattern in finalization correctly account for this?
7. If one token's withdrawal request is finalized but another is not, can the user redeem the finalized portion? Or are both stuck?

### 9.3 Rounding & Precision

8. Does `MorphoLendingRouter.healthFactor()` use the same rounding direction as Morpho internally? Morpho uses `toAssetsUp` for borrowed amounts — does the router match this?
9. In `tokenizeWithdrawRequest`, does `yieldTokenAmount * sharesAmount / sharesAmount` round correctly? Can repeated partial tokenizations accumulate rounding dust that locks funds?
10. Does the Taylor series approximation in `_calculateAdditionalFeesInYieldToken` systematically undercharge fees? How much error at realistic fee rates and accrual periods?

### 9.4 Reward Accounting

11. When `_claimVaultRewards` updates storage but the calling function holds a stale `state[]` memory array, does the subsequent `_accumulateSecondaryRewardViaEmissionRate` overwrite the claim delta?
12. When a user is fully liquidated (`accountSharesAfter == 0`) while their shares are in escrow, are accrued-but-unclaimed rewards distributed before the reward debt is deleted?
13. Does `effectiveSupply` ever equal zero? If `VIRTUAL_SHARES` prevents this, do emission-based rewards accumulate on an empty vault and become unclaimable?
14. Can `claimAccountRewards(vault, MORPHO_ADDRESS)` misdirect rewards accumulated on the Morpho contract's collateral holdings?

### 9.5 Token Compatibility

15. Does `IERC20.approve()` work with USDT (which has no return value and requires resetting to 0 first)?
16. Does the vault opt in to OETH rebasing? If not, does the Origin strategy generate any yield?
17. Are Curve pool token addresses compared correctly when one token is Native ETH (`address(0)`) and the asset is WETH?

### 9.6 Cross-Chain Compatibility

18. Is the WETH address hardcoded? Does it resolve correctly on Arbitrum?
19. Does the Convex Booster deposit call use the correct number of parameters for the target chain?
20. Is the Convex Booster constructor check limited to `CHAIN_ID_MAINNET`? If so, Arbitrum deployments cannot use Convex even though it's available there.
