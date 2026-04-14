import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

patches = []

# ---- 1. Module scope: replace _gmOreLimit with _gmBldLimit (keyed by Grid string) ----
patches.append((
    b'// Persisted at-game-limit ore types -- geos will not auto-send to these\r\n'
    b'var _gmOreLimit = {};\r\n'
    b'try { _gmOreLimit = readSettings(null, \'gmOreLimit\') || {}; } catch (e) {}\r\n'
    b'\r\n'
    b'function _gmSetOreLimit(ore, limited) {\r\n'
    b'    if (limited) {\r\n'
    b'        _gmOreLimit[ore] = true;\r\n'
    b'    } else {\r\n'
    b'        delete _gmOreLimit[ore];\r\n'
    b'    }\r\n'
    b'    try { storeSettings(_gmOreLimit, \'gmOreLimit\'); } catch (e) {}\r\n'
    b'}\r\n',

    b'// Persisted at-game-limit: keyed by building Grid string (per-building, not per-ore)\r\n'
    b'var _gmBldLimit = {};\r\n'
    b'try { _gmBldLimit = readSettings(null, \'gmBldLimit\') || {}; } catch (e) {}\r\n'
    b'\r\n'
    b'function _gmSetBldLimit(grid, limited) {\r\n'
    b'    var key = String(grid);\r\n'
    b'    if (limited) {\r\n'
    b'        _gmBldLimit[key] = true;\r\n'
    b'    } else {\r\n'
    b'        delete _gmBldLimit[key];\r\n'
    b'    }\r\n'
    b'    try { storeSettings(_gmBldLimit, \'gmBldLimit\'); } catch (e) {}\r\n'
    b'}\r\n'
))

# ---- 2. Auto-send watcher: active mines filter -- remove ore-level limit ----
patches.append((
    b'            data.mines.filter(function(m) { return m.Secs > 0 && !_gmOreLimit[m.OreName]; }).forEach(function(m) {\r\n',
    b'            data.mines.filter(function(m) { return m.Secs > 0; }).forEach(function(m) {\r\n'
))

# ---- 3. Auto-send watcher: depleted mines loop -- switch to per-building grid limit ----
patches.append((
    b'            // Auto-send idle geos to depleted mines not at game limit and not already at cap\r\n'
    b'            (data.depletedMines || []).forEach(function(m) {\r\n'
    b'                if (_gmOreLimit[m.OreName]) return;  // at game limit\r\n'
    b'                var searching = data.searchingByOre[m.OreName] || 0;\r\n'
    b'                // Quarry ores: all buildings share one deposit, only 1 geo ever needed\r\n'
    b'                var deplCount = _gmQuarryOres[m.OreName] ? 1 : (data.depletedCountByOre[m.OreName] || 1);\r\n'
    b'                if (searching >= deplCount) return;  // already enough geos\r\n',

    b'            // Auto-send idle geos to depleted mines not at game limit and not already at cap\r\n'
    b'            // Precompute non-limited depleted count per ore (for cap logic)\r\n'
    b'            var _autoNonLimByOre = {};\r\n'
    b'            var _autoQuarryOreSent = {};\r\n'
    b'            (data.depletedMines || []).forEach(function(m) {\r\n'
    b'                if (!_gmBldLimit[String(m.Grid)])\r\n'
    b'                    _autoNonLimByOre[m.OreName] = (_autoNonLimByOre[m.OreName] || 0) + 1;\r\n'
    b'            });\r\n'
    b'            (data.depletedMines || []).forEach(function(m) {\r\n'
    b'                if (_gmBldLimit[String(m.Grid)]) return;  // this building is at game limit\r\n'
    b'                if (_gmQuarryOres[m.OreName] && _autoQuarryOreSent[m.OreName]) return;  // quarry: only 1 geo per ore\r\n'
    b'                var searching = data.searchingByOre[m.OreName] || 0;\r\n'
    b'                var deplCap = _gmQuarryOres[m.OreName] ? 1 : (_autoNonLimByOre[m.OreName] || 1);\r\n'
    b'                if (searching >= deplCap) return;  // already enough geos\r\n'
))

# ---- 4. Auto-send watcher: depleted loop body -- track quarry ore sent ----
patches.append((
    b'                if (!best || !best.IsIdle) return;\r\n'
    b'                autoSendDelay += 1500;\r\n'
    b'                autoSendUsed.push(best.UID);\r\n'
    b'                (function(g, ore, delay) {\r\n'
    b'                    setTimeout(function() { try { _gmSendGeo(g.Spec, ore); } catch(e) {} }, delay);\r\n'
    b'                })(best, m.OreName, autoSendDelay);\r\n'
    b'            });\r\n'
    b'        } catch (e) {}\r\n',

    b'                if (!best || !best.IsIdle) return;\r\n'
    b'                if (_gmQuarryOres[m.OreName]) _autoQuarryOreSent[m.OreName] = true;\r\n'
    b'                autoSendDelay += 1500;\r\n'
    b'                autoSendUsed.push(best.UID);\r\n'
    b'                (function(g, ore, delay) {\r\n'
    b'                    setTimeout(function() { try { _gmSendGeo(g.Spec, ore); } catch(e) {} }, delay);\r\n'
    b'                })(best, m.OreName, autoSendDelay);\r\n'
    b'            });\r\n'
    b'        } catch (e) {}\r\n'
))

# ---- 5. Render: depleted mines section -- switch from ore-limit to per-building grid limit ----
patches.append((
    b'    var depMines = allDepMines;  // all depleted buildings shown here, including those at ore limit\r\n'
    b'\r\n'
    b'    out += \'<div class="gm-section">Depleted Mines (\' + depMines.length + \')</div>\';\r\n'
    b'    if (depMines.length > 0) {\r\n'
    b'        var sendAllBtn = $(\'<button>\').attr({\r\n'
    b'            id: \'gmDepSendAllBtn\',\r\n'
    b'            \'class\': \'btn btn-xs btn-success\'\r\n'
    b'        }).text(\'Send All\').prop(\'outerHTML\');\r\n'
    b'        out += createTableRow([[3, \'Mine\'], [3, \'Ore\'], [2, \'Best Geo\'], [2, sendAllBtn], [2, \'\']], true);\r\n'
    b'        depMines.forEach(function (m) {\r\n'
    b'            var searching   = data.searchingByOre[m.OreName] || 0;\r\n'
    b'            // Quarry ores: all buildings share one deposit; only 1 geo search needed\r\n'
    b'            var deplCap     = _gmQuarryOres[m.OreName] ? 1 : (data.depletedCountByOre[m.OreName] || 1);\r\n'
    b'            var atCap       = searching >= deplCap;\r\n'
    b'            var isLimited   = !!_gmOreLimit[m.OreName];\r\n',

    b'    var depMines = allDepMines;  // all depleted buildings shown here\r\n'
    b'\r\n'
    b'    // Non-limited (not in _gmBldLimit) depleted count per ore, for cap calculations\r\n'
    b'    var nonLimDepByOre = {};\r\n'
    b'    allDepMines.forEach(function(m) {\r\n'
    b'        if (!_gmBldLimit[String(m.Grid)])\r\n'
    b'            nonLimDepByOre[m.OreName] = (nonLimDepByOre[m.OreName] || 0) + 1;\r\n'
    b'    });\r\n'
    b'\r\n'
    b'    out += \'<div class="gm-section">Depleted Mines (\' + depMines.length + \')</div>\';\r\n'
    b'    if (depMines.length > 0) {\r\n'
    b'        var sendAllBtn = $(\'<button>\').attr({\r\n'
    b'            id: \'gmDepSendAllBtn\',\r\n'
    b'            \'class\': \'btn btn-xs btn-success\'\r\n'
    b'        }).text(\'Send All\').prop(\'outerHTML\');\r\n'
    b'        out += createTableRow([[3, \'Mine\'], [3, \'Ore\'], [2, \'Best Geo\'], [2, sendAllBtn], [2, \'\']], true);\r\n'
    b'        depMines.forEach(function (m) {\r\n'
    b'            var searching   = data.searchingByOre[m.OreName] || 0;\r\n'
    b'            var isLimited   = !!_gmBldLimit[String(m.Grid)];\r\n'
    b'            // Cap: quarry=1 geo per ore; non-quarry=1 geo per non-limited depleted building\r\n'
    b'            var nonLimCount = nonLimDepByOre[m.OreName] || 0;\r\n'
    b'            var deplCap     = _gmQuarryOres[m.OreName] ? Math.min(1, nonLimCount) : nonLimCount;\r\n'
    b'            var atCap       = !isLimited && searching >= deplCap;\r\n'
))

# ---- 6. Render: depleted mines -- Clear Limit and At Limit buttons use data-grid ----
patches.append((
    b'            if (isLimited) {\r\n'
    b'                // Ore is at game limit: show soonest returning geo, "At limit" send label, Clear Limit button\r\n'
    b'                bestLabel = soonestBusy\r\n'
    b'                    ? \'<span style="color:#ffaa00">\' + soonestBusy.Name + \' ready in \' + _gmFmt(soonestBusy.RemMs) + \'</span>\'\r\n'
    b'                    : (best ? \'<em>\' + best.Name + \' (busy)</em>\' : \'<span style="color:#999">none</span>\');\r\n'
    b'                sendBtn   = \'<span style="color:#999;font-style:italic;">At limit</span>\';\r\n'
    b'                actionBtn = $(\'<button>\').attr({\r\n'
    b'                    \'class\'   : \'btn btn-xs btn-success gmClearLimitBtn\',\r\n'
    b'                    \'data-ore\': m.OreName\r\n'
    b'                }).text(\'Clear Limit\').prop(\'outerHTML\');\r\n'
    b'            } else if (atCap) {\r\n'
    b'                // Already enough geos searching: show soonest one returning\r\n'
    b'                var busyForOre = data.geos.filter(function(g) { return !g.IsIdle && g.BusyOre === m.OreName; });\r\n'
    b'                var soonestSearching = busyForOre.length > 0\r\n'
    b'                    ? busyForOre.reduce(function(a, b) { return a.RemMs < b.RemMs ? a : b; })\r\n'
    b'                    : null;\r\n'
    b'                bestLabel = soonestSearching\r\n'
    b'                    ? \'<span style="color:#ffaa00">\' + soonestSearching.Name + \' ready in \' + _gmFmt(soonestSearching.RemMs) + \'</span>\'\r\n'
    b'                    : \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
    b'                sendBtn   = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'                actionBtn = $(\'<button>\').attr({\r\n'
    b'                    \'class\'   : \'btn btn-xs btn-default gmMarkLimitBtn\',\r\n'
    b'                    \'data-ore\': m.OreName\r\n'
    b'                }).text(\'At Limit\').prop(\'outerHTML\');\r\n'
    b'            } else {\r\n'
    b'                // Normal: idle geo preferred, else show soonest busy geo that can search this ore\r\n'
    b'                if (best && best.IsIdle) {\r\n'
    b'                    bestLabel = best.Name;\r\n'
    b'                } else if (soonestBusy) {\r\n'
    b'                    bestLabel = \'<span style="color:#aaaaff">\' + soonestBusy.Name + \' ready in \' + _gmFmt(soonestBusy.RemMs) + \'</span>\';\r\n'
    b'                } else {\r\n'
    b'                    bestLabel = \'<span style="color:#999">none</span>\';\r\n'
    b'                }\r\n'
    b'                sendBtn = (best && best.IsIdle)\r\n'
    b'                    ? $(\'<button>\').attr({\r\n'
    b'                        \'class\'   : \'btn btn-xs btn-success gmDepSendBtn\',\r\n'
    b'                        \'data-ore\': m.OreName\r\n'
    b'                      }).text(\'Send Geo\').prop(\'outerHTML\')\r\n'
    b'                    : \'\';\r\n'
    b'                actionBtn = $(\'<button>\').attr({\r\n'
    b'                    \'class\'   : \'btn btn-xs btn-default gmMarkLimitBtn\',\r\n'
    b'                    \'data-ore\': m.OreName\r\n'
    b'                }).text(\'At Limit\').prop(\'outerHTML\');\r\n'
    b'            }\r\n',

    b'            if (isLimited) {\r\n'
    b'                // This building is at game limit: show soonest returning geo + Clear Limit button\r\n'
    b'                bestLabel = soonestBusy\r\n'
    b'                    ? \'<span style="color:#ffaa00">\' + soonestBusy.Name + \' ready in \' + _gmFmt(soonestBusy.RemMs) + \'</span>\'\r\n'
    b'                    : (best ? \'<em>\' + best.Name + \' (busy)</em>\' : \'<span style="color:#999">none</span>\');\r\n'
    b'                sendBtn   = \'<span style="color:#999;font-style:italic;">At limit</span>\';\r\n'
    b'                actionBtn = $(\'<button>\').attr({\r\n'
    b'                    \'class\'   : \'btn btn-xs btn-success gmClearLimitBtn\',\r\n'
    b'                    \'data-grid\': m.Grid\r\n'
    b'                }).text(\'Clear Limit\').prop(\'outerHTML\');\r\n'
    b'            } else if (atCap) {\r\n'
    b'                // Already enough geos searching: show soonest one returning\r\n'
    b'                var busyForOre = data.geos.filter(function(g) { return !g.IsIdle && g.BusyOre === m.OreName; });\r\n'
    b'                var soonestSearching = busyForOre.length > 0\r\n'
    b'                    ? busyForOre.reduce(function(a, b) { return a.RemMs < b.RemMs ? a : b; })\r\n'
    b'                    : null;\r\n'
    b'                bestLabel = soonestSearching\r\n'
    b'                    ? \'<span style="color:#ffaa00">\' + soonestSearching.Name + \' ready in \' + _gmFmt(soonestSearching.RemMs) + \'</span>\'\r\n'
    b'                    : \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
    b'                sendBtn   = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'                actionBtn = $(\'<button>\').attr({\r\n'
    b'                    \'class\'   : \'btn btn-xs btn-default gmMarkLimitBtn\',\r\n'
    b'                    \'data-grid\': m.Grid\r\n'
    b'                }).text(\'At Limit\').prop(\'outerHTML\');\r\n'
    b'            } else {\r\n'
    b'                // Normal: idle geo preferred, else show soonest busy geo that can search this ore\r\n'
    b'                if (best && best.IsIdle) {\r\n'
    b'                    bestLabel = best.Name;\r\n'
    b'                } else if (soonestBusy) {\r\n'
    b'                    bestLabel = \'<span style="color:#aaaaff">\' + soonestBusy.Name + \' ready in \' + _gmFmt(soonestBusy.RemMs) + \'</span>\';\r\n'
    b'                } else {\r\n'
    b'                    bestLabel = \'<span style="color:#999">none</span>\';\r\n'
    b'                }\r\n'
    b'                sendBtn = (best && best.IsIdle)\r\n'
    b'                    ? $(\'<button>\').attr({\r\n'
    b'                        \'class\'   : \'btn btn-xs btn-success gmDepSendBtn\',\r\n'
    b'                        \'data-ore\': m.OreName\r\n'
    b'                      }).text(\'Send Geo\').prop(\'outerHTML\')\r\n'
    b'                    : \'\';\r\n'
    b'                actionBtn = $(\'<button>\').attr({\r\n'
    b'                    \'class\'   : \'btn btn-xs btn-default gmMarkLimitBtn\',\r\n'
    b'                    \'data-grid\': m.Grid\r\n'
    b'                }).text(\'At Limit\').prop(\'outerHTML\');\r\n'
    b'            }\r\n'
))

# ---- 7. Render: At Game Limit section -- per-building rows from _gmBldLimit ----
patches.append((
    b'    // ------ At Game Limit section: one row per ore, no per-building rows ------\r\n'
    b'    var limitedOres = Object.keys(_gmOreLimit);\r\n'
    b'    out += \'<div class="gm-section">At Game Limit (\' + limitedOres.length + \')</div>\';\r\n'
    b'    if (limitedOres.length > 0) {\r\n'
    b'        out += createTableRow([[6, \'Ore\'], [2, \'Best Geo\'], [2, \'Send Anyway\'], [2, \'\']], true);\r\n'
    b'        limitedOres.forEach(function (ore) {\r\n'
    b'            var best = _gmBestGeo(data.geos, ore, []);\r\n'
    b'            var bestLabel = best\r\n'
    b'                ? (best.IsIdle ? best.Name : \'<em>\' + best.Name + \' (busy)</em>\')\r\n'
    b'                : \'<span style="color:#999">none</span>\';\r\n'
    b'            var sendBtn = (best && best.IsIdle)\r\n'
    b'                ? $(\'<button>\').attr({\r\n'
    b'                    \'class\'   : \'btn btn-xs btn-warning gmDepSendBtn\',\r\n'
    b'                    \'data-ore\': ore\r\n'
    b'                  }).text(\'Send Anyway\').prop(\'outerHTML\')\r\n'
    b'                : \'<span style="color:#999">no idle geo</span>\';\r\n'
    b'            var clearBtn = $(\'<button>\').attr({\r\n'
    b'                \'class\'   : \'btn btn-xs btn-success gmClearLimitBtn\',\r\n'
    b'                \'data-ore\': ore\r\n'
    b'            }).text(\'Clear Limit\').prop(\'outerHTML\');\r\n'
    b'            out += createTableRow([\r\n'
    b'                [6, getImageTag(ore, \'18px\') + \'&nbsp;\' + loca.GetText(\'RES\', ore)],\r\n'
    b'                [2, bestLabel],\r\n'
    b'                [2, sendBtn],\r\n'
    b'                [2, clearBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
    b'    } else {\r\n'
    b'        out += \'<div style="color:#999;padding:4px 10px;font-style:italic;">No ores marked at game limit.</div>\';\r\n'
    b'    }\r\n',

    b'    // ------ At Game Limit section: one row per limited BUILDING ------\r\n'
    b'    var limitedBlds = allDepMines.filter(function(m) { return !!_gmBldLimit[String(m.Grid)]; });\r\n'
    b'    out += \'<div class="gm-section">At Game Limit (\' + limitedBlds.length + \')</div>\';\r\n'
    b'    if (limitedBlds.length > 0) {\r\n'
    b'        out += createTableRow([[3, \'Mine\'], [3, \'Ore\'], [2, \'Best Geo\'], [2, \'Send Anyway\'], [2, \'\']], true);\r\n'
    b'        limitedBlds.forEach(function (m) {\r\n'
    b'            var best = _gmBestGeo(data.geos, m.OreName, []);\r\n'
    b'            var bestLabel = best\r\n'
    b'                ? (best.IsIdle ? best.Name : \'<em>\' + best.Name + \' (busy)</em>\')\r\n'
    b'                : \'<span style="color:#999">none</span>\';\r\n'
    b'            var sendBtn = (best && best.IsIdle)\r\n'
    b'                ? $(\'<button>\').attr({\r\n'
    b'                    \'class\'   : \'btn btn-xs btn-warning gmDepSendBtn\',\r\n'
    b'                    \'data-ore\': m.OreName\r\n'
    b'                  }).text(\'Send Anyway\').prop(\'outerHTML\')\r\n'
    b'                : \'<span style="color:#999">no idle geo</span>\';\r\n'
    b'            var clearBtn = $(\'<button>\').attr({\r\n'
    b'                \'class\'   : \'btn btn-xs btn-success gmClearLimitBtn\',\r\n'
    b'                \'data-grid\': m.Grid\r\n'
    b'            }).text(\'Clear Limit\').prop(\'outerHTML\');\r\n'
    b'            var gotoIcon = getImageTag(\'accuracy.png\', \'18px\', \'18px\')\r\n'
    b'                .replace(\'<img\', \'<img id="gmGoto_lim_\' + m.Grid + \'"\')\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'            out += createTableRow([\r\n'
    b'                [3, gotoIcon + \'&nbsp;\' + m.Name],\r\n'
    b'                [3, getImageTag(m.OreName, \'18px\') + \'&nbsp;\' + loca.GetText(\'RES\', m.OreName)],\r\n'
    b'                [2, bestLabel],\r\n'
    b'                [2, sendBtn],\r\n'
    b'                [2, clearBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
    b'    } else {\r\n'
    b'        out += \'<div style="color:#999;padding:4px 10px;font-style:italic;">No buildings marked at game limit.</div>\';\r\n'
    b'    }\r\n'
))

# ---- 8. Event handlers: switch from data-ore to data-grid for limit buttons ----
patches.append((
    b'    // ---- Event: Mark ore as at game limit ----\r\n'
    b'    $(\'.gmMarkLimitBtn\').off(\'click\').on(\'click\', function () {\r\n'
    b'        _gmSetOreLimit($(this).data(\'ore\'), true);\r\n'
    b'        _gmRefresh();\r\n'
    b'    });\r\n'
    b'\r\n'
    b'    // ---- Event: Clear ore game limit ----\r\n'
    b'    $(\'.gmClearLimitBtn\').off(\'click\').on(\'click\', function () {\r\n'
    b'        _gmSetOreLimit($(this).data(\'ore\'), false);\r\n'
    b'        _gmRefresh();\r\n'
    b'    });\r\n',

    b'    // ---- Event: Mark building as at game limit (per-building, keyed by Grid) ----\r\n'
    b'    $(\'.gmMarkLimitBtn\').off(\'click\').on(\'click\', function () {\r\n'
    b'        _gmSetBldLimit($(this).data(\'grid\'), true);\r\n'
    b'        _gmRefresh();\r\n'
    b'    });\r\n'
    b'\r\n'
    b'    // ---- Event: Clear building game limit ----\r\n'
    b'    $(\'.gmClearLimitBtn\').off(\'click\').on(\'click\', function () {\r\n'
    b'        _gmSetBldLimit($(this).data(\'grid\'), false);\r\n'
    b'        _gmRefresh();\r\n'
    b'    });\r\n'
))

# ---- 9. Under-construction detection: add isActive as fallback check ----
patches.append((
    b'            // Buildings still under construction should not appear in Active Mines.\r\n'
    b'            // GetBuildingMode() 1-4 = construction phases (most reliable check).\r\n'
    b'            // IsUpgradeInProgress() catches queued upgrades.\r\n'
    b'            var isUnderConstruction = false;\r\n'
    b'            try { isUnderConstruction = bld.IsUpgradeInProgress(); } catch (e) {}\r\n'
    b'            if (!isUnderConstruction) {\r\n'
    b'                try { var bMode = bld.GetBuildingMode(); if (bMode >= 1 && bMode <= 4) isUnderConstruction = true; } catch (e) {}\r\n'
    b'            }\r\n',

    b'            // Buildings still under construction should not appear in Active Mines.\r\n'
    b'            // Try multiple APIs: IsUpgradeInProgress, GetBuildingMode != 0, or not producing with ore present.\r\n'
    b'            var isUnderConstruction = false;\r\n'
    b'            try { isUnderConstruction = !!bld.IsUpgradeInProgress(); } catch (e) {}\r\n'
    b'            if (!isUnderConstruction) {\r\n'
    b'                try { var bMode = bld.GetBuildingMode(); if (bMode !== 0) isUnderConstruction = true; } catch (e) {}\r\n'
    b'            }\r\n'
    b'            // Fallback: if a non-quarry mine has ore but production isn\'t running, it is still being set up\r\n'
    b'            if (!isUnderConstruction && !isQuarry && !isActive && amt > 0) isUnderConstruction = true;\r\n'
))

ok = True
for i, (old, new) in enumerate(patches, 1):
    count = content.count(old)
    if count != 1:
        print('Patch %d: found %d times (expected 1)' % (i, count))
        ok = False
    else:
        content = content.replace(old, new, 1)
        print('Patch %d OK' % i)

if not ok:
    sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done.')
