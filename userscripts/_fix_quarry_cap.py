import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

patches = []

# 1. Promote _gmQuarryOres to module scope (right after _gmOreLimit block)
patches.append((
    b'// Persisted at-game-limit ore types -- geos will not auto-send to these\r\n'
    b'var _gmOreLimit = {};\r\n'
    b'try { _gmOreLimit = readSettings(null, \'gmOreLimit\') || {}; } catch (e) {}\r\n',

    b'// Quarry ore types: all buildings share one deposit, so only 1 geo search needed\r\n'
    b'var _gmQuarryOres = { \'Stone\': true, \'Marble\': true, \'Granite\': true };\r\n'
    b'\r\n'
    b'// Persisted at-game-limit ore types -- geos will not auto-send to these\r\n'
    b'var _gmOreLimit = {};\r\n'
    b'try { _gmOreLimit = readSettings(null, \'gmOreLimit\') || {}; } catch (e) {}\r\n'
))

# 2. Remove the local var inside _gmCollectData (it's now module-level)
patches.append((
    b'    // -- Active mines with ore remaining --\r\n'
    b'    // Quarry ores: depletion rate is shared across all buildings on the deposit,\r\n'
    b'    // so per-building calculation via CalculateWays() is unreliable.\r\n'
    b'    var _gmQuarryOres = { \'Stone\': true, \'Marble\': true, \'Granite\': true };\r\n'
    b'    var mines = [];\r\n',

    b'    // -- Active mines with ore remaining --\r\n'
    b'    // Quarry ores: depletion rate is shared across all buildings on the deposit,\r\n'
    b'    // so per-building calculation via CalculateWays() is unreliable.\r\n'
    b'    // (_gmQuarryOres is defined at module scope)\r\n'
    b'    var mines = [];\r\n'
))

# 3. Auto-send depleted mines loop: cap needed at 1 for quarry ores
patches.append((
    b'            // Auto-send idle geos to depleted mines not at game limit and not already at cap\r\n'
    b'            (data.depletedMines || []).forEach(function(m) {\r\n'
    b'                if (_gmOreLimit[m.OreName]) return;  // at game limit\r\n'
    b'                var searching = data.searchingByOre[m.OreName] || 0;\r\n'
    b'                var deplCount = data.depletedCountByOre[m.OreName] || 1;\r\n'
    b'                if (searching >= deplCount) return;  // already enough geos for all depleted slots\r\n',

    b'            // Auto-send idle geos to depleted mines not at game limit and not already at cap\r\n'
    b'            (data.depletedMines || []).forEach(function(m) {\r\n'
    b'                if (_gmOreLimit[m.OreName]) return;  // at game limit\r\n'
    b'                var searching = data.searchingByOre[m.OreName] || 0;\r\n'
    b'                // Quarry ores: all buildings share one deposit, only 1 geo ever needed\r\n'
    b'                var deplCount = _gmQuarryOres[m.OreName] ? 1 : (data.depletedCountByOre[m.OreName] || 1);\r\n'
    b'                if (searching >= deplCount) return;  // already enough geos\r\n'
))

# 4. Depleted mines render: atCap should use cap=1 for quarry ores
patches.append((
    b'            var searching   = data.searchingByOre[m.OreName] || 0;\r\n'
    b'            var deplCount   = data.depletedCountByOre[m.OreName] || 1;\r\n'
    b'            var atCap       = searching >= deplCount;\r\n'
    b'            var isLimited   = !!_gmOreLimit[m.OreName];\r\n',

    b'            var searching   = data.searchingByOre[m.OreName] || 0;\r\n'
    b'            // Quarry ores: all buildings share one deposit; only 1 geo search needed\r\n'
    b'            var deplCap     = _gmQuarryOres[m.OreName] ? 1 : (data.depletedCountByOre[m.OreName] || 1);\r\n'
    b'            var atCap       = searching >= deplCap;\r\n'
    b'            var isLimited   = !!_gmOreLimit[m.OreName];\r\n'
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
