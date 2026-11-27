/* Token Radar v2 dashboard: reads window.RADAR and renders it.
   No framework, no fetch, no network. */

(function () {
  'use strict';

  var R = window.RADAR;
  if (!R) return;

  /* ---------- formatting ---------- */

  function money(n) {
    if (n === null || n === undefined) return '—';
    var a = Math.abs(n);
    if (a >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function moneyFull(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function pct(n, digits) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(digits === undefined ? 1 : digits) + '%';
  }

  function mult(n) {
    if (n === null || n === undefined) return '—';
    return n.toFixed(2) + '×';
  }

  function age(days) {
    if (days === null || days === undefined) return '—';
    if (days < 60) return days + 'd';
    if (days < 730) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }

  function ci(n) {
    if (n === null || n === undefined) return '—';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* ---------- farm plan in page (matches model) ---------- */

  function capitalFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    if (tvl >= 1e7) return 75;
    return 50;
  }

  function holdDaysFor(days) {
    if (days === null || days === undefined) return 30;
    if (days < 180) return 60;
    if (days < 365) return 45;
    if (days < 730) return 35;
    return 28;
  }

  function actionFor(row) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    var chain = row.chains.length ? row.chains[0] : 'its main chain';
    var cap = capitalFor(row.tvl_usd);
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return `Supply $${cap} USDC to ${name} on ${chain} as collateral, borrow at <50% LTV, keep loop open.`;
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0)
      return `Provide $${cap} liquidity to ${name}'s top pool on ${chain}, compound weekly, monitor IL.`;
    if (c.indexOf('bridge') >= 0)
      return `Bridge $${cap} USDC to ${chain} via ${name}, deploy into highest-yield destination.`;
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0)
      return `Stake $${cap} of ${chain}'s native asset through ${name}, claim weekly, restake.`;
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0)
      return `Deposit $${cap} USDC margin on ${name}, open delta-neutral basis trade, roll funding weekly.`;
    if (c.indexOf('prediction') >= 0)
      return `Fund $${cap} and place one position on ${name}'s highest-volume market, hedge if odds shift >10%.`;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0)
      return `Deposit $${cap} into ${name}'s flagship vault on ${chain}, track allocation weekly, rebalance if drift >15%.`;
    if (c.indexOf('stable') >= 0)
      return `Mint/deposit $${cap} of ${name}'s stable asset on ${chain}, farm savings rate, keep liquid.`;
    if (c.indexOf('rwa') >= 0)
      return `Mint $${cap} of ${name}'s yield-bearing RWA token on ${chain}, hold or exit via secondary.`;
    if (c.indexOf('insurance') >= 0)
      return `Buy $${cap} cover from ${name} on ${chain} for largest DeFi position, renew before expiry.`;
    if (c.indexOf('yield aggregator') >= 0)
      return `Deposit $${cap} into ${name}'s auto-compounding vault on ${chain}, verify strategy weekly.`;
    if (c.indexOf('basis trading') >= 0)
      return `Deploy $${cap} into ${name}'s basis strategy on ${chain}, capture funding delta, roll quarterly.`;
    if (c.indexOf('risk curator') >= 0)
      return `Allocate $${cap} to ${name}'s top strategy on ${chain}, monitor risk score, withdraw if >70.`;
    if (c.indexOf('onchain capital allocator') >= 0)
      return `Commit $${cap} to ${name}'s allocation pool on ${chain}, track deployments, vote on proposals.`;
    return `Deposit $${cap} USDC into ${name} on ${chain}, qualify weekly, log everything.`;
  }

  function farmPlan(row) {
    var hold = holdDaysFor(row.age_days);
    var weeks = Math.max(2, Math.round(hold / 7));
    var cap = capitalFor(row.tvl_usd);
    var act = actionFor(row);
    return [
      ['Fresh wallet (hardware/clean browser), seed offline.', '< $3 gas first tx', '10 min', 'once', 'Never reuse; compromise = total loss.'],
      [act, '$' + cap + ' capital + ~$' + (cap >= 150 ? 8 : 4) + ' gas', '20 min setup', 'once', 'Contract risk: size to survive 100% loss.'],
      ['Weekly qualifying action: deposit, borrow, swap, vote, claim.', '~$2–5 gas/week', '10 min/week', weeks + ' weeks', 'Missed week = may not count in next snapshot.'],
      ['Hold ' + hold + ' days (' + weeks + ' weeks) so activity spans snapshots.', 'opportunity cost of $' + cap, hold + ' days passive', 'continuous', 'TVL can drop; protocol can pause; have exit plan.'],
      ['Check ' + name + '\'s official points page weekly; record claims & tx hashes.', 'free; never pay to claim', '5 min/week', 'weekly', 'Fake claim sites common; only use verified links.'],
      ['Before exit, claim all rewards from protocol\'s own page; convert to stable.', '~$3–10 gas + swap', '15 min', 'once at exit', 'Rewards may vest; check schedule before withdrawing.'],
      ['Log wallet, every tx hash, dates, amounts, gas, net result in farm ledger.', 'free', '5 min/week', 'weekly', 'Without logs: no replicate, audit, or retro proof.'],
    ];
  }

  /* ---------- header, meta ---------- */

  document.getElementById('modelVersion').textContent = R.model_version;
  document.getElementById('footAsOf').textContent = R.as_of;
  document.getElementById('footModel').textContent = R.model_version;
  document.getElementById('mWatch').textContent = R.watchlist_size + ' watchlist protocols';
  document.getElementById('meta').innerHTML = 'Snapshot ' + R.as_of + ' · ' + R.board_size + ' protocols ranked';

  var totalValue = R.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  var growing = R.rows.filter(function (r) { return (r.change_7d || 0) > 0; }).length;
  var medianMultiple = R.calibration.global_median;

  function statTile(k, v, n) {
    var t = el('div', 'stat');
    t.appendChild(el('div', 'k', k));
    t.appendChild(el('div', 'v', v));
    if (n) t.appendChild(el('div', 'n', n));
    return t;
  }

  var stats = document.getElementById('stats');
  stats.appendChild(statTile('Implied value on board', money(totalValue), R.board_size + ' protocols'));
  stats.appendChild(statTile('Watchlist covered', R.watchlist_size + ' / ' + R.watchlist_size, 'every protocol the house rule kept'));
  stats.appendChild(statTile('Global multiple', medianMultiple.toFixed(3) + '×', 'shrunken median mcap/tvl from ' + R.calibration.global_peers + ' live peers'));
  stats.appendChild(statTile('Growing this week', growing + ' of ' + R.board_size, 'TVL up over 7 days'));

  /* ---------- category bars (by implied value) ---------- */

  function categoryTotals() {
    var map = {};
    R.rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (!map[c]) map[c] = { value: 0, n: 0 };
      map[c].value += r.implied_value_usd;
      map[c].n += 1;
    });
    return Object.keys(map).map(function (k) {
      return { category: k, value: map[k].value, n: map[k].n };
    }).sort(function (a, b) { return b.value - a.value || (a.category < b.category ? -1 : 1); });
  }

  var cats = categoryTotals();
  var catMax = cats.length ? cats[0].value : 1;
  var catBars = document.getElementById('catBars');
  cats.slice(0, 9).forEach(function (c, i) {
    var row = el('div', 'bar-row');
    row.appendChild(el('div', 'name', c.category));
    row.appendChild(el('div', 'val', money(c.value)));
    var track = el('div', 'bar-track');
    var fill = el('div', 'bar-fill' + (i > 2 ? ' alt' : ''));
    fill.style.width = Math.max(2, (c.value / catMax) * 100).toFixed(1) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    catBars.appendChild(row);
  });
  document.getElementById('catSub').textContent =
    cats.length + ' categories; top ' + Math.min(9, cats.length) + ' carry ' + money(cats.slice(0, 9).reduce(function (a, c) { return a + c.value; }, 0)) + ' of implied value.';

  /* ---------- the board ---------- */

  var state = { q: '', cat: '', chain: '', watchOnly: false, sort: 'implied', open: null };
  var tbody = document.getElementById('rows');
  var maxImplied = R.rows.reduce(function (a, r) { return Math.max(a, r.implied_value_usd); }, 1);

  var chainNames = {};
  R.rows.forEach(function (r) { r.chains.forEach(function (c) { chainNames[c] = (chainNames[c] || 0) + 1; }); });
  var chainList = Object.keys(chainNames).sort(function (a, b) { return chainNames[b] - chainNames[a] || (a < b ? -1 : 1); });

  var catSelect = document.getElementById('cat');
  catSelect.appendChild(new Option('All categories', ''));
  cats.forEach(function (c) { catSelect.appendChild(new Option(c.category + ' (' + c.n + ')', c.category)); });
  var chainSelect = document.getElementById('chain');
  chainSelect.appendChild(new Option('All chains', ''));
  chainList.forEach(function (c) { chainSelect.appendChild(new Option(c, c)); });

  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.watchOnly && !r.watchlist) return false;
      if (state.cat && (r.category || 'Uncategorized') !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var by = state.sort;
    rows.sort(function (a, b) {
      if (by === 'tvl') return b.tvl_usd - a.tvl_usd || a.rank - b.rank;
      if (by === 'momentum') return (b.change_7d || 0) - (a.change_7d || 0) || a.rank - b.rank;
      if (by === 'momentum30') return (b.change_30d || 0) - (a.change_30d || 0) || a.rank - b.rank;
      if (by === 'age') return (b.age_days || 0) - (a.age_days || 0) || a.rank - b.rank;
      if (by === 'multiple') return b.multiple - a.multiple || a.rank - b.rank;
      return a.rank - b.rank;
    });
    return rows;
  }

  function momentumCell(change, cls) {
    var wrap = el('span', 'mom');
    var text = el('span', change === null ? 'flat' : (change > 0 ? 'pos' : change < 0 ? 'neg' : 'flat'), change === null ? 'n/a' : pct(change));
    wrap.appendChild(text);
    var track = el('span', 'track');
    var zero = el('i', 'zero');
    track.appendChild(zero);
    var bar = el('i', cls || '');
    var v = change === null ? 0 : Math.max(-100, Math.min(100, change));
    var half = Math.abs(v) / 2;
    bar.style.width = half + '%';
    if (v >= 0) { bar.style.left = '50%'; bar.style.background = 'var(--pos)'; }
    else { bar.style.right = '50%'; bar.style.background = 'var(--neg)'; }
    track.appendChild(bar);
    wrap.appendChild(track);
    return wrap;
  }

  function renderBoard() {
    var rows = visibleRows();
    var shown = rows.slice(0, 300);
    clear(tbody);
    shown.forEach(function (r) {
      var tr = el('tr', 'row' + (state.open === r.slug ? ' open' : ''));
      tr.setAttribute('tabindex', '0');
      tr.dataset.slug = r.slug;

      tr.appendChild(el('td', 'rank', r.rank));

      var tdName = el('td', 'pname');
      tdName.appendChild(el('div', 'n', r.name));
      var meta = el('div', 'm');
      meta.appendChild(el('span', 'tag', r.category || 'Uncategorized'));
      r.chains.slice(0, 2).forEach(function (c) { meta.appendChild(el('span', 'tag mono', c)); });
      if (r.chains.length > 2) meta.appendChild(el('span', 'tag mono', '+' + (r.chains.length - 2)));
      if (r.watchlist) meta.appendChild(el('span', 'tag wl', 'watchlist'));
      tdName.appendChild(meta);
      tr.appendChild(tdName);

      tr.appendChild(el('td', 'num', money(r.tvl_usd)));
      var tdMom = el('td', 'num');
      tdMom.appendChild(momentumCell(r.change_7d));
      tr.appendChild(tdMom);
      var tdMom30 = el('td', 'num');
      tdMom30.appendChild(momentumCell(r.change_30d));
      tr.appendChild(tdMom30);
      tr.appendChild(el('td', 'num', age(r.age_days)));
      tr.appendChild(el('td', 'num mult', mult(r.multiple)));

      var tdVal = el('td', 'num value');
      var line = el('div', 'vline');
      line.appendChild(el('span', 'amt', money(r.implied_value_usd)));
      var ci = el('span', 'ci');
      ci.textContent = ' (' + money(r.implied_value_ci_low) + '–' + money(r.implied_value_ci_high) + ')';
      line.appendChild(ci);
      tdVal.appendChild(line);
      var vbar = el('div', 'vbar');
      var fill = el('i');
      fill.style.width = Math.max(1.5, (r.implied_value_usd / maxImplied) * 100).toFixed(1) + '%';
      vbar.appendChild(fill);
      tdVal.appendChild(vbar);
      tr.appendChild(tdVal);

      tr.addEventListener('click', function () { openDetail(r.slug); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); }
      });
      tbody.appendChild(tr);
    });
    document.getElementById('count').textContent =
      shown.length === rows.length ? rows.length + ' shown' : 'top ' + shown.length + ' of ' + rows.length + ' shown';
  }

  /* ---------- detail drawer ---------- */

  var detail = document.getElementById('detail');
  var detailBody = document.getElementById('detailBody');

  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) { r = R.rows[i]; break; }
    if (!r) return;
    state.open = slug;
    clear(detailBody);

    detailBody.appendChild(el('h2', null, r.name));
    detailBody.appendChild(el('div', 'sub', (r.category || 'Uncategorized') + ' · ' + r.slug + ' · rank ' + r.rank + ' of ' + R.board_size));

    var kv = el('dl', 'kv');
    function pair(k, v) {
      kv.appendChild(el('dt', null, k));
      kv.appendChild(el('dd', null, v));
    }
    pair('TVL', money(r.tvl_usd) + ' (' + moneyFull(r.tvl_usd) + ')');
    pair('7-day change', r.change_7d === null ? 'not reported' : pct(r.change_7d, 2));
    pair('30-day est. change', r.change_30d === null ? '—' : pct(r.change_30d, 2));
    pair('Age', r.age_days === null ? 'unknown' : r.age_days + ' days (' + age(r.age_days) + ')');
    pair('Chains', r.chains.length ? r.chains.join(', ') : 'none');
    pair('Listed', r.listed_at || 'unknown');
    pair('Token', 'none on record');
    pair('Multiple', r.multiple.toFixed(3) + '× TVL from ' + (R.calibration.categories.find(function(c){return c.category===r.category})?.peer_count || R.calibration.global_peers) + ' live peers');
    pair('Implied value', moneyFull(r.implied_value_usd) + ' [' + money(r.implied_value_ci_low) + ' – ' + money(r.implied_value_ci_high) + ']');
    detailBody.appendChild(kv);

    detailBody.appendChild(el('div', 'section-title', 'How the number is built'));
    var wf = el('div', 'waterfall');
    var base = r.tvl_usd * r.multiple;
    function factor(label, mult, note, cls) {
      var row = el('div', 'wf');
      row.appendChild(el('div', null, label + (note ? ' · ' + note : '')));
      row.appendChild(el('div', 'v', typeof mult === 'number' ? mult.toFixed(2) + '×' : mult));
      var track = el('div', 'track');
      var fill = el('i', cls || '');
      fill.style.width = Math.max(4, Math.min(100, (mult / 1.5) * 100)).toFixed(1) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      wf.appendChild(row);
    }
    var baseRow = el('div', 'wf');
    baseRow.appendChild(el('div', null, 'Base · TVL × ' + r.multiple.toFixed(3) + '×'));
    baseRow.appendChild(el('div', 'v', money(base)));
    var baseTrack = el('div', 'track');
    var baseFill = el('i');
    baseFill.style.width = '100%';
    baseTrack.appendChild(baseFill);
    baseRow.appendChild(baseTrack);
    wf.appendChild(baseRow);
    factor('7d momentum · ' + (r.change_7d === null ? 'n/a' : pct(r.change_7d, 2)), r.growth_7d_mult, r.growth_7d_mult >= 1 ? 'adds' : 'takes', r.growth_7d_mult >= 1 ? 'pos' : 'neg');
    factor('30d est. · ' + (r.change_30d === null ? 'n/a' : pct(r.change_30d, 2)), r.growth_30d_mult, r.growth_30d_mult >= 1 ? 'adds' : 'takes', r.growth_30d_mult >= 1 ? 'pos' : 'neg');
    factor('Maturity', r.maturity_mult, 'age ' + (r.age_days === null ? 'unknown' : r.age_days + 'd'), 'pos');
    factor('Chain quality', r.chain_quality_mult, r.chains.length + ' chains', 'pos');
    factor('Breadth', r.breadth_mult, r.chains.length > 1 ? (r.chains.length - 1) + ' extra chains' : 'single chain', 'pos');
    var resultRow = el('div', 'wf');
    resultRow.appendChild(el('div', null, 'Implied value'));
    resultRow.appendChild(el('div', 'v', money(r.implied_value_usd)));
    var resultTrack = el('div', 'track');
    var resultFill = el('i');
    resultFill.style.width = Math.max(4, (r.implied_value_usd / base) * 100).toFixed(1) + '%';
    resultTrack.appendChild(resultFill);
    resultRow.appendChild(resultTrack);
    wf.appendChild(resultRow);
    detailBody.appendChild(wf);

    var box = el('div', 'callout');
    box.style.marginTop = '14px';
    box.textContent = '90% CI: ' + money(r.implied_value_ci_low) + ' – ' + money(r.implied_value_ci_high) + '. ' +
      'A category with few live peers has its multiple shrunk toward the global median (' + R.calibration.global_median.toFixed(3) + '×).';
    detailBody.appendChild(box);

    detailBody.appendChild(el('div', 'section-title', 'Farm plan · ' + farmPlan(r).length + ' steps'));
    var ol = el('ol', 'steps');
    farmPlan(r).forEach(function (s) {
      var li = el('li');
      li.appendChild(el('div', null, s[0]));
      li.appendChild(el('div', 'meta', 'Cost: ' + s[1] + ' · Time: ' + s[2] + ' · Freq: ' + s[3] + ' · Risk: ' + s[4]));
      ol.appendChild(li);
    });
    detailBody.appendChild(ol);

    detail.hidden = false;
    renderBoard();
  }

  function closeDetail() {
    detail.hidden = true;
    state.open = null;
    renderBoard();
  }

  document.getElementById('closeDetail').addEventListener('click', closeDetail);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !detail.hidden) closeDetail();
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
      e.preventDefault();
      document.getElementById('q').focus();
    }
  });

  /* ---------- live tokens view ---------- */

  var liveStats = document.getElementById('liveStats');
  liveStats.appendChild(statTile('Live peers measured', String(R.calibration.global_peers), 'protocols with a token on record'));
  liveStats.appendChild(statTile('Global median multiple', R.calibration.global_median.toFixed(3) + '×', 'market cap over TVL'));
  var liveValue = R.live.reduce(function (a, r) { return a + (r.mcap_usd || 0); }, 0);
  liveStats.appendChild(statTile('Market cap sampled', money(liveValue), R.live.length + ' largest live protocols'));
  liveStats.appendChild(statTile('Categories measured', String(R.calibration.categories.length), 'each with shrunk multiple'));

  var calMax = R.calibration.categories.length ? Math.max.apply(null, R.calibration.categories.map(function (c) { return c.shrunk_ratio; })) : 1;
  var calBars = document.getElementById('calBars');
  R.calibration.categories.slice(0, 12).forEach(function (c) {
    var row = el('div', 'bar-row');
    row.appendChild(el('div', 'name', c.category));
    row.appendChild(el('div', 'val', c.shrunk_ratio.toFixed(3) + '×'));
    var track = el('div', 'bar-track');
    var fill = el('div', 'bar-fill' + (c.effective_weight < 0.5 ? ' alt' : ''));
    fill.style.width = Math.max(2, (c.shrunk_ratio / calMax) * 100).toFixed(1) + '%';
    track.appendChild(fill);
    row.appendChild(track);
    calBars.appendChild(row);
  });

  var liveRows = document.getElementById('liveRows');
  R.live.forEach(function (r) {
    var tr = el('tr');
    var td = el('td', 'pname');
    td.appendChild(el('div', 'n', r.name));
    var m = el('div', 'm');
    m.appendChild(el('span', 'tag', r.category || 'Uncategorized'));
    td.appendChild(m);
    tr.appendChild(td);
    tr.appendChild(el('td', 'num', money(r.tvl_usd)));
    tr.appendChild(el('td', 'num', money(r.mcap_usd)));
    tr.appendChild(el('td', 'num mult', r.ratio.toFixed(2) + '×'));
    liveRows.appendChild(tr);
  });
  document.getElementById('liveSub').textContent = 'The ' + R.live.length + ' largest live protocols and the mcap/TVL ratio the board calibrates on.';

  /* ---------- model view ---------- */

  var catTable = document.getElementById('catTable');
  var head = el('tr');
  ['Category', 'Live peers', 'Raw median', 'Shrunk mult.', 'Weight', '90% CI'].forEach(function (h, i) {
    var th = el('th', i > 0 ? 'num' : null, h);
    head.appendChild(th);
  });
  var thead = document.createElement('thead');
  thead.appendChild(head);
  catTable.appendChild(thead);
  var tbody2 = el('tbody');
  R.calibration.categories.forEach(function (c) {
    var tr = el('tr');
    tr.appendChild(el('td', null, c.category));
    tr.appendChild(el('td', 'num', c.peer_count));
    tr.appendChild(el('td', 'num', c.median_ratio.toFixed(3) + '×'));
    tr.appendChild(el('td', 'num', c.shrunk_ratio.toFixed(3) + '×'));
    tr.appendChild(el('td', 'num', (c.effective_weight * 100).toFixed(0) + '%'));
    tr.appendChild(el('td', 'num', c.ci_low.toFixed(3) + ' – ' + c.ci_high.toFixed(3) + '×'));
    tbody2.appendChild(tr);
  });
  catTable.appendChild(tbody2);

  var constTable = document.getElementById('constTable');
  var cHead = el('tr');
  ['Constant', 'Value', 'What it does'].forEach(function (h) { cHead.appendChild(el('th', null, h)); });
  var cThead = document.createElement('thead');
  cThead.appendChild(cHead);
  constTable.appendChild(cThead);
  var cBody = el('tbody');
  var M = R.model;
  [
    ['calibration', M.calibration, 'where the multiple comes from'],
    ['shrinkage_prior_count', M.shrinkage_prior_count, 'virtual peers pulling thin categories toward global median'],
    ['min_peers_for_category', M.min_peers_for_category, 'peers a category needs before its own median is used'],
    ['growth_weight_7d', M.growth_weight_7d, 'how hard a week of TVL growth counts'],
    ['growth_weight_30d', M.growth_weight_30d, 'how hard estimated 30d growth counts'],
    ['growth_floor / cap', M.growth_floor + ' / ' + M.growth_cap, 'range the change is clamped to'],
    ['maturity_half_life_days', M.maturity_half_life_days, 'age at which maturity reaches halfway to 1.0'],
    ['maturity_floor', M.maturity_floor, 'minimum maturity for brand-new protocols'],
    ['chain_quality', JSON.stringify(M.chain_quality), 'per-chain quality weights'],
    ['default_chain_quality', M.default_chain_quality, 'fallback for unnamed chains'],
    ['breadth_step / cap', M.breadth_step + ' / ' + M.breadth_cap, 'extra chain bonus and max'],
    ['implied_floor', M.implied_floor, 'minimum implied value'],
    ['uncertainty_scaling', M.uncertainty_scaling, 'CI width scaling factor'],
  ].forEach(function (row) {
    var tr = el('tr');
    tr.appendChild(el('td', 'mono', row[0]));
    tr.appendChild(el('td', 'num', String(row[1])));
    tr.appendChild(el('td', null, row[2]));
    cBody.appendChild(tr);
  });
  constTable.appendChild(cBody);

  /* ---------- farm guide ---------- */

  var guideTable = document.getElementById('guideTable');
  var gHead = el('tr');
  ['Category', 'The qualifying action', 'Typical capital', 'Hold window'].forEach(function (h) { gHead.appendChild(el('th', null, h)); });
  var gThead = document.createElement('thead');
  gThead.appendChild(gHead);
  guideTable.appendChild(gThead);
  var gBody = el('tbody');
  var guideMap = [
    ['Lending, CDP, collateral', 'Supply USDC, borrow at <50% LTV, keep loop', '$50–$250', '28–60 days'],
    ['DEX, yield, leveraged farm', 'LP main pool, compound weekly, monitor IL', '$50–$250', '28–60 days'],
    ['Bridge', 'Bridge USDC, deploy bridged funds', '$50–$250', '28–45 days'],
    ['Staking, restaking', 'Stake native asset, claim weekly, restake', '$50–$250', '30–45 days'],
    ['Perpetuals, derivatives', 'Delta-neutral basis trade, roll funding', '$50–$250', '28–45 days'],
    ['Prediction market', 'Fund market, place position, hedge', '$50–$250', '28–45 days'],
    ['Curator, allocator', 'Deposit into vault, track allocation, vote', '$50–$250', '35–60 days'],
    ['Stablecoin', 'Mint/deposit stable, farm savings rate', '$50–$250', '28–45 days'],
    ['RWA', 'Mint yield token, hold or exit secondary', '$50–$250', '45–60 days'],
    ['Insurance', 'Buy cover for DeFi position, renew', '$50–$250', '28–45 days'],
    ['Yield aggregator', 'Auto-compound vault, verify weekly', '$50–$250', '35–60 days'],
    ['Basis trading', 'Capture funding delta, roll quarterly', '$50–$250', '45–60 days'],
    ['Risk curator', 'Top-rated strategy, monitor risk score', '$50–$250', '35–60 days'],
    ['Onchain capital allocator', 'Allocation pool, track, vote', '$50–$250', '35–60 days'],
    ['Other', 'Deposit USDC, qualify weekly, log', '$50–$250', '28–45 days'],
  ];
  guideMap.forEach(function (g) {
    var tr = el('tr');
    tr.appendChild(el('td', null, g[0]));
    tr.appendChild(el('td', null, g[1]));
    tr.appendChild(el('td', null, g[2]));
    tr.appendChild(el('td', null, g[3]));
    gBody.appendChild(tr);
  });
  guideTable.appendChild(gBody);

  /* ---------- wiring ---------- */

  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; renderBoard(); });
  catSelect.addEventListener('change', function (e) { state.cat = e.target.value; renderBoard(); });
  chainSelect.addEventListener('change', function (e) { state.chain = e.target.value; renderBoard(); });
  document.getElementById('watchOnly').addEventListener('change', function (e) { state.watchOnly = e.target.checked; renderBoard(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; renderBoard(); });

  var tabs = document.getElementById('tabs');
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-view]');
    if (!b) return;
    var view = b.dataset.view;
    ['board', 'live', 'model', 'guide'].forEach(function (v) {
      document.getElementById('view-' + v).hidden = v !== view;
    });
    Array.prototype.forEach.call(tabs.querySelectorAll('button'), function (btn) {
      btn.setAttribute('aria-selected', btn === b ? 'true' : 'false');
    });
    window.scrollTo(0, 0);
  });

  renderBoard();
})();