import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

# Helper snippet reused in both fixes
READY_SNIPPET = (
    b'                var busyForOre = data.geos.filter(function(g) { return !g.IsIdle && g.BusyOre === m.OreName; });\r\n'
    b'                var minRemMs   = busyForOre.length > 0 ? Math.min.apply(null, busyForOre.map(function(g) { return g.RemMs; })) : 0;\r\n'
    b'                foundInStr = minRemMs > 0\r\n'
    b'                    ? \'<span style="color:#ffaa00">next geo ready in \' + _gmFmt(minRemMs) + \'</span>\'\r\n'
    b'                    : \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
)

# =========================================================
# Fix 1: m.Secs <= 0 branch ("Mine idle") — searching > 0 block
# =========================================================
old1 = (
    b'                if (searching > 0) {\r\n'
    b'                    foundInStr = \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
    b'                    sendBtn    = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'                }\r\n'
)

new1 = (
    b'                if (searching > 0) {\r\n'
    + READY_SNIPPET +
    b'                    sendBtn    = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'                }\r\n'
)

if old1 in content:
    content = content.replace(old1, new1, 1)
    print('Fix 1 (idle mine geo ready) applied OK')
else:
    print('Fix 1: pattern NOT found')
    sys.exit(1)

# =========================================================
# Fix 2: m.Secs > 0 branch — if (atCap) block
# =========================================================
old2 = (
    b'                if (atCap) {\r\n'
    b'                    foundInStr = \'<span style="color:#ffaa00">\' + searching + \' geo(s) searching</span>\';\r\n'
    b'                    sendBtn    = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'                } else {\r\n'
)

new2 = (
    b'                if (atCap) {\r\n'
    + READY_SNIPPET +
    b'                    sendBtn    = \'<span style="color:#999;font-style:italic;">At cap</span>\';\r\n'
    b'                } else {\r\n'
)

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Fix 2 (active mine atCap geo ready) applied OK')
else:
    print('Fix 2: pattern NOT found')
    sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done — file written.')
