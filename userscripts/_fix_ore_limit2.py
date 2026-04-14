import sys, re

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

# =========================================================
# Fix 1: Add _gmOreLimit persistence right after _gmSavePref closing brace
# =========================================================
old1 = b'    try { storeSettings(_gmPrefs, \'gmPrefs\'); } catch (e) {}\r\n}\r\n'
new1 = (
    b'    try { storeSettings(_gmPrefs, \'gmPrefs\'); } catch (e) {}\r\n'
    b'}\r\n'
    b'\r\n'
    b'// Persisted at-game-limit ore types -- geos won\'t auto-send to these\r\n'
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
    b'}\r\n'
)
if old1 in content:
    content = content.replace(old1, new1, 1)
    print('Fix 1 (_gmOreLimit) applied OK')
else:
    print('Fix 1: pattern NOT found'); sys.exit(1)

# =========================================================
# Fix 2: Depleted mines render -- split by limit, add Mark Limit btn, add At Game Limit section
# Replace from "var depMines = ..." through the closing "}" of the else block
# =========================================================
old2 = (
    b'    var depMines = (data.depletedMines || []).slice();\r\n'
    b'    depMines.sort(function (a, b) { return a.Name.localeCompare(b.Name); });\r\n'
    b'    out += \'<div class="gm-section">Depleted Mines (\' + depMines.length + \')</div>\';\r\n'
    b'    if (depMines.length > 0) {\r\n'
    b'        var sendAllBtn = $(\'<button>\').attr({\r\n'
    b'            id: \'gmDepSendAllBtn\',\r\n'
    b'            \'class\': \'btn btn-xs btn-success\'\r\n'
    b'        }).text(\'Send All\').prop(\'outerHTML\');\r\n'
    b'        out += createTableRow([[4, \'Mine\'], [3, \'Ore\'], [3, \'Best Geo\'], [2, sendAllBtn]], true);\r\n'
    b'        depMines.forEach(function (m) {\r\n'
    b'            var searching   = data.searchingByOre[m.OreName] || 0;\r\n'
    b'            var deplCount   = data.depletedCountByOre[m.OreName] || 1;\r\n'
    b'            var atCap       = searching >= deplCount;  // enough geos already cover all depleted spots\r\n'
    b'            var best        = _gmBestGeo(data.geos, m.OreName, []);\r\n'
    b'            var bestLabel, sendBtn;\r\n'
    b'            if (atCap) {\r\n'
    b'                // All depleted slots for this ore already have a geo assigned \xe2\x80\x93\xe2\x86\x92 would fail with "too many"\r\n'
    b'                bestLabel = \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
    b'                sendBtn   = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'            } else {\r\n'
    b'                bestLabel = best\r\n'
    b'                    ? (best.IsIdle ? best.Name : \'<em>\' + best.Name + \' (busy)</em>\')\r\n'
    b'                    : \'<span style="color:#999">none</span>\';\r\n'
    b'                sendBtn = (best && best.IsIdle)\r\n'
    b'                    ? $(\'<button>\').attr({\r\n'
    b'                        \'class\'   : \'btn btn-xs btn-success gmDepSendBtn\',\r\n'
    b'                        \'data-ore\': m.OreName\r\n'
    b'                      }).text(\'Send Geo\').prop(\'outerHTML\')\r\n'
    b'                    : \'\';\r\n'
    b'            }\r\n'
    b'            var gotoIcon = getImageTag(\'accuracy.png\', \'18px\', \'18px\')\r\n'
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\' )\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'            out += createTableRow([\r\n'
    b'                [4, gotoIcon + \'&nbsp;\' + m.Name],\r\n'
    b'                [3, getImageTag(m.OreName, \'18px\') + \'&nbsp;\' + loca.GetText(\'RES\', m.OreName)],\r\n'
    b'                [3, bestLabel],\r\n'
    b'                [2, sendBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
    b'    } else {\r\n'
    b'        out += \'<div style="color:#999;padding:4px 10px;font-style:italic;">No depleted mines found.</div>\';\r\n'
    b'    }\r\n'
)

if old2 not in content:
    idx = content.find(b'    var depMines = (data.depletedMines || []).slice();')
    print('Fix 2: block start at byte', idx)
    print(repr(content[idx:idx+300]))
    sys.exit(1)

new2 = (
    b'    var allDepMines = (data.depletedMines || []).slice();\r\n'
    b'    allDepMines.sort(function (a, b) { return a.Name.localeCompare(b.Name); });\r\n'
    b'    var depMines     = allDepMines.filter(function (m) { return !_gmOreLimit[m.OreName]; });\r\n'
    b'    var limitedMines = allDepMines.filter(function (m) { return  _gmOreLimit[m.OreName]; });\r\n'
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
    b'            var deplCount   = data.depletedCountByOre[m.OreName] || 1;\r\n'
    b'            var atCap       = searching >= deplCount;\r\n'
    b'            var best        = _gmBestGeo(data.geos, m.OreName, []);\r\n'
    b'            var bestLabel, sendBtn;\r\n'
    b'            if (atCap) {\r\n'
    b'                bestLabel = \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
    b'                sendBtn   = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'            } else {\r\n'
    b'                bestLabel = best\r\n'
    b'                    ? (best.IsIdle ? best.Name : \'<em>\' + best.Name + \' (busy)</em>\')\r\n'
    b'                    : \'<span style="color:#999">none</span>\';\r\n'
    b'                sendBtn = (best && best.IsIdle)\r\n'
    b'                    ? $(\'<button>\').attr({\r\n'
    b'                        \'class\'   : \'btn btn-xs btn-success gmDepSendBtn\',\r\n'
    b'                        \'data-ore\': m.OreName\r\n'
    b'                      }).text(\'Send Geo\').prop(\'outerHTML\')\r\n'
    b'                    : \'\';\r\n'
    b'            }\r\n'
    b'            var markBtn = $(\'<button>\').attr({\r\n'
    b'                \'class\'   : \'btn btn-xs btn-default gmMarkLimitBtn\',\r\n'
    b'                \'data-ore\': m.OreName\r\n'
    b'            }).text(\'At Limit\').prop(\'outerHTML\');\r\n'
    b'            var gotoIcon = getImageTag(\'accuracy.png\', \'18px\', \'18px\')\r\n'
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\' )\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'            out += createTableRow([\r\n'
    b'                [3, gotoIcon + \'&nbsp;\' + m.Name],\r\n'
    b'                [3, getImageTag(m.OreName, \'18px\') + \'&nbsp;\' + loca.GetText(\'RES\', m.OreName)],\r\n'
    b'                [2, bestLabel],\r\n'
    b'                [2, sendBtn],\r\n'
    b'                [2, markBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
    b'    } else {\r\n'
    b'        out += \'<div style="color:#999;padding:4px 10px;font-style:italic;">No depleted mines found.</div>\';\r\n'
    b'    }\r\n'
    b'\r\n'
    b'    // ------ At Game Limit section ------\r\n'
    b'    var limitedOres = Object.keys(_gmOreLimit);\r\n'
    b'    out += \'<div class="gm-section">At Game Limit (\' + limitedOres.length + \')</div>\';\r\n'
    b'    if (limitedOres.length > 0) {\r\n'
    b'        out += createTableRow([[3, \'Mine\'], [3, \'Ore\'], [2, \'Best Geo\'], [2, \'Send Anyway\'], [2, \'\']], true);\r\n'
    b'        // Rows for limited ores that have a depleted mine building\r\n'
    b'        var shownOres = {};\r\n'
    b'        limitedMines.forEach(function (m) {\r\n'
    b'            shownOres[m.OreName] = true;\r\n'
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
    b'                \'data-ore\': m.OreName\r\n'
    b'            }).text(\'Clear Limit\').prop(\'outerHTML\');\r\n'
    b'            var gotoIcon = getImageTag(\'accuracy.png\', \'18px\', \'18px\')\r\n'
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\' )\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'            out += createTableRow([\r\n'
    b'                [3, gotoIcon + \'&nbsp;\' + m.Name],\r\n'
    b'                [3, getImageTag(m.OreName, \'18px\') + \'&nbsp;\' + loca.GetText(\'RES\', m.OreName)],\r\n'
    b'                [2, bestLabel],\r\n'
    b'                [2, sendBtn],\r\n'
    b'                [2, clearBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
    b'        // Rows for limited ores with no current depleted mine\r\n'
    b'        limitedOres.forEach(function (ore) {\r\n'
    b'            if (shownOres[ore]) return;\r\n'
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
    b'                [3, \'&mdash;\'],\r\n'
    b'                [3, getImageTag(ore, \'18px\') + \'&nbsp;\' + loca.GetText(\'RES\', ore)],\r\n'
    b'                [2, bestLabel],\r\n'
    b'                [2, sendBtn],\r\n'
    b'                [2, clearBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
    b'    } else {\r\n'
    b'        out += \'<div style="color:#999;padding:4px 10px;font-style:italic;">No ores marked at game limit.</div>\';\r\n'
    b'    }\r\n'
)

content = content.replace(old2, new2, 1)
print('Fix 2 (depleted + At Game Limit sections) applied OK')

# =========================================================
# Fix 3: Auto-send watcher -- skip ores in _gmOreLimit
# =========================================================
old3 = b'            data.mines.filter(function(m) { return m.Secs > 0; }).forEach(function(m) {\r\n'
new3 = b'            data.mines.filter(function(m) { return m.Secs > 0 && !_gmOreLimit[m.OreName]; }).forEach(function(m) {\r\n'
if old3 in content:
    content = content.replace(old3, new3, 1)
    print('Fix 3 (auto-send skip limited) applied OK')
else:
    print('Fix 3: pattern NOT found'); sys.exit(1)

# =========================================================
# Fix 4: Click handlers -- add gmMarkLimitBtn and gmClearLimitBtn before Go-to map
# =========================================================
old4 = b'    // ---- Event: Go-to map ----\r\n'
new4 = (
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
    b'    });\r\n'
    b'\r\n'
    b'    // ---- Event: Go-to map ----\r\n'
)
if old4 in content:
    content = content.replace(old4, new4, 1)
    print('Fix 4 (click handlers) applied OK')
else:
    print('Fix 4: pattern NOT found'); sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done -- file written.')
