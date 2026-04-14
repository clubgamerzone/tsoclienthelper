import sys, re

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

# =========================================================
# Fix 1: Move _gmQuarryOres definition BEFORE the mines loop
# Add it right before "var mines = [];"
# =========================================================
old1 = b'    // -- Active mines with ore remaining --\r\n    var mines = [];\r\n'
new1 = (
    b'    // -- Active mines with ore remaining --\r\n'
    b'    // Quarry ores: depletion rate is shared across all buildings on the deposit,\r\n'
    b'    // so per-building calculation via CalculateWays() is unreliable.\r\n'
    b'    var _gmQuarryOres = { \'Stone\': true, \'Marble\': true, \'Granite\': true };\r\n'
    b'    var mines = [];\r\n'
)
if old1 in content:
    content = content.replace(old1, new1, 1)
    print('Fix 1 (_gmQuarryOres before mines loop) applied OK')
else:
    print('Fix 1: pattern NOT found'); sys.exit(1)

# =========================================================
# Fix 2: In mines.push(), zero out secs for quarry ores and add IsQuarry flag
# =========================================================
old2 = (
    b'            var secs    = 0;\r\n'
    b'\r\n'
    b'            if (gEcon && bld.IsProductionActive()) {\r\n'
    b'                try {\r\n'
    b'                    var cMs  = bld.CalculateWays();\r\n'
    b'                    var cS   = cMs > 0 ? cMs / 1000 : 1;\r\n'
    b'                    var rcd  = gEcon.GetResourcesCreationDefinitionForBuilding(nameKey);\r\n'
    b'                    var rem  = rcd ? rcd.amountRemoved : 0;\r\n'
    b'                    var tot  = bld.GetResourceInputFactor() * rem;\r\n'
    b'                    var rps  = tot > 0 ? tot / cS : 0;\r\n'
    b'                    secs     = rps > 0 ? amt / rps : 0;\r\n'
    b'                } catch (e) {}\r\n'
    b'            }\r\n'
    b'\r\n'
    b'            var lvl = 0;\r\n'
    b'            try { lvl = bld.GetUpgradeLevel(); } catch (e) {}\r\n'
    b'            var isActive = false;\r\n'
    b'            try { isActive = bld.IsProductionActive(); } catch (e) {}\r\n'
    b'\r\n'
    b'            mines.push({\r\n'
    b'                Name:     loca.GetText(\'BUI\', nameKey) + \' L\' + lvl,\r\n'
    b'                OreName:  oreName,\r\n'
    b'                Amt:      amt,\r\n'
    b'                Secs:     secs,\r\n'
    b'                IsActive: isActive,\r\n'
    b'                Grid:     bld.GetGrid()\r\n'
    b'            });\r\n'
)
new2 = (
    b'            var isQuarry = !!_gmQuarryOres[oreName];\r\n'
    b'            var secs     = 0;\r\n'
    b'\r\n'
    b'            if (!isQuarry && gEcon && bld.IsProductionActive()) {\r\n'
    b'                try {\r\n'
    b'                    var cMs  = bld.CalculateWays();\r\n'
    b'                    var cS   = cMs > 0 ? cMs / 1000 : 1;\r\n'
    b'                    var rcd  = gEcon.GetResourcesCreationDefinitionForBuilding(nameKey);\r\n'
    b'                    var rem  = rcd ? rcd.amountRemoved : 0;\r\n'
    b'                    var tot  = bld.GetResourceInputFactor() * rem;\r\n'
    b'                    var rps  = tot > 0 ? tot / cS : 0;\r\n'
    b'                    secs     = rps > 0 ? amt / rps : 0;\r\n'
    b'                } catch (e) {}\r\n'
    b'            }\r\n'
    b'\r\n'
    b'            var lvl = 0;\r\n'
    b'            try { lvl = bld.GetUpgradeLevel(); } catch (e) {}\r\n'
    b'            var isActive = false;\r\n'
    b'            try { isActive = bld.IsProductionActive(); } catch (e) {}\r\n'
    b'\r\n'
    b'            mines.push({\r\n'
    b'                Name:     loca.GetText(\'BUI\', nameKey) + \' L\' + lvl,\r\n'
    b'                OreName:  oreName,\r\n'
    b'                Amt:      amt,\r\n'
    b'                Secs:     secs,\r\n'
    b'                IsActive: isActive,\r\n'
    b'                IsQuarry: isQuarry,\r\n'
    b'                Grid:     bld.GetGrid()\r\n'
    b'            });\r\n'
)
if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Fix 2 (quarry secs=0 + IsQuarry flag) applied OK')
else:
    print('Fix 2: pattern NOT found'); sys.exit(1)

# =========================================================
# Fix 3: Remove the old _gmQuarryOres definition in foundMines area (now duplicate)
# =========================================================
old3 = (
    b'    // Quarry ores (Stone, Marble) always have a quarry building linked via GetDepositBuildingGridPos()\r\n'
    b'    // but the link may not be detectable reliably, so exclude them \xe2\x80\x94 they\'re never "buildable" mines.\r\n'
    b'    var _gmQuarryOres = { \'Stone\': true, \'Marble\': true };\r\n'
)
if old3 in content:
    content = content.replace(old3, b'    // Quarry ores excluded from foundMines (defined earlier in this function)\r\n', 1)
    print('Fix 3 (remove duplicate _gmQuarryOres) applied OK')
else:
    # Try without the em-dash mojibake
    idx = content.find(b"    var _gmQuarryOres = { 'Stone': true, 'Marble': true };\r\n    var foundMines = [];")
    if idx >= 0:
        # Find the comment line before it
        block_start = content.rfind(b'    //', 0, idx)
        snippet = content[block_start:idx + len(b"    var _gmQuarryOres = { 'Stone': true, 'Marble': true };\r\n")]
        content = content.replace(snippet, b'    // Quarry ores excluded from foundMines (defined earlier in this function)\r\n', 1)
        print('Fix 3 (remove duplicate _gmQuarryOres - fallback) applied OK')
    else:
        print('Fix 3: pattern NOT found (non-fatal, leaving duplicate)') 

# =========================================================
# Fix 4: Render -- show "Active (quarry)" instead of "Mine idle" for quarry buildings
# =========================================================
old4 = (
    b'            if (m.Secs <= 0) {\r\n'
    b'                timeStr = \'<span style="color:#999">Mine idle</span>\';\r\n'
    b'                if (searching > 0) {\r\n'
)
new4 = (
    b'            if (m.Secs <= 0) {\r\n'
    b'                timeStr = m.IsQuarry && m.IsActive\r\n'
    b'                    ? \'<span style="color:#888">&mdash; (quarry)</span>\'\r\n'
    b'                    : \'<span style="color:#999">Mine idle</span>\';\r\n'
    b'                if (searching > 0) {\r\n'
)
if old4 in content:
    content = content.replace(old4, new4, 1)
    print('Fix 4 (quarry render label) applied OK')
else:
    print('Fix 4: pattern NOT found'); sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done -- file written.')
