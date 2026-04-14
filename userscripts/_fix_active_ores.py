import sys

src = r'c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_geo_manager.js'

with open(src, 'rb') as f:
    content = f.read()

old = b'        if (m.Secs > 0 && _gmBuildType[m.OreName]) {\r\n'
new = b'        if (m.Secs > 0 && _gmDepositTask[m.OreName]) {\r\n'

if old in content:
    content = content.replace(old, new, 1)
    print('Fix applied OK')
else:
    print('Pattern NOT found'); sys.exit(1)

with open(src, 'wb') as f:
    f.write(content)
print('Done.')
