import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

old = (
    b'            data.mines.filter(function(m) { return m.Secs > 0 && !_gmOreLimit[m.OreName]; }).forEach(function(m) {\r\n'
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
    b'                if (mineMsLeft - geoMs <= autoBuffer) {\r\n'
    b'                    autoSendDelay += 1500;\r\n'
    b'                    autoSendUsed.push(best.UID);\r\n'
    b'                    (function(g, ore, delay) {\r\n'
    b'                        setTimeout(function() { try { _gmSendGeo(g.Spec, ore); } catch(e) {} }, delay);\r\n'
    b'                    })(best, m.OreName, autoSendDelay);\r\n'
    b'                }\r\n'
    b'            });\r\n'
    b'        } catch (e) {}\r\n'
)

new = (
    b'            data.mines.filter(function(m) { return m.Secs > 0 && !_gmOreLimit[m.OreName]; }).forEach(function(m) {\r\n'
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
    b'                if (mineMsLeft - geoMs <= autoBuffer) {\r\n'
    b'                    autoSendDelay += 1500;\r\n'
    b'                    autoSendUsed.push(best.UID);\r\n'
    b'                    (function(g, ore, delay) {\r\n'
    b'                        setTimeout(function() { try { _gmSendGeo(g.Spec, ore); } catch(e) {} }, delay);\r\n'
    b'                    })(best, m.OreName, autoSendDelay);\r\n'
    b'                }\r\n'
    b'            });\r\n'
    b'\r\n'
    b'            // Auto-send idle geos to depleted mines not at game limit and not already at cap\r\n'
    b'            (data.depletedMines || []).forEach(function(m) {\r\n'
    b'                if (_gmOreLimit[m.OreName]) return;  // at game limit\r\n'
    b'                var searching = data.searchingByOre[m.OreName] || 0;\r\n'
    b'                var deplCount = data.depletedCountByOre[m.OreName] || 1;\r\n'
    b'                if (searching >= deplCount) return;  // already enough geos for all depleted slots\r\n'
    b'                var best = _gmBestGeo(data.geos, m.OreName, autoSendUsed);\r\n'
    b'                if (!best || !best.IsIdle) return;\r\n'
    b'                autoSendDelay += 1500;\r\n'
    b'                autoSendUsed.push(best.UID);\r\n'
    b'                (function(g, ore, delay) {\r\n'
    b'                    setTimeout(function() { try { _gmSendGeo(g.Spec, ore); } catch(e) {} }, delay);\r\n'
    b'                })(best, m.OreName, autoSendDelay);\r\n'
    b'            });\r\n'
    b'        } catch (e) {}\r\n'
)

if old in content:
    content = content.replace(old, new, 1)
    print('Auto-send depleted mines block applied OK')
else:
    print('Pattern NOT found'); sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done.')
