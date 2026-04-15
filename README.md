# TSO Client Helper

A collection of userscripts and tools for **The Settlers Online** portable Windows client.

## Userscripts

All scripts live in `userscripts/` and are loaded automatically by the client. Drop any `.js` file into the client's `userscripts` folder to activate it.

| Script | Name | Description |
|---|---|---|
| `user_geo_manager.js` | **Geo Manager** | Full geologist management: idle/busy geos with per-geo preferred ore type; active mine depletion countdowns; depleted mine list with smart auto-send; auto-build new deposits; per-building game-limit marking; quarry cap (1 geo per quarry ore); geo-to-mine assignment display; auto-send toggle + max-geos-per-cycle control; correct coverage logic (geo search time must exceed mine depletion time, per geo per ore) |
| `user_deposit.js` | Deposits Viewer | Shows info about your deposits |
| `user_buildlist.js` | Building List | List of buildings with monitoring for upgrades |
| `user_building_expansion.js` | Building Expansion | Expansion via templates with save/load and max-level limit |
| `user_generals.js` | Generals | Army info, status, send to adventures, templates |
| `user_friends.js` | Friends | Info about friends and guild members |
| `user_guild.js` | Guild | Guild info with quest and player status |
| `user_zoneBuff.js` | Zone Buffs | Zone buff templates with save/load |
| `user_mine_rebuild.js` | Mine Rebuild | Mine rebuild helper |
| `user_showmyloot.js` | Show My Loot | Upload adventure loot to tsomaps.com |
| `user_langs.js` | Languages | Switch game UI language at runtime |
| `user_licence.js` | Building Licenses | Show used building licenses |
| `user_buff_enhancer.js` | Buff Enhancer | Buff management enhancements |
| `user_quick_hour.js` | Quick Hour | Quick hour buff shortcuts |
| `user_shortcut_trader.js` | Shortcut Trader | Trader shortcuts |
| `user_drunken_miner.js` | Drunken Miner | Automated miner helper |
| `user_exp_time_matrix.js` | Exp Time Matrix | Experience/time matrix display |
| `user_geouienhancer.js` | Geo UI Enhancer | Geologist UI improvements |
| `user_ext_translate.js` | Ext Translate | Extended translation support |

## Geo Manager Highlights

Accessible via **Tools → Geo Manager**:

- **Geologists tab** — see every geo with current status, preferred ore type (persistent), and typical search time
- **Depleted Mines** — list of mines with no deposit left; send a geo or use *Send All* (two-phase, checks caps)
- **Depleting < 2h** — mines running low; shows closest geo relative to depletion time with a direct Send button
- **Found / Not Built** — unclaimed deposits; shows build cost and affordability, one-click Build Mine button
- **Not Urgent** — all other active mines; "Found In" column shows which geo to watch and whether it'll arrive before or after depletion
- **Auto-build** — while Geo Manager is open, automatically builds any newly found deposits you can afford (polls every 15 seconds, skips pre-existing deposits on startup)

## Client

The `client/` folder contains the C# WPF launcher (`client.sln`). Build with Visual Studio in x86/Release.

## License

See [LICENSE](LICENSE).
