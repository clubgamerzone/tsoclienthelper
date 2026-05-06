# TSO Client Helper

A collection of userscripts and tools for **The Settlers Online** portable Windows client.

---

## Deploying Scripts

Scripts are developed in the `userscripts/` folder here, but the game loads them from the portable client's userscripts folder. After editing a script, copy it to make it live:

```powershell
Copy-Item "c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\SCRIPT.js" `
    -Destination "C:\Users\jay\AppData\Local\tso_portable\userscripts\SCRIPT.js" -Force
```

Replace `SCRIPT.js` with the file you changed. Then restart the TSO portable client (or reload scripts if hot-reload is supported) for the changes to take effect.

To deploy all scripts at once:

```powershell
Copy-Item "c:\Users\jay\Downloads\tso_client-1.5.8.6\tso_client-1.5.8.6\userscripts\*.js" `
    -Destination "C:\Users\jay\AppData\Local\tso_portable\userscripts\" -Force
```

---

## Userscripts — Quick Reference

All scripts live in `userscripts/` and are loaded automatically by the client. Drop any `.js` file into the client's userscripts folder to activate it.

| Script | Menu Name | Summary |
|---|---|---|
| `user_quest_runner.js` | **Adventurer** | Full adventure automation: save general + army + adventure profiles, dispatch all generals, run a battle script with repeating support |
| `user_quest_runner_utils.js` | *(library)* | Shared army/utility functions used by `user_quest_runner.js` |
| `user_geo_manager.js` | **Geo Manager** | Full geologist management: mine depletion tracking, auto-send, auto-build deposits, coverage logic |
| `user_expedition_runner.js` | **Expedition Runner** | Automate expedition marshal waves: load army, attack, swap army for next wave while battle is in progress |
| `user_coop_adventure.js` | **Co-op Adventure** | Accept incoming adventure invitations automatically, apply a selected buff/arrow item, and return home |
| `user_building_status.js` | **Building Status** | All buildings grouped by type with production status, deposit/depletion info, and warehouse storage levels |
| `user_inventory_tools.js` | **Inventory Tools** | Bulk-apply AddResource star-menu items to the Mayor's House; supports select-all and one-by-one use |
| `user_quick_actions.js` | **Quick Actions** | One-click recruit creation: applies Bread + Bronze Sword + Settler resource packs then opens the Barracks |
| `user_questlist.js` | **Quest List** | Displays all active quests by name with claim buttons |
| `user_friend_building_finder.js` | **Building Finder** | Search for buildings by name on any visited zone (home island or friend island) |
| `user_move_grid_tester.js` | **Move Grid Tester** | Developer tool: iterates grid indices and tests whether a general can move to each one; saves results to `mgt_results.json` |
| `user_deposit.js` | **Deposits Viewer** | Shows info about your current deposits |
| `user_buildlist.js` | **Building List** | List of buildings with monitoring for upgrades |
| `user_building_expansion.js` | **Building Expansion** | Expansion via templates with save/load and max-level limit |
| `user_generals.js` | **Generals** | Army info, status, send to adventures, army templates |
| `user_friends.js` | **Friends** | Info about friends and guild members |
| `user_guild.js` | **Guild** | Guild info with quest and player status |
| `user_zoneBuff.js` | **Zone Buffs** | Zone buff templates with save/load |
| `user_mine_rebuild.js` | **Mine Rebuild** | Mine rebuild helper |
| `user_showmyloot.js` | **Show My Loot** | Upload adventure loot to tsomaps.com |
| `user_langs.js` | **Languages** | Switch game UI language at runtime |
| `user_licence.js` | **Building Licenses** | Show used building licenses |
| `user_buffenhancer.js` | **Buff Enhancer** | Buff management enhancements |
| `user_quick_hour.js` | **Quick Hour** | Quick hour buff shortcuts |
| `user_shortcut_trader.js` | **Shortcut Trader** | Trader shortcuts |
| `user_drunken_miner.js` | **Drunken Miner** | Automated miner helper |
| `user_exp_time_matrix.js` | **Exp Time Matrix** | Experience/time matrix display |
| `user_geouienhancer.js` | **Geo UI Enhancer** | Geologist UI improvements |
| `user_ext_translate.js` | **Ext Translate** | Extended translation support |

---

## Script Details

### Adventurer (`user_quest_runner.js`)

**Why:** Running adventures requires placing the adventure, dispatching multiple generals with specific armies, navigating to the island, and then executing a sequence of attacks — all of which is tedious to do manually for every run.

**How:** You create a *profile* that stores the adventure name, one or more general steps (general + army composition), and a *battle script* (ordered list of move/attack/wait steps for the generals once on the island). Hit **Run** and the tool:
1. Validates all generals are idle and armies are available
2. Unloads existing armies from all generals to free the unit pool
3. Loads the correct army onto each general
4. Places the adventure from inventory if not already on the map
5. Waits for the adventure zone to register, sends co-op invitations if configured
6. Dispatches all generals to the adventure zone
7. Navigates to the adventure island and waits 30 s for the zone to load
8. Runs the battle script step-by-step (MOVE, ATTACK\_GRID, WAIT, RETURN\_HOME, etc.)

**Repeat mode:** Enable the *Repeat* checkbox before running. When all battle script steps finish, the tool polls until every general in the script is back on the home island (idle, `GetTask() == null`), navigates home, then starts the whole profile over automatically.

**When to use:** Any time you farm the same adventure repeatedly, or run a multi-general adventure that needs a scripted attack order.

---

### Quest Runner Utilities (`user_quest_runner_utils.js`)

**Why:** Common army-manipulation functions (unloading all generals simultaneously, polling for idle state) are needed by multiple scripts.

**How:** Exposes `window._qrUtils.unloadAll(specs, onDone)` — fires unload server messages for all passed general specs at once, then polls every 2 s until all report `HasUnits() === false` (or 30 s timeout). Required by `user_quest_runner.js`; load it first or alongside.

**When to use:** Always — it is a dependency of the Adventurer script.

---

### Expedition Runner (`user_expedition_runner.js`)

**Why:** Expedition attacks use marshals instead of generals and require the player to swap the marshal's army after every wave before it returns — otherwise the next attack uses the wrong units. Doing this manually across many waves is error-prone.

**How:** You configure a marshal and a list of waves (each wave = a unit composition snapshot). Hit **Run**:
1. Loads wave 1's army onto the marshal
2. Sends the attack (`SendServerAction 95`)
3. Waits until the marshal leaves the garrison (attack accepted)
4. While the battle is running, immediately loads wave 2's army so it is ready upon return
5. Repeats for all waves

**When to use:** Any expedition where you run multiple back-to-back waves with different unit compositions.

---

### Co-op Adventure (`user_coop_adventure.js`)

**Why:** When a friend sends an adventure invitation you normally have to notice the mail, click accept, travel to the zone, and manually apply your buff item — all while the invitation window is open.

**How:** Runs silently in the background. Polls the mail window for type-23 (adventure invitation) messages. On detection: accepts the invitation via `AdventureManager.setAdventureState`, travels to the zone with `visitZone`, applies the selected star-menu item (zone buff or combat item such as a Cupid's Arrow bomb) to the correct target, then returns home.

Access via **Tools → Co-op Adventure**. Select the item to apply in the picker, then click **Start**.

**When to use:** When you are the receiving player in a co-op adventure and want to apply buffs or combat items without manual interaction.

---

### Building Status (`user_building_status.js`)

**Why:** The default game UI shows buildings one at a time; there is no overview of which buildings are idle, buffed, running low on materials, or have depleted deposits.

**How:** Opens a panel (**Tools → Building Status**) that lists every building on your island grouped by category (Weapons, Food, Wood, Ore, etc.). Each row shows current production status, deposit level/depletion time for mines, active buffs with their end time, and warehouse stock levels.

**When to use:** Daily island management — quickly scan which buildings need attention without clicking each one individually.

---

### Inventory Tools (`user_inventory_tools.js`)

**Why:** Applying many AddResource star-menu items (wood packs, ore packs, etc.) one by one to the Mayor's House is slow.

**How:** Opens a panel (**Tools → Inventory Tools / Add Resources tab**) showing all transferable star-menu items. Check the ones you want and click **Use All**, or click **Use** on individual rows. Items are applied via `SendServerAction(61)` to the Mayor's House grid, with a short delay between each.

**When to use:** When you have accumulated many resource packs and want to dump them all in one go.

---

### Quick Actions (`user_quick_actions.js`)

**Why:** Creating recruits requires applying Bread, Bronze Sword, and Settler resource packs in sequence before opening the Barracks — repetitive when done often.

**How:** One click from **Tools → Quick Actions** applies all available Bread AddResource packs → all Bronze Sword packs → all Settler packs to the Mayor's House, then opens the Barracks. Bread packs also trigger Retired Bandits (+25 free settlers each via the Provision House). Resource costs are read dynamically from game data with a fallback of 1 Settler / 5 Bread / 10 Bronze Swords per recruit.

**When to use:** Any time you want to quickly convert star-menu resource packs into recruits.

---

### Quest List (`user_questlist.js`)

**Why:** The in-game quest book does not show all active quest names at a glance and requires clicking through each book page to find claimable rewards.

**How:** Opens a modal (**Tools → Quest List**) that scrapes all active quest book entries, displays them by name, and shows a **Claim** button on any quest that is ready to collect.

**When to use:** Quick daily check of which quests are complete and ready to claim.

---

### Building Finder (`user_friend_building_finder.js`)

**Why:** When visiting a friend's island you cannot search for a specific building by name — you have to scroll around the map manually.

**How:** Opens a panel (**Tools → Building Finder**) with a text search box. Enter a building name (partial match works) and click **Search**. Results list the building name, level, and grid index. Click **Go** to scroll the map view to that building.

Works on any currently viewed zone (your own island or a friend's).

**When to use:** When you need to find a specific building on a large or unfamiliar island.

---

### Move Grid Tester (`user_move_grid_tester.js`)

**Why:** Developer/research tool — needed to discover which grid indices are valid movement targets on an adventure zone, used when building battle script MOVE steps for new adventure maps.

**How:** Opens a panel (**Tools → Move Grid Tester**). Select a general and enter a start/end grid range. The tool sends move commands one by one, waits 1 s to see if the general's position changed (accepted) or not (rejected), records all reachable grids, and saves the full result to `mgt_results.json` in the game's app storage folder.

**When to use:** When mapping out a new adventure zone before writing a battle script for it.

---

### Geo Manager (`user_geo_manager.js`)

**Why:** Managing many geologists manually — assigning preferred ores, watching depletion timers, sending geos to depleted mines, building newly found deposits — is extremely time-consuming at scale.

**How:** Opens a multi-tab panel (**Tools → Geo Manager**):

- **Geologists** — every geo with current status, preferred ore type (saved persistently), and typical search time
- **Depleted Mines** — mines with no deposit; send a single geo or use *Send All* (two-phase, respects geo caps)
- **Depleting < 2h** — mines running low; shows which geo to watch and a direct **Send** button
- **Found / Not Built** — unclaimed deposits with build cost, affordability indicator, and one-click **Build** button
- **Not Urgent** — all other active mines; "Found In" shows which geo will arrive and whether before or after depletion
- **Auto-build** — while the panel is open, polls every 15 s and auto-builds any newly discovered deposits you can afford

Coverage logic: a geo covers a mine only if the geo's search time is less than the mine's depletion time.

**When to use:** Continuously during play, especially when managing 10+ geologists across multiple ore types.

---

## Client

The `client/` folder contains the C# WPF launcher (`client.sln`). Build with Visual Studio in x86/Release.

## License

See [LICENSE](LICENSE).
