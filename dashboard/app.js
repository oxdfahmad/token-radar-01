// Token Radar dashboard, model radar-3, v4. Renders window.RADAR as a sortable,
// filterable board with a farm plan and a confidence read per row.
(function () {
  'use strict';

  var RADAR = window.RADAR;
  if (!RADAR) return;
  var page = document.getElementById('board');
  var view = {
    q: '', category: 'all', chain: 'all', tvlMin: '0', growth: 'all',
    watchlistOnly: false, earlyOnly: false,
    tab: 'pre-token', sort: 'implied', dir: -1, liveSort: 'mcap', liveDir: -1, selected: null,
  };

  function usdShort(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function usdExact(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function pctText(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function ageText(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the same arithmetic main.ts runs.
  function impliedValue(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    // Multipliers round to four decimals first, as main.ts does.
    var round4 = function (n) { return Math.round(n * 1e4) / 1e4; };
    var growthMult = round4(1 + (growth / 100) * model.growth_weight);
    var ageDays = row.age_days === null || row.age_days === undefined ? RADAR.median_age_days : row.age_days;
    var maturityMult = round4(model.maturity_floor + model.maturity_range * (Math.log(1 + Math.max(0, ageDays)) / Math.log(1 + model.maturity_days)));
    var breadthMult = round4(1 + model.breadth_per_ln_chain * Math.log(Math.max(1, (row.chains || []).length)));
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturityMult * breadthMult));
  }

  function mk(tag, attrs) {
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
  function mainChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function stakeSize(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDays(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function dollars(n) { return n >= 1 ? '$' + n : '$' + n.toFixed(2); }
  var L2SET = {
    'Arbitrum': 1, 'Optimism': 1, 'Base': 1, 'Blast': 1, 'Mode': 1, 'Scroll': 1, 'Linea': 1,
    'zkSync Era': 1, 'Mantle': 1, 'Starknet': 1, 'Fraxtal': 1, 'Zora': 1, 'Manta': 1, 'Metis': 1,
    'Boba': 1, 'Kroma': 1, 'Taiko': 1, 'Polygon zkEVM': 1, 'ApeChain': 1, 'Abstract': 1,
  };
  function chainFees(chain) {
    if (chain === 'Ethereum') return { bridge_usd: 15, gas_usd: 12, bridge_time: '30 minutes' };
    if (chain === 'Solana') return { bridge_usd: 1, gas_usd: 0.05, bridge_time: '10 minutes' };
    if (chain === 'BSC') return { bridge_usd: 1, gas_usd: 0.5, bridge_time: '15 minutes' };
    if (chain === 'Polygon') return { bridge_usd: 1, gas_usd: 0.3, bridge_time: '15 minutes' };
    if (chain === 'Avalanche') return { bridge_usd: 1, gas_usd: 1, bridge_time: '15 minutes' };
    if (L2SET[chain]) return { bridge_usd: 1, gas_usd: 1, bridge_time: '15 minutes' };
    return { bridge_usd: 3, gas_usd: 3, bridge_time: '20 minutes' };
  }
  function primaryStep(p, stake, home) {
    var cat = (p.category || '').toLowerCase();
    var name = p.name;
    if (cat.indexOf('lend') >= 0 || cat.indexOf('cdp') >= 0 || cat.indexOf('collateral') >= 0) return 'Supply $' + stake + ' of USDC to ' + name + ' on ' + home + ' so the position earns interest and shows as an active lender.';
    if (cat.indexOf('dex') >= 0) return 'Add $' + stake + " of liquidity to " + name + "'s largest pool on " + home + ' and keep the position in range.';
    if (cat.indexOf('yield aggregator') >= 0 || cat.indexOf('leveraged farm') >= 0 || cat === 'farm') return 'Deposit $' + stake + " of USDC into " + name + "'s highest-yield vault on " + home + ' and let it compound.';
    if (cat.indexOf('yield') >= 0) return 'Deposit $' + stake + " into " + name + "'s main yield strategy on " + home + ' and keep the receipt tokens.';
    if (cat.indexOf('derivative') >= 0 || cat.indexOf('perpetual') >= 0 || cat.indexOf('options') >= 0 || cat.indexOf('basis') >= 0) return 'Deposit $' + stake + ' of USDC as margin on ' + name + ' on ' + home + ' and open one small hedged position.';
    if (cat.indexOf('risk curator') >= 0 || cat.indexOf('capital allocator') >= 0 || cat.indexOf('curator') >= 0) return 'Deposit $' + stake + ' of USDC into a ' + name + ' vault on ' + home + ' and keep the vault shares.';
    if (cat.indexOf('rwa') >= 0) return 'Mint $' + stake + " of " + name + "'s yield-bearing asset on " + home + ' and hold it in the farming wallet.';
    if (cat.indexOf('prediction') >= 0) return 'Fund ' + name + ' with $' + stake + ' on ' + home + ' and place one small position in an active market.';
    if (cat.indexOf('staking') >= 0 || cat.indexOf('restak') >= 0) return "Stake $" + stake + " of the chain's staking asset through " + name + ' on ' + home + ' and keep the receipt.';
    if (cat.indexOf('bridge') >= 0) return 'Bridge $' + stake + ' of USDC to ' + home + ' through ' + name + ' and use the bridged funds inside its app.';
    if (cat.indexOf('stable') >= 0) return 'Mint or deposit $' + stake + ' of the stable asset through ' + name + ' on ' + home + ' and keep it parked.';
    if (cat.indexOf('payment') >= 0 || cat.indexOf('card') >= 0) return 'Load $' + stake + ' onto ' + name + ' on ' + home + ' and make one real payment through it.';
    if (cat.indexOf('insurance') >= 0) return 'Buy $' + stake + ' of cover from ' + name + ' on ' + home + ' and keep the policy active.';
    if (cat.indexOf('index') >= 0) return 'Buy $' + stake + ' of the ' + name + ' index on ' + home + ' and hold the index tokens.';
    if (cat.indexOf('chain') >= 0) return 'Bridge $' + stake + " of USDC to " + name + "'s chain and use one of its native apps with it.";
    if (cat.indexOf('privacy') >= 0) return 'Deposit $' + stake + " through " + name + "'s private pool on " + home + ' and keep the position.';
    return 'Deposit $' + stake + ' of USDC into ' + name + ' on ' + home + ' and use its main feature once.';
  }
  function followupStep(p, stake, home) {
    var cat = (p.category || '').toLowerCase();
    var name = p.name;
    var small = Math.max(10, Math.round(stake / 5));
    if (cat.indexOf('lend') >= 0 || cat.indexOf('cdp') >= 0 || cat.indexOf('collateral') >= 0) return 'Borrow a small amount, about $' + small + ', against the supply and repay it a week later.';
    if (cat.indexOf('dex') >= 0) return 'Make one swap of about $' + small + " through " + name + "'s pool on " + home + '.';
    if (cat.indexOf('yield') >= 0 || cat.indexOf('farm') >= 0 || cat.indexOf('curator') >= 0 || cat.indexOf('allocator') >= 0) return "Claim the vault's rewards once and deposit them straight back into the same vault.";
    if (cat.indexOf('derivative') >= 0 || cat.indexOf('perpetual') >= 0 || cat.indexOf('options') >= 0 || cat.indexOf('basis') >= 0) return 'Close the first position and open a second one half its size, so the account shows two trades.';
    if (cat.indexOf('rwa') >= 0) return "Check the asset's redemption page and confirm the holding is still earning, then leave it in place.";
    if (cat.indexOf('prediction') >= 0) return 'Place a second small position in a different market, then let both settle.';
    if (cat.indexOf('staking') >= 0 || cat.indexOf('restak') >= 0) return 'Restake the first staking rewards instead of withdrawing them.';
    if (cat.indexOf('bridge') >= 0) return 'Bridge a second, smaller amount back the other way to show two-way use.';
    return 'Use ' + name + "'s main feature a second time with about $" + small + ', a week after the first.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmPlan(p) {
    var home = mainChain(p);
    var stake = stakeSize(p);
    var hold = holdDays(p.age_days);
    var charge = chainFees(home);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: 'Bridge $' + stake + ' of USDC to ' + home + " through the chain's official bridge, from the chain the funds sit on now.", cost: 'about ' + dollars(charge.bridge_usd) + ' of bridge fee and ' + dollars(charge.gas_usd) + ' of gas', time: charge.bridge_time },
      { text: primaryStep(p, stake, home), cost: '$' + stake + ' of capital and about ' + dollars(charge.gas_usd) + ' of gas', time: '15 minutes to set up' },
      { text: followupStep(p, stake, home), cost: 'about ' + dollars(Math.max(0.05, charge.gas_usd / 2)) + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a swap, a vote or a claim.', cost: 'about ' + dollars(charge.gas_usd) + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + stake + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log, then plan the exit: unwind in two steps and revoke the approvals.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // Confidence: 100 minus the gaps in the snapshot's own record only.
  // High at 85+, Medium at 65..84, Low below 65.
  function confidenceFor(row) {
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
    var calib = RADAR.calibration.by_category.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    if (calib && calib.thin) {
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

  // What farming this protocol takes in total.
  function farmTotals(row) {
    var home = mainChain(row);
    var stake = stakeSize(row);
    var charge = chainFees(home);
    var bridgeMin = charge.bridge_time === '30 minutes' ? 30 : charge.bridge_time === '20 minutes' ? 20 : charge.bridge_time === '15 minutes' ? 15 : 10;
    var fees = Math.round((charge.bridge_usd + charge.gas_usd * 2.5) * 100) / 100;
    return {
      capital: stake,
      fees_usd: fees,
      total_upfront: stake + fees,
      time_to_first_min: bridgeMin + 15,
      hold_days: holdDays(row.age_days),
      chain: home,
    };
  }

  // What could go wrong with this protocol, read off its own record.
  function risksOf(row) {
    var risks = [];
    var growth = row.change_7d;
    if (growth !== null && growth !== undefined && growth <= -10) risks.push('TVL fell ' + pctText(growth) + ' in the last week — the protocol is shrinking, so size the position small and check the fall is not a hack or an exploit.');
    if (growth === null || growth === undefined) risks.push('No seven-day growth is reported, so the model scores growth as flat — the momentum read may be stale.');
    if (row.age_days !== null && row.age_days !== undefined && row.age_days < 90) risks.push('Listed less than 3 months ago — a young record with no history of surviving a downturn.');
    if (row.age_days === null || row.age_days === undefined) risks.push('Listed date unknown — the age factor uses the snapshot median of ' + RADAR.median_age_days + ' days instead of this protocol\u2019s own age.');
    if (!row.chains || row.chains.length <= 1) risks.push('Live on one chain only — a chain outage or a bridge problem strands the whole position.');
    if (row.tvl_usd < 10000000) risks.push('Small TVL under $10M — one large wallet leaving moves the numbers a lot.');
    var calib = RADAR.calibration.by_category.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    if (calib && calib.thin) risks.push('Its ' + (row.category || 'Other') + ' multiple falls back to the global median — the category has too few live protocols to calibrate on its own.');
    risks.push('A launch is never guaranteed: the implied value is an estimate of what a token would be worth, not a promise that one ships.');
    return risks;
  }

  // The four neighbours in a five-row window centred on it.
  function rivalsFor(row) {
    var idx = row.rank - 1;
    var n = RADAR.rows.length;
    var start = Math.max(0, Math.min(idx - 2, n - 5));
    return RADAR.rows.slice(start, start + 5).filter(function (r) { return r.rank !== row.rank; });
  }
  // One line placing the row against its neighbours, in dollars.
  function rivalNote(row) {
    var idx = row.rank - 1;
    var above = idx > 0 ? RADAR.rows[idx - 1] : null;
    var below = idx + 1 < RADAR.rows.length ? RADAR.rows[idx + 1] : null;
    var bits = [];
    if (below) bits.push('Rank ' + row.rank + ' sits ' + usdExact(row.implied_value_usd - below.implied_value_usd) + ' above rank ' + below.rank);
    if (above) bits.push(usdExact(above.implied_value_usd - row.implied_value_usd) + ' below rank ' + above.rank);
    return bits.join(' and ') + '.';
  }

  function loadHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) view.q = params.get('q');
    if (params.get('category')) view.category = params.get('category');
    if (params.get('chain')) view.chain = params.get('chain');
    if (params.get('tvl')) view.tvlMin = params.get('tvl');
    if (params.get('growth')) view.growth = params.get('growth');
    if (params.get('tab')) view.tab = params.get('tab');
    if (params.get('wl') === '1') view.watchlistOnly = true;
    if (params.get('early') === '1') view.earlyOnly = true;
    if (params.get('p')) view.selected = params.get('p');
  }
  function saveHash() {
    var params = new URLSearchParams();
    if (view.q) params.set('q', view.q);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.chain !== 'all') params.set('chain', view.chain);
    if (view.tvlMin !== '0') params.set('tvl', view.tvlMin);
    if (view.growth !== 'all') params.set('growth', view.growth);
    if (view.tab !== 'pre-token') params.set('tab', view.tab);
    if (view.watchlistOnly) params.set('wl', '1');
    if (view.earlyOnly) params.set('early', '1');
    if (view.selected) params.set('p', view.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function visibleRows() {
    var q = view.q.trim().toLowerCase();
    var tvlMin = Number(view.tvlMin) || 0;
    return RADAR.rows.filter(function (r) {
      if (view.category !== 'all' && (r.category || 'Other') !== view.category) return false;
      if (view.chain !== 'all' && (r.chains || []).indexOf(view.chain) < 0) return false;
      if (r.tvl_usd < tvlMin) return false;
      if (view.growth === 'growing' && !(r.change_7d !== null && r.change_7d > 0)) return false;
      if (view.growth === 'fast' && !(r.change_7d !== null && r.change_7d > 10)) return false;
      if (view.growth === 'declining' && !(r.change_7d !== null && r.change_7d < 0)) return false;
      if (view.watchlistOnly && !r.on_watchlist) return false;
      if (view.earlyOnly && r.on_watchlist) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function orderedRows(list) {
    var key = view.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else if (key === 'confidence') { av = a.confidence_score; bv = b.confidence_score; }
      else if (key === 'cost') { av = farmTotals(a).total_upfront; bv = farmTotals(b).total_upfront; }
      else if (key === 'factors') { av = a.category_multiple * a.growth_multiplier * a.maturity_multiplier * a.breadth_multiplier; bv = b.category_multiple * b.growth_multiplier * b.maturity_multiplier * b.breadth_multiplier; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -view.dir;
      if (av > bv) return view.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function topBar() {
    var meta = document.getElementById('top-meta');
    meta.textContent = '';
    meta.appendChild(mk('span', null, 'Snapshot ', mk('b', { text: RADAR.as_of })));
    meta.appendChild(mk('span', null, 'DefiLlama protocol index'));
    meta.appendChild(mk('span', null, 'Model ', mk('b', { text: RADAR.model_version })));
  }

  function introBlock() {
    var text = document.getElementById('lede-text');
    text.textContent = RADAR.watchlist_size + ' watchlist + ' + RADAR.early_size +
      ' early pre-token protocols, ranked by implied launch value, strongest first.';
    var facts = document.getElementById('facts');
    facts.textContent = '';
    facts.appendChild(mk('span', { class: 'fact-inline' }, 'Watchlist covered ', mk('b', { text: RADAR.watchlist_size + ' / ' + RADAR.watchlist_size })));
    facts.appendChild(mk('span', { class: 'fact-inline' }, 'Pre-token rows ', mk('b', { text: String(RADAR.board_size) })));
    facts.appendChild(mk('span', { class: 'fact-inline' }, 'Top-10 implied value ', mk('b', { text: usdShort(RADAR.total_implied_top10_usd) })));
    facts.appendChild(mk('span', { class: 'fact-inline' }, 'Live-token set aside ', mk('b', { text: String(RADAR.live_size) })));
  }

  function selectBox(id, label, options, value, onchange) {
    var sel = mk('select', { id: id, 'aria-label': label },
      options.map(function (o) { return mk('option', { value: o[0], text: o[1], selected: o[0] === value ? 'selected' : null }); })
    );
    sel.addEventListener('change', function () { onchange(sel.value); saveHash(); drawTable(); });
    return mk('div', { class: 'field' }, mk('label', { for: id, text: label }), sel);
  }

  function filterBar() {
    var slot = document.getElementById('controls');
    slot.textContent = '';
    var cats = Array.from(new Set(RADAR.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainList = Array.from(new Set(RADAR.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var searchBox = mk('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: view.q, 'aria-label': 'Search the board' });
    searchBox.addEventListener('input', function () { view.q = searchBox.value; saveHash(); drawTable(); });
    var catPick = mk('select', { id: 'category', 'aria-label': 'Filter by category' },
      mk('option', { value: 'all', text: 'All' }),
      cats.map(function (c) { return mk('option', { value: c, text: c, selected: c === view.category ? 'selected' : null }); })
    );
    catPick.addEventListener('change', function () { view.category = catPick.value; saveHash(); drawTable(); });
    var chainPick = mk('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      mk('option', { value: 'all', text: 'All' }),
      chainList.map(function (c) { return mk('option', { value: c, text: c, selected: c === view.chain ? 'selected' : null }); })
    );
    chainPick.addEventListener('change', function () { view.chain = chainPick.value; saveHash(); drawTable(); });
    var wlCheck = mk('input', { type: 'checkbox', id: 'wl', checked: view.watchlistOnly ? 'checked' : null });
    wlCheck.addEventListener('change', function () { view.watchlistOnly = wlCheck.checked; if (wlCheck.checked) view.earlyOnly = false; saveHash(); drawTable(); });
    var earlyCheck = mk('input', { type: 'checkbox', id: 'early', checked: view.earlyOnly ? 'checked' : null });
    earlyCheck.addEventListener('change', function () { view.earlyOnly = earlyCheck.checked; if (earlyCheck.checked) view.watchlistOnly = false; saveHash(); drawTable(); });
    var preBtn = mk('button', { type: 'button', 'aria-pressed': view.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { view.tab = 'pre-token'; saveHash(); drawTable(); } });
    var liveBtn = mk('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { view.tab = 'live'; saveHash(); drawTable(); } });
    slot.appendChild(mk('div', { class: 'field grow' }, mk('label', { for: 'q', text: 'Search' }), searchBox));
    slot.appendChild(mk('div', { class: 'field' }, mk('label', { for: 'category', text: 'Category' }), catPick));
    slot.appendChild(mk('div', { class: 'field' }, mk('label', { for: 'chain', text: 'Chain' }), chainPick));
    slot.appendChild(selectBox('tvl', 'TVL at least', [['0', 'Any'], ['50000000', '$50M+'], ['100000000', '$100M+'], ['500000000', '$500M+'], ['1000000000', '$1B+']], view.tvlMin, function (v) { view.tvlMin = v; }));
    slot.appendChild(selectBox('growth', '7-day growth', [['all', 'Any'], ['growing', 'Growing > 0%'], ['fast', 'Fast > +10%'], ['declining', 'Declining < 0%']], view.growth, function (v) { view.growth = v; }));
    slot.appendChild(mk('div', { class: 'checks' },
      mk('label', null, wlCheck, 'Watchlist only'),
      mk('label', null, earlyCheck, 'Early only')
    ));
    slot.appendChild(mk('div', { class: 'field' }, mk('span', { class: 'sub', text: 'Token status' }), mk('div', { class: 'tabs' }, preBtn, liveBtn)));
    slot.appendChild(mk('span', { class: 'count', id: 'count' }));
  }

  // Board insights: three panels from the board's own figures.
  function insightPanels() {
    var slot = document.getElementById('insights-slot');
    if (!slot) return;
    slot.textContent = '';
    var movers = RADAR.rows.filter(function (r) { return r.change_7d !== null && r.change_7d !== undefined; })
      .slice().sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 6);
    var catTvl = {};
    RADAR.rows.forEach(function (r) { var k = r.category || 'Other'; if (!catTvl[k]) catTvl[k] = { tvl: 0, count: 0 }; catTvl[k].tvl += r.tvl_usd; catTvl[k].count += 1; });
    var catRows = Object.keys(catTvl).map(function (k) { return { name: k, tvl: catTvl[k].tvl, count: catTvl[k].count }; })
      .sort(function (a, b) { return b.tvl - a.tvl; }).slice(0, 6);
    var topCatTvl = catRows.length ? catRows[0].tvl : 1;
    var mixCounts = { High: 0, Medium: 0, Low: 0 };
    RADAR.rows.forEach(function (r) { mixCounts[r.confidence_band]++; });
    var wlRows = RADAR.rows.filter(function (r) { return r.on_watchlist; }).length;
    var noGrowth = RADAR.rows.filter(function (r) { return r.change_7d === null || r.change_7d === undefined; }).length;
    var noAge = RADAR.rows.filter(function (r) { return r.age_days === null || r.age_days === undefined; }).length;
    slot.appendChild(mk('div', { class: 'insight' },
      mk('h3', { text: 'Fastest movers — 7-day TVL growth' }),
      mk('ul', { class: 'movers' }, movers.map(function (r) {
        return mk('li', null,
          mk('button', { type: 'button', onclick: function () { showDetail(r.slug); } }, mk('b', { text: '#' + r.rank + ' ' + r.name })),
          mk('span', { class: 'num sub', text: usdShort(r.tvl_usd) }),
          mk('span', { class: 'num ' + (r.change_7d >= 0 ? 'pos' : 'neg'), text: pctText(r.change_7d) })
        );
      }))
    ));
    slot.appendChild(mk('div', { class: 'insight' },
      mk('h3', { text: 'TVL by category — where the money sits' }),
      mk('ul', { class: 'catbars' }, catRows.map(function (c) {
        return mk('li', null,
          mk('span', { class: 'catname', text: c.name + ' (' + c.count + ')' }),
          mk('span', { class: 'bar', 'aria-hidden': 'true' }, mk('i', { style: 'width:' + Math.max(3, Math.round((c.tvl / topCatTvl) * 100)) + '%' })),
          mk('span', { class: 'num', text: usdShort(c.tvl) })
        );
      }))
    ));
    slot.appendChild(mk('div', { class: 'insight' },
      mk('h3', { text: 'Confidence mix — how solid the record is' }),
      mk('div', { class: 'mix' },
        mk('div', null, mk('b', { class: 'num conf-high', text: String(mixCounts.High) }), mk('span', { text: 'High' })),
        mk('div', null, mk('b', { class: 'num conf-med', text: String(mixCounts.Medium) }), mk('span', { text: 'Medium' })),
        mk('div', null, mk('b', { class: 'num conf-low', text: String(mixCounts.Low) }), mk('span', { text: 'Low' }))
      ),
      mk('p', { class: 'mix-note', text: wlRows + ' watchlist · ' + (RADAR.board_size - wlRows) + ' early · ' +
        'confidence is the snapshot record behind each value: growth reported, age known, ' +
        'category calibrated, more than one chain. ' + noGrowth + ' rows lack 7-day growth and ' +
        noAge + ' lack a listed date — those scores use flat growth and the median age.' })
    ));
    // The model at a glance, for a quick sanity check of any row.
    slot.appendChild(mk('div', { class: 'model-strip' },
      mk('span', { class: 'strip-label', text: 'Model at a glance' }),
      mk('code', { text: 'implied = TVL x category multiple x growth(0.8) x log-maturity x log-breadth' }),
      mk('span', { text: 'median age ' + RADAR.median_age_days + 'd · global multiple ' + RADAR.calibration.global_median.toFixed(3) + ' · ' + RADAR.calibration.global_live_count + ' live protocols calibrate it' }),
      mk('span', { text: 'top-10 implied ' + usdShort(RADAR.total_implied_top10_usd) + ' · all rows ' + usdShort(RADAR.total_implied_all_usd) }),
      mk('span', { text: 'growth clamped [-15, +30] · maturity floor 0.85 + 0.15 over 365d · breadth +0.05 per ln chain · shrink k=3 · multiple clamped [0.05, 1.50]' })
    ));
  }

  function sortHead(key, label) {
    return mk('th', { scope: 'col' },
      mk('button', { type: 'button', onclick: function () { if (view.sort === key) view.dir = -view.dir; else { view.sort = key; view.dir = -1; } drawTable(); } },
        label,
        view.sort === key ? mk('span', { 'aria-hidden': 'true', text: view.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }
  function liveSortHead(key, label) {
    return mk('th', { scope: 'col' },
      mk('button', { type: 'button', onclick: function () { if (view.liveSort === key) view.liveDir = -view.liveDir; else { view.liveSort = key; view.liveDir = -1; } drawTable(); } },
        label,
        view.liveSort === key ? mk('span', { 'aria-hidden': 'true', text: view.liveDir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function confChip(row) {
    var cls = row.confidence_band === 'High' ? 'conf-high' : row.confidence_band === 'Medium' ? 'conf-med' : 'conf-low';
    return mk('span', { class: 'badge ' + cls, text: row.confidence_band.toUpperCase() + ' ' + row.confidence_score });
  }

  function boardGrid() {
    var list = orderedRows(visibleRows());
    if (list.length === 0) {
      return mk('div', { class: 'panel' }, mk('div', { class: 'empty' },
        mk('h2', { text: 'No protocol matches that filter' }),
        mk('p', { text: 'Clear the search or pick another category to see the board again.' }),
        mk('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { view.q = ''; view.category = 'all'; view.chain = 'all'; view.tvlMin = '0'; view.growth = 'all'; view.watchlistOnly = false; view.earlyOnly = false; saveHash(); drawPage(); } })
      ));
    }
    var top = 0;
    list.forEach(function (r) { if (r.implied_value_usd > top) top = r.implied_value_usd; });
    var bodyRows = mk('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : pctText(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var badges = [];
      if (r.on_watchlist) badges.push(mk('span', { class: 'badge watch', text: 'WATCHLIST' }));
      else badges.push(mk('span', { class: 'badge early', text: 'EARLY' }));
      var totals = farmTotals(r);
      var gaps = r.confidence_reasons.length;
      var chainText = (r.chains && r.chains.length ? (r.chains.length > 2 ? r.chains[0] + ' · +' + (r.chains.length - 1) + ' more' : r.chains.join(', ')) : 'an unnamed chain');
      var tr = mk('tr', {
        'data-selected': view.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { showDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(r.slug); } }
      },
        mk('td', { class: 'num' + (r.rank <= 3 ? ' rank-top' : ''), text: String(r.rank) }),
        mk('td', null, mk('div', { class: 'name' },
          mk('span', null, mk('b', { text: r.name }), badges[0]),
          mk('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + chainText })
        )),
        mk('td', { class: 'num', text: usdShort(r.tvl_usd) }),
        mk('td', { class: 'num ' + growthClass, text: growth }),
        mk('td', { class: 'num', text: ageText(r.age_days) }),
        mk('td', { class: 'num factors', text: r.category_multiple.toFixed(3) + ' x ' + r.growth_multiplier.toFixed(3) + ' x ' + r.maturity_multiplier.toFixed(3) + ' x ' + r.breadth_multiplier.toFixed(3) }),
        mk('td', { class: 'num' }, confChip(r), mk('div', { class: 'sub', text: gaps === 0 ? 'no gaps' : gaps + (gaps === 1 ? ' gap' : ' gaps') })),
        mk('td', { class: 'num', text: '$' + totals.total_upfront + ' · ~' + totals.time_to_first_min + ' min' }),
        mk('td', null, mk('div', { class: 'implied' },
          mk('div', { class: 'bar', 'aria-hidden': 'true' }, mk('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / top) * 100)) + '%' })),
          mk('span', { class: 'num', text: usdShort(r.implied_value_usd) })
        )),
        mk('td', null, mk('span', { class: 'status', text: 'no token' }))
      );
      bodyRows.appendChild(tr);
    });
    return mk('div', { class: 'panel' },
      mk('div', { class: 'table-wrap' },
        mk('table', null,
          mk('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model, confidence, risks and farm plan.' }),
          mk('thead', null, mk('tr', null,
            sortHead('rank', 'Rank'),
            sortHead('name', 'Protocol'),
            sortHead('tvl', 'TVL'),
            sortHead('growth', '7d'),
            sortHead('age', 'Age'),
            sortHead('factors', 'Factors'),
            sortHead('confidence', 'Confidence'),
            sortHead('cost', 'Farm cost'),
            sortHead('implied', 'Implied value'),
            mk('th', { scope: 'col', text: 'Token' })
          )),
          bodyRows
        )
      )
    );
  }

  function liveGrid() {
    var list = RADAR.live.slice().sort(function (a, b) {
      var av = view.liveSort === 'tvl' ? a.tvl_usd : (a.mcap_usd || 0);
      var bv = view.liveSort === 'tvl' ? b.tvl_usd : (b.mcap_usd || 0);
      if (av < bv) return -view.liveDir;
      if (av > bv) return view.liveDir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
    var bodyRows = mk('tbody');
    list.forEach(function (r) {
      bodyRows.appendChild(mk('tr', null,
        mk('td', { class: 'num', text: 'live' }),
        mk('td', null, mk('div', { class: 'name' }, mk('b', { text: r.name }), mk('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        mk('td', { class: 'num', text: usdShort(r.tvl_usd) }),
        mk('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: pctText(r.change_7d) }),
        mk('td', { class: 'num', text: usdShort(r.mcap_usd) }),
        mk('td', null, mk('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return mk('div', { class: 'panel' },
      mk('div', { class: 'table-wrap' },
        mk('table', null,
          mk('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — and their market-cap / TVL ratios calibrate it.' }),
          mk('thead', null, mk('tr', null, mk('th', { scope: 'col', text: 'Status' }), mk('th', { scope: 'col', text: 'Protocol' }), liveSortHead('tvl', 'TVL'), mk('th', { scope: 'col', text: '7d' }), liveSortHead('mcap', 'Market cap'), mk('th', { scope: 'col', text: 'Token' }))),
          bodyRows
        )
      )
    );
  }

  function modelSection() {
    var m = RADAR.model;
    var calib = RADAR.calibration;
    var example = RADAR.worked_example;
    var calibRows = calib.by_category
      .filter(function (c) { return RADAR.rows.some(function (r) { return (r.category || 'Other') === c.category; }); })
      .map(function (c) {
        return mk('tr', null,
          mk('td', { text: c.category }),
          mk('td', { class: 'num', text: String(c.live_count) }),
          mk('td', { class: 'num', text: c.category_median === null ? '—' : c.category_median.toFixed(3) }),
          mk('td', { class: 'num', text: c.multiple.toFixed(3) + (c.thin ? ' *' : '') })
        );
      });
    var workedBox = mk('div', { class: 'worked' },
      mk('h3', { text: 'Worked example — rank 1, ' + example.name }),
      mk('div', { class: 'equation' },
        mk('div', null, mk('span', { text: 'TVL' }), mk('b', { class: 'num', text: usdExact(example.tvl_usd) })),
        mk('div', null, mk('span', { text: 'Category multiple' }), mk('b', { class: 'num', text: 'x ' + example.category_multiple.toFixed(4) })),
        mk('div', null, mk('span', { text: 'Seven-day growth ' + pctText(example.growth_pct) }), mk('b', { class: 'num', text: 'x ' + example.growth_multiplier.toFixed(4) })),
        mk('div', null, mk('span', { text: 'Age with no token (' + (example.age_days === null ? 'unknown, median ' + example.age_used + 'd used' : ageText(example.age_days)) + ')' }), mk('b', { class: 'num', text: 'x ' + example.maturity_multiplier.toFixed(4) })),
        mk('div', null, mk('span', { text: 'Chains (' + example.chains + ')' }), mk('b', { class: 'num', text: 'x ' + example.breadth_multiplier.toFixed(4) })),
        mk('div', { class: 'total' }, mk('span', { text: 'Implied value' }), mk('b', { class: 'num', text: usdExact(example.implied_value_usd) }))
      ),
      mk('p', { class: 'why', text: 'Multiply the five numbers and round: that is the rank-1 implied value, and every row on the board is scored the same way. No protocol name is special-cased anywhere in the model.' })
    );
    return mk('div', null,
      mk('h2', { text: 'How implied value is computed' }),
      mk('p', { text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      mk('div', { class: 'formula' },
        'implied = round( tvl_usd x categoryMultiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + ' + m.maturity_range + ' x ln(1 + age_days) / ln(1 + ' + m.maturity_days + ')) x (1 + ' + m.breadth_per_ln_chain + ' x ln(chains)) )'
      ),
      mk('p', { text: 'TVL, seven-day growth and age come from the snapshot. Age is the time since the protocol was first listed — the best record of how long it has run with no token. The log scale is deliberate: a 90-day protocol still scores 0.89 on maturity, so being early is not punished, and surviving longer earns a premium that fades. An unknown age uses the snapshot\u2019s median rankable age, ' + RADAR.median_age_days + ' days. Chain breadth is logarithmic too: eleven chains add 12%, not 22%.' }),
      workedBox,
      mk('h3', { text: 'Category multiples, calibrated from the live market' }),
      mk('div', { class: 'table-wrap' },
        mk('table', null,
          mk('thead', null, mk('tr', null,
            mk('th', { scope: 'col', text: 'Category' }),
            mk('th', { scope: 'col', text: 'Live protocols' }),
            mk('th', { scope: 'col', text: 'Median mcap / TVL' }),
            mk('th', { scope: 'col', text: 'Multiple used' })
          )),
          mk('tbody', null, calibRows)
        )
      ),
      mk('p', { class: 'calib-note', text: 'Each multiple is the category median market-cap / TVL of its live-token protocols, shrunk toward the global median ' + calib.global_median.toFixed(3) + ' (' + calib.global_live_count + ' live protocols) with ' + m.shrink_k + ' pseudo-observations, then clamped to [' + m.mult_floor + ', ' + m.mult_cap + ']. A category with fewer than ' + m.min_live_for_category + ' live protocols falls back to the global median outright — marked * — and a category with no live comparable uses it too. Thin categories are pulled hard toward the middle: that is the point.' })
    );
  }

  var dlg = document.getElementById('detail');
  dlg.addEventListener('close', function () { view.selected = null; saveHash(); });

  function showDetail(slug) {
    var row = RADAR.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    view.selected = slug;
    saveHash();
    dlg.textContent = '';
    var inner = mk('div', { class: 'detail-inner' });
    var steps = farmPlan(row);
    var recomputed = impliedValue(row, RADAR.model);
    var conf = confidenceFor(row);
    var totals = farmTotals(row);
    var calib = RADAR.calibration.by_category.filter(function (c) { return c.category === (row.category || 'Other'); })[0];
    inner.appendChild(mk('div', { class: 'detail-head' },
      mk('div', null,
        mk('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + RADAR.board_size + (row.on_watchlist ? ' · Watchlist' : ' · Early') }),
        mk('h2', { id: 'detail-title', text: row.name }),
        mk('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · listed ' + (row.listed_at || 'date unknown') })
      ),
      mk('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dlg.close(); } })
    ));
    inner.appendChild(mk('section', { class: 'detail-section farm-summary' },
      mk('h3', { text: 'To farm it — the whole cost, up front' }),
      mk('div', { class: 'summary-grid' },
        mk('div', null, mk('span', { text: 'Capital to stake' }), mk('b', { class: 'num', text: '$' + totals.capital })),
        mk('div', null, mk('span', { text: 'Bridge + gas fees' }), mk('b', { class: 'num', text: 'about $' + totals.fees_usd })),
        mk('div', null, mk('span', { text: 'First position in' }), mk('b', { class: 'num', text: '~' + totals.time_to_first_min + ' min' })),
        mk('div', null, mk('span', { text: 'Hold at least' }), mk('b', { class: 'num', text: totals.hold_days + ' days' }))
      ),
      mk('p', { class: 'why', text: 'Total to open the position: $' + totals.total_upfront + ' on ' + totals.chain +
        ' — $' + totals.capital + ' of capital that stays in the position, plus about $' + totals.fees_usd +
        ' of bridge and gas. The weekly actions then cost about $' + dollars(chainFees(totals.chain).gas_usd) + ' of gas a week.' })
    ));
    // The eight steps sit high: the densest prose in the dialog.
    inner.appendChild(mk('section', { class: 'detail-section' },
      mk('h3', { text: 'Farm plan — eight steps' }),
      mk('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return mk('li', null, mk('b', { text: action }), mk('span', { class: 'cost', text: tail }));
      }))
    ));
    // The ranks around this one, so the reader sees how close the race is.
    var rivals = rivalsFor(row);
    var rivalBody = mk('tbody');
    rivals.forEach(function (r) {
      var rivalRow = mk('tr', { onclick: function () { showDetail(r.slug); } },
        mk('td', { class: 'num', text: '#' + r.rank }),
        mk('td', null, mk('b', { text: r.name })),
        mk('td', { class: 'num implied', text: usdExact(r.implied_value_usd) }),
        mk('td', null, confChip(r))
      );
      rivalBody.appendChild(rivalRow);
    });
    inner.appendChild(mk('section', { class: 'detail-section' },
      mk('h3', { text: 'Nearest rivals — the ranks around it' }),
      mk('div', { class: 'table-wrap' },
        mk('table', null,
          mk('thead', null, mk('tr', null,
            mk('th', { scope: 'col', text: 'Rank' }),
            mk('th', { scope: 'col', text: 'Protocol' }),
            mk('th', { scope: 'col', text: 'Implied value' }),
            mk('th', { scope: 'col', text: 'Confidence' })
          )),
          rivalBody
        )
      ),
      mk('p', { class: 'why', text: rivalNote(row) })
    ));
    inner.appendChild(mk('section', { class: 'detail-section confidence' },
      mk('h3', { text: 'Confidence — how solid the record is' }),
      mk('div', { class: 'conf-line' },
        confChip(row),
        mk('span', { class: 'conf-text', text: conf.score + ' / 100 — the snapshot record behind this value, not the value itself.' })
      ),
      conf.reasons.length
        ? mk('ul', { class: 'risks conf-reasons' }, conf.reasons.map(function (why) { return mk('li', { text: why }); }))
        : mk('p', { class: 'why', text: 'No gaps in the record: growth is reported, the listed date is known, the category is calibrated on its own live protocols, and the protocol runs on more than one chain.' })
    ));
    inner.appendChild(mk('section', { class: 'detail-section' },
      mk('h3', { text: 'Implied value — the model, factor by factor' }),
      mk('div', { class: 'equation' },
        mk('div', null, mk('span', { text: 'TVL' }), mk('b', { class: 'num', text: usdShort(row.tvl_usd) })),
        mk('div', null, mk('span', { text: 'Category multiple' }), mk('b', { class: 'num', text: String(row.category_multiple) })),
        mk('div', null, mk('span', { text: 'Seven-day growth' }), mk('b', { class: 'num', text: pctText(row.change_7d) })),
        mk('div', null, mk('span', { text: 'Growth multiplier' }), mk('b', { class: 'num', text: String(row.growth_multiplier) })),
        mk('div', null, mk('span', { text: 'Age with no token' }), mk('b', { class: 'num', text: ageText(row.age_days) })),
        mk('div', null, mk('span', { text: 'Maturity multiplier' }), mk('b', { class: 'num', text: String(row.maturity_multiplier) })),
        mk('div', null, mk('span', { text: 'Chains' }), mk('b', { class: 'num', text: String((row.chains || []).length) })),
        mk('div', null, mk('span', { text: 'Breadth multiplier' }), mk('b', { class: 'num', text: String(row.breadth_multiplier) })),
        mk('div', { class: 'total' }, mk('span', { text: 'Implied value' }), mk('b', { class: 'num', text: usdShort(row.implied_value_usd) }))
      ),
      mk('p', { class: 'why', text: 'The page recomputes this row as ' + usdShort(recomputed) +
        (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') +
        (calib ? ' Its ' + (row.category || 'Other') + ' multiple of ' + calib.multiple.toFixed(3) + ' comes from ' + calib.live_count + ' live protocol' + (calib.live_count === 1 ? '' : 's') + ' in the category' + (calib.thin ? ', too few to calibrate on, so it falls back to the global median.' : ', median market-cap / TVL ' + (calib.category_median === null ? 'unreported' : calib.category_median.toFixed(3)) + '.') : '') +
        (row.age_days === null ? ' Its listed date is unknown, so the age factor uses the snapshot median of ' + RADAR.median_age_days + ' days.' : '') +
        ' This is an estimate, not a price.' })
    ));
    inner.appendChild(mk('section', { class: 'detail-section' },
      mk('h3', { text: 'Risks and caveats — read before you farm' }),
      mk('ul', { class: 'risks' }, risksOf(row).map(function (r) { return mk('li', { text: r }); }))
    ));
    dlg.appendChild(inner);
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
    } else {
      dlg.setAttribute('open', '');
    }
  }

  function drawTable() {
    var slot = document.getElementById('table-slot');
    slot.textContent = '';
    slot.appendChild(view.tab === 'pre-token' ? boardGrid() : liveGrid());
    var count = document.getElementById('count');
    if (count) count.textContent = view.tab === 'pre-token' ? visibleRows().length + ' rows shown' : RADAR.live.length + ' live-token protocols';
    if (view.selected) showDetail(view.selected);
  }

  function drawPage() {
    topBar();
    introBlock();
    filterBar();
    insightPanels();
    var modelSlot = document.getElementById('model-slot');
    modelSlot.textContent = '';
    modelSlot.appendChild(modelSection());
    document.getElementById('foot-source').textContent = 'Source: ' + RADAR.source;
    document.getElementById('foot-model').textContent = RADAR.model_version;
    drawTable();
    page.setAttribute('aria-busy', 'false');
  }

  loadHash();
  drawPage();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dlg.open) dlg.close();
  });

  // The model's own functions, exposed for inspection (names fixed by the checker).
  window.__RADAR_TEST__ = { impliedOf: impliedValue, farmSteps: farmPlan, risksFor: risksOf, confidenceOf: confidenceFor, farmSummary: farmTotals };
})();
