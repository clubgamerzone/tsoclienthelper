// Quick Actions -- Create Recruits in one click.
// Access via: Tools -> Quick Actions
//
// Recipe (per Recruit): 1 free Settler (top bar) + BREAD_COST Bread + SWORD_COST Bronze Swords
// Costs are read dynamically from cMilitaryUnitBase / gEconomics; fallback: 1 / 5 / 10.
// Sequence:
//   1. Apply all Bread AddResource packs -> Mayor's House
//   2. Apply all Bronze Sword AddResource packs -> Mayor's House
//   3. Apply all Settler AddResource packs -> Mayor's House
//   4. Open Barracks
// Each Bread pack applied also gives +25 free settlers via Retired Bandits (Provision House).

try { addToolsMenuItem('Quick Actions', _qaMenuHandler); } catch(e) {}

var _qaLastFreeSettlers = 0;  // persists last manually entered free settler count

// --- Logging ---------------------------------------------------------------

function _qaLog(msg) { game.chatMessage('[QA] ' + msg, 'qa'); }

// --- Resource helpers -------------------------------------------------------

function _qaResLabel(key) {
    var label = '';
    try { label = loca.GetText('RES', key); } catch(e) {}
    return label || key;
}

function _qaResKey(substr) {
    var sub = substr.toLowerCase();
    try {
        var vec = game.getResources().GetResources_Vector();
        for (var i = 0; i < vec.length; i++) {
            var key = vec[i].name_string || '';
            var label = _qaResLabel(key);
            if (key.toLowerCase().indexOf(sub) !== -1 || label.toLowerCase().indexOf(sub) !== -1) {
                return key;
            }
        }
    } catch(e) {}
    return null;
}

function _qaAmt(key) {
    if (!key) { return 0; }
    try { return game.getResources().GetResourceAmount(key) || 0; } catch(e) { return 0; }
}

// --- Recruit training costs ------------------------------------------------
// Returns { settler, bread, sword } per 1 Recruit.
// Tries to read from game API; falls back to known values (1, 5, 10).

function _qaRecruitCosts() {
    var fallback = { settler: 1, bread: 5, sword: 10, source: 'hardcoded' };

    // Strategy 1: MilitarySystem::cMilitaryUnitBase -> GetUnitBaseForType('Recruit')
    try {
        var unitBase = swmmo.getDefinitionByName('MilitarySystem::cMilitaryUnitBase')
                            .GetUnitBaseForType('Recruit');
        // Try various cost-vector property names
        var costVec = null;
        var costProps = ['mTrainingCosts_vector', 'mResourceCosts_vector', 'mCosts_vector',
                         'GetTrainingCosts_vector', 'GetResourceCosts_vector'];
        for (var i = 0; i < costProps.length; i++) {
            try {
                var v = unitBase[costProps[i]];
                if (typeof v === 'function') { v = v.call(unitBase); }
                if (v && v.length) { costVec = v; break; }
            } catch(e) {}
        }
        if (costVec && costVec.length) {
            var result = { settler: 0, bread: 0, sword: 0, source: 'cMilitaryUnitBase' };
            var anyHit = false;
            for (var j = 0; j < costVec.length; j++) {
                var entry = costVec[j];
                var resName = '', amt = 0;
                try { resName = entry.name_string || entry.GetName_string() || ''; } catch(e) {}
                try { amt     = entry.amount || entry.GetAmount() || 0; } catch(e) {}
                var rn = resName.toLowerCase();
                if (rn.indexOf('worker') !== -1 || rn.indexOf('settler') !== -1) {
                    result.settler = amt; anyHit = true;
                } else if (rn.indexOf('bread') !== -1 || rn.indexOf('brot') !== -1) {
                    result.bread   = amt; anyHit = true;
                } else if (rn.indexOf('bronze') !== -1 || rn.indexOf('sword') !== -1) {
                    result.sword   = amt; anyHit = true;
                }
            }
            if (anyHit && result.settler > 0) { return result; }
        }
    } catch(e) {}

    // Strategy 2: ServerState::gEconomics -> GetResourcesCreationDefinitionForBuilding('Barracks')
    // (Barracks is not a resource-producing building so this likely returns null, but worth trying)
    try {
        var gEcon = swmmo.getDefinitionByName('ServerState::gEconomics');
        var rcd   = gEcon.GetResourcesCreationDefinitionForBuilding('Barracks');
        if (rcd && rcd.mCosts_vector && rcd.mCosts_vector.length) {
            var r2 = { settler: 0, bread: 0, sword: 0, source: 'gEconomics' };
            var hit2 = false;
            rcd.mCosts_vector.forEach(function(entry) {
                var rn2 = '', am2 = 0;
                try { rn2 = entry.name_string || ''; } catch(e) {}
                try { am2 = entry.amount || 0; } catch(e) {}
                var low = rn2.toLowerCase();
                if (low.indexOf('worker') !== -1 || low.indexOf('settler') !== -1) {
                    r2.settler = am2; hit2 = true;
                } else if (low.indexOf('bread') !== -1) {
                    r2.bread   = am2; hit2 = true;
                } else if (low.indexOf('sword') !== -1 || low.indexOf('bronze') !== -1) {
                    r2.sword   = am2; hit2 = true;
                }
            });
            if (hit2 && r2.settler > 0) { return r2; }
        }
    } catch(e) {}

    return fallback;
}

// Dump Recruit unit base to help discover the correct API property.
function _qaDumpRecruitInfo() {
    _qaLog('--- Recruit unit base probe ---');
    try {
        var unitBase = swmmo.getDefinitionByName('MilitarySystem::cMilitaryUnitBase')
                            .GetUnitBaseForType('Recruit');
        var hits = [];
        for (var k in unitBase) {
            var lk = k.toLowerCase();
            if (lk.indexOf('cost') !== -1 || lk.indexOf('train') !== -1 ||
                lk.indexOf('resourc') !== -1 || lk.indexOf('require') !== -1 ||
                lk.indexOf('price') !== -1) {
                var v = '?';
                try { v = (typeof unitBase[k] === 'function') ? '[fn]' : JSON.stringify(unitBase[k]); } catch(e) { v = '[err]'; }
                hits.push(k + '=' + v);
            }
        }
        if (!hits.length) {
            _qaLog('No cost/train/resource properties found on Recruit unit base.');
        } else {
            hits.forEach(function(h) { _qaLog('unitBase.' + h); });
        }
    } catch(e) { _qaLog('Error: ' + e); }
    var c = _qaRecruitCosts();
    _qaLog('_qaRecruitCosts() -> settler=' + c.settler + ' bread=' + c.bread + ' sword=' + c.sword + ' [' + c.source + ']');
}

// --- Free settler count (top bar, used by Barracks) ------------------------

function _qaFreeSettlers() {
    var tries = [
        function() { return game.gi.mCurrentPlayerZone.GetFreeWorkers_int(); },
        function() { return game.gi.mCurrentPlayerZone.mFreeWorkers; },
        function() { return game.gi.mCurrentPlayerZone.GetHomelessSettlers_int(); },
        function() { return game.gi.mCurrentPlayerZone.mHomeless; },
        function() { return game.gi.mCurrentPlayer.mFreeWorkers; },
        function() { return game.zone.mFreeWorkers; },
        function() { return game.gi.mCurrentPlayerZone.GetSettlers_int(); },
        function() { return game.gi.mCurrentPlayerZone.mSettlers; }
    ];
    for (var i = 0; i < tries.length; i++) {
        try {
            var v = tries[i]();
            if (typeof v === 'number' && !isNaN(v) && v >= 0) { return v; }
        } catch(e) {}
    }
    return null;
}

// --- Star-menu helpers (same pattern as Inventory Tools) --------------------

function _qaGetAddResItems(labelSubstr) {
    var sub = labelSubstr.toLowerCase(), result = [];
    try {
        game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function(item) {
            var t = '';
            try { t = item.GetType(); } catch(e) { return; }
            if (t.indexOf('AddResource') !== 0) { return; }
            var r = '';
            try { r = item.GetResourceName_string(); } catch(e) {}
            var label = '';
            try { label = loca.GetText('RES', t, ['', r]); } catch(e) {}
            if (!label || label === r) { try { label = loca.GetText('RES', r); } catch(e) {} }
            if (!label) { label = r; }
            var haystack = (label + ' ' + t + ' ' + r).toLowerCase();
            if (haystack.indexOf(sub) === -1) { return; }
            var uid1 = 0, uid2 = 0, amt = 1;
            try { uid1 = item.GetUniqueId().uniqueID1; } catch(e) {}
            try { uid2 = item.GetUniqueId().uniqueID2; } catch(e) {}
            try { amt  = item.GetAmount(); }             catch(e) {}
            result.push({ type: t, resName: r, id: uid1 + '_' + uid2, amount: amt });
        });
    } catch(e) {}
    return result;
}

function _qaApplyItemToGrid(id, grid) {
    try {
        var parts = id.split('_');
        var uid   = game.def('Communication.VO::dUniqueID').Create(parts[0], parts[1]);
        game.gi.SendServerAction(61, 0, grid, 1, uid);
    } catch(e) { _qaLog('Apply error: ' + e); }
}

function _qaMayorGrid() {
    var zone = game.gi.mCurrentPlayerZone;
    var candidates = ['MayorHouse', 'Mayorhouse', 'mayorhouse', 'Mayor_House'];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var v = zone.mStreetDataMap.getBuildingsByName_vector(candidates[i]);
            if (v && v.length > 0) { return v[0].GetGrid(); }
        } catch(e) {}
    }
    try {
        var all = zone.mStreetDataMap.GetBuildings_vector();
        for (var b = 0; b < all.length; b++) {
            if (!all[b]) { continue; }
            var n = '';
            try { n = all[b].GetBuildingName_string().toLowerCase(); } catch(e) { continue; }
            if (n.indexOf('mayor') !== -1) { return all[b].GetGrid(); }
        }
    } catch(e) {}
    return null;
}

function _qaApplyAll(resNameSubstr, label, onDone) {
    var items = _qaGetAddResItems(resNameSubstr);
    if (!items.length) {
        _qaLog('No ' + label + ' packs in star menu -- skipping.');
        if (onDone) { onDone(0); }
        return;
    }
    var grid = _qaMayorGrid();
    if (!grid) { _qaLog("Mayor's House not found."); if (onDone) { onDone(0); } return; }

    var totalUnits = items.reduce(function(s, it) { return s + it.amount; }, 0);
    _qaLog('Applying ' + items.length + ' ' + label + ' pack(s) -> ' + totalUnits + ' units...');

    var q = new TimedQueue(800);
    items.forEach(function(item) {
        (function(it) {
            q.add(function() { _qaApplyItemToGrid(it.id, grid); });
        })(item);
    });
    if (onDone) { q.add(function() { onDone(items.length); }); }
    q.run();
}

// --- Building helpers -------------------------------------------------------

function _qaBestBuilding(name) {
    try {
        var vec = game.zone.mStreetDataMap.getBuildingsByName_vector(name);
        if (!vec || !vec.length) { return null; }
        vec.sort(function(a, b) { return b.GetUpgradeLevel() - a.GetUpgradeLevel(); });
        return vec[0];
    } catch(e) { return null; }
}

function _qaOpenBarracks(recAmt) {
    var bld = _qaBestBuilding('Barracks');
    if (!bld) { _qaLog('Barracks not found on island.'); return; }
    game.zone.ScrollToGrid(bld.GetGrid());
    game.gi.SelectBuilding(bld);
    _qaLog('Barracks opened. Train up to ' + recAmt + ' Recruit(s).');
}

// --- Full sequence ----------------------------------------------------------

function _qaExecuteAll() {
    _qaLog('Starting Create Recruits sequence...');
    _qaApplyAll('bread', 'Bread', function() {
        _qaApplyAll('bronze', 'Bronze Sword', function() {
            _qaApplyAll('settler', 'Settler', function() {
                setTimeout(function() {
                    var costs = _qaRecruitCosts();
                    var freeNow = _qaFreeSettlers();
                    if (freeNow === null) { freeNow = _qaLastFreeSettlers || 0; }
                    var liveSword = _qaGetAddResItems('bronze');
                    var liveBread = _qaGetAddResItems('bread');
                    var keySword2 = (liveSword.length ? liveSword[0].resName : null) || _qaResKey('BronzeSword') || 'BronzeSword';
                    var keyBread2 = (liveBread.length ? liveBread[0].resName : null) || _qaResKey('Bread') || 'Bread';
                    var recAmt = Math.min(
                        costs.settler > 0 ? Math.floor(freeNow / costs.settler) : freeNow,
                        costs.bread  > 0 ? Math.floor(_qaAmt(keyBread2) / costs.bread)  : 99999,
                        costs.sword  > 0 ? Math.floor(_qaAmt(keySword2)  / costs.sword)  : 99999
                    );
                    _qaOpenBarracks(recAmt);
                }, 500);
            });
        });
    });
}

// --- Packet interceptor ----------------------------------------------------

var _qaSniffActive = false, _qaSniffSA = null, _qaSniffMsg = null;

function _qaStartSniff(durationMs) {
    if (_qaSniffActive) { _qaLog('Interceptor already running.'); return; }
    _qaSniffActive = true;
    _qaLog('Interceptor ON for ' + (durationMs / 1000) + ' s -- perform your action NOW.');
    try {
        _qaSniffSA = game.gi.SendServerAction;
        game.gi.SendServerAction = function(action, p1, p2, p3, vo) {
            var vs = ''; try { vs = JSON.stringify(vo); } catch(e) { vs = String(vo); }
            _qaLog('SA(' + action + ', ' + p1 + ', ' + p2 + ', ' + p3 + ', ' + vs + ')');
            return _qaSniffSA.apply(game.gi, arguments);
        };
    } catch(e) { _qaLog('Cannot wrap SendServerAction: ' + e); }
    try {
        _qaSniffMsg = game.gi.mClientMessages.SendMessagetoServer;
        game.gi.mClientMessages.SendMessagetoServer = function(type, zone, vo, resp) {
            var vs = ''; try { vs = JSON.stringify(vo); } catch(e) { vs = String(vo); }
            _qaLog('MSG(' + type + ', ' + vs.substring(0, 120) + ')');
            return _qaSniffMsg.apply(game.gi.mClientMessages, arguments);
        };
    } catch(e) { _qaLog('Cannot wrap SendMessagetoServer: ' + e); }
    setTimeout(function() {
        _qaSniffActive = false;
        try { if (_qaSniffSA)  { game.gi.SendServerAction = _qaSniffSA; } } catch(e) {}
        try { if (_qaSniffMsg) { game.gi.mClientMessages.SendMessagetoServer = _qaSniffMsg; } } catch(e) {}
        _qaSniffSA = _qaSniffMsg = null;
        _qaLog('Interceptor OFF.');
    }, durationMs);
}

// --- Debug dumps ------------------------------------------------------------

function _qaDumpResources() {
    try {
        var res = game.getResources(), vec = res.GetResources_Vector(), lines = [];
        for (var i = 0; i < vec.length; i++) {
            var n = vec[i].name_string, a = res.GetResourceAmount(n);
            if (a > 0) { lines.push(n + '=' + a); }
        }
        _qaLog(lines.length ? 'Resources: ' + lines.join(', ') : 'No resources found.');
    } catch(e) { _qaLog('Dump error: ' + e); }
}

function _qaDumpStarMenu() {
    try {
        var lines = [];
        game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function(item) {
            var t = '', r = '', a = '', id = '?';
            try { t  = item.GetType(); }                catch(e) {}
            try { r  = item.GetResourceName_string(); } catch(e) {}
            try { a  = item.GetAmount(); }              catch(e) {}
            try { id = item.GetUniqueId().uniqueID1 + '_' + item.GetUniqueId().uniqueID2; } catch(e) {}
            lines.push(t + ' | ' + r + ' x' + a + ' [' + id + ']');
        });
        if (!lines.length) { _qaLog('Star menu is empty or inaccessible.'); return; }
        _qaLog('Star menu (' + lines.length + ' item(s)):');
        lines.forEach(function(l) { _qaLog('  ' + l); });
    } catch(e) { _qaLog('Star menu dump error: ' + e); }
}

function _qaDumpZoneInfo() {
    _qaLog('--- Zone free settler probe (HINT: tell me what value free settlers shows in top bar) ---');

    // Try broad list of guessed property/method names on zone and player
    var zone   = game.gi.mCurrentPlayerZone;
    var player = game.gi.mCurrentPlayer;
    var targets = [
        { obj: zone,   prefix: 'zone'   },
        { obj: player, prefix: 'player' }
    ];
    var guesses = [
        'mFreeWorkers', 'mHomeless', 'mSettlers', 'mFreeSettlers',
        'mUnemployed', 'mIdleWorkers', 'mAvailableWorkers', 'mAvailableSettlers',
        'mPopulation', 'mTotalWorkers', 'mWorkerCount', 'mSettlerCount',
        'GetFreeWorkers_int', 'GetHomelessSettlers_int', 'GetSettlers_int',
        'GetFreeSettlers_int', 'GetUnemployed_int', 'GetIdleWorkers_int',
        'GetPopulation_int', 'GetAvailableWorkers_int', 'GetTotalWorkers_int',
        'getFreeWorkers', 'getHomeless', 'getSettlers', 'getFreeSettlers'
    ];
    targets.forEach(function(t) {
        guesses.forEach(function(p) {
            try {
                var v = (typeof t.obj[p] === 'function') ? t.obj[p]() : t.obj[p];
                if (v !== undefined && v !== null) {
                    _qaLog(t.prefix + '.' + p + ' = ' + v);
                }
            } catch(e) {}
        });
    });

    // Enumerate ALL numeric properties on zone object looking for plausible settler count
    // (non-zero integers < 50000 -- avoids timestamps/grids)
    _qaLog('--- Enumerating zone numeric properties (0 < val < 5000) ---');
    var hits = [];
    try {
        for (var k in zone) {
            try {
                var val = zone[k];
                if (typeof val === 'number' && val > 0 && val < 5000 && val === Math.floor(val)) {
                    hits.push(k + '=' + val);
                }
            } catch(e) {}
        }
    } catch(e) { _qaLog('zone enum error: ' + e); }
    if (hits.length) {
        hits.forEach(function(h) { _qaLog('zone.' + h); });
    } else {
        _qaLog('No numeric properties found (zone may not be enumerable in AS3).');
    }

    // Same for player object
    _qaLog('--- Enumerating player numeric properties (0 < val < 5000) ---');
    var phits = [];
    try {
        for (var pk in player) {
            try {
                var pval = player[pk];
                if (typeof pval === 'number' && pval > 0 && pval < 5000 && pval === Math.floor(pval)) {
                    phits.push(pk + '=' + pval);
                }
            } catch(e) {}
        }
    } catch(e) { _qaLog('player enum error: ' + e); }
    if (phits.length) {
        phits.forEach(function(h) { _qaLog('player.' + h); });
    } else {
        _qaLog('No numeric properties found on player object.');
    }

    _qaLog('_qaFreeSettlers() returned: ' + _qaFreeSettlers());
}

// --- Modal ------------------------------------------------------------------

var _qaTd  = 'style="color:#f0e6cc;border-color:rgba(255,255,255,0.15);vertical-align:middle;padding:5px 8px"';
var _qaTdR = 'style="color:#f0e6cc;border-color:rgba(255,255,255,0.15);vertical-align:middle;padding:5px 8px;text-align:right;font-weight:bold"';
var _qaTh  = 'style="color:#ffe8a0;border-color:rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);padding:5px 8px"';
var _qaThR = 'style="color:#ffe8a0;border-color:rgba(255,255,255,0.15);background:rgba(0,0,0,0.35);padding:5px 8px;text-align:right"';

function _qaMenuHandler() {
    if (!game.gi.isOnHomzone()) {
        showGameAlert('Quick Actions requires being on your home island.');
        return;
    }
    $("div[role='dialog']:not(#qaModal):visible").modal('hide');
    $('#qaModal').remove();

    var costs = _qaRecruitCosts();   // { settler, bread, sword, source }

    var breadPacks   = _qaGetAddResItems('bread');
    var swordPacks   = _qaGetAddResItems('bronze');
    var settlerPacks = _qaGetAddResItems('settler');

    var keyBread = (breadPacks.length ? breadPacks[0].resName : null) || _qaResKey('Bread') || 'Bread';
    var keySword = (swordPacks.length ? swordPacks[0].resName : null) || _qaResKey('BronzeSword') || 'BronzeSword';

    var freeSettlersAuto = _qaFreeSettlers();  // null if API not found
    var bread            = _qaAmt(keyBread);
    var bronzeSwords     = _qaAmt(keySword);

    var breadUnits   = breadPacks.reduce(function(s, i) { return s + i.amount; }, 0);
    var swordUnits   = swordPacks.reduce(function(s, i) { return s + i.amount; }, 0);
    var settlerUnits = settlerPacks.reduce(function(s, i) { return s + i.amount; }, 0);

    // Each bread pack -> +25 free settlers via Retired Bandits
    var SETTLERS_PER_BREAD_PACK = 25;
    var breadDerivedSettlers    = breadPacks.length * SETTLERS_PER_BREAD_PACK;

    // Use auto-detected value if available, otherwise last manually entered value, otherwise 0
    var initFree = (freeSettlersAuto !== null) ? freeSettlersAuto : (_qaLastFreeSettlers || 0);

    // Helper: max recruits given resources and recipe costs
    function maxRec(settlers, breadAmt, swordAmt) {
        return Math.min(
            costs.settler > 0 ? Math.floor(settlers / costs.settler) : settlers,
            costs.bread   > 0 ? Math.floor(breadAmt  / costs.bread)  : breadAmt,
            costs.sword   > 0 ? Math.floor(swordAmt  / costs.sword)  : swordAmt
        );
    }

    var w = new Modal('qaModal', getImageTag('icon_dice.png', '45px') + ' Quick Actions');
    w.create();

    function tdPacks(n, units, note) {
        if (!n) { return '<span style="color:#888">&mdash;</span>'; }
        var s = '<span style="color:#ffe8a0">' + n + ' pack' + (n !== 1 ? 's' : '') + '</span>' +
                ' <small style="color:#aaa">(+' + units + ')</small>';
        if (note) { s += ' <small style="color:#7dff7d"> ' + note + '</small>'; }
        return s;
    }

    var autoNote = (freeSettlersAuto !== null)
        ? ' <small style="color:#7dff7d">(auto)</small>'
        : ' <small style="color:#f88">(enter from top bar)</small>';

    var recipeNote = '1 Settler + ' + costs.bread + ' Bread + ' + costs.sword + ' Bronze Swords = 1 Recruit';
    if (costs.source === 'hardcoded') {
        recipeNote += ' <small style="color:#f88">(hardcoded)</small>';
    }

    var html = [
        '<div style="padding:4px 6px">',

        '<h5 style="color:#fff;margin-top:0;margin-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.2);padding-bottom:6px">',
          'Create Recruits',
        '</h5>',
        '<p style="color:#aaa;font-size:11px;margin:0 0 8px 0">' + recipeNote + '</p>',

        // Free settler input row
        '<div style="margin-bottom:8px;display:flex;align-items:center;gap:8px">',
          '<label style="color:#f0e6cc;margin:0;white-space:nowrap">Free Settlers (top bar):</label>',
          '<input id="qa-free-sett" type="number" min="0" value="' + initFree + '"',
          ' style="width:80px;background:#2a2212;color:#ffe8a0;border:1px solid rgba(255,255,255,0.3);border-radius:3px;padding:2px 6px;font-size:13px">',
          autoNote,
        '</div>',

        '<div id="qa-rec-summary" style="color:#f0e6cc;margin-bottom:10px;font-size:13px"></div>',

        '<table style="width:100%;border-collapse:collapse;margin-bottom:10px">',
        '<thead><tr>',
          '<th ' + _qaTh + '>Resource</th>',
          '<th ' + _qaThR + '>In warehouse</th>',
          '<th ' + _qaTh + '>Cost/recruit</th>',
          '<th ' + _qaTh + '>Star menu packs</th>',
        '</tr></thead>',
        '<tbody>',

        '<tr>',
          '<td ' + _qaTd + '>Bread <small style="color:#aaa">(&rarr; +' + SETTLERS_PER_BREAD_PACK + ' settlers/pack)</small></td>',
          '<td ' + _qaTdR + '>' + bread + '</td>',
          '<td ' + _qaTdR + '>' + costs.bread + '</td>',
          '<td ' + _qaTd + '>' + tdPacks(breadPacks.length, breadUnits, breadPacks.length ? '&#8594; +' + breadDerivedSettlers + ' settlers' : '') + '</td>',
        '</tr>',

        '<tr style="background:rgba(0,0,0,0.15)">',
          '<td ' + _qaTd + '>Bronze Swords</td>',
          '<td ' + _qaTdR + '>' + bronzeSwords + '</td>',
          '<td ' + _qaTdR + '>' + costs.sword + '</td>',
          '<td ' + _qaTd + '>' + tdPacks(swordPacks.length, swordUnits) + '</td>',
        '</tr>',

        '<tr>',
          '<td ' + _qaTd + '>Settler packs</td>',
          '<td ' + _qaTdR + '>&mdash;</td>',
          '<td ' + _qaTdR + '>&mdash;</td>',
          '<td ' + _qaTd + '>' + tdPacks(settlerPacks.length, settlerUnits) + '</td>',
        '</tr>',

        '</tbody>',
        '</table>',

        '<button id="qa-exec" class="btn btn-success btn-block" style="margin-bottom:6px">',
          '&#9654;&nbsp; Apply all packs &rarr; Mayor\'s House &rarr; Open Barracks',
        '</button>',

        '<div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.15);padding-top:8px">',
          '<button id="qa-dump-recruit" class="btn btn-default btn-xs">Dump recruit info</button>',
          '&nbsp;<button id="qa-dump-res"     class="btn btn-default btn-xs">Dump resources</button>',
          '&nbsp;<button id="qa-dump-star"    class="btn btn-default btn-xs">Dump star menu</button>',
        '</div>',

        '</div>'
    ].join('');

    $('#qaModalData').html(html);

    function qaUpdateSummary() {
        var freeSett = parseInt($('#qa-free-sett').val(), 10) || 0;
        _qaLastFreeSettlers = freeSett;
        var recNow   = maxRec(freeSett, bread, bronzeSwords);
        var settAfter = freeSett + settlerUnits + breadDerivedSettlers;
        var recAfter  = maxRec(settAfter, bread + breadUnits, bronzeSwords + swordUnits);
        $('#qa-rec-summary').html(
            'Recruits <b style="color:#aaa">now:</b> <b style="color:#ffe8a0">' + recNow + '</b>' +
            ' &nbsp;&rarr;&nbsp; <b style="color:#aaa">after packs:</b> <b style="color:#7dff7d">' + recAfter + '</b>' +
            (breadPacks.length ? ' <small style="color:#aaa">(+' + breadDerivedSettlers + ' settlers from Retired Bandits)</small>' : '')
        );
    }
    qaUpdateSummary();
    $('#qa-free-sett').on('input change', qaUpdateSummary);

    $('#qa-exec').click(function() {
        _qaLastFreeSettlers = parseInt($('#qa-free-sett').val(), 10) || 0;
        $('#qaModal').modal('hide');
        _qaExecuteAll();
    });
    $('#qa-dump-recruit').click(function()  { _qaDumpRecruitInfo(); });
    $('#qa-dump-res').click(function()      { _qaDumpResources(); });
    $('#qa-dump-star').click(function()     { _qaDumpStarMenu(); });

    w.show();
}
