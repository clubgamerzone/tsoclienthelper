import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

old = (
    b'    // ------ Mines: Urgent < 2h ------\r\n'
    b'    var notUrgentMines = data.mines.slice();  // all active mines (urgent coloring handled per-row)\r\n'
    b'    var foundMines     = data.foundMines || [];\r\n'
    b'\r\n'
    b'    // Keep legacy alias so _gmSmartSendAll still works\r\n'
    b'    var otherMines = notUrgentMines;\r\n'
    b'\r\n'
    b'\r\n'
    b'\r\n'
    b'    // ------ Mines: Not urgent ------\r\n'
)
new = (
    b'    var notUrgentMines = data.mines.slice();  // all active mines (urgent coloring handled per-row)\r\n'
    b'    var foundMines     = data.foundMines || [];\r\n'
    b'\r\n'
    b'    // Keep legacy alias so _gmSmartSendAll still works\r\n'
    b'    var otherMines = notUrgentMines;\r\n'
    b'\r\n'
    b'    // ------ Mines: Not urgent ------\r\n'
)

if old in content:
    content = content.replace(old, new, 1)
    print('Cleanup applied OK')
else:
    print('Cleanup: pattern NOT found'); sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done.')
