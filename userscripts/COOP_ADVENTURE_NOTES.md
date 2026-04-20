# Co-op Adventure Script — Development Notes

> Reference this file in future sessions on any PC to restore context quickly.

---

## File locations

- **Source (dev):** `c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\user_coop_adventure.js`
- **Deploy target:** `C:\Users\jay\AppData\Local\tso_portable\userscripts\user_coop_adventure.js`
- **Deploy command:**
  ```powershell
  node -c "...\userscripts\user_coop_adventure.js" 2>&1 ; Copy-Item "...\userscripts\user_coop_adventure.js" -Destination "C:\Users\jay\AppData\Local\tso_portable\userscripts\user_coop_adventure.js" -Force
  ```

---

## Purpose

Automates co-op adventure workflow:
1. Watches mailbox for type-23 (adventure invite) mails
2. Accepts the invitation
3. Travels to the adventure zone
4. Applies a selected bomb/arrow item
5. Returns home

---

## Key Flash APIs (verified working)

| What | API |
|---|---|
| Star menu items | `game.gi.mCurrentPlayer.mAvailableBuffs_vector` |
| Item type name | `item.GetType()` |
| Item amount | `item.GetAmount()` |
| Item resource name | `item.GetResourceName_string()` |
| Item icon data | `item.GetBuffIconData()` → `[module, name]` |
| Render icon | `getImageByModule(iconData[0], iconData[1], 24, 24)` |
| Display name | `loca.GetText('RES', type, ['', resName])` — fallback: `loca.GetText('RES', resName)` |
| Zone buffs | `game.gi.mZoneBuffManager.mAvailableBuffs_vector` — each has `.buffName` |
| Mail window | `globalFlash.gui.mMailWindow` |
| Apply item to building | `game.gi.SendServerAction(61, 0, grid, 1, uid)` |
| Build unique ID | `game.def('Communication.VO::dUniqueID').Create(uid1, uid2)` |
| Travel to zone | `game.gi.visitZone(zoneID)` |
| Player ID | `game.gi.mCurrentPlayer.GetPlayerId()` |

---

## Module-level state vars (must be declared with `var`)

```js
var _caRunning = false;
var _caState = null;
var _caModal = null;
var _caChatLog = [];
var _caSelectedBuff = null;
var _caLastMailRefresh = 0;
```

> **Critical:** If any of these are missing, the script throws `ReferenceError: Can't find variable: _caRunning` and the modal won't open.

---

## Item filter

Only show items where the internal type contains `"bomb"` (case-insensitive):

```js
if (type.toLowerCase().indexOf('bomb') === -1) return;
```

Known bomb item type names:
- `BattleBuffBombCupidosArrow`
- `BattleBuffBomb_random_units_limited_3`
- (any future chocolate bomb will also match)

---

## Tools menu registrations

```js
addToolsMenuItem('Co-op Adventure', _caOpenModal);  // opens the UI modal
addToolsMenuItem('CA Test Click', _caTestClick);     // debug: dumps all star menu types to adventurer chat
```

---

## Modal structure

- `_caOpenModal()` — creates modal, builds footer (Start / Stop / [-] buttons), calls `_caRenderBody()`
- `_caRenderBody()` — renders: status row, bomb item selector, active adventures list, log panel
- `_caGetStarMenuItems()` — reads `mAvailableBuffs_vector`, filters to bomb types, returns array with `{name, resName, displayName, amount, iconData, type}`
- `_caGetZoneBuffs()` — reads `mZoneBuffManager.mAvailableBuffs_vector`, returns array of buffName strings

> **Critical:** `_caGetStarMenuItems` and `_caGetZoneBuffs` must always exist — they were accidentally deleted once when removing unrelated code, breaking the modal silently.

---

## Known bugs fixed

| Bug | Root cause | Fix |
|---|---|---|
| `ReferenceError: Can't find variable: _caRunning` | State vars not declared with `var` | Add module-level `var` declarations |
| Modal shows "No items available" | Used `game.getBuffs()` which doesn't exist | Use `game.gi.mCurrentPlayer.mAvailableBuffs_vector` |
| Items show "[undefined group] - BUF" | Wrong loca key (`BUF` instead of `RES`) | Use `loca.GetText('RES', type, ['', resName])` |
| Accept button click silently ignored | Stage-level coords intercepted by HTML modal overlay | Use `btn.dispatchEvent()` with **local** button coords (`btn.width/2`, `btn.height/2`) |
| Modal permanently hidden after click | Was hiding modal but never restoring | Save `modalWasVisible`, restore after click |
| Modal won't open at all | `_caGetStarMenuItems`/`_caGetZoneBuffs` deleted | Keep both functions, they are called from `_caRenderBody` |

---

## Debugging tips

- All logs go to **adventurer chat** via `game.chatMessage('...', 'adventurer')`
- `_caOpenModal` and `_caRenderBody` are wrapped in try/catch — errors print as `CA OPEN ERROR:` / `CA RENDER ERROR:`
- Click **CA Test Click** from Tools menu to dump all star menu item types to chat — useful for finding internal names
- `_caPoll` runs on a timer when started — logs state transitions to adventurer chat
