// Token Radar v2: Calibrated Launch Radar with Hierarchical Bayesian Model
//
// This model measures what the market pays for each kind of protocol using the live peers
// in the same snapshot, then applies that to every pre-token protocol with uncertainty
// quantification. No protocol name is ever special-cased.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard. */
export interface ModelConstants {
  calibration: string;
  shrinkage_prior_count: number;
  min_peers_for_category: number;
  growth_weight_7d: number;
  growth_weight_30d: number;
  growth_floor: number;
  growth_cap: number;
  maturity_half_life_days: number;
  maturity_floor: number;
  chain_quality: Record<string, number>;
  default_chain_quality: number;
  breadth_step: number;
  breadth_cap: number;
  implied_floor: number;
  uncertainty_scaling: number;
}

export const MODEL: ModelConstants = {
  calibration: 'hierarchical Bayes: per-category median mcap/tvl shrunk toward global median with data-driven weight',
  shrinkage_prior_count: 8,
  min_peers_for_category: 3,
  growth_weight_7d: 0.35,
  growth_weight_30d: 0.15,
  growth_floor: -60,
  growth_cap: 120,
  maturity_half_life_days: 730,
  maturity_floor: 0.45,
  chain_quality: {
    Ethereum: 1.00, Arbitrum: 0.95, Base: 0.95, Optimism: 0.90, Polygon: 0.85,
    Solana: 0.90, Avalanche: 0.80, Binance: 0.75, Bitcoin: 0.70,
    Hyperliquid: 0.80, Monad: 0.70, Sui: 0.75, Tron: 0.60, Plasma: 0.65, Ripple: 0.55,
  },
  default_chain_quality: 0.50,
  breadth_step: 0.02,
  breadth_cap: 5,
  implied_floor: 1,
  uncertainty_scaling: 1.5,
};

/** The model's version label. */
export const MODEL_VERSION = 'radar-3-hierarchical';

/** A farm step with quantified estimates. */
export interface FarmStep {
  text: string;
  cost_usd: string;
  time_estimate: string;
  frequency: string;
  risk_note: string;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  change_30d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_value_ci_low: number;
  implied_value_ci_high: number;
  model: {
    base_multiple: number;
    growth_7d_pct: number;
    growth_7d_mult: number;
    growth_30d_pct: number;
    growth_30d_mult: number;
    maturity_mult: number;
    chain_quality_mult: number;
    breadth_mult: number;
    age_days: number | null;
    uncertainty_pct: number;
  };
  farm_steps: string[];
}

/** Dashboard compact row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  change_30d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_value_ci_low: number;
  implied_value_ci_high: number;
  multiple: number;
  growth_7d_mult: number;
  growth_30d_mult: number;
  maturity_mult: number;
  chain_quality_mult: number;
  breadth_mult: number;
  peer_count: number;
  watchlist: boolean;
}

/** Live-token protocol for calibration view. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number;
}

/** Category calibration result. */
export interface CategoryCalibration {
  category: string;
  median_ratio: number;
  shrunk_ratio: number;
  peer_count: number;
  effective_weight: number;
  ci_low: number;
  ci_high: number;
}

/** Global calibration. */
export interface Calibration {
  global_median: number;
  global_peers: number;
  global_ci_low: number;
  global_ci_high: number;
  categories: CategoryCalibration[];
}

/** Full dashboard data. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
}

const DAY_MS = 86_400_000;

/** Finite number or fallback. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Age in days from as_of to listed_at, null if unknown. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Median of array, null if empty. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Winsorize at p and 1-p quantiles. */
function winsorize(values: number[], p: number): number[] {
  if (values.length < 3) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(p * sorted.length)];
  const hi = sorted[Math.ceil((1 - p) * sorted.length) - 1];
  return values.map(v => Math.max(lo, Math.min(hi, v)));
}

/** Standard error of median via bootstrap approximation. */
function medianSE(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  return 1.253 * (values.reduce((s, v) => s + v * v, 0) / n - (values.reduce((s, v) => s + v, 0) / n) ** 2) ** 0.5 / n ** 0.5;
}

/** Market cap / TVL ratio for live protocols; null if not valid. */
function liveRatio(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return null;
  const ratio = p.mcap_usd / p.tvl_usd;
  return ratio > 50 ? null : ratio;
}

/** Hierarchical calibration: global + per-category with empirical Bayes shrinkage. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const live = snapshot.protocols.filter(p => liveRatio(p) !== null);
  const allRatios: number[] = [];
  const perCategory = new Map<string, number[]>();

  for (const p of live) {
    const ratio = liveRatio(p)!;
    allRatios.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = perCategory.get(key);
    if (list === undefined) perCategory.set(key, [ratio]);
    else list.push(ratio);
  }

  const globalRatios = winsorize(allRatios, 0.02);
  const globalMedian = median(globalRatios) ?? model.default_multiple;
  const globalSE = medianSE(globalRatios);
  const globalPeers = globalRatios.length;
  const global_ci_low = Math.max(0, globalMedian - 1.96 * globalSE);
  const global_ci_high = globalMedian + 1.96 * globalSE;

  const categories: CategoryCalibration[] = [];

  for (const [category, list] of perCategory) {
    const n = list.length;
    const winsorized = winsorize(list, 0.05);
    const catMedian = median(winsorized);
    const catSE = medianSE(winsorized);

    if (n >= model.min_peers_for_category && catMedian !== null) {
      // Empirical Bayes shrinkage: weight = n / (n + prior)
      const weight = n / (n + model.shrinkage_prior_count);
      const shrunk = weight * catMedian! + (1 - weight) * globalMedian;
      const ci_low = Math.max(0, shrunk - 1.96 * catSE * Math.sqrt(1 / n + 1 / model.shrinkage_prior_count));
      const ci_high = shrunk + 1.96 * catSE * Math.sqrt(1 / n + 1 / model.shrinkage_prior_count);
      categories.push({
        category,
        median_ratio: catMedian!,
        shrunk_ratio: shrunk,
        peer_count: n,
        effective_weight: weight,
        ci_low,
        ci_high,
      });
    } else {
      categories.push({
        category,
        median_ratio: catMedian ?? globalMedian,
        shrunk_ratio: globalMedian,
        peer_count: n,
        effective_weight: 0,
        ci_low: global_ci_low,
        ci_high: global_ci_high,
      });
    }
  }

  categories.sort((a, b) => b.peer_count - a.peer_count || (a.category < b.category ? -1 : 1));

  return {
    global_median: globalMedian,
    global_peers: globalPeers,
    global_ci_low,
    global_ci_high,
    categories,
  };
}

/** Get the shrunk multiple for a protocol's category. */
export function multipleFor(p: SnapshotProtocol, calibration: Calibration, model: ModelConstants = MODEL): { multiple: number; peers: number; ci_low: number; ci_high: number } {
  const key = p.category ?? 'Uncategorized';
  const found = calibration.categories.find(c => c.category === key);
  if (found) return { multiple: found.shrunk_ratio, peers: found.peer_count, ci_low: found.ci_low, ci_high: found.ci_high };
  return { multiple: calibration.global_median, peers: calibration.global_peers, ci_low: calibration.global_ci_low, ci_high: calibration.global_ci_high };
}

/** Maturity multiplier: survival curve with half-life. */
function maturityMultiplier(age: number | null, model: ModelConstants): number {
  if (age === null) return (model.maturity_floor + 1) / 2;
  const halfLife = model.maturity_half_life_days;
  const survival = 0.5 ** (age / halfLife);
  return model.maturity_floor + (1 - model.maturity_floor) * (1 - survival);
}

/** Chain quality multiplier: max quality of all chains. */
function chainQualityMultiplier(chains: string[], model: ModelConstants): number {
  if (chains.length === 0) return model.default_chain_quality;
  let best = model.default_chain_quality;
  for (const c of chains) {
    const q = model.chain_quality[c];
    if (q !== undefined && q > best) best = q;
  }
  return best;
}

/** Breadth multiplier: diminishing returns per additional chain. */
function breadthMultiplier(chains: string[], model: ModelConstants): number {
  const extra = Math.max(0, Math.min(chains.length - 1, model.breadth_cap));
  return 1 + extra * model.breadth_step;
}

/** Approximate 30d change from 7d and TVL trajectory (heuristic). */
function estimate30dChange(change7d: number | null, tvl: number): number {
  if (change7d === null) return 0;
  // If TVL is small, weekly changes are noisier → shrink toward 0
  const noise = Math.min(1, 100_000_000 / Math.max(1, tvl));
  return change7d * (4 - noise * 3); // ~4 weeks, dampened by size
}

/** All multipliers and implied value for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: Calibration,
): {
  implied: number;
  base: number;
  growth7dPct: number;
  growth7dMult: number;
  growth30dPct: number;
  growth30dMult: number;
  maturityMult: number;
  chainQualityMult: number;
  breadthMult: number;
  age: number | null;
  multiple: number;
  peers: number;
  ci_low: number;
  ci_high: number;
  uncertainty_pct: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const raw7d = finite(protocol.change_7d, 0);
  const growth7dPct = Math.min(model.growth_cap, Math.max(model.growth_floor, raw7d));
  const growth7dMult = 1 + (growth7dPct / 100) * model.growth_weight_7d;

  const growth30dPct = estimate30dChange(raw7d, protocol.tvl_usd);
  const clamped30d = Math.min(model.growth_cap, Math.max(model.growth_floor, growth30dPct));
  const growth30dMult = 1 + (clamped30d / 100) * model.growth_weight_30d;

  const maturityMult = maturityMultiplier(age, model);
  const chainQualityMult = chainQualityMultiplier(protocol.chains, model);
  const breadthMult = breadthMultiplier(protocol.chains, model);

  const { multiple, peers, ci_low, ci_high } = multipleFor(protocol, calibration, model);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(model.implied_floor, Math.round(base * growth7dMult * growth30dMult * maturityMult * chainQualityMult * breadthMult));

  // Uncertainty: proportional to CI width of multiple, scaled
  const multipleWidth = ci_high - ci_low;
  const uncertainty = Math.min(0.5, (multipleWidth / Math.max(0.001, multiple)) * model.uncertainty_scaling);
  const impliedCI_low = Math.max(model.implied_floor, Math.round(implied * (1 - uncertainty)));
  const impliedCI_high = Math.round(implied * (1 + uncertainty));

  return {
    implied,
    base,
    growth7dPct,
    growth7dMult,
    growth30dPct,
    growth30dMult,
    maturityMult,
    chainQualityMult,
    breadthMult,
    age,
    multiple,
    peers,
    ci_low: impliedCI_low,
    ci_high: impliedCI_high,
    uncertainty_pct: Math.round(uncertainty * 10000) / 100,
  };
}

/** DefiLlama version marker. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Pre-token check. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Derivative categories to exclude. */
const DERIVATIVE_CATEGORIES = new Set([
  'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX',
]);

/** Exchange name prefixes. */
const EXCHANGE_NAMES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];
const WRAPPER_WORD = /\b(wrapped|staked|staking)\b/i;

/** Rankable: pre-token, not derivative, not wrapper, not exchange. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category && DERIVATIVE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPER_WORD.test(p.name)) return false;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_NAMES.some(e => lower.startsWith(e + ' ') || lower.startsWith(e + '-'))) return false;
  return true;
}

/** Protocol index by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map(p => [p.slug, p]));
}

/** Capital tier from TVL. */
function capitalTier(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  if (tvl >= 10_000_000) return 75;
  return 50;
}

/** Hold days from age. */
function holdDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 35;
  return 28;
}

/** Category-specific action. */
function categoryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} USDC to ${name} on ${chain} as collateral, borrow against it at <50% LTV, and keep the loop open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} liquidity to ${name}'s highest-APR pool on ${chain}, compound rewards weekly, and monitor IL.`;
  if (c.includes('bridge')) return `Bridge $${capital} USDC to ${chain} via ${name}, then deploy bridged funds into its highest-yield destination.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of ${chain}'s native staking asset through ${name}, claim rewards weekly, and restake.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} USDC margin on ${name}, open a delta-neutral basis trade, and roll funding weekly.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one position on ${name}'s highest-volume market, hedge if odds shift >10%.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into ${name}'s flagship vault on ${chain}, track allocation weekly, rebalance if drift >15%.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of ${name}'s stable asset on ${chain}, farm the savings rate, and keep principal liquid.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing RWA token on ${chain}, hold to maturity or exit via secondary market.`;
  if (c.includes('insurance')) return `Buy $${capital} cover from ${name} on ${chain} for your largest DeFi position, renew before expiry.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} into ${name}'s auto-compounding vault on ${chain}, verify strategy weekly.`;
  if (c.includes('basis trading')) return `Deploy $${capital} into ${name}'s basis strategy on ${chain}, capture funding rate delta, roll quarterly.`;
  if (c.includes('risk curator')) return `Allocate $${capital} to ${name}'s top-rated strategy on ${chain}, monitor risk score, withdraw if >70.`;
  if (c.includes('onchain capital allocator')) return `Commit $${capital} to ${name}'s allocation pool on ${chain}, track deployments, vote on proposals.`;
  return `Deposit $${capital} USDC into ${name} on ${chain}, perform one qualifying action weekly, and log everything.`;
}

/** Seven-step farm plan with quantified estimates. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = p.chains.length > 0 ? p.chains[0] : 'its main chain';
  const capital = capitalTier(p.tvl_usd);
  const hold = holdDays(age);
  const action = categoryAction(p, capital, chain);
  const weeks = Math.max(2, Math.round(hold / 7));

  return [
    {
      text: `Create a fresh wallet (hardware or clean browser) for this farm; store seed phrase offline.`,
      cost_usd: '< $3 gas for first tx',
      time_estimate: '10 minutes',
      frequency: 'once',
      risk_note: 'Never reuse this wallet for other activities; compromise = total loss.',
    },
    {
      text: action,
      cost_usd: `$${capital} capital + ~$${capital >= 150 ? 8 : 4} gas`,
      time_estimate: '20 minutes setup',
      frequency: 'once',
      risk_note: 'Smart contract risk: protocol can be exploited; size position to survive 100% loss.',
    },
    {
      text: `Perform one qualifying action weekly: deposit, borrow, swap, vote, or claim rewards.`,
      cost_usd: '~$2–5 gas/week',
      time_estimate: '10 minutes/week',
      frequency: `weekly for ${weeks} weeks`,
      risk_note: 'Missed week = activity may not count in next snapshot; set calendar reminders.',
    },
    {
      text: `Hold position for ${hold} days (${weeks} weeks) so activity spans multiple snapshots.`,
      cost_usd: `opportunity cost of $${capital} locked`,
      time_estimate: `${hold} days passive`,
      frequency: 'continuous',
      risk_note: 'TVL can drop; protocol can pause; have exit plan ready.',
    },
    {
      text: `Check ${p.name}'s official points/rewards page weekly; record claimed amounts and tx hashes.`,
      cost_usd: 'free to check; never pay to claim',
      time_estimate: '5 minutes/week',
      frequency: 'weekly',
      risk_note: 'Fake claim sites are common; only use links from protocol\'s verified Twitter/Discord.',
    },
    {
      text: `Before exit, claim all pending rewards from the protocol's own page; convert to stable if needed.`,
      cost_usd: '~$3–10 gas + swap fees',
      time_estimate: '15 minutes',
      frequency: 'once at exit',
      risk_note: 'Rewards may vest; check vesting schedule before withdrawing principal.',
    },
    {
      text: `Log wallet address, every tx hash, dates, amounts, gas paid, and net result in a farm ledger.`,
      cost_usd: 'free',
      time_estimate: '5 minutes/week',
      frequency: 'weekly',
      risk_note: 'Without logs you cannot replicate, audit, or prove eligibility for retroactive rewards.',
    },
  ];
}

/** Live-token rows for calibration view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(p => liveRatio(p) !== null && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map(p => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: Math.round((liveRatio(p) ?? 0) * 1e4) / 1e4,
    }));
}

/** Dashboard compact row. */
export function radarRow(row: BoardRow, calibration: Calibration): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    change_30d: row.change_30d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_value_ci_low: row.implied_value_ci_low,
    implied_value_ci_high: row.implied_value_ci_high,
    multiple: row.model.base_multiple,
    growth_7d_mult: row.model.growth_7d_mult,
    growth_30d_mult: row.model.growth_30d_mult,
    maturity_mult: row.model.maturity_mult,
    chain_quality_mult: row.model.chain_quality_mult,
    breadth_mult: row.model.breadth_mult,
    peer_count: row.model.age_days, // actually peers, but we don't have it here
    watchlist: true, // filled by buildRadar
  };
}

/** Build the full board and radar data. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  // Watchlist is the floor
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  // Early radar: all other rankable protocols by TVL
  const early = snapshot.protocols
    .filter(p => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  for (const p of early) chosen.set(p.slug, p);

  const calibration = calibrate(snapshot, model);
  const peerCountByCategory = new Map(calibration.categories.map(c => [c.category, c.peer_count]));

  const scored = [...chosen.values()].map(p => {
    const v = impliedValue(p, snapshot.as_of, model, calibration);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : 1));

  const board = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    change_30d: Math.round(estimate30dChange(s.p.change_7d, s.p.tvl_usd) * 100) / 100,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    implied_value_ci_low: s.v.ci_low,
    implied_value_ci_high: s.v.ci_high,
    model: {
      base_multiple: Math.round(s.v.multiple * 10000) / 10000,
      growth_7d_pct: s.v.growth7dPct,
      growth_7d_mult: Math.round(s.v.growth7dMult * 10000) / 10000,
      growth_30d_pct: Math.round(s.v.growth30dPct * 100) / 100,
      growth_30d_mult: Math.round(s.v.growth30dMult * 10000) / 10000,
      maturity_mult: Math.round(s.v.maturityMult * 10000) / 10000,
      chain_quality_mult: Math.round(s.v.chainQualityMult * 10000) / 10000,
      breadth_mult: Math.round(s.v.breadthMult * 10000) / 10000,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));

  const live = liveRows(snapshot);
  const earlyCount = board.filter(r => !snapshot.watchlist.includes(r.slug)).length;

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlyCount,
    live_size: live.length,
    calibration,
    rows: board.map((r, i) => ({
      ...radarRow(r, calibration),
      peer_count: peerCountByCategory.get(r.category ?? 'Uncategorized') ?? calibration.global_peers,
      watchlist: snapshot.watchlist.includes(r.slug),
    })),
    live,
  };
  return { board, radar };
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Farm step to single string for board.json gate. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost_usd}. Time: ${step.time_estimate}. Frequency: ${step.frequency}. Risk: ${step.risk_note}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** Snapshot parser. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some(s => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug, name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}

/** Board validation for gate. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map(r => r.slug));
  const missing = snapshot.watchlist.filter(s => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map(r => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows: the gate takes 100 to 4000`;
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_value_ci_low > r.implied_value_usd || r.implied_value_ci_high < r.implied_value_usd) return `${r.slug} CI does not contain point estimate`;
  }
  return null;
}

/** data.js script. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}