import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

# --- Patch 1: skip under-construction buildings, route to foundMines ---
old1 = (
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

new1 = (
    b'            var lvl = 0;\r\n'
    b'            try { lvl = bld.GetUpgradeLevel(); } catch (e) {}\r\n'
    b'            var isActive = false;\r\n'
    b'            try { isActive = bld.IsProductionActive(); } catch (e) {}\r\n'
    b'\r\n'
    b'            // Buildings still under construction should not appear in Active Mines\r\n'
    b'            var isUnderConstruction = false;\r\n'
    b'            try { isUnderConstruction = bld.IsUpgradeInProgress(); } catch (e) {}\r\n'
    b'            if (isUnderConstruction) {\r\n'
    b'                foundMines.push({\r\n'
    b'                    Name:               loca.GetText(\'BUI\', nameKey) + \' L\' + lvl,\r\n'
    b'                    OreName:            oreName,\r\n'
    b'                    Amt:                amt,\r\n'
    b'                    Grid:               bld.GetGrid(),\r\n'
    b'                    IsUnderConstruction: true\r\n'
    b'                });\r\n'
    b'                return;\r\n'
    b'            }\r\n'
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

# --- Patch 2: render foundMines rows — show "Under Construction" status for those entries ---
old2 = (
    b'        foundMines.forEach(function (m) {\r\n'
    b'            var gotoIcon = getImageTag(\'accuracy.png\', \'18px\', \'18px\')\r\n'
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\')\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'            var buildBtn = _gmBuildType[m.OreName]\r\n'
    b'                ? $(\'<button>\').attr({\r\n'
    b'                    \'class\'      : \'btn btn-xs btn-primary gmBuildBtn\',\r\n'
    b'                    \'data-grid\'  : m.Grid,\r\n'
    b'                    \'data-ore\'   : m.OreName,\r\n'
    b'                    \'data-btype\' : _gmBuildType[m.OreName]\r\n'
    b'                  }).text(\'Build Mine\').prop(\'outerHTML\')\r\n'
    b'                : \'\';\r\n'
    b'            var costHtml = _gmCheckCost(m.OreName, data.resources);\r\n'
    b'            out += createTableRow([\r\n'
    b'                [4, gotoIcon + \'&nbsp;\' + getImageTag(m.OreName, \'18px\') + \'&nbsp;<strong>\' + loca.GetText(\'RES\', m.OreName) + \'</strong>\'],\r\n'
    b'                [2, \'<span class="gm-ok">\' + m.Amt.toLocaleString() + \'</span>\'],\r\n'
    b'                [4, costHtml],\r\n'
    b'                [2, buildBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
)

new2 = (
    b'        foundMines.forEach(function (m) {\r\n'
    b'            var gotoIcon = getImageTag(\'accuracy.png\', \'18px\', \'18px\')\r\n'
    b'                .replace(\'<img\', \'<img id="gmGoto_\' + m.Grid + \'"\')\r\n'
    b'                .replace(\'style="\', \'style="cursor:pointer;vertical-align:middle;\');\r\n'
    b'            if (m.IsUnderConstruction) {\r\n'
    b'                out += createTableRow([\r\n'
    b'                    [4, gotoIcon + \'&nbsp;\' + getImageTag(m.OreName, \'18px\') + \'&nbsp;<strong>\' + loca.GetText(\'RES\', m.OreName) + \'</strong>\'],\r\n'
    b'                    [2, \'<span class="gm-ok">\' + m.Amt.toLocaleString() + \'</span>\'],\r\n'
    b'                    [4, \'<span style="color:#aaffaa">Under Construction</span>\'],\r\n'
    b'                    [2, \'\']\r\n'
    b'                ]);\r\n'
    b'                return;\r\n'
    b'            }\r\n'
    b'            var buildBtn = _gmBuildType[m.OreName]\r\n'
    b'                ? $(\'<button>\').attr({\r\n'
    b'                    \'class\'      : \'btn btn-xs btn-primary gmBuildBtn\',\r\n'
    b'                    \'data-grid\'  : m.Grid,\r\n'
    b'                    \'data-ore\'   : m.OreName,\r\n'
    b'                    \'data-btype\' : _gmBuildType[m.OreName]\r\n'
    b'                  }).text(\'Build Mine\').prop(\'outerHTML\')\r\n'
    b'                : \'\';\r\n'
    b'            var costHtml = _gmCheckCost(m.OreName, data.resources);\r\n'
    b'            out += createTableRow([\r\n'
    b'                [4, gotoIcon + \'&nbsp;\' + getImageTag(m.OreName, \'18px\') + \'&nbsp;<strong>\' + loca.GetText(\'RES\', m.OreName) + \'</strong>\'],\r\n'
    b'                [2, \'<span class="gm-ok">\' + m.Amt.toLocaleString() + \'</span>\'],\r\n'
    b'                [4, costHtml],\r\n'
    b'                [2, buildBtn]\r\n'
    b'            ]);\r\n'
    b'        });\r\n'
)

ok = True
for i, (old, new) in enumerate([(old1, new1), (old2, new2)], 1):
    count = content.count(old)
    if count != 1:
        print('Patch %d: pattern found %d times (expected 1)' % (i, count))
        ok = False
    else:
        content = content.replace(old, new, 1)
        print('Patch %d applied OK' % i)

if not ok:
    sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done.')
