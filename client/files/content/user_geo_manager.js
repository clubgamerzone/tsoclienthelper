// ========== GEOLOGIST MANAGER ==========
// Shows ALL geologists (idle + busy), active mine depletion times,
// depleted deposit count (accurate), and smart-send geologists to mines.
// Tools menu > "Geo Manager"

addToolsMenuItem('Geo Manager', _gmMenuHandler);

var _gmModalInitialized    = false;
var _gmRefreshInterval     = null;
var _gmAutoBuildInterval   = null;
var _gmAutoBuildSeenGrids  = null;   // null = not yet initialized (first tick)
var _gmGeoIdleSince        = {};     // UID -> timestamp (ms) when geo first seen idle; for grace period

// Deposit resource name --> geologist task string 'taskType,subTaskId'
// Values from geoDropSpec in 4-specialists.js
var _gmDepositTask = {
    'Stone':       '0,0',
    'BronzeOre':   '0,1',
    'Marble':      '0,2',
    'IronOre':     '0,3',
    'GoldOre':     '0,4',
    'Coal':        '0,5',
    'Granite':     '0,6',
    'TitaniumOre': '0,7',
    'Salpeter':    '0,8'
};

// Building type numbers for SendServerAction(50, ...) â€” from user_drunken_miner.js
var _gmBuildType = {
    'IronOre':     50,
    'Coal':        37,
    'BronzeOre':   36,
    'GoldOre':     46,
    'TitaniumOre': 69,
    'Salpeter':    63
};

// Construction costs per mine type (IronOre confirmed from game; others estimated â€” correct if wrong)
var _gmBuildCost = {
    'BronzeOre':   [{ name: 'Plank', amount:  30 }, { name: 'Stone', amount:   5 }, { name: 'Tool', amount:  20 }],
    'IronOre':     [{ name: 'Plank', amount: 250 }, { name: 'Stone', amount: 250 }, { name: 'Tool', amount: 200 }],
    'Coal':        [{ name: 'Plank', amount:  60 }, { name: 'Stone', amount:  50 }, { name: 'Tool', amount:  50 }],
    'GoldOre':     [{ name: 'Plank', amount: 150 }, { name: 'Stone', amount: 200 }, { name: 'Tool', amount: 100 }],
    'TitaniumOre': [{ name: 'Plank', amount: 500 }, { name: 'Stone', amount: 500 }, { name: 'Tool', amount: 400 }],
    'Salpeter':    [{ name: 'Plank', amount: 200 }, { name: 'Stone', amount: 300 }, { name: 'Tool', amount: 200 }]
};

// ---- Auto-build watcher: builds new found deposits when affordable ----
function _gmStartAutoBuildWatcher() {
    if (_gmAutoBuildInterval) clearInterval(_gmAutoBuildInterval);
    _gmAutoBuildInterval = setInterval(function () {
        try {
            if ($('#gmModal:visible').length === 0) return;
            if (!game || !game.gi || !game.gi.isOnHomzone || !game.gi.isOnHomzone()) return;
            var data = _gmCollectData();
            var found = data.foundMines || [];

            // Build map of current found-mine grids
            var current = {};
            found.forEach(function (m) { current[m.Grid] = m; });

            if (_gmAutoBuildSeenGrids === null) {
                // First tick: snapshot existing deposits â€” don't build them
                _gmAutoBuildSeenGrids = current;
                return;
            }

            // Detect NEW deposits (in current but not in seen)
            var tooBuild = [];
            Object.keys(current).forEach(function (grid) {
                if (!_gmAutoBuildSeenGrids[grid]) tooBuild.push(current[grid]);
            });

            // Update seen to current state
            _gmAutoBuildSeenGrids = current;

            // Build each new deposit that is affordable
            var buildIdx = 0;
            tooBuild.forEach(function (m) {
                var btype = _gmBuildType[m.OreName];
                if (!btype) return;
                var costs = _gmBuildCost[m.OreName] || [];
                var canAfford = true;
                costs.forEach(function (c) {
                    try {
                        if ((data.resources.GetResourceAmount(c.name) || 0) < c.amount) canAfford = false;
                    } catch (e) { canAfford = false; }
                });
                if (!canAfford) return;
                // Stagger multiple builds 1.5 s apart to avoid server-side rejections
                (function (delay, mine) {
                    setTimeout(function () {
                        try { game.gi.SendServerAction(50, btype, mine.Grid, 0, null); } catch (e) {}
                    }, delay);
                })(buildIdx * 1500, m);
                buildIdx++;
            });

            // Track per-geo idle-since time for grace period (10s after returning, don't auto-send)
            var now = Date.now();
            data.geos.forEach(function(g) {
                if (g.IsIdle) {
                    if (!_gmGeoIdleSince[g.UID]) _gmGeoIdleSince[g.UID] = now;
                } else {
                    delete _gmGeoIdleSince[g.UID];
                }
            });
            var _graceMs = 10000;  // 10s grace period before sending a freshly-returned geo

            // Shared state for both send loops
            var autoSendUsed = [];
            var autoSendDelay = 0;
            var _autoTotalSent = 0;

            if (_gmAutoSendEnabled) {
            // PRIORITY 1: Depleted mines/quarries — always send an idle geo if not at limit and not already at cap
            var _autoNonLimByOre = {};
            var _autoQuarryOreSent = {};
            (data.depletedMines || []).forEach(function(m) {
                if (!_gmBldLimit[String(m.Grid)])
                    _autoNonLimByOre[m.OreName] = (_autoNonLimByOre[m.OreName] || 0) + 1;
            });
            (data.depletedMines || []).forEach(function(m) {
                if (_gmBldLimit[String(m.Grid)]) return;  // this building is at game limit
                if (_gmQuarryOres[m.OreName] && _autoQuarryOreSent[m.OreName]) return;  // quarry: only 1 geo per ore
                if (_gmAutoSendMax > 0 && _autoTotalSent >= _gmAutoSendMax) return;  // cycle limit reached
                var searching = data.searchingByOre[m.OreName] || 0;
                var deplCap = _gmQuarryOres[m.OreName] ? 1 : (_autoNonLimByOre[m.OreName] || 1);
                if (searching >= deplCap) return;  // already enough geos searching for this ore
                var best = _gmBestGeo(data.geos, m.OreName, autoSendUsed);
                if (!best || !best.IsIdle) return;
                if (now - (_gmGeoIdleSince[best.UID] || 0) < _graceMs) return;  // geo just returned, wait
                if (_gmQuarryOres[m.OreName]) _autoQuarryOreSent[m.OreName] = true;
                _autoTotalSent++;
                autoSendDelay += 1500;
                autoSendUsed.push(best.UID);
                (function(g, ore, delay) {
                    setTimeout(function() { try { _gmSendGeo(g.Spec, ore); } catch(e) {} }, delay);
                })(best, m.OreName, autoSendDelay);
            });

            // PRIORITY 2: Active mines — only evaluate the N soonest-depleting active mines where
            // N = number of currently idle geos (no point scanning mines beyond what we can send to).
            // For each mine, find the idle geo whose search time is >= mineLeft AND closest to mineLeft
            // (minimum excess = arrives soonest after depletion, least idle time on the mine).
            var idleGeoCount = data.geos.filter(function(g) { return g.IsIdle && autoSendUsed.indexOf(g.UID) === -1; }).length;
            var activeMines = data.mines.filter(function(m) { return m.Secs > 0; });
            var minesToEval = activeMines.slice(0, idleGeoCount);  // already sorted soonest-depleting first

            minesToEval.forEach(function(m) {
                if (_gmAutoSendMax > 0 && _autoTotalSent >= _gmAutoSendMax) return;  // cycle limit reached
                var mineMsLeft = m.Secs * 1000;

                // Only count already-searching geos that will return AFTER this mine depletes
                var searching = 0;
                data.geos.forEach(function(g) {
                    if (!g.IsIdle && g.BusyOre === m.OreName && autoSendUsed.indexOf(g.UID) === -1 && g.RemMs >= mineMsLeft) searching++;
                });

                // Among idle, not-already-reserved geos: keep only those whose search time >= mineLeft
                // and who have been idle for at least the grace period (not freshly returned)
                var validCandidates = [];
                data.geos.forEach(function(g) {
                    if (!g.IsIdle || autoSendUsed.indexOf(g.UID) >= 0) return;
                    if (now - (_gmGeoIdleSince[g.UID] || 0) < _graceMs) return;  // geo just returned, wait
                    var ms = _gmSearchMs(g.Spec, m.OreName);
                    if (ms >= mineMsLeft) validCandidates.push({ g: g, ms: ms });
                });

                if (validCandidates.length === 0) return;  // no geo arrives after depletion

                // Pick: prefer matching preferred type, then closest match (smallest excess over mineLeft)
                validCandidates.sort(function(a, b) {
                    var aPref = a.g.Pref === m.OreName ? 0 : 1;
                    var bPref = b.g.Pref === m.OreName ? 0 : 1;
                    if (aPref !== bPref) return aPref - bPref;
                    return (a.ms - mineMsLeft) - (b.ms - mineMsLeft);  // closest arrival after depletion
                });
                var best = validCandidates[0].g;
                var geoMs = validCandidates[0].ms;

                var nonLimDep = _autoNonLimByOre[m.OreName] || 0;
                var willDeplete = 0;
                data.mines.forEach(function(n) {
                    if (n.OreName === m.OreName && n.Secs > 0 && n.Secs * 1000 < geoMs) willDeplete++;
                });
                var needs = nonLimDep + willDeplete;
                if (searching >= needs) return;  // already enough valid geos covering this ore

                _autoTotalSent++;
                autoSendDelay += 1500;
                autoSendUsed.push(best.UID);
                (function(g, ore, delay) {
                    setTimeout(function() { try { _gmSendGeo(g.Spec, ore); } catch(e) {} }, delay);
                })(best, m.OreName, autoSendDelay);
            });
            } // end if (_gmAutoSendEnabled)
        } catch (e) {}
    }, 15000); // poll every 15 seconds
}
_gmStartAutoBuildWatcher();

// Persisted preferred-deposit-type per geologist, keyed by UID string
var _gmPrefs = {};
try { _gmPrefs = readSettings(null, 'gmPrefs') || {}; } catch (e) {}

function _gmSavePref(uid, depositName) {
    if (depositName) {
        _gmPrefs[uid] = depositName;
    } else {
        delete _gmPrefs[uid];
    }
    try { storeSettings(_gmPrefs, 'gmPrefs'); } catch (e) {}
}

// Quarry ore types: all buildings share one deposit, so only 1 geo search needed
var _gmQuarryOres = { 'Stone': true, 'Marble': true, 'Granite': true };

// Persisted at-game-limit: keyed by building Grid string (per-building, not per-ore)
var _gmBldLimit = {};
try { _gmBldLimit = readSettings(null, 'gmBldLimit') || {}; } catch (e) {}

function _gmSetBldLimit(grid, limited) {
    var key = String(grid);
    if (limited) {
        _gmBldLimit[key] = true;
    } else {
        delete _gmBldLimit[key];
    }
    try { storeSettings(_gmBldLimit, 'gmBldLimit'); } catch (e) {}
}

// Auto-send toggle and per-cycle geo limit
var _gmAutoSendEnabled = true;
try { _gmAutoSendEnabled = readSettings(null, 'gmAutoSendEnabled') !== false; } catch (e) {}
var _gmAutoSendMax = 0;  // 0 = unlimited
try { _gmAutoSendMax = parseInt(readSettings(null, 'gmAutoSendMax') || '0', 10) || 0; } catch (e) {}

// ---- Format milliseconds as human-readable duration ----
function _gmFmt(ms) {
    if (ms <= 0) return '0s';
    var s  = Math.floor(ms / 1000);
    var d  = Math.floor(s / 86400);
    var h  = Math.floor((s % 86400) / 3600);
    var m  = Math.floor((s % 3600) / 60);
    var sc = s % 60;
    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + ('0' + m).slice(-2) + 'm';
    if (m > 0) return m + 'm ' + ('0' + sc).slice(-2) + 's';
    return sc + 's';
}

// ---- Calculate how long geo takes to search for a deposit type (ms) ----
// Uses the same formula as getTaskDurationText in 4-specialists.js
function _gmSearchMs(spec, depositName) {
    var taskStr = _gmDepositTask[depositName];
    if (!taskStr) return 0;
    var parts = taskStr.split(',');
    try {
        var task = getTaskInfo(parts[0], parts[1]);
        if (!task || !task.duration) return 0;
        var t = task.duration;
        // Apply skill-tree adjustments (same logic as getTaskDurationText)
        try {
            spec.getSkillTree().getItems_vector().concat(spec.skills.getItems_vector()).forEach(function (skill) {
                var vi = skill.getLevel() - 1;
                if (vi < 0) return;
                skill.getDefinition().level_vector[vi].forEach(function (sd) {
                    if ((sd.type_string.length === 0 || sd.type_string === task.taskName + task.subTaskName) &&
                        sd.modifier_string.toLowerCase() === 'searchtime') {
                        t = sd.value !== 0 ? sd.value : (t * sd.multiplier + sd.adder);
                    }
                });
            });
        } catch (e2) {}
        return (t / spec.GetSpecialistDescription().GetTimeBonus()) * 100;
    } catch (e) { return 0; }
}

// ---- Send a geologist to search for a deposit type ----
// Same packet format as sendSpecPacket in 4-specialists.js
function _gmSendGeo(spec, depositName) {
    var taskStr = _gmDepositTask[depositName];
    if (!taskStr) { game.showAlert('Unknown ore: ' + depositName); return; }
    try {
        var arr = taskStr.split(',');
        var pkt     = game.def("Communication.VO::dStartSpecialistTaskVO", true);
        pkt.subTaskID   = arr[1];
        pkt.paramString = "";
        pkt.uniqueID    = spec.GetUniqueID();
        game.gi.SendServerAction(95, arr[0], 0, 0, pkt);
    } catch (e) { game.showAlert('Send error: ' + e); }
}

// ---- Check if player can afford a mine build cost ----
// Returns HTML: green "âœ“ Ready" or red list of "icon have/need" for each missing resource
function _gmCheckCost(oreName, resources) {
    var costs = _gmBuildCost[oreName];
    if (!costs) return '<span style="color:#999">?</span>';
    if (!resources) return '<span style="color:#999">?</span>';
    var missing = [];
    costs.forEach(function (c) {
        try {
            var have = resources.GetResourceAmount(c.name) || 0;
            if (have < c.amount) {
                missing.push(
                    getImageTag(c.name, '14px') + '&nbsp;' +
                    '<span class="gm-urgent">' + have.toLocaleString() + '/' + c.amount.toLocaleString() + '</span>'
                );
            }
        } catch (e) {}
    });
    if (missing.length === 0) return '<span class="gm-ok">&#10003; Ready</span>';
    return missing.join('&nbsp;&nbsp;');
}

// ---- Collect all data from Flash ----
function _gmCollectData() {
    var gi   = game.gi;
    var zone = gi.mCurrentPlayerZone;
    var gEcon = null;
    try { gEcon = swmmo.getDefinitionByName("ServerState::gEconomics"); } catch (e) {}

    // -- All geologists (idle AND busy) --
    var geos = [];
    zone.GetSpecialists_vector().forEach(function (spec) {
        try {
            if (spec.GetBaseType() !== 2) return;   // 2 = GEOLOGIST
            var uid  = spec.GetUniqueID().toKeyString();
            var task = spec.GetTask();
            var idle = (task === null);
            var busyOre = '';
            var remMs   = 0;
            if (!idle) {
                try { busyOre = task.GetDepositToSearch_string(); } catch (e) {}
                try { remMs   = task.GetRemainingTime(); } catch (e) {}
                if (remMs <= 0) { idle = true; busyOre = ''; }  // returning from task
            }
            geos.push({
                Spec:    spec,
                UID:     uid,
                Name:    spec.getName(false).replace(/<[^>]+>/g, ''),
                Icon:    spec.getIconID(),
                IsIdle:  idle,
                BusyOre: busyOre,
                RemMs:   remMs,
                Pref:    _gmPrefs[uid] || ''
            });
        } catch (e) {}
    });
    geos.sort(function (a, b) {
        // Idle geos go to the bottom
        if (a.IsIdle !== b.IsIdle) return a.IsIdle ? 1 : -1;
        // Both busy: sort by remaining time ascending
        if (!a.IsIdle && !b.IsIdle) return a.RemMs - b.RemMs;
        // Both idle: alphabetical
        return a.Name.localeCompare(b.Name);
    });

    // -- Build deposit map (grid -> deposit object) --
    var depositMap = {};
    try {
        var depArr = zone.mStreetDataMap.mDepositContainer.mContainer;
        for (var di = 0; di < depArr.length; di++) {
            if (depArr[di]) depositMap[depArr[di].GetGrid()] = depArr[di];
        }
    } catch (e) {}

    // -- Active mines with ore remaining --
    // Quarry ores: depletion rate is shared across all buildings on the deposit,
    // so per-building calculation via CalculateWays() is unreliable.
    // (_gmQuarryOres is defined at module scope)
    var mines = [];
    var depletedMines = [];
    var claimedDepositGrids = {};  // grids that already have a building on/linked to them
    zone.mStreetDataMap.mBuildingContainer.forEach(function (bld) {
        try {
            // Quarries reference deposit via GetDepositBuildingGridPos(), not their own grid
            var dep = depositMap[bld.GetGrid()] || null;
            if (!dep) {
                try {
                    var depGrid = bld.GetResourceCreation().GetDepositBuildingGridPos();
                    if (depGrid > 0) {
                        dep = depositMap[depGrid] || null;
                        if (dep) claimedDepositGrids[depGrid] = true;
                    }
                } catch (e) {}
            } else {
                claimedDepositGrids[bld.GetGrid()] = true;
            }
            if (!dep) {
                // Exhausted mine buildings lose their deposit reference â€” catch them by name
                try {
                    var exName = bld.GetBuildingName_string();
                    var exUp = exName.toUpperCase();
                    if (exUp.indexOf('DEPLETED') >= 0 || exUp.indexOf('EXHAUSTED') >= 0) {
                        if (exUp.indexOf('FARMFIELD') < 0) {
                            try { if (bld.isGarrison()) return; } catch (e) {}
                            var exOre = null;
                            var exKeys = Object.keys(_gmDepositTask);
                            for (var ki = 0; ki < exKeys.length && !exOre; ki++) {
                                if (exName.indexOf(exKeys[ki]) >= 0) exOre = exKeys[ki];
                            }
                            if (exOre) {
                                var exLvl = 0;
                                try { exLvl = bld.GetUpgradeLevel(); } catch (e) {}
                                depletedMines.push({
                                    Name:    loca.GetText('BUI', exName) + ' L' + exLvl,
                                    OreName: exOre,
                                    Grid:    bld.GetGrid()
                                });
                            }
                        }
                    }
                } catch (e) {}
                return;
            }

            var nameKey = bld.GetBuildingName_string();
            // Skip farmfields and garrisons â€” they aren't real mines
            var nUp = nameKey.toUpperCase();
            if (nUp.indexOf('FARMFIELD') !== -1) return;
            try { if (bld.isGarrison()) return; } catch (e) {}
            var oreName = dep.GetName_string();
            // Only include deposits that geologists can actually search for
            if (!_gmDepositTask[oreName]) return;

            var amt = dep.GetAmount();
            if (amt <= 0) {
                // Depleted mine â€” needs a geologist to replenish
                var lvlD = 0;
                try { lvlD = bld.GetUpgradeLevel(); } catch (e) {}
                depletedMines.push({
                    Name:    loca.GetText('BUI', nameKey) + ' L' + lvlD,
                    OreName: oreName,
                    Grid:    bld.GetGrid()
                });
                return;
            }
            var isQuarry = !!_gmQuarryOres[oreName];
            var secs     = 0;

            if (!isQuarry && gEcon && bld.IsProductionActive()) {
                try {
                    var cMs  = bld.CalculateWays();
                    var cS   = cMs > 0 ? cMs / 1000 : 1;
                    var rcd  = gEcon.GetResourcesCreationDefinitionForBuilding(nameKey);
                    var rem  = rcd ? rcd.amountRemoved : 0;
                    var tot  = bld.GetResourceInputFactor() * rem;
                    var rps  = tot > 0 ? tot / cS : 0;
                    secs     = rps > 0 ? amt / rps : 0;
                } catch (e) {}
            }

            var lvl = 0;
            try { lvl = bld.GetUpgradeLevel(); } catch (e) {}
            var isActive = false;
            try { isActive = bld.IsProductionActive(); } catch (e) {}

            // Buildings still under construction should not appear in Active Mines.
            // GetBuildingMode 1-4 = construction/upgrade phases.
            var isUnderConstruction = false;
            try { isUnderConstruction = !!bld.IsUpgradeInProgress(); } catch (e) {}
            if (!isUnderConstruction) {
                try { var bMode = bld.GetBuildingMode(); if (bMode >= 1 && bMode <= 4) isUnderConstruction = true; } catch (e) {}
            }
            if (isUnderConstruction) {
                foundMines.push({
                    Name:               loca.GetText('BUI', nameKey) + ' L' + lvl,
                    OreName:            oreName,
                    Amt:                amt,
                    Grid:               bld.GetGrid(),
                    IsUnderConstruction: true
                });
                return;
            }

            mines.push({
                Name:     loca.GetText('BUI', nameKey) + ' L' + lvl,
                OreName:  oreName,
                Amt:      amt,
                Secs:     secs,
                IsActive: isActive,
                IsQuarry: isQuarry,
                Grid:     bld.GetGrid()
            });
        } catch (e) {}
    });

    // Sort: soonest depleting first; inactive (secs=0) at bottom
    mines.sort(function (a, b) {
        if (a.Secs === 0 && b.Secs === 0) return a.Name.localeCompare(b.Name);
        if (a.Secs === 0) return 1;
        if (b.Secs === 0) return -1;
        return a.Secs - b.Secs;
    });

    // -- Found deposits: in depositMap, have ore, geo-searchable, but no building built on them yet --
    // Quarry ores (Stone, Marble) always have a quarry building linked via GetDepositBuildingGridPos()
    // Quarry ores excluded from foundMines (defined earlier in this function)
    var foundMines = [];
    for (var fg in depositMap) {
        if (!depositMap.hasOwnProperty(fg)) continue;
        if (claimedDepositGrids[fg]) continue;  // already has a mine building
        try {
            var fd = depositMap[fg];
            if (fd.GetAmount() <= 0) continue;
            var foreName = fd.GetName_string();
            if (!_gmDepositTask[foreName]) continue;
            if (_gmQuarryOres[foreName]) continue;  // quarry ore â€” always has a building, skip
            foundMines.push({ OreName: foreName, Amt: fd.GetAmount(), Grid: parseInt(fg, 10) });
        } catch (e) {}
    }
    foundMines.sort(function (a, b) { return a.OreName.localeCompare(b.OreName); });

    // -- Depleted deposits (accurate count) --
    // 1. Buildings that became depleted husks ("MineDepleted..." name)
    // 2. Deposits still linked to a building but with 0 amount
    var depleted = {};
    try {
        zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
            if (!b) return;
            var bn = b.GetBuildingName_string();
            if (bn.indexOf('Depleted') < 0 && bn.indexOf('depleted') < 0) return;
            // Extract ore name from building name patterns like "GoldOreMineDepletedDeposit"
            var ore = bn.replace(/^.*MineDepletedDeposit/, '').replace(/^.*MineDepleted/, '').trim();
            if (ore) depleted[ore] = (depleted[ore] || 0) + 1;
        });
    } catch (e) {}
    for (var g in depositMap) {
        if (!depositMap.hasOwnProperty(g)) continue;
        try {
            var d = depositMap[g];
            if (d.GetAmount() <= 0) {
                var ore = d.GetName_string();
                depleted[ore] = (depleted[ore] || 0) + 1;
            }
        } catch (e) {}
    }

    // -- Per-ore count of geos currently searching --
    var searchingByOre = {};
    geos.forEach(function (g) {
        if (!g.IsIdle && g.BusyOre) {
            searchingByOre[g.BusyOre] = (searchingByOre[g.BusyOre] || 0) + 1;
        }
    });

    // -- Per-ore count of depleted mine buildings --
    var depletedCountByOre = {};
    depletedMines.forEach(function (m) {
        depletedCountByOre[m.OreName] = (depletedCountByOre[m.OreName] || 0) + 1;
    });

    // -- Player resources for build cost check --
    var resources = null;
    try { resources = game.getResources(); } catch (e) {}

    var activeMinesByOre = {};
    mines.forEach(function(m) {
        if (m.Secs > 0) activeMinesByOre[m.OreName] = (activeMinesByOre[m.OreName] || 0) + 1;
    });

    return { geos: geos, mines: mines, foundMines: foundMines, depletedMines: depletedMines, depleted: depleted,
             searchingByOre: searchingByOre, depletedCountByOre: depletedCountByOre, resources: resources,
             activeMinesByOre: activeMinesByOre };
}

// ---- Pick best idle geologist for an ore type ----
// Priority: 1) idle geo with preferred type matching; 2) any idle geo (shortest search time)
function _gmBestGeo(geos, oreName, excludeUIDs) {
    excludeUIDs = excludeUIDs || [];
    var best = null, bestMs = Infinity, bestIsPref = false;
    geos.forEach(function (g) {
        if (!g.IsIdle || excludeUIDs.indexOf(g.UID) >= 0) return;
        var isPref = g.Pref === oreName;
        var ms = _gmSearchMs(g.Spec, oreName);
        if (!best) {
            best = g; bestMs = ms; bestIsPref = isPref;
        } else if (isPref && !bestIsPref) {
            best = g; bestMs = ms; bestIsPref = true;
        } else if (isPref === bestIsPref && ms < bestMs) {
            best = g; bestMs = ms;
        }
    });
    return best;
}

// ---- Smart Send: send idle geologists to mines with < 2h depletion ----
function _gmSmartSendAll() {
    try {
        var data = _gmCollectData();
        var used = [];
        var queue = [];

        data.mines.forEach(function (m) {
            if (m.Secs === 0 || m.Secs > 7200) return;   // only < 2h mines
            var g = _gmBestGeo(data.geos, m.OreName, used);
            if (!g) return;
            used.push(g.UID);
            queue.push({ spec: g.Spec, ore: m.OreName, geoName: g.Name, mineName: m.Name });
        });

        if (queue.length === 0) {
            game.showAlert('No mines < 2h need a geologist, or no idle geologists available.');
            return;
        }
        queue.forEach(function (item, idx) {
            setTimeout(function () { _gmSendGeo(item.spec, item.ore); }, idx * 1200);
        });
        setTimeout(function () { _gmRefresh(); }, queue.length * 1200 + 800);
        game.showAlert('Sending ' + queue.length + ' geologist(s) to urgent mines...');
    } catch (e) { game.showAlert('Smart send error: ' + e); }
}

// ---- Render data into modal ----
function _gmRender(data) {
    var out = '<div class="container-fluid">';
    var idleCount = data.geos.filter(function (g) { return g.IsIdle; }).length;

    // ------ Active mines summary ------
    var activeByOre = {};
    data.mines.forEach(function (m) {
        if (m.Secs > 0 && _gmDepositTask[m.OreName]) {
            activeByOre[m.OreName] = (activeByOre[m.OreName] || 0) + 1;
        }
    });
    var activeOreKeys = Object.keys(activeByOre);
    if (activeOreKeys.length > 0) {
        var totalActive = 0, activeHtml = '';
        activeOreKeys.forEach(function (ore) {
            totalActive += activeByOre[ore];
            activeHtml += getImageTag(ore, '18px', '18px') + '&nbsp;' + activeByOre[ore] + '&nbsp;&nbsp;';
        });
        out += '<div class="gm-section">Active Mines (' + totalActive + '): ' + activeHtml + '</div>';
    }

    // ------ Depleted deposits summary ------
    var deplKeys = Object.keys(data.depleted);
    if (deplKeys.length > 0) {
        var totalDepleted = 0, deplHtml = '';
        deplKeys.forEach(function (ore) {
            totalDepleted += data.depleted[ore];
            deplHtml += getImageTag(ore, '18px', '18px') + '&nbsp;' + data.depleted[ore] + '&nbsp;&nbsp;';
        });
        var searching = data.geos.filter(function (g) { return !g.IsIdle; }).length;
        out += '<div class="gm-section">Depleted Deposits (' + totalDepleted + '): ' + deplHtml +
               (searching > 0 ? '&nbsp;|&nbsp; <span class="gm-busy">' + searching + ' geo(s) currently searching</span>' : '') + '</div>';
    }

    // ------ Geologists ------
    out += '<div class="gm-section">Geologists &mdash; ' + idleCount + ' idle / ' + data.geos.length + ' total</div>';
    out += createTableRow([
        [4, 'Name'],
        [3, 'Status'],
        [3, 'Preferred Type'],
        [2, 'Typical Search']
    ], true);

    data.geos.forEach(function (g) {
        var statusHtml;
        if (g.IsIdle) {
            statusHtml = '<span class="gm-idle">Idle</span>';
        } else {
            var oreLabel = g.BusyOre ? loca.GetText('RES', g.BusyOre) : '?';
            statusHtml = '<span class="gm-busy">&rarr;&nbsp;' + oreLabel + '<br/><small>' +
                         (g.RemMs > 0 ? _gmFmt(g.RemMs) : '?') + ' remaining</small></span>';
        }

        // Preferred type dropdown
        var sid = 'gmP_' + g.UID.replace(/[^0-9a-z]/gi, '_');
        var dropHtml = '<select id="' + sid + '" class="form-control gmPrefSel" ' +
                       'data-uid="' + g.UID + '" style="font-size:11px;height:auto;padding:0 2px;">';
        dropHtml += '<option value="">&#x2014; none &#x2014;</option>';
        $.each(_gmDepositTask, function (ore) {
            dropHtml += '<option value="' + ore + '"' + (g.Pref === ore ? ' selected' : '') + '>' +
                        loca.GetText('RES', ore) + '</option>';
        });
        dropHtml += '</select>';

        // Typical search time for preferred ore (or busy ore)
        var refOre    = g.Pref || g.BusyOre;
        var searchStr = refOre ? _gmFmt(_gmSearchMs(g.Spec, refOre)) : '&mdash;';

        out += createTableRow([
            [4, getImageTag(g.Icon, '18px') + '&nbsp;' + g.Name],
            [3, statusHtml],
            [3, dropHtml],
            [2, searchStr]
        ]);
    });

    // ------ Depleted Mines ------
    var allDepMines = (data.depletedMines || []).slice();
    allDepMines.sort(function (a, b) { return a.Name.localeCompare(b.Name); });
    var depMines = allDepMines;  // all depleted buildings shown here

    // Non-limited (not in _gmBldLimit) depleted count per ore, for cap calculations
    var nonLimDepByOre = {};
    allDepMines.forEach(function(m) {
        if (!_gmBldLimit[String(m.Grid)])
            nonLimDepByOre[m.OreName] = (nonLimDepByOre[m.OreName] || 0) + 1;
    });

    out += '<div class="gm-section">Depleted Mines (' + depMines.length + ')</div>';
    if (depMines.length > 0) {
        var sendAllBtn = $('<button>').attr({
            id: 'gmDepSendAllBtn',
            'class': 'btn btn-xs btn-success'
        }).text('Send All').prop('outerHTML');
        out += createTableRow([[3, 'Mine'], [3, 'Ore'], [2, 'Best Geo'], [2, sendAllBtn], [2, '']], true);
        depMines.forEach(function (m) {
            var searching   = data.searchingByOre[m.OreName] || 0;
            var isLimited   = !!_gmBldLimit[String(m.Grid)];
            // Cap: quarry=1 geo per ore; non-quarry=1 geo per non-limited depleted building
            var nonLimCount = nonLimDepByOre[m.OreName] || 0;
            var deplCap     = _gmQuarryOres[m.OreName] ? Math.min(1, nonLimCount) : nonLimCount;
            var atCap       = !isLimited && searching >= deplCap;
            var best        = _gmBestGeo(data.geos, m.OreName, []);
            var bestLabel, sendBtn, actionBtn;

            // Soonest busy geo capable of searching this ore type
            var busyCapable = data.geos.filter(function(g) {
                try { return !g.IsIdle && _gmSearchMs(g.Spec, m.OreName) > 0; } catch(e) { return false; }
            });
            var soonestBusy = busyCapable.length > 0
                ? busyCapable.reduce(function(a, b) { return a.RemMs < b.RemMs ? a : b; })
                : null;

            if (isLimited) {
                // This building is at game limit: show soonest returning geo + Clear Limit button
                bestLabel = soonestBusy
                    ? '<span style="color:#ffaa00">' + soonestBusy.Name + ' ready in ' + _gmFmt(soonestBusy.RemMs) + '</span>'
                    : (best ? '<em>' + best.Name + ' (busy)</em>' : '<span style="color:#999">none</span>');
                sendBtn   = '<span style="color:#999;font-style:italic;">At limit</span>';
                actionBtn = $('<button>').attr({
                    'class'   : 'btn btn-xs btn-success gmClearLimitBtn',
                    'data-grid': m.Grid
                }).text('Clear Limit').prop('outerHTML');
            } else if (atCap) {
                // Already enough geos searching: show soonest one returning
                var busyForOre = data.geos.filter(function(g) { return !g.IsIdle && g.BusyOre === m.OreName; });
                var soonestSearching = busyForOre.length > 0
                    ? busyForOre.reduce(function(a, b) { return a.RemMs < b.RemMs ? a : b; })
                    : null;
                bestLabel = soonestSearching
                    ? '<span style="color:#ffaa00">' + soonestSearching.Name + ' ready in ' + _gmFmt(soonestSearching.RemMs) + '</span>'
                    : '<span style="color:#ffaa00">' + searching + ' geo(s) searching</span>';
                sendBtn   = '<span style="color:#999;font-style:italic;">At cap</span>';
                actionBtn = $('<button>').attr({
                    'class'   : 'btn btn-xs btn-default gmMarkLimitBtn',
                    'data-grid': m.Grid
                }).text('At Limit').prop('outerHTML');
            } else {
                // Normal: idle geo preferred, else show soonest busy geo that can search this ore
                if (best && best.IsIdle) {
                    bestLabel = best.Name;
                } else if (soonestBusy) {
                    bestLabel = '<span style="color:#aaaaff">' + soonestBusy.Name + ' ready in ' + _gmFmt(soonestBusy.RemMs) + '</span>';
                } else {
                    bestLabel = '<span style="color:#999">none</span>';
                }
                sendBtn = (best && best.IsIdle)
                    ? $('<button>').attr({
                        'class'   : 'btn btn-xs btn-success gmDepSendBtn',
                        'data-ore': m.OreName
                      }).text('Send Geo').prop('outerHTML')
                    : '';
                actionBtn = $('<button>').attr({
                    'class'   : 'btn btn-xs btn-default gmMarkLimitBtn',
                    'data-grid': m.Grid
                }).text('At Limit').prop('outerHTML');
            }

            var gotoIcon = getImageTag('accuracy.png', '18px', '18px')
                .replace('<img', '<img id="gmGoto_' + m.Grid + '"')
                .replace('style="', 'style="cursor:pointer;vertical-align:middle;');
            out += createTableRow([
                [3, gotoIcon + '&nbsp;' + m.Name],
                [3, getImageTag(m.OreName, '18px') + '&nbsp;' + loca.GetText('RES', m.OreName)],
                [2, bestLabel],
                [2, sendBtn],
                [2, actionBtn]
            ]);
        });
    } else {
        out += '<div style="color:#999;padding:4px 10px;font-style:italic;">No depleted mines found.</div>';
    }

    // ------ At Game Limit section: one row per limited BUILDING ------
    var limitedBlds = allDepMines.filter(function(m) { return !!_gmBldLimit[String(m.Grid)]; });
    out += '<div class="gm-section">At Game Limit (' + limitedBlds.length + ')</div>';
    if (limitedBlds.length > 0) {
        out += createTableRow([[3, 'Mine'], [3, 'Ore'], [2, 'Best Geo'], [2, 'Send Anyway'], [2, '']], true);
        limitedBlds.forEach(function (m) {
            var best = _gmBestGeo(data.geos, m.OreName, []);
            var bestLabel = best
                ? (best.IsIdle ? best.Name : '<em>' + best.Name + ' (busy)</em>')
                : '<span style="color:#999">none</span>';
            var sendBtn = (best && best.IsIdle)
                ? $('<button>').attr({
                    'class'   : 'btn btn-xs btn-warning gmDepSendBtn',
                    'data-ore': m.OreName
                  }).text('Send Anyway').prop('outerHTML')
                : '<span style="color:#999">no idle geo</span>';
            var clearBtn = $('<button>').attr({
                'class'   : 'btn btn-xs btn-success gmClearLimitBtn',
                'data-grid': m.Grid
            }).text('Clear Limit').prop('outerHTML');
            var gotoIcon = getImageTag('accuracy.png', '18px', '18px')
                .replace('<img', '<img id="gmGoto_lim_' + m.Grid + '"')
                .replace('style="', 'style="cursor:pointer;vertical-align:middle;');
            out += createTableRow([
                [3, gotoIcon + '&nbsp;' + m.Name],
                [3, getImageTag(m.OreName, '18px') + '&nbsp;' + loca.GetText('RES', m.OreName)],
                [2, bestLabel],
                [2, sendBtn],
                [2, clearBtn]
            ]);
        });
    } else {
        out += '<div style="color:#999;padding:4px 10px;font-style:italic;">No buildings marked at game limit.</div>';
    }

    var notUrgentMines = data.mines.slice();  // all active mines (urgent coloring handled per-row)
    var foundMines     = data.foundMines || [];

    // Keep legacy alias so _gmSmartSendAll still works
    var otherMines = notUrgentMines;

    // ------ Mines: Not urgent ------
    out += '<div class="gm-section">Mines &mdash; Found / Not Built (' + foundMines.length + ')</div>';
    if (foundMines.length > 0) {
        out += createTableRow([[4, 'Ore'], [2, 'Deposit'], [4, 'Can Build?'], [2, '']], true);
        foundMines.forEach(function (m) {
            var gotoIcon = getImageTag('accuracy.png', '18px', '18px')
                .replace('<img', '<img id="gmGoto_' + m.Grid + '"')
                .replace('style="', 'style="cursor:pointer;vertical-align:middle;');
            if (m.IsUnderConstruction) {
                out += createTableRow([
                    [4, gotoIcon + '&nbsp;' + getImageTag(m.OreName, '18px') + '&nbsp;<strong>' + loca.GetText('RES', m.OreName) + '</strong>'],
                    [2, '<span class="gm-ok">' + m.Amt.toLocaleString() + '</span>'],
                    [4, '<span style="color:#aaffaa">Under Construction</span>'],
                    [2, '']
                ]);
                return;
            }
            var buildBtn = _gmBuildType[m.OreName]
                ? $('<button>').attr({
                    'class'      : 'btn btn-xs btn-primary gmBuildBtn',
                    'data-grid'  : m.Grid,
                    'data-ore'   : m.OreName,
                    'data-btype' : _gmBuildType[m.OreName]
                  }).text('Build Mine').prop('outerHTML')
                : '';
            var costHtml = _gmCheckCost(m.OreName, data.resources);
            out += createTableRow([
                [4, gotoIcon + '&nbsp;' + getImageTag(m.OreName, '18px') + '&nbsp;<strong>' + loca.GetText('RES', m.OreName) + '</strong>'],
                [2, '<span class="gm-ok">' + m.Amt.toLocaleString() + '</span>'],
                [4, costHtml],
                [2, buildBtn]
            ]);
        });
    } else {
        out += '<div style="color:#999;padding:4px 10px;font-style:italic;">No unbuilt deposits found.</div>';
    }

    out += '<div class="gm-section">Mines &mdash; Active (' + notUrgentMines.length + ')</div>';
    if (notUrgentMines.length > 0) {
        out += createTableRow([
            [3, 'Mine'],
            [2, 'Ore'],
            [2, 'Deposit'],
            [2, 'Depletes In'],
            [2, 'Found In'],
            [1, '']
        ], true);
        // Pre-assign searching geos to specific mines (soonest geo -> soonest mine per ore)
        // Mines already sorted by Secs asc; geos sorted by RemMs asc
        var _assignedGeoByGrid = {};
        var _busyGeosByOre = {};
        data.geos.forEach(function(g) {
            if (!g.IsIdle && g.BusyOre) {
                if (!_busyGeosByOre[g.BusyOre]) _busyGeosByOre[g.BusyOre] = [];
                _busyGeosByOre[g.BusyOre].push(g);
            }
        });
        Object.keys(_busyGeosByOre).forEach(function(ore) {
            _busyGeosByOre[ore].sort(function(a, b) { return a.RemMs - b.RemMs; });
        });
        // Only evaluate the top N soonest-depleting active mines where N = idle geo count
        var _idleGeoCount = data.geos.filter(function(g) { return g.IsIdle; }).length;
        var _evaluatedGrids = {};
        var _evalCount = 0;
        notUrgentMines.forEach(function(m) {
            if (m.Secs > 0 && _evalCount < _idleGeoCount) {
                _evaluatedGrids[m.Grid] = true;
                _evalCount++;
            }
        });

        var _oreAssignIdx = {};
        notUrgentMines.forEach(function(m) {
            if (m.Secs <= 0) return;
            var geos = _busyGeosByOre[m.OreName];
            if (!geos || !geos.length) return;
            var mineMsLeft = m.Secs * 1000;
            var idx = _oreAssignIdx[m.OreName] || 0;
            // Skip geos that return before this mine depletes — they arrive while mine is still active and find nothing
            while (idx < geos.length && geos[idx].RemMs < mineMsLeft) idx++;
            if (idx < geos.length) {
                _assignedGeoByGrid[m.Grid] = geos[idx];
                _oreAssignIdx[m.OreName] = idx + 1;
            }
        });

        notUrgentMines.forEach(function (m) {
            var gotoIcon = getImageTag('accuracy.png', '18px', '18px')
                .replace('<img', '<img id="gmGoto_' + m.Grid + '"')
                .replace('style="', 'style="cursor:pointer;vertical-align:middle;');

            var timeStr, foundInStr = '', sendBtn = '';
            // For active mines, only geos that return AFTER the mine depletes count as coverage
            var mineMsLeftCap = m.Secs > 0 ? m.Secs * 1000 : 0;
            var searching = 0;
            data.geos.forEach(function(g) {
                if (!g.IsIdle && g.BusyOre === m.OreName) {
                    if (mineMsLeftCap === 0 || g.RemMs >= mineMsLeftCap) searching++;
                }
            });
            var bestForCap  = _gmBestGeo(data.geos, m.OreName, []);
            var capGeoMs    = bestForCap ? _gmSearchMs(bestForCap.Spec, m.OreName) : 0;
            var depleted    = data.depletedCountByOre[m.OreName] || 0;
            var willDeplete = 0;
            if (capGeoMs > 0) {
                data.mines.forEach(function(n) {
                    if (n.OreName === m.OreName && n.Secs > 0 && n.Secs * 1000 < capGeoMs) willDeplete++;
                });
            }
            var needs       = depleted + willDeplete;
            var atCap       = searching >= needs;

            if (m.Secs <= 0) {
                timeStr = m.IsQuarry && m.IsActive
                    ? '<span style="color:#888">&mdash; (quarry)</span>'
                    : '<span style="color:#999">Mine idle</span>';
                if (searching > 0) {
                var busyForOre = data.geos.filter(function(g) { return !g.IsIdle && g.BusyOre === m.OreName; });
                var minRemMs   = busyForOre.length > 0 ? Math.min.apply(null, busyForOre.map(function(g) { return g.RemMs; })) : 0;
                foundInStr = minRemMs > 0
                    ? '<span style="color:#ffaa00">next geo ready in ' + _gmFmt(minRemMs) + '</span>'
                    : '<span style="color:#ffaa00">' + searching + ' geo(s) searching</span>';
                    sendBtn    = '<span style="color:#999;font-style:italic;">At cap</span>';
                }
            } else {
                var mineMsLeft = m.Secs * 1000;

                // Build candidate list with search time per ore
                var candidates = [];
                data.geos.forEach(function (g) {
                    try {
                        var ms = _gmSearchMs(g.Spec, m.OreName);
                        if (ms > 0) candidates.push({ g: g, ms: ms });
                    } catch (e) {}
                });

                // RED if any geo arrives after depletion
                var anyAfter = candidates.some(function (c) { return c.ms >= mineMsLeft; });
                timeStr = anyAfter
                    ? '<span class="gm-urgent">' + _gmFmt(mineMsLeft) + '</span>'
                    : '<span class="gm-ok">' + _gmFmt(mineMsLeft) + '</span>';

                // Active mine not in the evaluation window — show dash, no coverage info
                if (!_evaluatedGrids[m.Grid]) {
                    foundInStr = '<span style="color:#666">&mdash;</span>';
                } else if (atCap) {
                    var assignedGeo = _assignedGeoByGrid[m.Grid] || null;
                    if (assignedGeo) {
                        foundInStr = '<span style="color:#aaffaa">found in ' + _gmFmt(assignedGeo.RemMs) + ' by ' + assignedGeo.Name + '</span>';
                    } else {
                        // Only count geos that arrive AFTER this mine depletes
                        var validBusy = data.geos.filter(function(g) { return !g.IsIdle && g.BusyOre === m.OreName && g.RemMs >= mineMsLeft; });
                        var minRemMs  = validBusy.length > 0 ? Math.min.apply(null, validBusy.map(function(g) { return g.RemMs; })) : 0;
                        foundInStr = minRemMs > 0
                            ? '<span style="color:#ffaa00">next geo ready in ' + _gmFmt(minRemMs) + '</span>'
                            : '<span style="color:#ffaa00">' + searching + ' geo(s) searching</span>';
                    }
                    sendBtn = '<span style="color:#999;font-style:italic;">At cap</span>';
                } else {
                    // Pick geo whose time is closest to mine depletion, idle preferred on tie
                    candidates.sort(function (a, b) {
                        var da = Math.abs(a.ms - mineMsLeft);
                        var db = Math.abs(b.ms - mineMsLeft);
                        if (da !== db) return da - db;
                        return (b.g.IsIdle ? 1 : 0) - (a.g.IsIdle ? 1 : 0);
                    });
                    var pick = candidates[0] || null;

                    if (searching > 0) {
                        foundInStr = '<span style="color:#ffaa00">' + searching + ' geo(s) searching</span><br/>';
                    }

                    if (pick) {
                        var busyNote     = pick.g.IsIdle ? '' : ' <em>(busy)</em>';
                        var arrivesAfter = pick.ms >= mineMsLeft;
                        var msColor      = arrivesAfter ? 'gm-ok' : 'gm-warn';
                        var nameStyle    = anyAfter ? '' : 'color:#999;';
                        foundInStr += '<span style="' + nameStyle + '">' + pick.g.Name + busyNote + '</span>' +
                            '<br/><small><span class="' + msColor + '">' + _gmFmt(pick.ms) + '</span></small>';
                        // Send button only if idle AND geo barely makes it (or is already too late)
                        if (pick.g.IsIdle && arrivesAfter) {
                            sendBtn = $('<button>').attr({
                                'class'    : 'btn btn-xs btn-warning gmNUSendBtn',
                                'data-uid' : pick.g.UID,
                                'data-ore' : m.OreName
                            }).text('Send').prop('outerHTML');
                        }
                    }
                }
            }
            out += createTableRow([
                [3, gotoIcon + '&nbsp;' + m.Name],
                [2, getImageTag(m.OreName, '18px') + '&nbsp;' + loca.GetText('RES', m.OreName)],
                [2, m.Amt.toLocaleString()],
                [2, timeStr],
                [2, foundInStr],
                [1, sendBtn]
            ]);
        });
    } else {
        out += '<div style="color:#999;padding:4px 10px;font-style:italic;">No other active mines.</div>';
    }

    out += '</div>';
    $('#gmModalData').html(out);

    // ---- Event: save preferred type ----
    $('.gmPrefSel').off('change').on('change', function () {
        _gmSavePref($(this).data('uid'), $(this).val());
    });

    // ---- Event: Send button on a mine row ----
    $('.gmSendBtn').off('click').on('click', function () {
        var uid = $(this).data('uid');
        var ore = $(this).data('ore');
        var fresh = _gmCollectData();
        var geo = null;
        fresh.geos.forEach(function (g) { if (g.UID === uid) geo = g; });
        if (geo && geo.IsIdle) {
            _gmSendGeo(geo.Spec, ore);
            setTimeout(function () { _gmRefresh(); }, 1500);
        } else {
            game.showAlert('Geologist is no longer idle.');
        }
    });

    // ---- Event: Send All button for depleted mines ----
    $('#gmDepSendAllBtn').off('click').on('click', function () {
        try {
            var fresh = _gmCollectData();
            var used  = [];
            var queue = [];

            // Build per-ore count of available (uncapped) depleted slots
            var availByOre = {};
            (fresh.depletedMines || []).forEach(function (m) {
                var searching = fresh.searchingByOre[m.OreName] || 0;
                var deplCount = fresh.depletedCountByOre[m.OreName] || 1;
                if (searching < deplCount) {
                    availByOre[m.OreName] = (availByOre[m.OreName] || 0) + 1;
                }
            });

            // Local searching tracker so phase 2 respects phase 1 assignments
            var searchingNow = {};
            Object.keys(fresh.searchingByOre).forEach(function (ore) {
                searchingNow[ore] = fresh.searchingByOre[ore];
            });

            var idleGeos = fresh.geos.filter(function (g) { return g.IsIdle; });

            // Phase 1: send each idle geo to its preferred ore if there's an uncapped slot
            idleGeos.forEach(function (g) {
                if (!g.Pref || !availByOre[g.Pref] || availByOre[g.Pref] <= 0) return;
                var deplCount = fresh.depletedCountByOre[g.Pref] || 0;
                if ((searchingNow[g.Pref] || 0) >= deplCount) return;
                used.push(g.UID);
                availByOre[g.Pref]--;
                searchingNow[g.Pref] = (searchingNow[g.Pref] || 0) + 1;
                queue.push({ spec: g.Spec, ore: g.Pref });
            });

            // Phase 2: remaining idle geos â†’ best-matching remaining available ore
            idleGeos.forEach(function (g) {
                if (used.indexOf(g.UID) >= 0) return;
                var bestOre = null, bestMs = Infinity;
                Object.keys(availByOre).forEach(function (ore) {
                    if (availByOre[ore] <= 0) return;
                    var ms = _gmSearchMs(g.Spec, ore);
                    if (ms < bestMs) { bestOre = ore; bestMs = ms; }
                });
                if (!bestOre) return;
                used.push(g.UID);
                availByOre[bestOre]--;
                queue.push({ spec: g.Spec, ore: bestOre });
            });

            if (queue.length === 0) {
                game.showAlert('No idle geologists available, or all depleted mines are already at cap.');
                return;
            }
            queue.forEach(function (item, idx) {
                setTimeout(function () { _gmSendGeo(item.spec, item.ore); }, idx * 1200);
            });
            setTimeout(function () { _gmRefresh(); }, queue.length * 1200 + 800);
            game.showAlert('Sending ' + queue.length + ' geologist(s) to depleted mines...');
        } catch (e) { game.showAlert('Send All error: ' + e); }
    });

    // ---- Event: Send Geo button on depleted mine row ----
    $('.gmDepSendBtn').off('click').on('click', function () {
        var ore = $(this).data('ore');
        var fresh = _gmCollectData();
        var geo = _gmBestGeo(fresh.geos, ore, []);
        if (geo && geo.IsIdle) {
            _gmSendGeo(geo.Spec, ore);
            setTimeout(function () { _gmRefresh(); }, 1500);
        } else {
            game.showAlert('No idle geologist available for ' + loca.GetText('RES', ore) + '.');
        }
    });

    // ---- Event: Send Geo button on not-urgent mine row ----
    $('.gmNUSendBtn').off('click').on('click', function () {
        var ore = $(this).data('ore');
        var uid = $(this).data('uid');
        var fresh = _gmCollectData();
        var geo = null;
        fresh.geos.forEach(function (g) { if (g.UID === uid) geo = g; });
        // Fall back to best idle geo for that ore if original is no longer idle
        if (!geo || !geo.IsIdle) geo = _gmBestGeo(fresh.geos, ore, []);
        if (geo && geo.IsIdle) {
            _gmSendGeo(geo.Spec, ore);
            setTimeout(function () { _gmRefresh(); }, 1500);
        } else {
            game.showAlert('No idle geologist available for ' + loca.GetText('RES', ore) + '.');
        }
    });

    // ---- Event: Build Mine button on found deposit row ----
    $('.gmBuildBtn').off('click').on('click', function () {
        var grid  = parseInt($(this).data('grid'), 10);
        var ore   = $(this).data('ore');
        var btype = parseInt($(this).data('btype'), 10);
        try {
            game.gi.SendServerAction(50, btype, grid, 0, null);
            game.showAlert('Building ' + loca.GetText('RES', ore) + ' mine...');
            setTimeout(function () { _gmRefresh(); }, 2000);
        } catch (e) { game.showAlert('Build error: ' + e); }
    });

    // ---- Event: Mark building as at game limit (per-building, keyed by Grid) ----
    $('.gmMarkLimitBtn').off('click').on('click', function () {
        _gmSetBldLimit($(this).data('grid'), true);
        _gmRefresh();
    });

    // ---- Event: Clear building game limit ----
    $('.gmClearLimitBtn').off('click').on('click', function () {
        _gmSetBldLimit($(this).data('grid'), false);
        _gmRefresh();
    });

    // ---- Event: Go-to map ----
    $('[id^="gmGoto_"]').off('click').on('click', function () {
        var grid = parseInt(this.id.replace('gmGoto_', ''), 10);
        try { swmmo.application.mGameInterface.mCurrentPlayerZone.ScrollToGrid(grid); } catch (e) {}
    });
}

// ---- Auto-refresh loop ----
function _gmRefresh() {
    try {
        var data = _gmCollectData();
        _gmRender(data);
    } catch (e) {}

    if (_gmRefreshInterval) clearInterval(_gmRefreshInterval);
    _gmRefreshInterval = setInterval(function () {
        if ($('#gmModal:visible').length > 0) {
            try { _gmRender(_gmCollectData()); } catch (e) {}
        } else {
            clearInterval(_gmRefreshInterval);
            _gmRefreshInterval = null;
        }
    }, 30000);
}

// ---- Menu handler ----
function _gmMenuHandler() {
    if (!game.gi.isOnHomzone()) { game.showAlert('Not in home zone'); return; }
    $("div[role='dialog']:not(#gmModal):visible").modal('hide');
    if (!_gmModalInitialized) $('#gmModal').remove();

    try {
        if ($('#gmModal .modal-header .container-fluid').length === 0) {

            $('#gmStyle').remove();
            $('head').append($('<style>', { id: 'gmStyle' }).text(
                '#gmModal div.row:hover { background-color: #A65329; }' +
                '#gmModal .gm-idle    { color: #66cc66; }' +
                '#gmModal .gm-busy    { color: #ffaa00; }' +
                '#gmModal .gm-ok      { color: #66cc66; }' +
                '#gmModal .gm-warn    { color: #ffaa00; font-weight: bold; }' +
                '#gmModal .gm-urgent  { color: #ff5555; font-weight: bold; }' +
                '#gmModal .gm-section { background: #4a3020; color: #ffcc88; font-weight: bold;' +
                                       ' padding: 4px 10px; margin: 6px 0 2px; border-radius: 4px; }'
            ));

            createModalWindow('gmModal', 'Geo Manager');

            $('#gmModal .modal-header').append(
                '<div class="container-fluid">' +
                $('<button>').attr({ id: 'gmRefreshBtn', 'class': 'btn btn-success' })
                             .text('Refresh').prop('outerHTML') +
                '&nbsp;&nbsp;' +
                $('<button>').attr({ id: 'gmSmartSendBtn', 'class': 'btn btn-warning' })
                             .text('Smart Send (<2h)').prop('outerHTML') +
                '&nbsp;&nbsp;' +
                $('<button>').attr({ id: 'gmAutoSendToggle', 'class': 'btn btn-xs ' + (_gmAutoSendEnabled ? 'btn-success' : 'btn-danger') })
                             .text(_gmAutoSendEnabled ? 'Auto-Send: ON' : 'Auto-Send: OFF').prop('outerHTML') +
                '&nbsp;Max/cycle:&nbsp;<input id="gmAutoSendMax" type="number" min="0" style="width:45px;text-align:center;display:inline-block" value="' + _gmAutoSendMax + '">&nbsp;<small style="color:#999">(0=&#8734;)</small>' +
                '&nbsp;&nbsp;<small style="color:#aaa">Preferred type per geo is saved automatically.</small>' +
                '</div>'
            );

            $('#gmRefreshBtn').click(function () { _gmRefresh(); });
            $('#gmSmartSendBtn').click(function () { _gmSmartSendAll(); });
            $('#gmAutoSendToggle').click(function () {
                _gmAutoSendEnabled = !_gmAutoSendEnabled;
                try { storeSettings(_gmAutoSendEnabled, 'gmAutoSendEnabled'); } catch (e) {}
                $(this).toggleClass('btn-success', _gmAutoSendEnabled)
                       .toggleClass('btn-danger', !_gmAutoSendEnabled)
                       .text(_gmAutoSendEnabled ? 'Auto-Send: ON' : 'Auto-Send: OFF');
            });
            $('#gmAutoSendMax').off('change').on('change', function () {
                _gmAutoSendMax = parseInt($(this).val(), 10) || 0;
                try { storeSettings(_gmAutoSendMax, 'gmAutoSendMax'); } catch (e) {}
            });

            $('#gmModal').on('shown.bs.modal', function () {
                $('#gmModal .modal-dialog').draggable({ handle: '#gmModal .modal-header', containment: 'window' });
            });
            $('#gmModal').on('hidden.bs.modal', function () {
                if (_gmRefreshInterval) { clearInterval(_gmRefreshInterval); _gmRefreshInterval = null; }
            });

            _gmModalInitialized = true;
        }

        _gmRefresh();
    } catch (e) {}

    $('#gmModal:not(:visible)').modal({ backdrop: 'static' });
}

