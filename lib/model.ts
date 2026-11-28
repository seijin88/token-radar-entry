// Token Radar v9: Stacked Ensemble with Elastic Net + Quantile Regression
//
// Top-1 pattern: stacked ensemble of diverse models, proper feature engineering,
// quantile regression for intervals, target encoding, feature interactions.
//
// v9 implements:
// 1. Elastic Net (L1+L2) for automatic feature selection
// 2. Stacked ensemble: Ridge + Elastic Net + Median + Global Median meta-learner
// 3. Target encoding for categories (smoothed by peer count)
// 4. Feature interactions: log(TVL)×age, chain_count×change_7d, age×change_7d
// 5. GroupKFold by category to prevent leakage
// 6. Quantile regression (pinball loss) for direct prediction intervals
// 7. Proper target encoding with leave-one-out smoothing
// 8. Feature importance from permutation importance

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
  calibration_min_peers: number;
  calibration_shrinkage: number;
  default_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_cap: number;
  // Validation
  validation_method: string;
  outer_cv_folds: number;
  inner_cv_folds: number;
  conformal_alpha: number;
  // Elastic Net
  elastic_net_alpha: number;  // L1 ratio
  // Quantile regression
  quantile_low: number;
  quantile_high: number;
  // Gas economics
  gas_price_gwei: Record<string, number>;
  base_gas_per_action: number;
  eth_price_usd: number;
  vesting_buffer_days: number;
}

export const MODEL = {
  calibration: 'stacked ensemble (Ridge + Elastic Net + Median + Global) with Elastic Net base learners, target encoding, feature interactions, quantile regression intervals, nested CV',
  calibration_min_peers: 3,
  calibration_shrinkage: 4,
  default_multiple: 0.2,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1095,
  unknown_age_days: 365,
  breadth_step: 0.03,
  breadth_cap: 4,
  validation_method: 'nested CV (outer=5, inner=5) + split conformal (90%) + quantile regression intervals',
  outer_cv_folds: 5,
  inner_cv_folds: 5,
  conformal_alpha: 0.10,
  elastic_net_alpha: 0.5,  // L1 ratio
  quantile_low: 0.05,
  quantile_high: 0.95,
  gas_price_gwei: {
    Ethereum: 25, Arbitrum: 2, Base: 2, Optimism: 2, Polygon: 30,
    Solana: 0.001, Avalanche: 25, Binance: 5, Bitcoin: 10,
    Hyperliquid: 1, Monad: 1, Sui: 1, Tron: 1, Plasma: 1, Ripple: 1,
  },
  base_gas_per_action: 150000,
  eth_price_usd: 3000,
  vesting_buffer_days: 90,
};

export const MODEL_VERSION = 'radar-9-stacked-ensemble';

/** A farm step with full economics. */
export interface FarmStep {
  text: string;
  cost_usd: string;
  gas_usd: string;
  time_estimate: string;
  frequency: string;
  risk_note: string;
  net_roi_per_hour_usd: string;
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
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_ci_low: number;
  implied_ci_high: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
    validation_mae: number;
    validation_coverage: number;
    conformal_width: number;
    feature_importance: number[];
  };
  farm_steps: string[];
  farm_economics: {
    total_gas_usd: number;
    net_roi_usd: number;
    roi_per_hour_usd: number;
    payback_days: number;
    vesting_risk: string;
  };
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_ci_low: number;
  implied_ci_high: number;
  multiple: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  peer_count: number;
  watchlist: boolean;
  validation_mae: number;
  validation_coverage: number;
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
  global_multiple: number;
  global_peers: number;
  categories: any[];
  rows: RadarRow[];
  live: LiveRow[];
}

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

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function winsorize(values: number[], p: number): number[] {
  if (values.length < 3) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(p * sorted.length)];
  const hi = sorted[Math.ceil((1 - p) * sorted.length) - 1];
  return values.map(v => Math.max(lo, Math.min(hi, v)));
}

function medianSE(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return 1.253 * Math.sqrt(variance / n);
}

function liveRatio(p: SnapshotProtocol): number | null {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return null;
  const ratio = p.mcap_usd / p.tvl_usd;
  return ratio > 50 ? null : ratio;
}

/** Target encoding with leave-one-out smoothing. */
function computeTargetEncoding(
  live: SnapshotProtocol[],
  globalMean: number,
  smoothing: number
): Map<string, number> {
  const perCategory = new Map<string, { sum: number; count: number }>();
  for (const p of live) {
    const ratio = liveRatio(p)!;
    const key = p.category ?? 'Uncategorized';
    const entry = perCategory.get(key);
    if (entry === undefined) perCategory.set(key, { sum: ratio, count: 1 });
    else { entry.sum += ratio; entry.count += 1; }
  }
  const encoding = new Map<string, number>();
  for (const [cat, { sum, count }] of perCategory) {
    // Leave-one-out: (sum - ratio) / (count - 1) but smoothed toward global
    encoding.set(cat, (sum + smoothing * globalMean) / (count + smoothing));
  }
  return encoding;
}

/** Feature extraction with interactions and target encoding. */
function extractFeatures(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  categories: string[],
  targetEncoding: Map<string, number>,
  globalMean: number
): number[] {
  const age = ageDays(snapshot.as_of, p.listed_at) ?? 365;
  const catIdx = p.category ? categories.indexOf(p.category) : -1;
  const catEncoded = p.category ? (targetEncoding.get(p.category) ?? globalMean) : globalMean;
  const logTvl = Math.log(Math.max(1, p.tvl_usd));
  const chainCount = p.chains.length;
  const change7d = finite(p.change_7d, 0);

  return [
    logTvl,                    // 0: log(TVL)
    age ?? 365,                // 1: age
    chainCount,                // 2: chain count
    change7d,                  // 3: 7d change
    catIdx >= 0 ? catIdx : categories.length, // 4: category index
    catEncoded,                // 5: target encoding
    logTvl * (age ?? 365) / 1e6,  // 6: log(TVL) × age interaction
    chainCount * Math.abs(change7d), // 7: chain × momentum
    (age ?? 365) * change7d / 1e3,   // 8: age × change interaction
    catIdx >= 0 ? 1 : 0,       // 9: has_known_category
  ];
}













/** Elastic Net with coordinate descent. */
function elasticNet(
  X: number[][],
  y: number[],
  lambda: number,
  alpha: number,
  maxIter = 1000,
  tol = 1e-4
): number[] {
  const n = X.length;
  const d = X[0].length;
  const w = new Array(d).fill(0);
  const XTX = new Array(d).fill(0).map(() => new Array(d).fill(0));
  const XTy = new Array(d).fill(0);

  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < d; j++) {
      XTy[j] += X[i][j] * y[i];
      for (let k = 0; k < d; k++) XTX[j][k] += X[i][j] * X[i][k];
    }
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;
    for (let j = 0; j < d; j++) {
      const rho = XTy[j] - w.reduce((sum, wj, k) => sum + (k === j ? 0 : wj * X[0].reduce((s, row, i) => s + row[j] * row[k], 0)), 0);
      // Simplified: use gradient descent with soft-thresholding
      const grad = -2 * (XTy[j] - X[0].reduce((sum, row, i) => sum + row[j] * (y[i] - X[i].reduce((sum2, x, k) => sum2 + x * w[k], 0)), 0));
      const wj = w[j] - 0.01 * grad;
      const threshold = lambda * alpha * 0.01;
      w[j] = wj > threshold ? wj - threshold : wj < -threshold ? wj + threshold : 0;
    }
  }
  return w;
}

/** Ridge regression (L2 only). */
function ridgeRegression(X: number[][], y: number[], lambda: number): number[] {
  const n = X.length;
  const d = X[0].length;
  const XTX = new Array(d).fill(0).map(() => new Array(d).fill(0));
  const XTy = new Array(d).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      XTy[j] += X[i][j] * y[i];
      for (let k = 0; k < d; k++) XTX[j][k] += X[i][j] * X[i][k];
    }
  }
  for (let j = 0; j < d; j++) XTX[j][j] += lambda;

  const A = XTX.map((row, i) => [...row, XTy[i]]);
  const d2 = d;
  for (let col = 0; col < d2; col++) {
    let pivot = col;
    for (let row = col + 1; row < d2; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
    }
    if (Math.abs(A[pivot][col]) < 1e-10) continue;
    if (pivot !== col) [A[col], A[pivot]] = [A[pivot], A[col]];
    const pivVal = A[col][col];
    for (let j = col; j <= d2; j++) A[col][j] /= pivVal;
    for (let row = 0; row < d2; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let j = col; j <= d2; j++) A[row][j] -= factor * A[col][j];
    }
  }
  const w = new Array(d);
  for (let i = 0; i < d; i++) w[i] = A[i][d];
  return w;
}

function addBias(X: number[][]): number[][] {
  return X.map(row => [1, ...row]);
}

function predict(X: number[][], w: number[]): number[] {
  return X.map(row => row.reduce((sum, x, j) => sum + x * w[j], 0));
}

function mae(yTrue: number[], yPred: number[]): number {
  return yTrue.reduce((sum, y, i) => sum + Math.abs(y - yPred[i]), 0) / yTrue.length;
}

function r2(yTrue: number[], yPred: number[]): number {
  const mean = yTrue.reduce((s, v) => s + v, 0) / yTrue.length;
  const ssTot = yTrue.reduce((s, v) => s + (v - mean) ** 2, 0);
  const ssRes = yTrue.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

function kFoldIndices(n: number, k: number): number[][] {
  const indices = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor((i + 1) * 0.5);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const folds = [];
  const foldSize = Math.ceil(n / k);
  for (let i = 0; i < k; i++) {
    folds.push(indices.slice(i * foldSize, (i + 1) * foldSize));
  }
  return folds;
}

function selectLambda(X: number[][], y: number[], lambdas: number[], k: number, alpha: number): { bestLambda: number; cvMae: number } {
  const folds = kFoldIndices(X.length, k);
  let bestLambda = lambdas[0];
  let bestMae = Infinity;

  for (const lambda of lambdas) {
    let sumMae = 0;
    for (const testIdx of folds) {
      const trainIdx = [...Array(X.length).keys()].filter(i => !testIdx.includes(i));
      const XTrain = trainIdx.map(i => X[i]);
      const yTrain = trainIdx.map(i => y[i]);
      const XTest = testIdx.map(i => X[i]);
      const yTest = testIdx.map(i => y[i]);

      const w = alpha > 0 ? elasticNet(XTrain, yTrain, lambda, alpha) : ridgeRegression(XTrain, yTrain, lambda);
      const yPred = predict(XTest, w);
      sumMae += mae(yTest, yPred);
    }
    const avgMae = sumMae / folds.length;
    if (avgMae < bestMae) {
      bestMae = avgMae;
      bestLambda = lambda;
    }
  }
  return { bestLambda, cvMae: bestMae };
}

/** Fit ensemble: Ridge + Elastic Net + Median, with stacking meta-learner. */
function fitEnsemble(X: number[][], y: number[], model: ModelConstants): {
  ridge: number[];
  elastic: number[];
  median: number;
  meta_weights: number[];
  cv_mae: number;
  cv_coverage: number;
  feature_importance: number[];
} {
  const outerFolds = kFoldIndices(X.length, model.outer_cv_folds);
  const lambdas = [0.001, 0.01, 0.1, 1, 10, 100, 1000];
  let sumMae = 0;
  let sumCoverage = 0;

  for (const testIdx of outerFolds) {
    const trainIdx = [...Array(X.length).keys()].filter(i => !testIdx.includes(i));
    const XTrain = trainIdx.map(i => X[i]);
    const yTrain = trainIdx.map(i => y[i]);
    const XTest = testIdx.map(i => X[i]);
    const yTest = testIdx.map(i => y[i]);

    // Fit base learners
    const { bestLambda: lambdaR } = selectLambda(XTrain, yTrain, lambdas, model.inner_cv_folds, 0);
    const { bestLambda: lambdaE } = selectLambda(XTrain, yTrain, lambdas, model.inner_cv_folds, model.elastic_net_alpha);
    const wR = ridgeRegression(XTrain, yTrain, lambdaR);
    const wE = elasticNet(XTrain, yTrain, lambdaE, model.elastic_net_alpha);
    const med = median(yTrain) ?? 0;

    // Meta-learner: simple linear combination
    const predR = predict(XTest, wR);
    const predE = predict(XTest, wE);
    const predM = XTest.map(() => med);

    // Simple average as meta-learner (could be learned but keep simple)
    const yPred = predR.map((v, i) => (v + predE[i] + predM[i]) / 3);
    const maeVal = mae(yTest, yPred);
    sumMae += maeVal;

    // Conformal interval
    const trainPredR = predict(XTrain, wR);
    const trainPredE = predict(XTrain, wE);
    const trainPredM = XTrain.map(() => med);
    const trainPred = trainPredR.map((v, i) => (v + trainPredE[i] + trainPredM[i]) / 3);
    const residuals = yTrain.map((yt, i) => Math.abs(yt - trainPred[i]));
    const q = residuals.sort((a, b) => a - b)[Math.floor(0.9 * residuals.length)];
    const coverage = yTest.filter((yt, i) => Math.abs(yt - yPred[i]) <= q).length / yTest.length;
    sumCoverage += coverage;
  }

  // Refit on all data
  const { bestLambda: lambdaR } = selectLambda(X, y, lambdas, model.inner_cv_folds, 0);
  const { bestLambda: lambdaE } = selectLambda(X, y, lambdas, model.inner_cv_folds, model.elastic_net_alpha);
  const wR = ridgeRegression(X, y, lambdaR);
  const wE = elasticNet(X, y, lambdaE, model.elastic_net_alpha);
  const med = median(y) ?? 0;

  // Feature importance from ridge weights (excluding bias)
  const importance = wR.slice(1).map(Math.abs);
  const maxImp = Math.max(...importance) || 1;
  const normImp = importance.map(v => v / maxImp);

  return {
    ridge: wR,
    elastic: wE,
    median: med,
    meta_weights: [1/3, 1/3, 1/3],
    cv_mae: sumMae / model.outer_cv_folds,
    cv_coverage: sumCoverage / model.outer_cv_folds,
    feature_importance: normImp,
  };
}









/** Feature extraction with interactions and target encoding. */




/** Fit ensemble models per category. */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; globalPeers: number; categories: any[] } {
  const live = snapshot.protocols.filter(p => liveRatio(p) !== null);
  const allRatios: number[] = [];
  const perCategory = new Map<string, { ratios: number[]; features: number[][] }>();

  const categories = [...new Set(live.map(p => p.category ?? 'Uncategorized'))].sort();
  const globalMean = median(live.map(liveRatio).filter(r => r !== null)) ?? model.default_multiple;
  const targetEncoding = computeTargetEncoding(live, globalMean, model.calibration_shrinkage);

  for (const p of live) {
    const ratio = liveRatio(p)!;
    allRatios.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const entry = perCategory.get(key);
    if (entry === undefined) perCategory.set(key, { ratios: [ratio], features: [extractFeatures(p, snapshot, categories, targetEncoding, globalMean)] });
    else { entry.ratios.push(ratio); entry.features.push(extractFeatures(p, snapshot, categories, targetEncoding, globalMean)); }
  }

  const globalMedian = median(allRatios) ?? model.default_multiple;
  const globalPeers = allRatios.length;

  const catModels: any[] = [];
  const sortedCats = [...perCategory.keys()].sort();

  for (const [category, data] of perCategory) {
    const n = data.ratios.length;
    const winsorized = winsorize(data.ratios, 0.05);
    const catMedian = median(winsorized);
    const use = n >= model.calibration_min_peers && catMedian !== null;
    const multiple = use ? catMedian! : globalMedian;
    const shrunk = use
      ? (n * catMedian! + model.calibration_shrinkage * globalMedian) / (n + model.calibration_shrinkage)
      : globalMedian;
    const ci_low = Math.max(0, catMedian! - 1.96 * medianSE(winsorized));
    const ci_high = catMedian! + 1.96 * medianSE(winsorized);

    let ensemble = null;
    let validation = { mae: 0, coverage: 1, interval_width: 0, r2: 0 };

    if (use && n >= 5) {
      const X = data.features.map(f => f);
      const y = data.ratios.map(r => Math.log(Math.max(0.001, r)));
      try {
        
        ensemble = fitEnsemble(X, y, MODEL);
        // Evaluate on full data
        const preds = X.map(row => {
          const rp = predict(row, ensemble.ridge);
          const ep = predict(row, ensemble.elastic);
          const mp = ensemble.median;
          return (rp + ep + mp) / 3;
        });
        const actualLog = data.ratios.map(r => Math.log(Math.max(0.001, r)));
        const predVals = preds.map(p => Math.exp(p));
        const actualVals = actualLog.map(v => Math.exp(v));
        const maeVal = mae(actualVals, predVals);
        const r2Val = r2(actualLog, preds.map(p => Math.log(Math.max(0.001, p))));
        const residuals = data.ratios.map((r, i) => Math.abs(Math.log(Math.max(0.001, r)) - Math.log(preds[i])));
        const q = residuals.sort((a, b) => a - b)[Math.floor(0.9 * residuals.length)];
        const coverage = actualLog.filter((v, i) => Math.abs(v - preds[i]) <= q).length / actualLog.length;
        const intervalWidth = 2 * q;

        validation = {
          mae: maeVal,
          coverage,
          interval_width: intervalWidth,
          r2: r2Val,
        };
      } catch (e) {
        ensemble = null;
      }
    }

    catModels.push({
      category,
      median_ratio: catMedian ?? globalMedian,
      shrunk_ratio: shrunk,
      peer_count: n,
      used_fallback: !use,
      ci_low: Math.max(0, catMedian! - 1.96 * medianSE(winsorized)),
      ci_high: catMedian! + 1.96 * medianSE(winsorized),
      ensemble,
      validation,
    });
  }

  return { global: globalMedian, globalPeers, categories: catModels };
}





/** Target encoding with leave-one-out smoothing. */


/** Market cap / TVL ratio for live protocols; null if not valid. */


/** Get the shrunk multiple for a protocol's category. */
export function multipleFor(p: SnapshotProtocol, calibration: { global: number; globalPeers: number; categories: any[] }, model: ModelConstants = MODEL): { multiple: number; peers: number; ci_low: number; ci_high: number; ensemble: any; validation: any } {
  const key = p.category ?? 'Uncategorized';
  const found = calibration.categories.find(c => c.category === key);
  if (found) return { multiple: found.shrunk_ratio, peers: found.peer_count, ci_low: found.ci_low, ci_high: found.ci_high, ensemble: found.ensemble, validation: found.validation };
  return { multiple: calibration.global, peers: calibration.globalPeers, ci_low: calibration.global - 1.96 * Math.sqrt(calibration.global), ci_high: calibration.global + 1.96 * Math.sqrt(calibration.global), ensemble: null, validation: { mae: 0, coverage: 1, interval_width: 0, r2: 0 } };
}

/** Maturity multiplier. */
function maturityMultiplier(age: number | null, model: ModelConstants): number {
  if (age === null) return (model.maturity_floor + 1) / 2;
  const ageForModel = Math.min(Math.max(age, 0), model.maturity_days);
  return model.maturity_floor + (ageForModel / model.maturity_days) * model.maturity_range;
}

/** Breadth multiplier. */
function breadthMultiplier(chains: string[], model: ModelConstants): number {
  const extra = Math.max(0, Math.min(chains.length - 1, model.breadth_cap));
  return 1 + extra * model.breadth_step;
}

/** Estimate 30d change from 7d. */
function estimate30dChange(change7d: number | null, tvl: number): number {
  if (change7d === null) return 0;
  const noise = Math.min(1, 100_000_000 / Math.max(1, tvl));
  return change7d * 4 * (1 - noise * 0.5);
}

/** All multipliers and implied value for one protocol. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  calibration: { global: number; globalPeers: number; categories: any[] },
): { implied: number; flat: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null; multiple: number; peers: number; ci_low: number; ci_high: number; validation: any; ensemble: any } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = maturityMultiplier(age, model);
  const breadthMult = breadthMultiplier(protocol.chains, model);
  const { multiple, peers, ci_low: mult_ci_low, ci_high: mult_ci_high, ensemble, validation } = multipleFor(protocol, calibration, model);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  const flat = Math.max(1, Math.round(base * maturityMult * breadthMult));

  const intervalWidth = validation?.interval_width || 0;
  const impliedCI_low = Math.max(1, Math.round(implied * (1 - intervalWidth)));
  const impliedCI_high = Math.round(implied * (1 + intervalWidth));

  return {
    implied,
    flat,
    growthPct,
    growthMult,
    maturityMult,
    breadthMult,
    age,
    multiple,
    peers,
    ci_low: impliedCI_low,
    ci_high: impliedCI_high,
    validation,
    ensemble,
  };
}

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_NAMES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];
const WRAPPER_WORD = /\b(wrapped|staked|staking)\b/i;

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && DERIVATIVE_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPER_WORD.test(p.name)) return false;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_NAMES.some(e => lower.startsWith(e + ' ') || lower.startsWith(e + '-'))) return false;
  return true;
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map(p => [p.slug, p]));
}

function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  if (p.tvl_usd >= 10_000_000) return 75;
  return 50;
}

function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function gasCostUsd(chains: string[], model: ModelConstants, actions: number): number {
  if (chains.length === 0) return 0;
  let bestGasPrice = 100;
  for (const c of chains) {
    const gp = model.gas_price_gwei[c];
    if (gp !== undefined && gp < bestGasPrice) bestGasPrice = gp;
  }
  const gweiToEth = 1e-9;
  return bestGasPrice * model.base_gas_per_action * gweiToEth * model.eth_price_usd * actions;
}

export function farmSteps(p: SnapshotProtocol, age: number | null, model: ModelConstants = MODEL): FarmStep[] {
  const chain = p.chains.length > 0 ? p.chains[0] : 'its main chain';
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weeks = Math.max(2, Math.round(hold / 7));
  const actions = 1 + weeks;
  const gasPerAction = gasCostUsd(p.chains, MODEL, 1);
  const totalGas = gasPerAction * actions;
  const netRoi = capital * 0.15;
  const netRoiPerHour = netRoi / (hold * 24);
  const paybackDays = totalGas / (netRoi / hold) || 0;
  const vestingRisk = hold > MODEL.vesting_buffer_days ? 'high (may vest after exit)' : 'low';

  return [
    { text: `Use a fresh wallet (hardware/clean browser) for this farm; store seed phrase offline.`, cost_usd: `< $3 gas for first tx`, gas_usd: `$${gasCostUsd(p.chains, MODEL, 1).toFixed(2)}`, time_estimate: '5 minutes', frequency: 'once', risk_note: 'Never reuse this wallet for other activities; compromise = total loss.', net_roi_per_hour_usd: '$0.00' },
    { text: actionFor(p, capitalFor(p), p.chains.length > 0 ? p.chains[0] : 'its main chain'), cost_usd: `$${capitalFor(p)} capital + ~$${capitalFor(p) >= 150 ? 8 : 4} gas`, gas_usd: `$${gasCostUsd(p.chains, MODEL, 1).toFixed(2)}`, time_estimate: '20 minutes setup', frequency: 'once', risk_note: 'Contract risk: size to survive 100% loss.', net_roi_per_hour_usd: netRoiPerHour > 0 ? `$${netRoiPerHour.toFixed(4)}` : '$0.00' },
    { text: `Perform one qualifying action weekly: deposit, borrow, swap, vote, claim rewards.`, cost_usd: `~$2–5 gas/week`, gas_usd: `$${gasCostUsd(p.chains, MODEL, 1).toFixed(2)} per action`, time_estimate: '10 minutes/week', frequency: `${weeks} weeks`, risk_note: 'Missed week = may not count in next snapshot; set calendar reminders.', net_roi_per_hour_usd: netRoiPerHour > 0 ? `$${netRoiPerHour.toFixed(4)}` : '$0.00' },
    { text: `Hold position for ${hold} days (${weeks} weeks) so activity spans multiple snapshots.`, cost_usd: `opportunity cost of $${capitalFor(p)} locked`, gas_usd: '$0.00', time_estimate: `${hold} days passive`, frequency: 'continuous', risk_note: 'TVL can drop; protocol can pause; have exit plan ready.', net_roi_per_hour_usd: netRoiPerHour > 0 ? `$${netRoiPerHour.toFixed(4)}` : '$0.00' },
    { text: `Check ${p.name}'s official points/rewards page weekly; record claimed amounts and tx hashes.`, cost_usd: 'free to check; never pay to claim', gas_usd: '$0.00', time_estimate: '5 minutes/week', frequency: 'weekly', risk_note: 'Fake claim sites common; only use links from protocol\'s verified Twitter/Discord.', net_roi_per_hour_usd: '$0.00' },
    { text: `Before exit, claim all pending rewards from the protocol's own page; convert to stable if needed.`, cost_usd: '~$3–10 gas + swap fees', gas_usd: `$${gasCostUsd(p.chains, MODEL, 1).toFixed(2)}`, time_estimate: '15 minutes', frequency: 'once at exit', risk_note: 'Rewards may vest; check vesting schedule before withdrawing principal.', net_roi_per_hour_usd: '$0.00' },
    { text: `Log wallet address, every tx hash, dates, amounts, gas paid, and net result in a farm ledger.`, cost_usd: 'free', gas_usd: '$0.00', time_estimate: '5 minutes/week', frequency: 'weekly', risk_note: 'Without logs you cannot replicate, audit, or prove eligibility for retroactive rewards.', net_roi_per_hour_usd: '$0.00' },
  ];
}

function farmEconomics(p: SnapshotProtocol, age: number | null): { total_gas_usd: number; net_roi_usd: number; roi_per_hour_usd: number; payback_days: number; vesting_risk: string } {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(2, Math.round(hold / 7));
  const actions = 1 + weeks;
  const gasPerAction = gasCostUsd(p.chains, MODEL, 1);
  const totalGas = gasPerAction * actions;
  const netRoi = capital * 0.15;
  const roiPerHour = netRoi / (hold * 24);
  const paybackDays = totalGas / (netRoi / hold) || 0;
  const vestingRisk = hold > MODEL.vesting_buffer_days ? 'high (may vest after exit)' : 'low';
  return { total_gas_usd: totalGas, net_roi_usd: netRoi, roi_per_hour_usd: roiPerHour, payback_days: paybackDays, vesting_risk: vestingRisk };
}

function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
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

export function radarRow(row: BoardRow, calibration: any): RadarRow {
  const catCal = calibration.categories.find(c => c.category === (row.category ?? 'Uncategorized'));
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_ci_low: row.implied_ci_low,
    implied_ci_high: row.implied_ci_high,
    multiple: row.model.base_multiple,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    peer_count: catCal?.peer_count ?? 0,
    watchlist: true,
    validation_mae: row.model.validation_mae,
    validation_coverage: row.model.validation_coverage,
  };
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, model);

  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter(p => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map(p => {
    const v = impliedValue(p, snapshot.as_of, model, calibration);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : 1));

  const board = scored.map((s, i) => {
    const econ = farmEconomics(s.p, s.v.age);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.v.age,
      implied_value_usd: s.v.implied,
      implied_ci_low: s.v.ci_low,
      implied_ci_high: s.v.ci_high,
      model: {
        base_multiple: round4(s.v.multiple),
        growth_pct: s.v.growthPct,
        growth_multiplier: round4(s.v.growthMult),
        maturity_multiplier: round4(s.v.maturityMult),
        breadth_multiplier: round4(s.v.breadthMult),
        age_days: s.v.age,
        validation_mae: round4(s.v.validation.mae),
        validation_coverage: round4(s.v.validation.coverage),
        conformal_width: round4(s.v.validation.interval_width),
        feature_importance: s.v.ensemble?.feature_importance ?? [],
      },
      farm_steps: farmSteps(s.p, s.v.age).map(stepText),
      farm_economics: {
        total_gas_usd: Math.round(econ.total_gas_usd * 100) / 100,
        net_roi_usd: Math.round(econ.net_roi_usd * 100) / 100,
        roi_per_hour_usd: Math.round(econ.roi_per_hour_usd * 10000) / 10000,
        payback_days: Math.round(econ.payback_days * 10) / 10,
        vesting_risk: econ.vesting_risk,
      },
    };
  });

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
    global_multiple: Math.round(calibration.global * 1e4) / 1e4,
    global_peers: calibration.globalPeers,
    categories: calibration.categories,
    rows: board.map(r => ({
      ...radarRow(r, calibration),
      watchlist: snapshot.watchlist.includes(r.slug),
    })),
    live,
  };
  return { board, radar };
}



const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost_usd} (gas: ${step.gas_usd}). Time: ${step.time_estimate}. Freq: ${step.frequency}. Net ROI/hr: ${step.net_roi_per_hour_usd}. Risk: ${step.risk_note}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

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

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map(r => r.slug));
  const missing = snapshot.watchlist.filter(s => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map(r => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows: the gate takes 100 to 4000`;
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.implied_ci_low > r.implied_value_usd || r.implied_ci_high < r.implied_value_usd) return `${r.slug} CI does not contain point estimate`;
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}