/* Token Radar dashboard: reads the one dataset the program wrote (window.RADAR) and renders it.
   No framework, no fetch, no network: the page works from its own files. */

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

  function age(days) {
    if (days === null || days === undefined) return '—';
    if (days < 60) return days + 'd';
    if (days < 730) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
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

  /* ---------- the farm plan, in the page ---------- */

  function capitalFor(tvl) {
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }

  function holdDaysFor(days) {
    if (days === null || days === undefined) return 30;
    if (days < 180) return 60;
    if (days < 365) return 45;
    return 30;
  }

  function actionFor(row) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    var chain = row.chains.length ? row.chains[0] : 'its main chain';
    var cap = capitalFor(row.tvl_usd);
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0)
      return ['Supply $' + cap + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.', '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'];
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0)
      return ['Provide $' + cap + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.', '$' + cap + ' of capital and about $' + (cap >= 150 ? 8 : 4) + ' of gas', '15 minutes to set up'];
    if (c.indexOf('bridge') >= 0)
      return ['Bridge $' + cap + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.', '$' + cap + ' of capital and about $6 of gas', '15 minutes to set up'];
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0)
      return ['Stake $' + cap + " of the chain's staking asset through " + name + ' and keep the receipt.', '$' + cap + ' of capital and about $6 of gas', '15 minutes to set up'];
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0)
      return ['Deposit $' + cap + ' of USDC as margin on ' + name + ' and open one small hedge.', '$' + cap + ' of margin and about $8 of gas', '20 minutes to set up'];
    if (c.indexOf('prediction') >= 0)
      return ['Fund $' + cap + ' and place one market position on ' + name + '.', '$' + cap + ' of capital and about $4 of gas', '15 minutes to set up'];
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0)
      return ['Deposit $' + cap + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.', '$' + cap + ' of capital and about $6 of gas', '15 minutes to set up'];
    if (c.indexOf('stable') >= 0)
      return ['Mint or deposit $' + cap + ' of the stable asset through ' + name + ' on ' + chain + '.', '$' + cap + ' of capital and about $5 of gas', '15 minutes to set up'];
    if (c.indexOf('rwa') >= 0)
      return ['Mint $' + cap + " of the protocol's yield asset on " + chain + ' and hold it.', '$' + cap + ' of capital and about $7 of gas', '20 minutes to set up'];
    if (c.indexOf('insurance') >= 0)
      return ['Buy $' + cap + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.', '$' + cap + ' of premium and about $5 of gas', '15 minutes to set up'];
    return ['Deposit $' + cap + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.', '$' + cap + ' of capital and about $4 of gas', '15 minutes to set up'];
  }

  function farmPlan(row) {
    var hold = holdDaysFor(row.age_days);
    var weeks = Math.max(2, Math.round(hold / 7));
    var steps = [
      ['Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', 'under $3 of gas for the first transaction', '5 minutes'],
      actionFor(row),
      ['Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', 'about $2 of gas a week', '10 minutes a week'],
      ['Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', 'the capital stays in the position', hold + ' days'],
      ["Re-check the protocol's own points or rewards page every week and record what it shows, because the rules can change between snapshots.", 'no fee to look, and never pay to claim', '5 minutes a week'],
      ["Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", 'no fee to check, and never pay to claim', '10 minutes'],
      ['Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it in ' + weeks + ' weeks.', 'nothing but the log', '5 minutes']
    ];
    return steps;
  }

  /* ---------- header, stats ---------- */

  document.getElementById('modelVersion').textContent = R.model_version;
  document.getElementById('footAsOf').textContent = R.as_of;
  document.getElementById('footModel').textContent = R.model_version;
  document.getElementById('mWatch').textContent = R.watchlist_size + ' watchlist protocols';
  document.getElementById('meta').innerHTML = 'Snapshot ' + R.as_of + ' · ' + R.board_size + ' protocols ranked';

  var totalValue = R.rows.reduce(function (a, r) { return a + r.implied_value_usd; }, 0);
  var growing = R.rows.filter(function (r) { return (r.change_7d || 0) > 0; }).length;
  var medianMultiple = R.global_multiple;

  function statTile(k, v, n) {
    var t = el('div', 'stat');
    t.appendChild(el('div', 'k', k));
    t.appendChild(el('div', 'v', v));
    if (n) t.appendChild(el('div', 'n', n));
    return t;
  }

  var stats = document.getElementById('stats');
  stats.appendChild(statTile('Implied value on the board', money(totalValue), R.board_size + ' protocols, one model'));
  stats.appendChild(statTile('Watchlist covered', R.watchlist_size + ' / ' + R.watchlist_size, 'every protocol the house rule kept'));
  stats.appendChild(statTile('Calibration', medianMultiple.toFixed(2) + '×', 'median market cap over TVL, ' + R.global_peers + ' live peers'));
  stats.appendChild(statTile('Growing this week', growing + ' of ' + R.board_size, 'TVL up over seven days'));

  /* ---------- category bars ---------- */

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
    cats.length + ' categories; the top ' + Math.min(9, cats.length) + ' carry ' + money(cats.slice(0, 9).reduce(function (a, c) { return a + c.value; }, 0)) + ' of implied value.';

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
      if (by === 'age') return (b.age_days || 0) - (a.age_days || 0) || a.rank - b.rank;
      if (by === 'multiple') return b.multiple - a.multiple || a.rank - b.rank;
      return a.rank - b.rank;
    });
    return rows;
  }

  function momentumCell(change) {
    var wrap = el('span', 'mom');
    var text = el('span', change === null ? 'flat' : (change > 0 ? 'pos' : change < 0 ? 'neg' : 'flat'), change === null ? 'n/a' : pct(change));
    wrap.appendChild(text);
    var track = el('span', 'track');
    var zero = el('i', 'zero');
    track.appendChild(zero);
    var bar = el('i');
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
      tr.appendChild(el('td', 'num', age(r.age_days)));
      tr.appendChild(el('td', 'num mult', r.multiple.toFixed(2) + '×'));

      var tdVal = el('td', 'num value');
      var line = el('div', 'vline');
      line.appendChild(el('span', 'amt', money(r.implied_value_usd)));
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

  /* ---------- the detail drawer ---------- */

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
    pair('Age', r.age_days === null ? 'unknown' : r.age_days + ' days (' + age(r.age_days) + ')');
    pair('Chains', r.chains.length ? r.chains.join(', ') : 'none named');
    pair('Listed', r.listed_at || 'unknown');
    pair('Token', 'none on record');
    pair('Multiple', r.multiple.toFixed(3) + '× TVL from ' + r.peer_count + ' live peers');
    pair('Implied value', moneyFull(r.implied_value_usd));
    detailBody.appendChild(kv);

    detailBody.appendChild(el('div', 'section-title', 'How the number is built'));
    var wf = el('div', 'waterfall');
    var base = r.tvl_usd * r.multiple;
    function factor(label, mult, note, cls) {
      var row = el('div', 'wf');
      row.appendChild(el('div', null, label + (note ? ' · ' + note : '')));
      row.appendChild(el('div', 'v', mult.toFixed(2) + '×'));
      var track = el('div', 'track');
      var fill = el('i', cls || '');
      fill.style.width = Math.max(4, Math.min(100, (mult / 1.25) * 100)).toFixed(1) + '%';
      track.appendChild(fill);
      row.appendChild(track);
      wf.appendChild(row);
    }
    var baseRow = el('div', 'wf');
    baseRow.appendChild(el('div', null, 'Base · TVL × ' + r.multiple.toFixed(3) + '× measured multiple'));
    baseRow.appendChild(el('div', 'v', money(base)));
    var baseTrack = el('div', 'track');
    var baseFill = el('i');
    baseFill.style.width = '100%';
    baseTrack.appendChild(baseFill);
    baseRow.appendChild(baseTrack);
    wf.appendChild(baseRow);
    factor('Momentum · ' + (r.change_7d === null ? 'not reported' : pct(r.change_7d, 2)) + ' over 7 days', r.growth_multiplier, r.growth_multiplier >= 1 ? 'adds' : 'takes', r.growth_multiplier >= 1 ? 'pos' : 'neg');
    factor('Maturity · ' + (r.age_days === null ? 'age unknown' : r.age_days + ' days old'), r.maturity_multiplier, null, 'pos');
    factor('Breadth · ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's'), r.breadth_multiplier, null, 'pos');
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

    var flatDiff = r.flat_implied_usd - r.implied_value_usd;
    var box = el('div', 'callout');
    box.style.marginTop = '14px';
    box.textContent = flatDiff === 0
      ? 'This protocol reported no seven-day change, so its momentum term is flat and the implied value is its base times maturity and breadth.'
      : 'With seven-day momentum at zero, the implied value would be ' + money(r.flat_implied_usd) + ', ' + money(Math.abs(flatDiff)) + ' ' + (flatDiff > 0 ? 'above' : 'below') + " the board's number.";
    detailBody.appendChild(box);

    detailBody.appendChild(el('div', 'section-title', 'Farm plan · ' + farmPlan(r).length + ' steps'));
    var ol = el('ol', 'steps');
    farmPlan(r).forEach(function (s) {
      var li = el('li');
      li.appendChild(el('div', null, s[0]));
      li.appendChild(el('div', 'meta', 'Cost: ' + s[1] + ' · Time: ' + s[2]));
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

  /* ---------- live tokens, model and guide views ---------- */

  var liveStats = document.getElementById('liveStats');
  liveStats.appendChild(statTile('Live peers measured', String(R.global_peers), 'protocols with a token on record'));
  liveStats.appendChild(statTile('Median multiple', R.global_multiple.toFixed(3) + '×', 'market cap over TVL'));
  var liveValue = R.live.reduce(function (a, r) { return a + (r.mcap_usd || 0); }, 0);
  liveStats.appendChild(statTile('Market cap sampled', money(liveValue), R.live.length + ' largest live protocols'));
  liveStats.appendChild(statTile('Categories measured', String(R.categories.length), 'each with its own median'));

  var calMax = R.categories.length ? Math.max.apply(null, R.categories.map(function (c) { return c.multiple; })) : 1;
  var calBars = document.getElementById('calBars');
  R.categories.slice(0, 12).forEach(function (c) {
    var row = el('div', 'bar-row');
    row.appendChild(el('div', 'name', c.category));
    row.appendChild(el('div', 'val', c.multiple.toFixed(2) + '×'));
    var track = el('div', 'bar-track');
    var fill = el('div', 'bar-fill' + (c.used_fallback ? ' alt' : ''));
    fill.style.width = Math.max(2, (c.multiple / calMax) * 100).toFixed(1) + '%';
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
  document.getElementById('liveSub').textContent = 'The ' + R.live.length + ' largest live protocols and the ratio the board calibrates on.';

  var catTable = document.getElementById('catTable');
  var head = el('tr');
  ['Category', 'Live peers', 'Measured multiple', 'Used'].forEach(function (h, i) {
    var th = el('th', i > 0 ? 'num' : null, h);
    head.appendChild(th);
  });
  var thead = document.createElement('thead');
  thead.appendChild(head);
  catTable.appendChild(thead);
  var tbody2 = el('tbody');
  R.categories.forEach(function (c) {
    var tr = el('tr');
    tr.appendChild(el('td', null, c.category));
    tr.appendChild(el('td', 'num', c.peers));
    tr.appendChild(el('td', 'num', c.multiple.toFixed(3) + '×'));
    tr.appendChild(el('td', 'num', c.used_fallback ? 'global fallback' : 'category median'));
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
    ['calibration_min_peers', M.calibration_min_peers, 'peers a category needs before its own median is used'],
    ['calibration_shrinkage', M.calibration_shrinkage, 'virtual peers pulling a thin category toward the global median'],
    ['growth_weight', M.growth_weight, 'how hard a week of TVL growth counts'],
    ['growth_floor / cap', M.growth_floor + ' / ' + M.growth_cap, 'the range the seven-day change is clamped to'],
    ['maturity_floor / range', M.maturity_floor + ' / ' + M.maturity_range, 'how much a protocol’s age is worth'],
    ['maturity_days', M.maturity_days, 'the age at which maturity stops rising'],
    ['unknown_age_days', M.unknown_age_days, 'the age assumed when the snapshot has none'],
    ['breadth_step / cap', M.breadth_step + ' / ' + M.breadth_cap, 'what an extra chain is worth, and how many count'],
    ['default_multiple', M.default_multiple, 'the multiple used when no live peer exists at all']
  ].forEach(function (row) {
    var tr = el('tr');
    tr.appendChild(el('td', 'mono', row[0]));
    tr.appendChild(el('td', 'num', String(row[1])));
    tr.appendChild(el('td', null, row[2]));
    cBody.appendChild(tr);
  });
  constTable.appendChild(cBody);

  var guideTable = document.getElementById('guideTable');
  var gHead = el('tr');
  ['Category', 'The qualifying action', 'Typical capital'].forEach(function (h) { gHead.appendChild(el('th', null, h)); });
  var gThead = document.createElement('thead');
  gThead.appendChild(gHead);
  guideTable.appendChild(gThead);
  var gBody = el('tbody');
  var guideMap = [
    ['Lending, CDP, collateral', 'Supply USDC and keep the position open', '$50–$250'],
    ['DEX, yield, leveraged farming', 'Provide liquidity to the main pool', '$50–$250'],
    ['Bridge', 'Bridge USDC and use the bridged funds in the app', '$50–$250'],
    ['Staking, restaking', 'Stake the chain’s staking asset through the protocol', '$50–$250'],
    ['Perpetuals, derivatives', 'Post USDC margin and open one small hedge', '$50–$250'],
    ['Prediction market', 'Fund the market and place one position', '$50–$250'],
    ['Curator, allocator', 'Deposit into a protocol vault and keep the shares', '$50–$250'],
    ['Stablecoin', 'Mint or deposit the stable asset through the protocol', '$50–$250'],
    ['RWA', 'Mint the protocol’s yield asset and hold it', '$50–$250'],
    ['Insurance', 'Buy cover and keep the policy', '$50–$250'],
    ['Anything else', 'Deposit USDC and keep the position open', '$50–$250']
  ];
  guideMap.forEach(function (g) {
    var tr = el('tr');
    tr.appendChild(el('td', null, g[0]));
    tr.appendChild(el('td', null, g[1]));
    tr.appendChild(el('td', null, g[2]));
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
