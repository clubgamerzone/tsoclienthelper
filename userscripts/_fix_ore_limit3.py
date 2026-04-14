import sys, re

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

# =========================================================
# Fix 2: Replace the depleted mines render block using regex anchors
# Match from "var depMines = ..." through the closing "    }\r\n" of the else
# =========================================================
pattern2 = re.compile(
    rb'    var depMines = \(data\.depletedMines \|\| \[\]\)\.slice\(\);.*?'
    rb'    \} else \{\r\n'
    rb"        out \+= '<div style=\"color:#999;padding:4px 10px;font-style:italic;\">No depleted mines found\.</div>';\r\n"
    rb'    \}\r\n',
    re.DOTALL
)

m2 = pattern2.search(content)
if not m2:
    print('Fix 2: regex NOT matched'); sys.exit(1)

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
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\')\r\n'
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
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\')\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'            out += createTableRow([\r\n'
    b'                [3, gotoIcon + \'&nbsp;\' + m.Name],\r\n'
    b'                [3, getImageTag(m.OreName, \'18px\') + \'&nbsp;\' + loca.GetText(\'RES\', m.OreName)],\r\n'
    b'                [2, bestLabel],\r\n'
    b'                [2, sendBtn],\r\n'
    b'                [2, clearBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
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

content = content[:m2.start()] + new2 + content[m2.end():]
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
