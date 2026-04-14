import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

old = b'    try { storeSettings(_gmPrefs, \'gmPrefs\'); } catch (e) {}\r\n}\r\n'

if content.count(old) != 1:
    print('Found', content.count(old), 'occurrences -- aborting'); sys.exit(1)

new = (
    b'    try { storeSettings(_gmPrefs, \'gmPrefs\'); } catch (e) {}\r\n'
    b'}\r\n'
    b'\r\n'
    b'// Persisted at-game-limit ore types -- geos will not auto-send to these\r\n'
    b'var _gmOreLimit = {};\r\n'
    b'try { _gmOreLimit = readSettings(null, \'gmOreLimit\') || {}; } catch (e) {}\r\n'
    b'\r\n'
    b'function _gmSetOreLimit(ore, limited) {\r\n'
    b'    if (limited) {\r\n'
    b'        _gmOreLimit[ore] = true;\r\n'
    b'    } else {\r\n'
    b'        delete _gmOreLimit[ore];\r\n'
    b'    }\r\n'
    b'    try { storeSettings(_gmOreLimit, \'gmOreLimit\'); } catch (e) {}\r\n'
    b'}\r\n'
)

content = content.replace(old, new, 1)
print('_gmOreLimit block inserted OK')

with open(src, 'wb') as f:
    f.write(content)
print('Done.')
