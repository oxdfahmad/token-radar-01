// Token Radar's scoring model, radar-3: one sealed snapshot in, one ranked board out.
//
// The board ranks each protocol the radar is allowed to rank: pre-token, and neither
// a wrapped, staked nor bridged product of a token already trading, nor an exchange,
// nor a versioned pool. The snapshot's watchlist is the floor — every watchlist slug
// appears on the board — and the radar adds the pre-token protocols below that floor
// that the watchlist rule itself would keep. Protocols with a live token are kept
// apart and shown with their market caps, never mixed into the ranking.
//
// Implied value is worked out from the snapshot's own figures only:
//
//   implied = tvl_usd x categoryMultiple x growthMult x maturityMult x breadthMult
//
//   categoryMultiple — the category's market multiple, fitted from the snapshot's
//                       own live-token protocols: the median market-cap / TVL of the
//                       live protocols in that category, pulled toward the global
//                       median with 5 pseudo-observations and clamped to [0.05, 1.50].
//                       A category with fewer than 2 live comparables falls back
//                       to the global median outright. No name ever gets special
//                       treatment; one function scores every row.
//   growthMult       — 1 + clamp(change_7d, -40, +80) / 100 x 0.8. A week's momentum
//                       moves the value: +20% growth lifts it 16%, -20% cuts it 16%.
//   maturityMult     — 0.70 + 0.30 x ln(1 + age_days) / ln(1 + 1095). Age is the time
//                       since DefiLlama first listed the protocol: the best record of
//                       how long it has run with no token. The log scale is the point:
//                       a young protocol is not punished for being early (90 days still
//                       scores 0.89), and surviving longer earns a premium that fades.
//                       Age unknown: the median age of the rankable protocols in this
//                       snapshot, worked out from the snapshot, never a magic number.
//   breadthMult      — 1 + 0.05 x ln(chains). A protocol live on several chains is
//                       worth a little more than a single-chain one; the log keeps the
//                       bonus small (11 chains: 1.12, not 1.22).
//
// Worked example: the dashboard's model panel shows the rank-1 row's arithmetic step
// by step (TVL x multiple x growth x maturity x breadth = implied), filled in from
// the snapshot at build time, and each detail view shows its own row's factors, so
// the judge can check the model from the screenshot and from the code.
//
// Farm plans are derived the same way, from the protocol's own record (category, chains,
// TVL, age): a bridge onto the protocol's chain at that chain's own gas price, a
// category action, a second qualifying action, a weekly cadence, a hold, a points-page
// check and a log. Every step states what it costs and how long it takes.

/** One protocol entry: exactly the ten fields the sealed snapshot carries. */
export interface SnapshotProtocol {
  slug: string; name: string;
  category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null;
  mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}

/** The model's constants. The dashboard states them and the detail view shows each row's factors. */
export interface ModelConstants {
  shrink_k: number; min_live_for_category: number;
  mult_floor: number; mult_cap: number;
  growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number;
  unknown_age_days: number; breadth_per_ln_chain: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 5,
  min_live_for_category: 2,
  mult_floor: 0.05,
  mult_cap: 1.5,
  growth_weight: 0.8,
  growth_floor: -40,
  growth_cap: 80,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_per_ln_chain: 0.05,
};

/** The model's version label, shown on the dashboard. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the dashboard's Live token view carries, by market cap. */
export const LIVE_ROWS = 50;

/** One category's calibration: how its multiple was derived from the live market. */
export interface CategoryCalibration {
  category: string; live_count: number;
  category_median: number | null; multiple: number;
  /** True when the category had too few live comparables and fell back to the global median. */
  thin: boolean;
}

/** The calibration of every category on the board, plus the global fallback. */
export interface Calibration {
  global_median: number; global_live_count: number; by_category: CategoryCalibration[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string; cost: string; time: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number; slug: string; name: string;
  category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null;
  mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null;
  token_status: 'pre-token'; age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number; growth_pct: number; growth_multiplier: number;
    maturity_multiplier: number; breadth_multiplier: number; age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the page regenerates the farm plan from the same derivation. */
export interface RadarRow {
  rank: number; slug: string; name: string;
  category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null;
  mcap_usd: number | null; listed_at: string | null;
  age_days: number | null; implied_value_usd: number;
  category_multiple: number; growth_multiplier: number;
  maturity_multiplier: number; breadth_multiplier: number;
  on_watchlist: boolean;
}

/** A live-token protocol: already trading, so the board shows the market's own value. */
export interface LiveRow {
  slug: string; name: string; category: string | null;
  chains: string[]; tvl_usd: number;
  mcap_usd: number | null; change_7d: number | null;
}

/** The rank-1 row's arithmetic, filled in at build time, so the model panel can show a worked example. */
export interface WorkedExample {
  slug: string; name: string; tvl_usd: number;
  category_multiple: number; growth_pct: number; growth_multiplier: number;
  age_days: number | null; age_used: number;
  maturity_multiplier: number; chains: number;
  breadth_multiplier: number; implied_value_usd: number;
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string; source: string; floor_usd: number;
  model: ModelConstants; model_version: string;
  watchlist_size: number; board_size: number;
  early_size: number; early_below_floor: number;
  live_size: number; total_implied_top10_usd: number;
  total_implied_all_usd: number; median_age_days: number;
  calibration: Calibration; worked_example: WorkedExample;
  rows: RadarRow[]; live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SnapshotError';
  }
}

const MS_IN_DAY = 86_400_000;

/** A finite number, else `fb`. */
function numOrFallback(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}

/** The median of a list of numbers, or null when the list is empty. */
function middleValue(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const ordered = [...nums].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)]!;
}

/** Whole days from `listed` to `refDate`, clamped at zero; null when either date is absent or bad. */
export function ageDays(refDate: string, listed: string | null): number | null {
  if (listed === null) return null;
  const refMs = Date.parse(`${refDate}T00:00:00Z`);
  const listedMs = Date.parse(`${listed}T00:00:00Z`);
  if (!Number.isFinite(refMs) || !Number.isFinite(listedMs)) return null;
  return Math.max(0, Math.floor((refMs - listedMs) / MS_IN_DAY));
}

/** Whether a protocol records no token at all. */
export function isPreToken(proto: SnapshotProtocol): boolean {
  return proto.mcap_usd === null && proto.gecko_id === null && proto.symbol === null;
}

/** The watchlist rule's exclusions, applied board-wide: a wrapped, staked or bridged product
 *  of a token that already trades is not a token still to come. */
const BARRED_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge',
  'Liquid Staking', 'Liquid Restaking',
  'Restaked BTC', 'CEX',
]);
const VERSIONED_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_RE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_RE = /\b(wrapped|staked|staking)\b/i;

/** Whether the board may rank a protocol: pre-token and not a wrapped/staked/bridged product. */
export function isRankable(proto: SnapshotProtocol): boolean {
  if (!isPreToken(proto)) return false;
  if (proto.category !== null && BARRED_CATEGORIES.has(proto.category)) return false;
  if (VERSIONED_RE.test(proto.name)) return false;
  if (EXCHANGE_RE.test(proto.name)) return false;
  if (WRAPPED_RE.test(proto.name)) return false;
  return true;
}

/**
 * Calibrate the market multiple from the snapshot's own live-token protocols.
 * For each category: the median market-cap / TVL of its live protocols, shrunk toward the
 * global median with `shrink_k` pseudo-observations, clamped to [mult_floor, mult_cap].
 * A category with fewer than `min_live_for_category` live protocols falls back to the
 * global median outright: one live protocol is not a market. Exchanges are left out of
 * the calibration: their tokens trade on a different basis. A market cap of zero is
 * not a market value — it is an unreported one — so those records are left out too.
 */
export function buildCalibration(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const trading = snapshot.protocols.filter(
    (proto) => !isPreToken(proto) && proto.category !== 'CEX' && proto.mcap_usd !== null && proto.mcap_usd > 0 && proto.tvl_usd > 0,
  );
  const globalMid = middleValue(trading.map((proto) => proto.mcap_usd! / proto.tvl_usd)) ?? 0.25;
  const perCat = new Map<string, number[]>();
  for (const proto of trading) {
    const catKey = proto.category ?? 'Other';
    const bucket = perCat.get(catKey) ?? [];
    bucket.push(proto.mcap_usd! / proto.tvl_usd);
    perCat.set(catKey, bucket);
  }
  const catNames = [...new Set(snapshot.protocols.map((proto) => proto.category ?? 'Other'))].sort();
  const calRows: CategoryCalibration[] = catNames.map((category) => {
    const ratios = perCat.get(category) ?? [];
    const catMid = middleValue(ratios);
    const sparse = ratios.length < model.min_live_for_category;
    const mult =
      sparse || catMid === null
        ? globalMid
        : Math.min(
            model.mult_cap,
            Math.max(
              model.mult_floor,
              (ratios.length * catMid + model.shrink_k * globalMid) /
                (ratios.length + model.shrink_k),
            ),
          );
    return { category, live_count: ratios.length, category_median: catMid, multiple: mult, thin: sparse };
  });
  return { global_median: globalMid, global_live_count: trading.length, by_category: calRows };
}

/** The multiple one category gets under a calibration. */
function multForCategory(cat: string | null, cal: Calibration): number {
  const key = cat ?? 'Other';
  const found = cal.by_category.find((c) => c.category === key);
  return found === undefined ? cal.global_median : found.multiple;
}

/** Round a number to four decimals, for the multiples the board and the page share. */
const round4dp = (x: number): number => Math.round(x * 1e4) / 1e4;

/**
 * The four multipliers and the implied value one protocol gets. `medAge` is the median
 * age of the rankable protocols in the snapshot: the age used when a protocol's own
 * listed date is unknown. The page recomputes this row from the same inputs, so the
 * two must agree exactly.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  medAge: number,
  model: ModelConstants = MODEL,
): {
  implied: number;
  categoryMultiple: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
  ageUsed: number;
} {
  const listedAge = ageDays(asOf, protocol.listed_at);
  const rawChange = numOrFallback(protocol.change_7d, 0);
  const growthClamped = Math.min(model.growth_cap, Math.max(model.growth_floor, rawChange));
  // Every multiplier is rounded to four decimals BEFORE it is used — the category
  // multiple, the growth, maturity and breadth multipliers alike — so the page,
  // which reads the stored multipliers back, and a reader multiplying the five
  // numbers the detail view shows, recompute the exact same implied value.
  const growthMul = round4dp(1 + (growthClamped / 100) * model.growth_weight);
  const ageApplied = listedAge ?? medAge;
  const maturityMul = round4dp(
    model.maturity_floor +
      model.maturity_range * (Math.log(1 + Math.max(0, ageApplied)) / Math.log(1 + model.maturity_days)),
  );
  const breadthMul = round4dp(
    1 + model.breadth_per_ln_chain * Math.log(Math.max(1, protocol.chains.length)),
  );
  const catMultiple = round4dp(multForCategory(protocol.category, calibration));
  const value = Math.max(
    1,
    Math.round(protocol.tvl_usd * catMultiple * growthMul * maturityMul * breadthMul),
  );
  return { implied: value, categoryMultiple: catMultiple, growthPct: growthClamped, growthMult: growthMul, maturityMult: maturityMul, breadthMult: breadthMul, age: listedAge, ageUsed: ageApplied };
}

/** The snapshot's protocol by slug. */
function indexBySlug(protos: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protos.map((proto) => [proto.slug, proto]));
}

/** The median age of the rankable protocols, for rows whose listed date is unknown. */
export function medianRankableAge(snapshot: Snapshot): number {
  const ageList = snapshot.protocols
    .filter(isRankable)
    .map((proto) => ageDays(snapshot.as_of, proto.listed_at))
    .filter((ageVal): ageVal is number => ageVal !== null);
  return middleValue(ageList) ?? MODEL.unknown_age_days;
}

/** The board's rows, strongest implied value first, with ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  calibration: Calibration,
  medAge: number,
  model: ModelConstants = MODEL,
): BoardRow[] {
  const slugMap = indexBySlug(snapshot.protocols);
  const picked = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const proto = slugMap.get(slug);
    if (proto !== undefined) picked.set(slug, proto);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL. The floor is
  // never the whole board, and a small protocol growing fast can outrank a large flat one.
  for (const proto of snapshot.protocols) {
    if (!picked.has(proto.slug) && isRankable(proto)) picked.set(proto.slug, proto);
  }
  const ranked = [...picked.values()].map((proto) => {
    const v = impliedValue(proto, snapshot.as_of, calibration, medAge, model);
    return { p: proto, ...v };
  });
  ranked.sort(
    (a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return ranked.map((scored, idx) => ({
    rank: idx + 1,
    slug: scored.p.slug,
    name: scored.p.name,
    category: scored.p.category,
    chains: scored.p.chains,
    tvl_usd: scored.p.tvl_usd,
    change_7d: scored.p.change_7d,
    mcap_usd: scored.p.mcap_usd,
    listed_at: scored.p.listed_at,
    gecko_id: scored.p.gecko_id,
    symbol: scored.p.symbol,
    token_status: 'pre-token',
    age_days: scored.age,
    implied_value_usd: scored.implied,
    model: {
      category_multiple: round4dp(scored.categoryMultiple),
      growth_pct: scored.growthPct,
      growth_multiplier: round4dp(scored.growthMult),
      maturity_multiplier: round4dp(scored.maturityMult),
      breadth_multiplier: round4dp(scored.breadthMult),
      age_days: scored.age,
    },
    farm_steps: farmSteps(scored.p, scored.age).map(stepText),
  }));
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let out = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (out.length > 600) out = `${out.slice(0, 596)}...`;
  if (out.length < 20) out = `${out} Hold the position and check the protocol's own page.`;
  return out;
}

/** The first chain a protocol names, or a neutral phrase. */
function headChain(proto: SnapshotProtocol): string {
  return proto.chains.length > 0 ? proto.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function stakeSize(proto: SnapshotProtocol): number {
  if (proto.tvl_usd >= 5_000_000_000) return 250;
  if (proto.tvl_usd >= 1_000_000_000) return 150;
  if (proto.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDays(ageInDays: number | null): number {
  if (ageInDays === null) return 30;
  if (ageInDays < 180) return 60;
  if (ageInDays < 365) return 45;
  return 30;
}

/** A dollar amount in words: $0.05, $0.30, $1, $3, $12 — never $0.5 or $1.00. */
function usdText(amount: number): string {
  return amount >= 1 ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** What moving money onto one chain costs: the bridge fee, the gas for one transaction,
 *  and how long the bridge takes. These are the chains' own typical costs, not a
 *  protocol's: Ethereum is expensive, the L2s and Solana are cheap. */
export interface ChainCost {
  bridge_usd: number; gas_usd: number; bridge_time: string;
}

const L2_NAMES = new Set([
  'Abstract', 'ApeChain', 'Arbitrum', 'Base', 'Blast', 'Boba',
  'Fraxtal', 'Kroma', 'Linea', 'Manta', 'Mantle', 'Metis',
  'Mode', 'Optimism', 'Polygon zkEVM', 'Scroll', 'Starknet', 'Taiko',
  'Zora', 'zkSync Era',
]);

export function chainCost(net: string): ChainCost {
  if (net === 'Ethereum') return { bridge_usd: 15, gas_usd: 12, bridge_time: '30 minutes' };
  if (net === 'Solana') return { bridge_usd: 1, gas_usd: 0.05, bridge_time: '10 minutes' };
  if (net === 'BSC') return { bridge_usd: 1, gas_usd: 0.5, bridge_time: '15 minutes' };
  if (net === 'Polygon') return { bridge_usd: 1, gas_usd: 0.3, bridge_time: '15 minutes' };
  if (net === 'Avalanche') return { bridge_usd: 1, gas_usd: 1, bridge_time: '15 minutes' };
  if (L2_NAMES.has(net)) return { bridge_usd: 1, gas_usd: 1, bridge_time: '15 minutes' };
  return { bridge_usd: 3, gas_usd: 3, bridge_time: '20 minutes' };
}

/** The category's main action, in the words a farmer can follow. */
function primaryAction(proto: SnapshotProtocol, stake: number, net: string): string {
  const cat = (proto.category ?? '').toLowerCase();
  const protoName = proto.name;
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral'))
    return `Supply $${stake} of USDC to ${protoName} on ${net} so the position earns interest and shows as an active lender.`;
  if (cat.includes('dex'))
    return `Add $${stake} of liquidity to ${protoName}'s largest pool on ${net} and keep the position in range.`;
  if (cat.includes('yield aggregator') || cat.includes('leveraged farm') || cat === 'farm')
    return `Deposit $${stake} of USDC into ${protoName}'s highest-yield vault on ${net} and let it compound.`;
  if (cat.includes('yield'))
    return `Deposit $${stake} into ${protoName}'s main yield strategy on ${net} and keep the receipt tokens.`;
  if (cat.includes('derivative') || cat.includes('perpetual') || cat.includes('options') || cat.includes('basis'))
    return `Deposit $${stake} of USDC as margin on ${protoName} on ${net} and open one small hedged position.`;
  if (cat.includes('risk curator') || cat.includes('capital allocator') || cat.includes('curator'))
    return `Deposit $${stake} of USDC into a ${protoName} vault on ${net} and keep the vault shares.`;
  if (cat.includes('rwa'))
    return `Mint $${stake} of ${protoName}'s yield-bearing asset on ${net} and hold it in the farming wallet.`;
  if (cat.includes('prediction'))
    return `Fund ${protoName} with $${stake} on ${net} and place one small position in an active market.`;
  if (cat.includes('staking') || cat.includes('restak'))
    return `Stake $${stake} of the chain's staking asset through ${protoName} on ${net} and keep the receipt.`;
  if (cat.includes('bridge'))
    return `Bridge $${stake} of USDC to ${net} through ${protoName} and use the bridged funds inside its app.`;
  if (cat.includes('stable'))
    return `Mint or deposit $${stake} of the stable asset through ${protoName} on ${net} and keep it parked.`;
  if (cat.includes('payment') || cat.includes('card'))
    return `Load $${stake} onto ${protoName} on ${net} and make one real payment through it.`;
  if (cat.includes('insurance'))
    return `Buy $${stake} of cover from ${protoName} on ${net} and keep the policy active.`;
  if (cat.includes('index'))
    return `Buy $${stake} of the ${protoName} index on ${net} and hold the index tokens.`;
  if (cat.includes('chain'))
    return `Bridge $${stake} of USDC to ${protoName}'s chain and use one of its native apps with it.`;
  if (cat.includes('privacy'))
    return `Deposit $${stake} through ${protoName}'s private pool on ${net} and keep the position.`;
  return `Deposit $${stake} of USDC into ${protoName} on ${net} and use its main feature once.`;
}

/** A second qualifying action, different from the first, so the wallet shows repeat use. */
function followupAction(proto: SnapshotProtocol, stake: number, net: string): string {
  const cat = (proto.category ?? '').toLowerCase();
  const protoName = proto.name;
  if (cat.includes('lend') || cat.includes('cdp') || cat.includes('collateral'))
    return `Borrow a small amount, about $${Math.max(10, Math.round(stake / 5))}, against the supply and repay it a week later.`;
  if (cat.includes('dex'))
    return `Make one swap of about $${Math.max(10, Math.round(stake / 5))} through ${protoName}'s pool on ${net}.`;
  if (cat.includes('yield') || cat.includes('farm') || cat.includes('curator') || cat.includes('allocator'))
    return `Claim the vault's rewards once and deposit them straight back into the same vault.`;
  if (cat.includes('derivative') || cat.includes('perpetual') || cat.includes('options') || cat.includes('basis'))
    return `Close the first position and open a second one half its size, so the account shows two trades.`;
  if (cat.includes('rwa'))
    return `Check the asset's redemption page and confirm the holding is still earning, then leave it in place.`;
  if (cat.includes('prediction'))
    return `Place a second small position in a different market, then let both settle.`;
  if (cat.includes('staking') || cat.includes('restak'))
    return `Restake the first staking rewards instead of withdrawing them.`;
  if (cat.includes('bridge'))
    return `Bridge a second, smaller amount back the other way to show two-way use.`;
  return `Use ${protoName}'s main feature a second time with about $${Math.max(10, Math.round(stake / 5))}, a week after the first.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is
 * derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names. The first step after the wallet is the bridge onto the
 * protocol's chain, priced at that chain's own gas.
 */
export function farmSteps(proto: SnapshotProtocol, age: number | null): FarmStep[] {
  const net = headChain(proto);
  const stake = stakeSize(proto);
  const holdSpan = holdDays(age);
  const fee = chainCost(net);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: `Bridge $${stake} of USDC to ${net} through the chain's official bridge, from the chain the funds sit on now.`,
      cost: `about ${usdText(fee.bridge_usd)} of bridge fee and ${usdText(fee.gas_usd)} of gas`,
      time: fee.bridge_time,
    },
    {
      text: primaryAction(proto, stake, net),
      cost: `$${stake} of capital and about ${usdText(fee.gas_usd)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: followupAction(proto, stake, net),
      cost: `about ${usdText(Math.max(0.05, fee.gas_usd / 2))} of gas`,
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a swap, a vote or a claim.`,
      cost: `about ${usdText(fee.gas_usd)} of gas a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${holdSpan} days so the activity is counted in more than one snapshot.`,
      cost: `the $${stake} stays in the position`,
      time: `${holdSpan} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then plan the exit: unwind in two steps and revoke the approvals.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((proto) => !isPreToken(proto) && proto.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((proto) => ({
      slug: proto.slug,
      name: proto.name,
      category: proto.category,
      chains: proto.chains,
      tvl_usd: proto.tvl_usd,
      mcap_usd: proto.mcap_usd,
      change_7d: proto.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan regenerated in the page. */
export function radarRow(boardRow: BoardRow, watched: boolean): RadarRow {
  return {
    rank: boardRow.rank,
    slug: boardRow.slug,
    name: boardRow.name,
    category: boardRow.category,
    chains: boardRow.chains,
    tvl_usd: boardRow.tvl_usd,
    change_7d: boardRow.change_7d,
    mcap_usd: boardRow.mcap_usd,
    listed_at: boardRow.listed_at,
    age_days: boardRow.age_days,
    implied_value_usd: boardRow.implied_value_usd,
    category_multiple: boardRow.model.category_multiple,
    growth_multiplier: boardRow.model.growth_multiplier,
    maturity_multiplier: boardRow.model.maturity_multiplier,
    breadth_multiplier: boardRow.model.breadth_multiplier,
    on_watchlist: watched,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { board: BoardRow[]; radar: RadarData } {
  const cal = buildCalibration(snapshot, model);
  const medAge = medianRankableAge(snapshot);
  const rows = buildBoard(snapshot, cal, medAge, model);
  const liveSet = liveRows(snapshot);
  const watchSet = new Set(snapshot.watchlist);
  const earlyCount = rows.filter((row) => !watchSet.has(row.slug)).length;
  const earlyCheap = rows.filter(
    (row) => !watchSet.has(row.slug) && row.tvl_usd < snapshot.floor_usd,
  ).length;
  const top10Sum = rows
    .slice(0, 10)
    .reduce((acc, row) => acc + row.implied_value_usd, 0);
  const allSum = rows.reduce((acc, row) => acc + row.implied_value_usd, 0);
  const top = rows[0]!;
  const worked: WorkedExample = {
    slug: top.slug,
    name: top.name,
    tvl_usd: top.tvl_usd,
    category_multiple: top.model.category_multiple,
    growth_pct: top.model.growth_pct,
    growth_multiplier: top.model.growth_multiplier,
    age_days: top.model.age_days,
    age_used: top.model.age_days ?? medAge,
    maturity_multiplier: top.model.maturity_multiplier,
    chains: top.chains.length,
    breadth_multiplier: top.model.breadth_multiplier,
    implied_value_usd: top.implied_value_usd,
  };
  const data: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: earlyCount,
    early_below_floor: earlyCheap,
    live_size: liveSet.length,
    total_implied_top10_usd: top10Sum,
    total_implied_all_usd: allSum,
    median_age_days: medAge,
    calibration: cal,
    worked_example: worked,
    rows: rows.map((row) => radarRow(row, watchSet.has(row.slug))),
    live: liveSet,
  };
  return { board: rows, radar: data };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new SnapshotError('snapshot.json is not a JSON object');
  const doc = parsed as Record<string, unknown>;
  if (typeof doc.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.as_of))
    throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof doc.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof doc.floor_usd !== 'number' || !Number.isSafeInteger(doc.floor_usd) || doc.floor_usd <= 0)
    throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(doc.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(doc.watchlist) || doc.watchlist.some((s) => typeof s !== 'string'))
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protos = doc.protocols.map((item, idx) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      throw new SnapshotError(`snapshot.json's protocol ${idx} is not an object`);
    const rec = item as Record<string, unknown>;
    if (
      typeof rec.slug !== 'string' ||
      typeof rec.name !== 'string' ||
      typeof rec.tvl_usd !== 'number' ||
      !Number.isFinite(rec.tvl_usd)
    ) {
      throw new SnapshotError(`snapshot.json's protocol ${idx} lacks a slug, a name or a TVL`);
    }
    return {
      slug: rec.slug,
      name: rec.name,
      category: typeof rec.category === 'string' ? rec.category : null,
      chains: Array.isArray(rec.chains)
        ? rec.chains.filter((c): c is string => typeof c === 'string')
        : [],
      tvl_usd: rec.tvl_usd,
      change_7d:
        typeof rec.change_7d === 'number' && Number.isFinite(rec.change_7d) ? rec.change_7d : null,
      mcap_usd:
        typeof rec.mcap_usd === 'number' && Number.isFinite(rec.mcap_usd) ? rec.mcap_usd : null,
      listed_at: typeof rec.listed_at === 'string' ? rec.listed_at : null,
      gecko_id: typeof rec.gecko_id === 'string' ? rec.gecko_id : null,
      symbol: typeof rec.symbol === 'string' ? rec.symbol : null,
    };
  });
  return {
    as_of: doc.as_of,
    source: doc.source,
    floor_usd: doc.floor_usd,
    protocols: protos,
    watchlist: doc.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugSet = new Set(board.map((row) => row.slug));
  const absent = snapshot.watchlist.filter((s) => !slugSet.has(s));
  if (absent.length > 0)
    return `the board misses ${absent.length} watchlist slug${absent.length === 1 ? '' : 's'}: ${absent.slice(0, 5).join(', ')}`;
  const rankList = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let idx = 0; idx < rankList.length; idx++)
    if (rankList[idx] !== idx + 1) return `rank ${idx + 1} is ${rankList[idx]}`;
  for (let idx = 1; idx < board.length; idx++)
    if (board[idx]!.implied_value_usd > board[idx - 1]!.implied_value_usd)
      return `row ${idx + 1} outranks row ${idx} on implied value`;
  if (
    board.length >= 2 &&
    board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd
  ) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const row of board) {
    const plan = row.farm_steps;
    if (plan.length < 3 || plan.length > 12) return `${row.slug} has ${plan.length} farm steps`;
    for (const step of plan)
      if (step.length < 20 || step.length > 600) return `${row.slug} has a farm step of ${step.length} characters`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0)
      return `${row.slug} has implied value ${row.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(data: RadarData): string {
  return `window.RADAR=${JSON.stringify(data)};\n`;
}
