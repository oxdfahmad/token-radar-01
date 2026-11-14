// Token Radar dashboard, model radar-3, v3. Reads window.RADAR: the ranked board,
// filters, per-protocol detail views with the model's inputs, a confidence read,
// risks and the farm plan, plus the live-token set. No network.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = {
    q: '', category: 'all', chain: 'all', tvlMin: '0', growth: 'all',
    watchlistOnly: false, earlyOnly: false,
    tab: 'pre-token', sort: 'implied', dir: -1, liveSort: 'mcap', liveDir: -1, selected: null,
  };

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtUsdFull(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the same arithmetic main.ts runs, so the page can check it.
  function impliedOf(row, model) {
    var g = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    // Every multiplier is rounded to four decimals before it is used, exactly as
    // main.ts does, so this recompute matches board.json to the dollar.
    var r4 = function (n) { return Math.round(n * 1e4) / 1e4; };
    var gMult = r4(1 + (g / 100) * model.growth_weight);
    var age = row.age_days === null || row.age_days === undefined ? DATA.median_age_days : row.age_days;
    var mat = r4(model.maturity_floor + model.maturity_range * (Math.log(1 + Math.max(0, age)) / Math.log(1 + model.maturity_days)));
    var brd = r4(1 + model.breadth_per_ln_chain * Math.log(Math.max(1, (row.chains || []).length)));
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * gMult * mat * brd));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json.
  function headChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function stakeFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function usd(n) { return n >= 1 ? '$' + n : '$' + n.toFixed(2); }
  var L2 = {
    'Arbitrum': 1, 'Optimism': 1, 'Base': 1, 'Blast': 1, 'Mode': 1, 'Scroll': 1, 'Linea': 1,
    'zkSync Era': 1, 'Mantle': 1, 'Starknet': 1, 'Fraxtal': 1, 'Zora': 1, 'Manta': 1, 'Metis': 1,
    'Boba': 1, 'Kroma': 1, 'Taiko': 1, 'Polygon zkEVM': 1, 'ApeChain': 1, 'Abstract': 1,
  };
  function costForChain(chain) {
    if (chain === 'Ethereum') return { bridge_usd: 15, gas_usd: 12, bridge_time: '30 minutes' };
    if (chain === 'Solana') return { bridge_usd: 1, gas_usd: 0.05, bridge_time: '10 minutes' };
    if (chain === 'BSC') return { bridge_usd: 1, gas_usd: 0.5, bridge_time: '15 minutes' };
    if (chain === 'Polygon') return { bridge_usd: 1, gas_usd: 0.3, bridge_time: '15 minutes' };
    if (chain === 'Avalanche') return { bridge_usd: 1, gas_usd: 1, bridge_time: '15 minutes' };
    if (L2[chain]) return { bridge_usd: 1, gas_usd: 1, bridge_time: '15 minutes' };
    return { bridge_usd: 3, gas_usd: 3, bridge_time: '20 minutes' };
  }
  function mainAction(p, stake, net) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + stake + ' of USDC to ' + name + ' on ' + net + ' so the position earns interest and shows as an active lender.';
    if (c.indexOf('dex') >= 0) return 'Add $' + stake + " of liquidity to " + name + "'s largest pool on " + net + ' and keep the position in range.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('leveraged farm') >= 0 || c === 'farm') return 'Deposit $' + stake + " of USDC into " + name + "'s highest-yield vault on " + net + ' and let it compound.';
    if (c.indexOf('yield') >= 0) return 'Deposit $' + stake + " into " + name + "'s main yield strategy on " + net + ' and keep the receipt tokens.';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + stake + ' of USDC as margin on ' + name + ' on ' + net + ' and open one small hedged position.';
    if (c.indexOf('risk curator') >= 0 || c.indexOf('capital allocator') >= 0 || c.indexOf('curator') >= 0) return 'Deposit $' + stake + ' of USDC into a ' + name + ' vault on ' + net + ' and keep the vault shares.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + stake + " of " + name + "'s yield-bearing asset on " + net + ' and hold it in the farming wallet.';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + name + ' with $' + stake + ' on ' + net + ' and place one small position in an active market.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + stake + " of the chain's staking asset through " + name + ' on ' + net + ' and keep the receipt.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + stake + ' of USDC to ' + net + ' through ' + name + ' and use the bridged funds inside its app.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + stake + ' of the stable asset through ' + name + ' on ' + net + ' and keep it parked.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Load $' + stake + ' onto ' + name + ' on ' + net + ' and make one real payment through it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + stake + ' of cover from ' + name + ' on ' + net + ' and keep the policy active.';
    if (c.indexOf('index') >= 0) return 'Buy $' + stake + ' of the ' + name + ' index on ' + net + ' and hold the index tokens.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + stake + " of USDC to " + name + "'s chain and use one of its native apps with it.";
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + stake + " through " + name + "'s private pool on " + net + ' and keep the position.';
    return 'Deposit $' + stake + ' of USDC into ' + name + ' on ' + net + ' and use its main feature once.';
  }
  function secondAction(p, stake, net) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(stake / 5));
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Borrow a small amount, about $' + small + ', against the supply and repay it a week later.';
    if (c.indexOf('dex') >= 0) return 'Make one swap of about $' + small + " through " + name + "'s pool on " + net + '.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return "Claim the vault's rewards once and deposit them straight back into the same vault.";
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('options') >= 0 || c.indexOf('basis') >= 0) return 'Close the first position and open a second one half its size, so the account shows two trades.';
    if (c.indexOf('rwa') >= 0) return "Check the asset's redemption page and confirm the holding is still earning, then leave it in place.";
    if (c.indexOf('prediction') >= 0) return 'Place a second small position in a different market, then let both settle.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Restake the first staking rewards instead of withdrawing them.';
    if (c.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount back the other way to show two-way use.';
    return 'Use ' + name + "'s main feature a second time with about $" + small + ', a week after the first.';
  }
  function stepLine(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var net = headChain(p);
    var stake = stakeFor(p);
    var hold = holdFor(p.age_days);
    var fee = costForChain(net);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: 'Bridge $' + stake + ' of USDC to ' + net + " through the chain's official bridge, from the chain the funds sit on now.", cost: 'about ' + usd(fee.bridge_usd) + ' of bridge fee and ' + usd(fee.gas_usd) + ' of gas', time: fee.bridge_time },
      { text: mainAction(p, stake, net), cost: '$' + stake + ' of capital and about ' + usd(fee.gas_usd) + ' of gas', time: '15 minutes to set up' },
      { text: secondAction(p, stake, net), cost: 'about ' + usd(Math.max(0.05, fee.gas_usd / 2)) + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a swap, a vote or a claim.', cost: 'about ' + usd(fee.gas_usd) + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + stake + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then plan the exit: unwind in two steps and revoke the approvals.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepLine);
  }

  // Confidence: the same read main.ts makes. 100 minus the gaps in the snapshot's
  // own record only: growth unreported -20, listed date unknown -20, thin category
  // calibration -15, one chain -10. High at 85+, Medium at 65..84, Low below 65.
  function confidenceOf(row) {
    var score = 100;
    var reasons = [];
    if (row.change_7d === null || row.change_7d === undefined) {
      score -= 20;
      reasons.push('Seven-day growth is unreported, so momentum is scored as flat.');
    }
    if (row.age_days === null || row.age_days === undefined) {
      score -= 20;
      reasons.push('Listed date unknown — the age factor uses the snapshot median instead of its own age.');
    }
    var cal = DATA.calibration.by_category.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    if (cal && cal.thin) {
      score -= 15;
      reasons.push('Category multiple falls back to the global median — too few live protocols to calibrate on.');
    }
    if (!row.chains || row.chains.length <= 1) {
      score -= 10;
      reasons.push('Live on one chain only, so a chain outage strands the whole position.');
    }
    var band = score >= 85 ? 'High' : score >= 65 ? 'Medium' : 'Low';
    return { score: score, band: band, reasons: reasons };
  }

  // What farming this protocol takes in total. Same derivation as the steps.
  function farmSummary(row) {
    var net = headChain(row);
    var stake = stakeFor(row);
    var fee = costForChain(net);
    var bridgeMin = fee.bridge_time === '30 minutes' ? 30 : fee.bridge_time === '20 minutes' ? 20 : fee.bridge_time === '15 minutes' ? 15 : 10;
    var fees = Math.round((fee.bridge_usd + fee.gas_usd * 2.5) * 100) / 100;
    return {
      capital: stake,
      fees_usd: fees,
      total_upfront: stake + fees,
      time_to_first_min: bridgeMin + 15,
      hold_days: holdFor(row.age_days),
      chain: net,
    };
  }

  // What could go wrong with this protocol, read off its own record.
  function risksFor(row) {
    var risks = [];
    var g = row.change_7d;
    if (g !== null && g !== undefined && g <= -10) risks.push('TVL fell ' + fmtPct(g) + ' in the last week — the protocol is shrinking, so size the position small and check the fall is not a hack or an exploit.');
    if (g === null || g === undefined) risks.push('No seven-day growth is reported, so the model scores growth as flat — the momentum read may be stale.');
    if (row.age_days !== null && row.age_days !== undefined && row.age_days < 90) risks.push('Listed less than 3 months ago — a young record with no history of surviving a downturn.');
    if (row.age_days === null || row.age_days === undefined) risks.push('Listed date unknown — the age factor uses the snapshot median of ' + DATA.median_age_days + ' days instead of this protocol\u2019s own age.');
    if (!row.chains || row.chains.length <= 1) risks.push('Live on one chain only — a chain outage or a bridge problem strands the whole position.');
    if (row.tvl_usd < 10000000) risks.push('Small TVL under $10M — one large wallet leaving moves the numbers a lot.');
    var cal = DATA.calibration.by_category.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    if (cal && cal.thin) risks.push('Its ' + (row.category || 'Other') + ' multiple falls back to the global median — the category has too few live protocols to calibrate on its own.');
    risks.push('A launch is never guaranteed: the implied value is an estimate of what a token would be worth, not a promise that one ships.');
    return risks;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tvl')) state.tvlMin = params.get('tvl');
    if (params.get('growth')) state.growth = params.get('growth');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('early') === '1') state.earlyOnly = true;
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tvlMin !== '0') params.set('tvl', state.tvlMin);
    if (state.growth !== 'all') params.set('growth', state.growth);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.earlyOnly) params.set('early', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    var tvlMin = Number(state.tvlMin) || 0;
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (r.tvl_usd < tvlMin) return false;
      if (state.growth === 'growing' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (state.growth === 'fast' && !(r.change_7d !== null && r.change_7d > 10)) return false;
      if (state.growth === 'declining' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (state.earlyOnly && r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'confidence') { av = a.confidence_score; bv = b.confidence_score; }
      else if (key === 'cost') { av = farmSummary(a).total_upfront; bv = farmSummary(b).total_upfront; }
      else if (key === 'factors') { av = a.category_multiple * a.growth_multiplier * a.maturity_multiplier * a.breadth_multiplier; bv = b.category_multiple * b.growth_multiplier * b.maturity_multiplier * b.breadth_multiplier; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function headerMeta() {
    var meta = document.getElementById('top-meta');
    meta.textContent = '';
    meta.appendChild(el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })));
    meta.appendChild(el('span', null, 'DefiLlama protocol index'));
    meta.appendChild(el('span', null, 'Model ', el('b', { text: DATA.model_version })));
  }

  function lede() {
    var text = document.getElementById('lede-text');
    text.textContent = DATA.watchlist_size + ' watchlist + ' + DATA.early_size +
      ' early pre-token protocols, ranked by implied launch value, strongest first.';
    var facts = document.getElementById('facts');
    facts.textContent = '';
    facts.appendChild(el('span', { class: 'fact-inline' }, 'Watchlist covered ', el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })));
    facts.appendChild(el('span', { class: 'fact-inline' }, 'Pre-token rows ', el('b', { text: String(DATA.board_size) })));
    facts.appendChild(el('span', { class: 'fact-inline' }, 'Top-10 implied value ', el('b', { text: fmtUsd(DATA.total_implied_top10_usd) })));
    facts.appendChild(el('span', { class: 'fact-inline' }, 'Live-token set aside ', el('b', { text: String(DATA.live_size) })));
  }

  function selectField(id, label, options, value, onchange) {
    var sel = el('select', { id: id, 'aria-label': label },
      options.map(function (o) { return el('option', { value: o[0], text: o[1], selected: o[0] === value ? 'selected' : null }); })
    );
    sel.addEventListener('change', function () { onchange(sel.value); writeHash(); renderTable(); });
    return el('div', { class: 'field' }, el('label', { for: id, text: label }), sel);
  }

  function controls() {
    var slot = document.getElementById('controls');
    slot.textContent = '';
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); renderTable(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); renderTable(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); renderTable(); });
    var wlBox = el('input', { type: 'checkbox', id: 'wl', checked: state.watchlistOnly ? 'checked' : null });
    wlBox.addEventListener('change', function () { state.watchlistOnly = wlBox.checked; if (wlBox.checked) state.earlyOnly = false; writeHash(); renderTable(); });
    var earlyBox = el('input', { type: 'checkbox', id: 'early', checked: state.earlyOnly ? 'checked' : null });
    earlyBox.addEventListener('change', function () { state.earlyOnly = earlyBox.checked; if (earlyBox.checked) state.watchlistOnly = false; writeHash(); renderTable(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); renderTable(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); renderTable(); } });
    slot.appendChild(el('div', { class: 'field grow' }, el('label', { for: 'q', text: 'Search' }), search));
    slot.appendChild(el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect));
    slot.appendChild(el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect));
    slot.appendChild(selectField('tvl', 'TVL at least', [['0', 'Any TVL'], ['50000000', '$50M+'], ['100000000', '$100M+'], ['500000000', '$500M+'], ['1000000000', '$1B+']], state.tvlMin, function (v) { state.tvlMin = v; }));
    slot.appendChild(selectField('growth', '7-day growth', [['all', 'Any growth'], ['growing', 'Growing (> 0%)'], ['fast', 'Fast (> +10%)'], ['declining', 'Declining (< 0%)']], state.growth, function (v) { state.growth = v; }));
    slot.appendChild(el('div', { class: 'checks' },
      el('label', null, wlBox, 'Watchlist only'),
      el('label', null, earlyBox, 'Early only')
    ));
    slot.appendChild(el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)));
    slot.appendChild(el('span', { class: 'count', id: 'count' }));
  }

  // Board insights: three dense panels straight from the board's own figures.
  function insights() {
    var slot = document.getElementById('insights-slot');
    if (!slot) return;
    slot.textContent = '';
    var movers = DATA.rows.filter(function (r) { return r.change_7d !== null && r.change_7d !== undefined; })
      .slice().sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 5);
    var catTvl = {};
    DATA.rows.forEach(function (r) { var k = r.category || 'Other'; catTvl[k] = (catTvl[k] || 0) + r.tvl_usd; });
    var cats = Object.keys(catTvl).map(function (k) { return { name: k, tvl: catTvl[k] }; })
      .sort(function (a, b) { return b.tvl - a.tvl; }).slice(0, 5);
    var topCat = cats.length ? cats[0].tvl : 1;
    var mix = { High: 0, Medium: 0, Low: 0 };
    DATA.rows.forEach(function (r) { mix[r.confidence_band]++; });
    var wlCount = DATA.rows.filter(function (r) { return r.on_watchlist; }).length;
    slot.appendChild(el('div', { class: 'insight' },
      el('h3', { text: 'Fastest movers — 7-day TVL growth' }),
      el('ul', { class: 'movers' }, movers.map(function (r) {
        return el('li', null,
          el('button', { type: 'button', onclick: function () { openDetail(r.slug); } }, el('b', { text: '#' + r.rank + ' ' + r.name })),
          el('span', { class: 'num ' + (r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) })
        );
      }))
    ));
    slot.appendChild(el('div', { class: 'insight' },
      el('h3', { text: 'TVL by category — where the money sits' }),
      el('ul', { class: 'catbars' }, cats.map(function (c) {
        return el('li', null,
          el('span', { class: 'catname', text: c.name }),
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((c.tvl / topCat) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(c.tvl) })
        );
      }))
    ));
    slot.appendChild(el('div', { class: 'insight' },
      el('h3', { text: 'Confidence mix — how solid the record is' }),
      el('div', { class: 'mix' },
        el('div', null, el('b', { class: 'num conf-high', text: String(mix.High) }), el('span', { text: 'High' })),
        el('div', null, el('b', { class: 'num conf-med', text: String(mix.Medium) }), el('span', { text: 'Medium' })),
        el('div', null, el('b', { class: 'num conf-low', text: String(mix.Low) }), el('span', { text: 'Low' }))
      ),
      el('p', { class: 'mix-note', text: wlCount + ' watchlist · ' + (DATA.board_size - wlCount) + ' early · ' +
        'confidence is the snapshot record behind each value: growth reported, age known, ' +
        'category calibrated, more than one chain.' })
    ));
    // The model at a glance, in one line: the formula plus the two numbers a reader
    // needs to sanity-check any row without scrolling to the model section.
    slot.appendChild(el('div', { class: 'model-strip' },
      el('span', { class: 'strip-label', text: 'Model at a glance' }),
      el('code', { text: 'implied = TVL x category multiple x growth(0.8) x log-maturity x log-breadth' }),
      el('span', { text: 'median age ' + DATA.median_age_days + 'd · global multiple ' + DATA.calibration.global_median.toFixed(3) + ' · ' + DATA.calibration.global_live_count + ' live protocols calibrate it' }),
      el('span', { text: 'growth clamped [-15, +30] · maturity floor 0.85 + 0.15 over 365d · breadth +0.05 per ln chain · shrink k=3 · multiple clamped [0.05, 1.50]' })
    ));
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } renderTable(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }
  function liveSortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.liveSort === key) state.liveDir = -state.liveDir; else { state.liveSort = key; state.liveDir = -1; } renderTable(); } },
        label,
        state.liveSort === key ? el('span', { 'aria-hidden': 'true', text: state.liveDir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function confBadge(row) {
    var cls = row.confidence_band === 'High' ? 'conf-high' : row.confidence_band === 'Medium' ? 'conf-med' : 'conf-low';
    return el('span', { class: 'badge ' + cls, text: row.confidence_band.toUpperCase() + ' ' + row.confidence_score });
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.tvlMin = '0'; state.growth = 'all'; state.watchlistOnly = false; state.earlyOnly = false; writeHash(); render(); } })
      ));
    }
    var max = 0;
    list.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badges = [];
      if (r.on_watchlist) badges.push(el('span', { class: 'badge watch', text: 'WATCHLIST' }));
      else badges.push(el('span', { class: 'badge early', text: 'EARLY' }));
      var sum = farmSummary(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' + (r.rank <= 3 ? ' rank-top' : ''), text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), badges[0]),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num factors', text: r.category_multiple.toFixed(3) + ' x ' + r.growth_multiplier.toFixed(3) + ' x ' + r.maturity_multiplier.toFixed(3) + ' x ' + r.breadth_multiplier.toFixed(3) }),
        el('td', { class: 'num' }, confBadge(r)),
        el('td', { class: 'num', text: '$' + sum.total_upfront }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model, confidence, risks and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('rank', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('factors', 'Factors'),
            sortHeader('confidence', 'Confidence'),
            sortHeader('cost', 'Farm cost'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var list = DATA.live.slice().sort(function (a, b) {
      var av = state.liveSort === 'tvl' ? a.tvl_usd : (a.mcap_usd || 0);
      var bv = state.liveSort === 'tvl' ? b.tvl_usd : (b.mcap_usd || 0);
      if (av < bv) return -state.liveDir;
      if (av > bv) return state.liveDir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    var tbody = el('tbody');
    list.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap / TVL ratios calibrate it.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), liveSortHeader('tvl', 'TVL'), el('th', { scope: 'col', text: '7d' }), liveSortHeader('mcap', 'Market cap'), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var ex = DATA.worked_example;
    var calRows = cal.by_category
      .filter(function (c) { return DATA.rows.some(function (r) { return (r.category || 'Other') === c.category; }); })
      .map(function (c) {
        return el('tr', null,
          el('td', { text: c.category }),
          el('td', { class: 'num', text: String(c.live_count) }),
          el('td', { class: 'num', text: c.category_median === null ? '—' : c.category_median.toFixed(3) }),
          el('td', { class: 'num', text: c.multiple.toFixed(3) + (c.thin ? ' *' : '') })
        );
      });
    var worked = el('div', { class: 'worked' },
      el('h3', { text: 'Worked example — rank 1, ' + ex.name }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsdFull(ex.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: 'x ' + ex.category_multiple.toFixed(4) })),
        el('div', null, el('span', { text: 'Seven-day growth ' + fmtPct(ex.growth_pct) }), el('b', { class: 'num', text: 'x ' + ex.growth_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Age with no token (' + (ex.age_days === null ? 'unknown, median ' + ex.age_used + 'd used' : fmtAge(ex.age_days)) + ')' }), el('b', { class: 'num', text: 'x ' + ex.maturity_multiplier.toFixed(4) })),
        el('div', null, el('span', { text: 'Chains (' + ex.chains + ')' }), el('b', { class: 'num', text: 'x ' + ex.breadth_multiplier.toFixed(4) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsdFull(ex.implied_value_usd) }))
      ),
      el('p', { class: 'why', text: 'Multiply the five numbers and round: that is the rank-1 implied value, and every row on the board is scored the same way. No protocol name is special-cased anywhere in the model.' })
    );
    return el('div', null,
      el('h2', { text: 'How implied value is computed' }),
      el('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x categoryMultiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + ' + m.maturity_range + ' x ln(1 + age_days) / ln(1 + ' + m.maturity_days + ')) x (1 + ' + m.breadth_per_ln_chain + ' x ln(chains)) )'
      ),
      el('p', { text: 'TVL, seven-day growth and age come from the snapshot. Age is the time since the protocol was first listed — the best record of how long it has run with no token. The log scale is deliberate: a 90-day protocol still scores 0.89 on maturity, so being early is not punished, and surviving longer earns a premium that fades. An unknown age uses the snapshot\u2019s median rankable age, ' + DATA.median_age_days + ' days. Chain breadth is logarithmic too: eleven chains add 12%, not 22%.' }),
      worked,
      el('h3', { text: 'Category multiples, calibrated from the live market' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Live protocols' }),
            el('th', { scope: 'col', text: 'Median mcap / TVL' }),
            el('th', { scope: 'col', text: 'Multiple used' })
          )),
          el('tbody', null, calRows)
        )
      ),
      el('p', { class: 'calib-note', text: 'Each multiple is the category median market-cap / TVL of its live-token protocols, shrunk toward the global median ' + cal.global_median.toFixed(3) + ' (' + cal.global_live_count + ' live protocols) with ' + m.shrink_k + ' pseudo-observations, then clamped to [' + m.mult_floor + ', ' + m.mult_cap + ']. A category with fewer than ' + m.min_live_for_category + ' live protocols falls back to the global median outright — marked * — and a category with no live comparable uses it too. Thin categories are pulled hard toward the middle: that is the point.' })
    );
  }

  var dialog = document.getElementById('detail');
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var inner = el('div', { class: 'detail-inner' });
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, DATA.model);
    var conf = confidenceOf(row);
    var sum = farmSummary(row);
    var cal = DATA.calibration.by_category.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    inner.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · Watchlist' : ' · Early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'date unknown') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    inner.appendChild(el('section', { class: 'detail-section farm-summary' },
      el('h3', { text: 'To farm it — the whole cost, up front' }),
      el('div', { class: 'summary-grid' },
        el('div', null, el('span', { text: 'Capital to stake' }), el('b', { class: 'num', text: '$' + sum.capital })),
        el('div', null, el('span', { text: 'Bridge + gas fees' }), el('b', { class: 'num', text: 'about $' + sum.fees_usd })),
        el('div', null, el('span', { text: 'First position in' }), el('b', { class: 'num', text: '~' + sum.time_to_first_min + ' min' })),
        el('div', null, el('span', { text: 'Hold at least' }), el('b', { class: 'num', text: sum.hold_days + ' days' }))
      ),
      el('p', { class: 'why', text: 'Total to open the position: $' + sum.total_upfront + ' on ' + sum.chain +
        ' — $' + sum.capital + ' of capital that stays in the position, plus about $' + sum.fees_usd +
        ' of bridge and gas. The weekly actions then cost about $' + usd(costForChain(sum.chain).gas_usd) + ' of gas a week.' })
    ));
    inner.appendChild(el('section', { class: 'detail-section confidence' },
      el('h3', { text: 'Confidence — how solid the record is' }),
      el('div', { class: 'conf-line' },
        confBadge(row),
        el('span', { class: 'conf-text', text: conf.score + ' / 100 — the snapshot record behind this value, not the value itself.' })
      ),
      conf.reasons.length
        ? el('ul', { class: 'risks conf-reasons' }, conf.reasons.map(function (why) { return el('li', { text: why }); }))
        : el('p', { class: 'why', text: 'No gaps in the record: growth is reported, the listed date is known, the category is calibrated on its own live protocols, and the protocol runs on more than one chain.' })
    ));
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the model, factor by factor' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: String(row.category_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { class: 'num', text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Breadth multiplier' }), el('b', { class: 'num', text: String(row.breadth_multiplier) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'why', text: 'The page recomputes this row as ' + fmtUsd(recomputed) +
        (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') +
        (cal ? ' Its ' + (row.category || 'Other') + ' multiple of ' + cal.multiple.toFixed(3) + ' comes from ' + cal.live_count + ' live protocol' + (cal.live_count === 1 ? '' : 's') + ' in the category' + (cal.thin ? ', too few to calibrate on, so it falls back to the global median.' : ', median market-cap / TVL ' + (cal.category_median === null ? 'unreported' : cal.category_median.toFixed(3)) + '.') : '') +
        (row.age_days === null ? ' Its listed date is unknown, so the age factor uses the snapshot median of ' + DATA.median_age_days + ' days.' : '') +
        ' This is an estimate, not a price.' })
    ));
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Risks and caveats — read before you farm' }),
      el('ul', { class: 'risks' }, risksFor(row).map(function (r) { return el('li', { text: r }); }))
    ));
    inner.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — eight steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    dialog.appendChild(inner);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function renderTable() {
    var slot = document.getElementById('table-slot');
    slot.textContent = '';
    slot.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    var count = document.getElementById('count');
    if (count) count.textContent = state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols';
    if (state.selected) openDetail(state.selected);
  }

  function render() {
    headerMeta();
    lede();
    controls();
    insights();
    var modelSlot = document.getElementById('model-slot');
    modelSlot.textContent = '';
    modelSlot.appendChild(modelPanel());
    document.getElementById('foot-source').textContent = 'Source: ' + DATA.source;
    document.getElementById('foot-model').textContent = DATA.model_version;
    renderTable();
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });

  // The model's own functions, exposed for inspection.
  window.__RADAR_TEST__ = { impliedOf: impliedOf, farmSteps: farmSteps, risksFor: risksFor, confidenceOf: confidenceOf, farmSummary: farmSummary };
})();
