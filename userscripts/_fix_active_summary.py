import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

old = (
    b'    // ------ Depleted deposits summary ------\r\n'
    b'    var deplKeys = Object.keys(data.depleted);\r\n'
)

new = (
    b'    // ------ Active mines summary ------\r\n'
    b'    var activeByOre = {};\r\n'
    b'    data.mines.forEach(function (m) {\r\n'
    b'        if (m.Secs > 0 && _gmBuildType[m.OreName]) {\r\n'
    b'            activeByOre[m.OreName] = (activeByOre[m.OreName] || 0) + 1;\r\n'
    b'        }\r\n'
    b'    });\r\n'
    b'    var activeOreKeys = Object.keys(activeByOre);\r\n'
    b'    if (activeOreKeys.length > 0) {\r\n'
    b'        var totalActive = 0, activeHtml = \'\';\r\n'
    b'        activeOreKeys.forEach(function (ore) {\r\n'
    b'            totalActive += activeByOre[ore];\r\n'
    b'            activeHtml += getImageTag(ore, \'18px\', \'18px\') + \'&nbsp;\' + activeByOre[ore] + \'&nbsp;&nbsp;\';\r\n'
    b'        });\r\n'
    b'        out += \'<div class="gm-section">Active Mines (\' + totalActive + \'): \' + activeHtml + \'</div>\';\r\n'
    b'    }\r\n'
    b'\r\n'
    b'    // ------ Depleted deposits summary ------\r\n'
    b'    var deplKeys = Object.keys(data.depleted);\r\n'
)

if old in content:
    content = content.replace(old, new, 1)
    print('Active mines summary inserted OK')
else:
    print('Pattern NOT found'); sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done.')
