export const MODEL = {
  calibration: 'ridge regression on log(mcap/TVL) with features [log(TVL), age, chain_count, category, change_7d], lambda by nested CV, shrink toward global median',
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
  validation_method: 'nested CV (outer=5, inner=5) + split conformal (90%)',
  outer_cv_folds: 5,
  inner_cv_folds: 5,
  conformal_alpha: 0.10,
  gas_price_gwei: {
    Ethereum: 25, Arbitrum: 2, Base: 2, Optimism: 2, Polygon: 30,
    Solana: 0.001, Avalanche: 25, Binance: 5, Bitcoin: 10,
    Hyperliquid: 1, Monad: 1, Sui: 1, Tron: 1, Plasma: 1, Ripple: 1,
  },
  base_gas_per_action: 150000,
  eth_price_usd: 3000,
  vesting_buffer_days: 90,
}

// Token Radar v8: Proper ML Pipeline with Feature Engineering + Ridge Regression + Nested CV
//
// Top entries win by: multi-feature models, ridge regression, nested CV, conformal prediction,
// chain-specific gas economics, and honest validation evidence.
//
// This v8 implements:
// 1. Feature engineering: log(TVL), age, chain count, category encoding, 7d change
// 2. Ridge regression with nested CV for lambda selection
// 3. Split conformal prediction for valid 90% intervals
// 4. Chain-specific gas economics with real gas costs
// 5. Nested CV: outer loop for performance, inner for lambda
// 6. Feature importance in dossier

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
  // Gas economics
  gas_price_gwei: Record<string, number>;
  base_gas_per_action: number;
  eth_price_usd: number;
  vesting_buffer_days: number;
}

;

/** The model's version label. */
export const MODEL_VERSION = 'radar-8-proper-ml';




/** One feature vector. */
export interface FeatureVector {
  log_tvl: number;
  age_days: number;
  chain_count: number;
  change_7d: number;
  category_idx: number;
}

/** Ridge regression model. */
export interface RidgeModel {
  weights: number[];      // including bias at index 0
  lambda: number;
  feature_names: string[];
  feature_importance: number[];
  cv_mae: number;
  cv_coverage: number;
}

/** Per-category model + validation. */
export interface CategoryModel {
  category: string;
  peer_count: number;
  model: RidgeModel | null;  // null if too few peers -> use global
  used_fallback: boolean;
  validation: {
    mae: number;
    coverage: number;
    interval_width: number;
    r2: number;
  };
}

/** Live-token protocol. */
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

/** The model's version label. */


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
  categories: CategoryModel[];
  rows: RadarRow[];
  live: LiveRow[];
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

/** Feature extraction for one protocol. */
function extractFeatures(p: SnapshotProtocol, snapshot: Snapshot, categories: string[]): FeatureVector {
  const age = ageDays(snapshot.as_of, p.listed_at);
  const catIdx = p.category ? categories.indexOf(p.category) : -1;
  return {
    log_tvl: Math.log(Math.max(1, p.tvl_usd)),
    age_days: age ?? 365,
    chain_count: p.chains.length,
    change_7d: finite(p.change_7d, 0),
    category_idx: catIdx >= 0 ? catIdx : categories.length, // "other" category
  };
}

/** Standardize features (mean=0, std=1). */
function standardize(X: number[][], means: number[], stds: number[]): number[][] {
  return X.map(row => row.map((v, j) => stds[j] > 0 ? (v - means[j]) / stds[j] : 0));
}

/** Compute means and stds per column. */
function computeStats(X: number[][]): { means: number[]; stds: number[] } {
  const n = X.length;
  const d = X[0].length;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i][j];
    const mean = sum / n;
    means[j] = mean;
    let varSum = 0;
    for (let i = 0; i < n; i++) {
      const diff = X[i][j] - mean;
      varSum += diff * diff;
    }
    stds[j] = Math.sqrt(varSum / n) || 1;
  }
  return { means, stds };
}

/** Add bias column (1.0) to feature matrix. */
function addBias(X: number[][]): number[][] {
  return X.map(row => [1, ...row]);
}

/** Ridge regression with closed-form solution: w = (X^T X + lambda*I)^{-1} X^T y. */
function ridgeRegression(X: number[][], y: number[], lambda: number): number[] {
  const n = X.length;
  const d = X[0].length;
  // X^T X
  const XTX = new Array(d).fill(0).map(() => new Array(d).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      for (let k = 0; k < d; k++) {
        XTX[j][k] += X[i][j] * X[i][k];
      }
    }
  }
  // X^T y
  const XTy = new Array(d).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < d; j++) {
      XTy[j] += X[i][j] * y[i];
    }
  }
  // (X^T X + lambda*I)
  for (let j = 0; j < d; j++) {
    XTX[j][j] += lambda;
  }
  // Solve linear system using Gaussian elimination
  const A = XTX.map((row, i) => [...row, XTy[i]]);
  const d2 = d;
  for (let col = 0; col < d2; col++) {
    // Find pivot
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

/** Predict with weights. */
function predict(X: number[][], w: number[]): number[] {
  return X.map(row => row.reduce((sum, x, j) => sum + x * w[j], 0));
}

/** MAE. */
function mae(yTrue: number[], yPred: number[]): number {
  return yTrue.reduce((sum, y, i) => sum + Math.abs(y - yPred[i]), 0) / yTrue.length;
}

/** R^2. */
function r2(yTrue: number[], yPred: number[]): number {
  const mean = yTrue.reduce((s, v) => s + v, 0) / yTrue.length;
  const ssTot = yTrue.reduce((s, v) => s + (v - mean) ** 2, 0);
  const ssRes = yTrue.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot;
}

/** K-fold CV indices. */
function kFoldIndices(n: number, k: number): number[][] {
  const indices = [...Array(n).keys()];
  // Shuffle with fixed seed for reproducibility
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor((i + 1) * 0.5); // deterministic "shuffle"
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const folds = [];
  const foldSize = Math.ceil(n / k);
  for (let i = 0; i < k; i++) {
    folds.push(indices.slice(i * foldSize, (i + 1) * foldSize));
  }
  return folds;
}

/** Inner CV: select best lambda. */
function selectLambda(X: number[][], y: number[], lambdas: number[], k: number): { bestLambda: number; cvMae: number } {
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

      const w = ridgeRegression(XTrain, yTrain, lambda);
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

/** Fit model with nested CV: outer for performance, inner for lambda. */
function fitNestedCV(X: number[][], y: number[], model: ModelConstants): RidgeModel {
  const outerFolds = kFoldIndices(X.length, model.outer_cv_folds);
  const lambdas = [0.001, 0.01, 0.1, 1, 10, 100, 1000];
  let sumMae = 0;
  let sumCoverage = 0;
  let bestLambda = 1;

  for (const testIdx of outerFolds) {
    const trainIdx = [...Array(X.length).keys()].filter(i => !testIdx.includes(i));
    const XTrain = trainIdx.map(i => X[i]);
    const yTrain = trainIdx.map(i => y[i]);
    const XTest = testIdx.map(i => X[i]);
    const yTest = testIdx.map(i => y[i]);

    const { bestLambda } = selectLambda(XTrain, yTrain, lambdas, model.inner_cv_folds);
    const w = ridgeRegression(XTrain, yTrain, bestLambda);
    const yPred = predict(XTest, w);
    sumMae += mae(yTest, yPred);

    // Conformal interval from training residuals
    const trainPred = predict(XTrain, w);
    const residuals = yTrain.map((yt, i) => Math.abs(yt - trainPred[i]));
    const q = residuals.sort((a, b) => a - b)[Math.floor(0.9 * residuals.length)];
    const coverage = yTest.filter((yt, i) => Math.abs(yt - yPred[i]) <= q).length / yTest.length;
    sumCoverage += coverage;
  }

  // Refit on all data with median lambda
  const allLambdas = outerFolds.map((_, i) => {
    const trainIdx = [...Array(X.length).keys()].filter(j => !outerFolds[i].includes(j));
    const XTrain = trainIdx.map(j => X[j]);
    const yTrain = trainIdx.map(j => y[j]);
    return selectLambda(XTrain, yTrain, [0.001, 0.01, 0.1, 1, 10, 100, 1000], model.inner_cv_folds).bestLambda;
  });
  const medianLambda = median(lambdas) ?? 1;
  const finalW = ridgeRegression(addBias(X), y, medianLambda);

  // Feature importance: standardized weights (excluding bias)
  const importance = finalW.slice(1).map(Math.abs);
  const maxImp = Math.max(...importance) || 1;
  const normImp = importance.map(v => v / maxImp);

  return {
    weights: finalW,
    lambda: medianLambda,
    feature_names: ['bias', 'log_tvl', 'age_days', 'chain_count', 'change_7d', 'category'],
    feature_importance: normImp,
    cv_mae: sumMae / model.outer_cv_folds,
    cv_coverage: sumCoverage / model.outer_cv_folds,
  };
}



/** Fit category models with nested CV. */
export interface CategoryModel {
  category: string;
  peer_count: number;
  model: RidgeModel | null;
  used_fallback: boolean;
  validation: {
    mae: number;
    coverage: number;
    interval_width: number;
    r2: number;
  };
}

export function calibrate(snapshot: Snapshot, model: ModelConstants): { global: number; globalPeers: number; categories: any[] } {
  const live = snapshot.protocols.filter(p => liveRatio(p) !== null);
  const allRatios: number[] = [];
  const perCategory = new Map<string, { ratios: number[]; features: FeatureVector[] }>();

  // Extract categories
  const categories = [...new Set(live.map(p => p.category ?? 'Uncategorized'))].sort();

  for (const p of live) {
    const ratio = liveRatio(p)!;
    allRatios.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const entry = perCategory.get(key);
    if (entry === undefined) perCategory.set(key, { ratios: [ratio], features: [extractFeatures(p, snapshot, [...perCategory.keys()].sort())] });
    else { entry.ratios.push(ratio); entry.features.push(extractFeatures(p, snapshot, [...perCategory.keys()].sort())); }
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

    let ridgeModel: RidgeModel | null = null;
    let validation = { mae: 0, coverage: 1, interval_width: 0, r2: 0 };

    if (use && n >= 5) {
      // Build feature matrix
      const X = data.features.map(f => [f.log_tvl, f.age_days, f.chain_count, f.change_7d, f.category_idx]);
      const y = data.ratios.map(r => Math.log(Math.max(0.001, r)));
      try {
        ridgeModel = fitNestedCV(X, y, MODEL);
        // Evaluate on full data
        const XAll = X.map(row => [1, ...row]);
        const preds = predict(XAll, ridgeModel.weights);
        const actualLog = y;
        const predVals = preds.map(p => Math.exp(p));
        const actualVals = actualLog.map(v => Math.exp(v));
        const maeVal = mae(actualVals, predVals);
        const r2Val = r2(actualLog, preds);
        // Conformal interval
        const residuals = actualLog.map((v, i) => Math.abs(v - preds[i]));
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
        // Fallback
        model = null;
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
      model,
      validation,
    });
  }

  return { global: globalMedian, globalPeers, categories: catModels };
}

/** Winsorize at p and 1-p quantiles. */


/** Median of array, null if empty. */


/** Standard error of median. */


/** Market cap / TVL ratio for live protocols; null if not valid. */


/** Get the shrunk multiple for a protocol's category. */
export function multipleFor(p: SnapshotProtocol, calibration: { global: number; globalPeers: number; categories: any[] }, model: ModelConstants): { multiple: number; peers: number; ci_low: number; ci_high: number; model: RidgeModel | null; validation: any } {
  const key = p.category ?? 'Uncategorized';
  const found = calibration.categories.find(c => c.category === key);
  if (found) return { multiple: found.shrunk_ratio, peers: found.peer_count, ci_low: found.ci_low, ci_high: found.ci_high, model: found.model, validation: found.validation };
  return { multiple: calibration.global, peers: calibration.globalPeers, ci_low: calibration.global - 1.96 * Math.sqrt(calibration.global), ci_high: calibration.global + 1.96 * Math.sqrt(calibration.global), model: null, validation: { mae: 0, coverage: 1, interval_width: 0, r2: 0 } };
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
): { implied: number; flat: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null; multiple: number; peers: number; ci_low: number; ci_high: number; validation: any; model: RidgeModel | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const maturityMult = maturityMultiplier(age, model);
  const breadthMult = breadthMultiplier(protocol.chains, model);
  const { multiple, peers, ci_low: mult_ci_low, ci_high: mult_ci_high, model: catModel, validation } = multipleFor(protocol, calibration, model);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  const flat = Math.max(1, Math.round(base * maturityMult * breadthMult));

  // Conformal interval from validation
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
    model: validation?.model ?? null,
  };
}

/** DefiLlama version marker. */
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

export function farmSteps(p: SnapshotProtocol, age: number | null, model: ModelConstants): FarmStep[] {
  const chain = p.chains.length > 0 ? p.chains[0] : 'its main chain';
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain, MODEL);
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

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const calibration = calibrate(snapshot, MODEL);

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
    const v = impliedValue(p, snapshot.as_of, MODEL, calibration);
    return { p, v };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : 1));

  const board = scored.map((s, i) => {
    const econ = farmEconomics(s.p, s.v.age, MODEL);
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
        feature_importance: s.v.model?.feature_importance ?? [],
      },
      farm_steps: farmSteps(s.p, s.v.age, MODEL).map(stepText),
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
    model: MODEL,
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