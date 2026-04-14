import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

# =========================================================
# Fix 1: Auto-send watcher — replace wrong cap logic
# =========================================================
old1 = (
    b'            var autoMinesByOre = {};\r\n'
    b'            data.mines.forEach(function(m) {\r\n'
    b'                if (m.Secs > 0) autoMinesByOre[m.OreName] = (autoMinesByOre[m.OreName] || 0) + 1;\r\n'
    b'            });\r\n'
    b'            var autoSendUsed = [];\r\n'
    b'            var autoSendDelay = 0;\r\n'
    b'            data.mines.filter(function(m) { return m.Secs > 7200; }).forEach(function(m) {\r\n'
    b'                var searching  = data.searchingByOre[m.OreName] || 0;\r\n'
    b'                var activeCount = autoMinesByOre[m.OreName] || 1;\r\n'
    b'                if (searching >= activeCount) return;  // already covered\r\n'
    b'                var best = _gmBestGeo(data.geos, m.OreName, autoSendUsed);\r\n'
    b'                if (!best || !best.IsIdle) return;\r\n'
    b'                var geoMs      = _gmSearchMs(best.Spec, m.OreName);\r\n'
    b'                var mineMsLeft = m.Secs * 1000;\r\n'
)

new1 = (
    b'            var autoSendUsed = [];\r\n'
    b'            var autoSendDelay = 0;\r\n'
    b'            data.mines.filter(function(m) { return m.Secs > 7200; }).forEach(function(m) {\r\n'
    b'                var searching  = data.searchingByOre[m.OreName] || 0;\r\n'
    b'                var best = _gmBestGeo(data.geos, m.OreName, autoSendUsed);\r\n'
    b'                if (!best || !best.IsIdle) return;\r\n'
    b'                var geoMs      = _gmSearchMs(best.Spec, m.OreName);\r\n'
    b'                var depleted   = data.depletedCountByOre[m.OreName] || 0;\r\n'
    b'                var willDeplete = 0;\r\n'
    b'                data.mines.forEach(function(n) {\r\n'
    b'                    if (n.OreName === m.OreName && n.Secs > 0 && n.Secs * 1000 < geoMs) willDeplete++;\r\n'
    b'                });\r\n'
    b'                var needs = depleted + willDeplete;\r\n'
    b'                if (searching >= needs) return;  // enough geos already cover mines that will need them\r\n'
    b'                var mineMsLeft = m.Secs * 1000;\r\n'
)

if old1 in content:
    content = content.replace(old1, new1, 1)
    print('Fix 1 (auto-send cap) applied OK')
else:
    print('Fix 1: pattern NOT found — check indentation/CRLF')
    sys.exit(1)

# =========================================================
# Fix 2: Not-urgent display — replace wrong atCap formula
# =========================================================
old2 = (
    b'            var searching   = data.searchingByOre[m.OreName] || 0;\r\n'
    b'            var activeCount = data.activeMinesByOre[m.OreName] || 1;\r\n'
    b'            var atCap       = searching >= activeCount;\r\n'
)

new2 = (
    b'            var searching   = data.searchingByOre[m.OreName] || 0;\r\n'
    b'            var bestForCap  = _gmBestGeo(data.geos, m.OreName, []);\r\n'
    b'            var capGeoMs    = bestForCap ? _gmSearchMs(bestForCap.Spec, m.OreName) : 0;\r\n'
    b'            var depleted    = data.depletedCountByOre[m.OreName] || 0;\r\n'
    b'            var willDeplete = 0;\r\n'
    b'            if (capGeoMs > 0) {\r\n'
    b'                data.mines.forEach(function(n) {\r\n'
    b'                    if (n.OreName === m.OreName && n.Secs > 0 && n.Secs * 1000 < capGeoMs) willDeplete++;\r\n'
    b'                });\r\n'
    b'            }\r\n'
    b'            var needs       = depleted + willDeplete;\r\n'
    b'            var atCap       = searching >= needs;\r\n'
)

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Fix 2 (not-urgent atCap) applied OK')
else:
    print('Fix 2: pattern NOT found — check indentation/CRLF')
    sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done — file written.')
