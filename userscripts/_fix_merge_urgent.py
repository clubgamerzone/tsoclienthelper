import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

# =========================================================
# Fix 1: Merge urgentMines into notUrgentMines — all active mines
# Remove urgentMines line, change notUrgentMines to include all mines
# =========================================================
old1 = (
    b'    var urgentMines    = data.mines.filter(function (m) { return m.Secs > 0 && m.Secs <= 7200; });\r\n'
    b'    var notUrgentMines = data.mines.filter(function (m) { return m.Secs > 7200 || m.Secs === 0; });\r\n'
    b'    var foundMines     = data.foundMines || [];\r\n'
    b'\r\n'
    b'    // Keep legacy alias so _gmSmartSendAll still works\r\n'
    b'    var otherMines = notUrgentMines;\r\n'
)
new1 = (
    b'    var notUrgentMines = data.mines.slice();  // all active mines (urgent coloring handled per-row)\r\n'
    b'    var foundMines     = data.foundMines || [];\r\n'
    b'\r\n'
    b'    // Keep legacy alias so _gmSmartSendAll still works\r\n'
    b'    var otherMines = notUrgentMines;\r\n'
)

if old1 in content:
    content = content.replace(old1, new1, 1)
    print('Fix 1 (remove urgentMines split) applied OK')
else:
    print('Fix 1: pattern NOT found'); sys.exit(1)

# =========================================================
# Fix 2: Remove the entire "Depleting < 2h" render block
# From the section header through the closing "} else { ...}" block
# =========================================================
old2 = (
    b'    out += \'<div class="gm-section">Mines &mdash; Depleting &lt; 2h (\' + urgentMines.length + \')</div>\';\r\n'
    b'    if (urgentMines.length > 0) {\r\n'
    b'        out += createTableRow([\r\n'
    b'            [3, \'Mine\'],\r\n'
    b'            [2, \'Ore\'],\r\n'
    b'            [2, \'Deposit\'],\r\n'
    b'            [2, \'Depletes In\'],\r\n'
    b'            [2, \'Best Geo\'],\r\n'
    b'            [1, \'\']\r\n'
    b'        ], true);\r\n'
    b'        urgentMines.forEach(function (m) {\r\n'
    b'            var timeCls  = m.Secs < 3600 ? \'gm-urgent\' : \'gm-warn\';\r\n'
    b'            var best     = _gmBestGeo(data.geos, m.OreName, []);\r\n'
    b'            var bestLabel = best\r\n'
    b'                ? (best.IsIdle ? best.Name : \'<em>\' + best.Name + \' (busy)</em>\')\r\n'
    b'                : \'<span style="color:#999">none</span>\';\r\n'
    b'            var sendBtn = (best && best.IsIdle)\r\n'
    b'                ? $\'(<button>)\'.attr({\r\n'
    b'                    \'class\'    : \'btn btn-xs btn-warning gmSendBtn\',\r\n'
    b'                    \'data-uid\' : best.UID,\r\n'
    b'                    \'data-ore\' : m.OreName\r\n'
    b'                  }).text(\'Send\').prop(\'outerHTML\')\r\n'
    b'                : \'\';\r\n'
)
# That pattern likely won't match exactly due to jquery syntax — search for a simpler anchor
# Let's find the exact block bytes
import re
pattern = (
    rb"    out \+= '<div class=\"gm-section\">Mines &mdash; Depleting &lt; 2h \(' \+ urgentMines\.length \+ '\)</div>';\r\n"
    rb"    if \(urgentMines\.length > 0\) \{.*?    \} else \{\r\n"
    rb"        out \+= '<div style=\"color:#999;padding:4px 10px;font-style:italic;\">No mines depleting within 2 hours\.</div>';\r\n"
    rb"    \}\r\n"
)
m = re.search(pattern, content, re.DOTALL)
if m:
    content = content[:m.start()] + b'\r\n' + content[m.end():]
    print('Fix 2 (remove urgent section block) applied OK')
else:
    print('Fix 2: pattern NOT found'); sys.exit(1)

# =========================================================
# Fix 3: Update "Not Urgent" section title to "Active Mines"
# =========================================================
old3 = b'    out += \'<div class="gm-section">Mines &mdash; Not Urgent (\' + notUrgentMines.length + \')</div>\';\r\n'
new3 = b'    out += \'<div class="gm-section">Mines &mdash; Active (\' + notUrgentMines.length + \')</div>\';\r\n'

if old3 in content:
    content = content.replace(old3, new3, 1)
    print('Fix 3 (rename section title) applied OK')
else:
    print('Fix 3: pattern NOT found'); sys.exit(1)

# =========================================================
# Fix 4: Auto-send watcher — include < 2h mines too (Secs > 0 not > 7200)
# =========================================================
old4 = b'            data.mines.filter(function(m) { return m.Secs > 7200; }).forEach(function(m) {\r\n'
new4 = b'            data.mines.filter(function(m) { return m.Secs > 0; }).forEach(function(m) {\r\n'

if old4 in content:
    content = content.replace(old4, new4, 1)
    print('Fix 4 (auto-send watcher Secs > 0) applied OK')
else:
    print('Fix 4: pattern NOT found'); sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done — file written.')
