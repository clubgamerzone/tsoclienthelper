import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

# Insert geo-to-mine assignment block just before notUrgentMines.forEach
old1 = (
    b'        notUrgentMines.forEach(function (m) {\r\n'
    b'            var gotoIcon = getImageTag(\'accuracy.png\', \'18px\', \'18px\')\r\n'
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\')\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'\r\n'
    b'            var timeStr, foundInStr = \'\', sendBtn = \'\';\r\n'
)

new1 = (
    b'        // Pre-assign searching geos to specific mines (soonest geo -> soonest mine per ore)\r\n'
    b'        // Mines already sorted by Secs asc; geos sorted by RemMs asc\r\n'
    b'        var _assignedGeoByGrid = {};\r\n'
    b'        var _busyGeosByOre = {};\r\n'
    b'        data.geos.forEach(function(g) {\r\n'
    b'            if (!g.IsIdle && g.BusyOre) {\r\n'
    b'                if (!_busyGeosByOre[g.BusyOre]) _busyGeosByOre[g.BusyOre] = [];\r\n'
    b'                _busyGeosByOre[g.BusyOre].push(g);\r\n'
    b'            }\r\n'
    b'        });\r\n'
    b'        Object.keys(_busyGeosByOre).forEach(function(ore) {\r\n'
    b'            _busyGeosByOre[ore].sort(function(a, b) { return a.RemMs - b.RemMs; });\r\n'
    b'        });\r\n'
    b'        var _oreAssignIdx = {};\r\n'
    b'        notUrgentMines.forEach(function(m) {\r\n'
    b'            if (m.Secs <= 0) return;\r\n'
    b'            var geos = _busyGeosByOre[m.OreName];\r\n'
    b'            if (!geos || !geos.length) return;\r\n'
    b'            var idx = _oreAssignIdx[m.OreName] || 0;\r\n'
    b'            if (idx < geos.length) {\r\n'
    b'                _assignedGeoByGrid[m.Grid] = geos[idx];\r\n'
    b'                _oreAssignIdx[m.OreName] = idx + 1;\r\n'
    b'            }\r\n'
    b'        });\r\n'
    b'\r\n'
    b'        notUrgentMines.forEach(function (m) {\r\n'
    b'            var gotoIcon = getImageTag(\'accuracy.png\', \'18px\', \'18px\')\r\n'
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\')\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'\r\n'
    b'            var timeStr, foundInStr = \'\', sendBtn = \'\';\r\n'
)

# Replace the atCap block inside the m.Secs > 0 branch
old2 = (
    b'                if (atCap) {\r\n'
    b'                var busyForOre = data.geos.filter(function(g) { return !g.IsIdle && g.BusyOre === m.OreName; });\r\n'
    b'                var minRemMs   = busyForOre.length > 0 ? Math.min.apply(null, busyForOre.map(function(g) { return g.RemMs; })) : 0;\r\n'
    b'                foundInStr = minRemMs > 0\r\n'
    b'                    ? \'<span style="color:#ffaa00">next geo ready in \' + _gmFmt(minRemMs) + \'</span>\'\r\n'
    b'                    : \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
    b'                    sendBtn    = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'                } else {\r\n'
)

new2 = (
    b'                if (atCap) {\r\n'
    b'                    var assignedGeo = _assignedGeoByGrid[m.Grid] || null;\r\n'
    b'                    if (assignedGeo) {\r\n'
    b'                        foundInStr = \'<span style="color:#aaffaa">found in \' + _gmFmt(assignedGeo.RemMs) + \' by \' + assignedGeo.Name + \'</span>\';\r\n'
    b'                    } else {\r\n'
    b'                        var busyForOre = data.geos.filter(function(g) { return !g.IsIdle && g.BusyOre === m.OreName; });\r\n'
    b'                        var minRemMs   = busyForOre.length > 0 ? Math.min.apply(null, busyForOre.map(function(g) { return g.RemMs; })) : 0;\r\n'
    b'                        foundInStr = minRemMs > 0\r\n'
    b'                            ? \'<span style="color:#ffaa00">next geo ready in \' + _gmFmt(minRemMs) + \'</span>\'\r\n'
    b'                            : \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
    b'                    }\r\n'
    b'                    sendBtn = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'                } else {\r\n'
)

ok = True
for i, (old, new) in enumerate([(old1, new1), (old2, new2)], 1):
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
