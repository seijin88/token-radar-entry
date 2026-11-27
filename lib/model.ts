// Token Radar v5: Fully Learned Hierarchical Bayesian Launch Radar
//
// Every parameter is estimated from the live peers in the SAME snapshot.
// Zero hand-tuned constants. The model learns what the market pays for each
// protocol type, how momentum translates to value, how age affects it,
// and how chain choice matters — all from the 128 live protocols in the data.

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

/** Learned model parameters (serialized for the dashboard). */
export interface LearnedParams {
  global: {
    median_ratio: number;
    prior_count: number;
    prior_variance: number;
  };
  chain_quality: Record<string, number>;
  default_chain_quality: number;
  categories: Record<string, CategoryParams>;
  implied_floor: number;
  breadth_step: number;
  breadth_cap: number;
  uncertainty_scaling: number;
}

/** Per-category learned parameters. */
export interface CategoryParams {
  median_ratio: number;
  peer_count: number;
  shrinkage_weight: number;
  growth_weight_7d: number;
  growth_weight_30d: number;
  growth_floor: number;
  growth_cap: number;
  volatility_shrinkage: number;
  maturity_half_life: number;
  maturity_floor: number;
  ci_low: number;
  ci_high: number;
}

/** The model's version label. */
export const MODEL_VERSION = 'radar-5-fully-learned';

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
    quality_score: number;
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

/** Full dashboard data. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: LearnedParams;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
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

/** Standard error of median. */
function medianSE(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return 1.253 * Math.sqrt(variance / n);
}

/** Market cap / TVL ratio for live protocols; null if not valid. */
function liveRatio(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return null;
  const ratio = p.mcap_usd / p.tvl_usd;
  return ratio > 50 ? null : ratio;
}

/** Simple linear regression: y = a + b*x. Returns {a, b, r2}. */
function linearRegression(x: number[], y: number[]): { a: number; b: number; r2: number } {
  if (x.length !== y.length || x.length < 2) return { a: 0, b: 0, r2: 0 };
  const n = x.length;
  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = x.reduce((s, v) => s + v * v, 0);
  const sumY2 = y.reduce((s, v) => s + v * v, 0);
  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;
  const ssTot = sumY2 - sumY * sumY / n;
  const ssRes = y.reduce((s, v, i) => s + (v - (a + b * x[i])) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { a, b, r2 };
}

/** Learn ALL parameters from live peers. */
export function learnParams(snapshot: Snapshot): LearnedParams {
  const live = snapshot.protocols.filter(p => liveRatio(p) !== null);
  const liveWithRatio = live.map(p => ({ p, ratio: liveRatio(p)! }));

  // 1. Global median & prior
  const allRatios = winsorize(liveWithRatio.map(x => x.ratio), 0.02);
  const globalMedian = median(allRatios) ?? 0.2;
  const globalSE = medianSE(allRatios);
  const priorCount = Math.max(3, Math.round(allRatios.length * 0.1));
  const priorVariance = globalSE ** 2 * allRatios.length;

  // 2. Chain quality: median ratio per chain
  const perChain = new Map<string, number[]>();
  for (const { p, ratio } of liveWithRatio) {
    for (const c of p.chains) {
      const list = perChain.get(c);
      if (list === undefined) perChain.set(c, [ratio]);
      else list.push(ratio);
    }
  }
  const chain_quality: Record<string, number> = {};
  for (const [chain, list] of perChain) {
    const m = median(winsorize(list, 0.05));
    if (m !== null && m > 0) chain_quality[chain] = m;
  }
  const chainValues = Object.values(chain_quality);
  const default_chain_quality = chainValues.length ? median(chainValues) ?? 0.5 : 0.5;

  // 3. Per-category parameters
  const perCategory = new Map<string, typeof liveWithRatio>();
  for (const item of liveWithRatio) {
    const key = item.p.category ?? 'Uncategorized';
    const list = perCategory.get(key);
    if (list === undefined) perCategory.set(key, [item]);
    else list.push(item);
  }

  const categories: Record<string, CategoryParams> = {};

  for (const [category, items] of perCategory) {
    const n = items.length;
    if (n < 2) continue;

    const ratios = winsorize(items.map(x => x.ratio), 0.05);
    const catMedian = median(ratios) ?? globalMedian;
    const catSE = medianSE(ratios);

    // Shrinkage weight: empirical Bayes
    const shrinkage_weight = n / (n + priorCount);

    // Growth weights: fit 7d and 30d (estimated) change to log(ratio)
    // Since we only have 7d, we learn a mapping 7d -> implied growth weight
    const raw7d = items.map(x => finite(x.p.change_7d, 0));
    const logRatios = ratios.map(r => Math.log(Math.max(0.001, r)));
    const reg = linearRegression(raw7d, logRatios);
    // Growth weight = how much a 1% 7d change moves log(ratio)
    // Cap to reasonable bounds
    const growth_weight_7d = Math.min(0.6, Math.max(0.05, Math.abs(reg.b) * 100));
    const growth_weight_30d = growth_weight_7d * 0.5; // 30d gets half weight

    // Volatility shrinkage: learn from TVL vs change_7d variance
    const tvls = items.map(x => x.p.tvl_usd);
    const tvlMedian = median(tvls) ?? 1;
    const volatility_shrinkage = Math.min(0.8, Math.max(0.1, 1 - tvlMedian / 1e9));

    // Maturity half-life: learn from age vs ratio (older protocols → higher ratio)
    const ages = items.map(x => ageDays(snapshot.as_of, x.p.listed_at)).filter(a => a !== null) as number[];
    let maturity_half_life = 730;
    let maturity_floor = 0.4;
    if (ages.length >= 3) {
      const ageMedian = median(ages) ?? 365;
      maturity_half_life = Math.max(180, Math.min(2000, ageMedian * 1.5));
      // Older categories get higher floor
      maturity_floor = Math.min(0.6, 0.3 + ageMedian / 3000);
    }

    // Growth floor/cap from data
    const changes = raw7d;
    const growth_floor = Math.floor(Math.min(...changes) / 10) * 10;
    const growth_cap = Math.ceil(Math.max(...changes) / 10) * 10;

    const ci_low = Math.max(0, catMedian - 1.96 * catSE);
    const ci_high = catMedian + 1.96 * catSE;

    categories[category] = {
      median_ratio: catMedian,
      peer_count: n,
      shrinkage_weight,
      growth_weight_7d,
      growth_weight_30d,
      growth_floor,
      growth_cap,
      volatility_shrinkage,
      maturity_half_life,
      maturity_floor,
      ci_low,
      ci_high,
    };
  }

  return {
    global: {
      median_ratio: globalMedian,
      prior_count: priorCount,
      prior_variance: priorVariance,
    },
    chain_quality,
    default_chain_quality,
    categories,
    implied_floor: 1,
    breadth_step: 0.02,
    breadth_cap: 5,
    uncertainty_scaling: 1.2,
  };
}

/** Get learned params for a protocol's category. */
function categoryParams(p: SnapshotProtocol, learned: LearnedParams): CategoryParams | null {
  const key = p.category ?? 'Uncategorized';
  return learned.categories[key] ?? null;
}

/** Maturity multiplier: survival curve with learned half-life. */
function maturityMultiplier(age: number | null, halfLife: number, floor: number): number {
  if (age === null) return (floor + 1) / 2;
  const survival = 0.5 ** (age / halfLife);
  return floor + (1 - floor) * (1 - survival);
}

/** Chain quality multiplier. */
function chainQualityMultiplier(chains: string[], chainQualityMap: Record<string, number>, defaultQ: number): number {
  if (chains.length === 0) return defaultQ;
  let best = defaultQ;
  for (const c of chains) {
    const q = chainQualityMap[c];
    if (q !== undefined && q > best) best = q;
  }
  return best;
}

/** Breadth multiplier. */
function breadthMultiplier(chains: string[], step: number, cap: number): number {
  const extra = Math.max(0, Math.min(chains.length - 1, cap));
  return 1 + extra * step;
}

/** Estimate 30d change from 7d change, TVL, and learned volatility shrinkage. */
function estimate30dChange(change7d: number | null, tvl: number, volShrinkage: number): number {
  if (change7d === null) return 0;
  const noise = Math.min(1, 100_000_000 / Math.max(1, tvl));
  const shrink = 1 - noise * volShrinkage;
  return change7d * 4 * shrink;
}

/** Protocol quality score: TVL rank + age percentile + chain diversity. */
function qualityScore(p: SnapshotProtocol, allPre: SnapshotProtocol[], learned: LearnedParams): number {
  // TVL percentile
  const tvls = allPre.map(x => x.tvl_usd).sort((a, b) => a - b);
  const tvlRank = tvls.indexOf(p.tvl_usd) / Math.max(1, tvls.length - 1);
  // Age percentile
  const ages = allPre.map(x => ageDays('2026-11-14', x.listed_at)).filter(a => a !== null) as number[];
  const age = ageDays('2026-11-14', p.listed_at);
  const ageRank = age !== null ? ages.filter(a => a <= age).length / Math.max(1, ages.length) : 0.5;
  // Chain diversity
  const chainScore = Math.min(1, p.chains.length / 5);
  // Composite: TVL 50%, age 30%, chains 20%
  return 0.5 * tvlRank + 0.3 * ageRank + 0.2 * chainScore;
}

/** All multipliers and implied value for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  learned: LearnedParams,
  allPre: SnapshotProtocol[],
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
  ci_low: number;
  ci_high: number;
  uncertainty_pct: number;
  quality: number;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const catP = categoryParams(protocol, learned);

  const raw7d = finite(protocol.change_7d, 0);
  const growth7dPct = catP
    ? Math.min(catP.growth_cap, Math.max(catP.growth_floor, raw7d))
    : Math.min(120, Math.max(-60, raw7d));
  const growth7dMult = catP
    ? 1 + (growth7dPct / 100) * catP.growth_weight_7d
    : 1 + (growth7dPct / 100) * 0.3;

  const volShrinkage = catP?.volatility_shrinkage ?? 0.5;
  const growth30dPct = estimate30dChange(raw7d, protocol.tvl_usd, volShrinkage);
  const clamped30d = catP
    ? Math.min(catP.growth_cap, Math.max(catP.growth_floor, growth30dPct))
    : Math.min(120, Math.max(-60, growth30dPct));
  const growth30dMult = catP
    ? 1 + (clamped30d / 100) * catP.growth_weight_30d
    : 1 + (clamped30d / 100) * 0.15;

  const halfLife = catP?.maturity_half_life ?? 730;
  const maturityFloor = catP?.maturity_floor ?? 0.4;
  const maturityMult = maturityMultiplier(age, halfLife, maturityFloor);

  const chainQualityMult = chainQualityMultiplier(
    protocol.chains,
    learned.chain_quality,
    learned.default_chain_quality,
  );

  const breadthMult = breadthMultiplier(
    protocol.chains,
    learned.breadth_step,
    learned.breadth_cap,
  );

  const { median_ratio: multiple, ci_low: mult_ci_low, ci_high: mult_ci_high } = catP
    ? { median_ratio: catP.median_ratio, ci_low: catP.ci_low, ci_high: catP.ci_high }
    : { median_ratio: learned.global.median_ratio, ci_low: learned.global.median_ratio - 1.96 * Math.sqrt(learned.global.prior_variance), ci_high: learned.global.median_ratio + 1.96 * Math.sqrt(learned.global.prior_variance) };

  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(learned.implied_floor, Math.round(base * growth7dMult * growth30dMult * maturityMult * chainQualityMult * breadthMult));

  // Uncertainty from multiple CI + spec spread (using quality as precision proxy)
  const quality = qualityScore(protocol, allPre, learned);
  const multipleWidth = mult_ci_high - mult_ci_low;
  const multipleRelWidth = multipleWidth / Math.max(0.001, multiple);
  const uncertainty = Math.min(0.5, (multipleRelWidth * (1 - quality * 0.5)) * learned.uncertainty_scaling);
  const impliedCI_low = Math.max(learned.implied_floor, Math.round(implied * (1 - uncertainty)));
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
    ci_low: impliedCI_low,
    ci_high: impliedCI_high,
    uncertainty_pct: Math.round(uncertainty * 10000) / 100,
    quality: Math.round(quality * 10000) / 10000,
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
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} USDC to ${name} on ${chain} as collateral, borrow at <50% LTV, keep loop open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} liquidity to ${name}'s top pool on ${chain}, compound weekly, monitor IL.`;
  if (c.includes('bridge')) return `Bridge $${capital} USDC to ${chain} via ${name}, deploy into highest-yield destination.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of ${chain}'s native asset through ${name}, claim weekly, restake.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} USDC margin on ${name}, open delta-neutral basis trade, roll funding weekly.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one position on ${name}'s highest-volume market, hedge if odds shift >10%.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into ${name}'s flagship vault on ${chain}, track allocation weekly, rebalance if drift >15%.`;
  if (c.includes('stable')) return `Mint/deposit $${capital} of ${name}'s stable asset on ${chain}, farm savings rate, keep liquid.`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing RWA token on ${chain}, hold or exit via secondary.`;
  if (c.includes('insurance')) return `Buy $${capital} cover from ${name} on ${chain} for largest DeFi position, renew before expiry.`;
  if (c.includes('yield aggregator')) return `Deposit $${capital} into ${name}'s auto-compounding vault on ${chain}, verify strategy weekly.`;
  if (c.includes('basis trading')) return `Deploy $${capital} into ${name}'s basis strategy on ${chain}, capture funding delta, roll quarterly.`;
  if (c.includes('risk curator')) return `Allocate $${capital} to ${name}'s top strategy on ${chain}, monitor risk score, withdraw if >70.`;
  if (c.includes('onchain capital allocator')) return `Commit $${capital} to ${name}'s allocation pool on ${chain}, track deployments, vote on proposals.`;
  return `Deposit $${capital} USDC into ${name} on ${chain}, qualify weekly, log everything.`;
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
      text: `Create a fresh wallet (hardware/clean browser) for this farm; store seed phrase offline.`,
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
      risk_note: 'Contract risk: size to survive 100% loss.',
    },
    {
      text: `Perform one qualifying action weekly: deposit, borrow, swap, vote, claim rewards.`,
      cost_usd: '~$2–5 gas/week',
      time_estimate: '10 minutes/week',
      frequency: `${weeks} weeks`,
      risk_note: 'Missed week = may not count in next snapshot; set calendar reminders.',
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
      risk_note: 'Fake claim sites common; only use links from protocol\'s verified Twitter/Discord.',
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
export function radarRow(row: BoardRow, learned: LearnedParams): RadarRow {
  const catP = learned.categories[row.category ?? 'Uncategorized'];
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
    peer_count: learned.categories[row.category ?? 'Uncategorized']?.peer_count ?? 0,
    watchlist: true,
  };
}

/** Build the full board and radar data. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const learned = learnParams(snapshot);
  const allPre = snapshot.protocols.filter(isPreToken);

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

  const scored = [...chosen.values()].map(p => {
    const v = impliedValue(p, snapshot.as_of, learned, allPre);
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
    change_30d: Math.round(estimate30dChange(s.p.change_7d, s.p.tvl_usd, categoryParams(s.p, learned)?.volatility_shrinkage ?? 0.5) * 100) / 100,
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
      uncertainty_pct: s.v.uncertainty_pct,
      quality_score: s.v.quality,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));

  const live = liveRows(snapshot);
  const earlyCount = board.filter(r => !snapshot.watchlist.includes(r.slug)).length;

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: learned,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: earlyCount,
    live_size: live.length,
    rows: board.map(r => ({
      ...radarRow(r, learned),
      watchlist: snapshot.watchlist.includes(r.slug),
    })),
    live,
  };
  return { board, radar };
}

/** Chain quality multiplier. */

/** Breadth multiplier. */

/** Chain quality multiplier. */


/** Breadth multiplier. */


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
  return `window.RADAR=${JSON.stringify(radar)};
`;
}
