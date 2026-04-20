// Co-op Adventure — Accept adventure invitations, apply a buff, and return home.
// Access via: Tools -> Co-op Adventure
//
// This tool runs in the background even when the modal is closed/minimized.
// It polls for incoming adventure invitations, accepts them, travels to the
// adventure zone, applies the selected zone buff, and returns to the home island.

try { addToolsMenuItem('Co-op Adventure', _caOpenModal); } catch (e) {}

// ---- State ----
var _caModal = null;
var _caRunning = false;
var _caPollTimer = null;
var _caState = null; // { phase, advVO, buffName, ... }
var _caSelectedBuff = '';
var _caAutoAccept = true;
var _caChatLog = [];
var _caLastKnownAdventures = []; // track adventure list to detect new joins

// ---- Helpers ----
function _caLog(msg) {
    var ts = new Date().toLocaleTimeString();
    var line = '[' + ts + '] ' + msg;
    try { game.chatMessage('Co-op: ' + msg, 'adventurer'); } catch (e) {}
    _caChatLog.push(line);
    if (_caChatLog.length > 20) { _caChatLog.shift(); }
    _caUpdateLogPanel();
}

function _caUpdateLogPanel() {
    var $log = $('#caRunLog');
    if (!$log.length) return;
    $log.html(_caChatLog.map(function (l) {
        return '<div style="font-size:11px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            l.replace(/</g, '&lt;') + '</div>';
    }).join(''));
    $log.scrollTop($log[0].scrollHeight);
}

// ---- Get ALL star menu items (buffs, arrows, etc.) ----
function _caGetStarMenuItems() {
    var items = [];
    try {
        var vec = game.gi.mCurrentPlayer.mAvailableBuffs_vector;
        for (var i = 0; i < vec.length; i++) {
            var item = vec[i];
            var type = '';
            try { type = item.GetType(); } catch (e) { continue; }
            // Skip adventures, resources, deposits, and building placements
            if (type === 'Adventure' || type.indexOf('AddResource') === 0 || type === 'FillDeposit' || type === 'BuildBuilding') { continue; }
            var resName = '';
            try { resName = item.GetResourceName_string(); } catch (e) {}
            // Buff items have no resName — use type as the key
            var itemKey = resName || type;
            var amount = 1;
            try { amount = item.GetAmount(); } catch (e) {}
            var uid1 = 0, uid2 = 0;
            try { uid1 = item.GetUniqueId().uniqueID1; } catch (e) {}
            try { uid2 = item.GetUniqueId().uniqueID2; } catch (e) {}
            var displayName = '';
            try { displayName = loca.GetText('RES', type, ['', resName]); } catch (e) {}
            if (!displayName || displayName === type || displayName === resName) {
                try { displayName = loca.GetText('RES', type); } catch (e) {}
            }
            if (!displayName || displayName === type) {
                try { displayName = loca.GetText('RES', resName || type); } catch (e) {}
            }
            if (!displayName || displayName === type) {
                try { displayName = loca.GetText('SHI', type); } catch (e) {}
            }
            if (!displayName) displayName = type;
            items.push({
                type: type,
                name: itemKey,
                displayName: displayName,
                amount: amount,
                id: uid1 + '_' + uid2
            });
        }
    } catch (e) { _caLog('ERR _caGetStarMenuItems: ' + e); }
    items.sort(function (a, b) { return a.displayName.localeCompare(b.displayName); });
    return items;
}

// ---- Get zone buffs only (for checking if running) ----
function _caGetZoneBuffs() {
    var buffs = [];
    try {
        var buffVector = game.getBuffs();
        for (var i = 0; i < buffVector.length; i++) {
            var data = buffVector[i];
            var def = data.GetBuffDefinition();
            if (def.GetBuffType() === 8 && def.GetName_string() !== 'ChangeColorScheme') {
                buffs.push(def.GetName_string());
            }
        }
    } catch (e) {}
    return buffs;
}

// ---- Get adventures I've joined (not owned by me) ----
function _caGetJoinedAdventures() {
    var joined = [];
    try {
        var AdvManager = swmmo.getDefinitionByName("com.bluebyte.tso.adventure.logic::AdventureManager").getInstance();
        var advs = AdvManager.getAdventures();
        if (advs) {
            for (var i = 0; i < advs.length; i++) {
                var adv = advs[i];
                if (AdvManager.isMyAdventure(adv)) continue; // skip my own
                // Find my status in the player list
                var myId = game.gi.mCurrentPlayer.GetPlayerId();
                var myStatus = -1;
                try {
                    if (adv.players) {
                        for (var p = 0; p < adv.players.length; p++) {
                            var pl = adv.players.getItemAt ? adv.players.getItemAt(p) : adv.players[p];
                            if (pl && pl.id === myId) { myStatus = pl.status; break; }
                        }
                    }
                } catch (pe) {}
                adv._myStatus = myStatus;
                joined.push(adv);
            }
        }
    } catch (e) { _caLog('ERR getJoined: ' + e); }
    return joined;
}

// ---- Get ALL adventures (to detect new ones appearing) ----
function _caGetAllAdventures() {
    var all = [];
    try {
        var AdvManager = swmmo.getDefinitionByName("com.bluebyte.tso.adventure.logic::AdventureManager").getInstance();
        var advs = AdvManager.getAdventures();
        if (advs) { for (var i = 0; i < advs.length; i++) { all.push(advs[i]); } }
    } catch (e) { _caLog('ERR getAllAdvs: ' + e); }
    return all;
}

// ---- Accept a pending adventure invitation ----
function _caAcceptAdventure(adv) {
    try {
        var AdvManager = swmmo.getDefinitionByName("com.bluebyte.tso.adventure.logic::AdventureManager").getInstance();
        _caLog('Accepting: ' + adv.adventureName + ' (zone ' + adv.zoneID + ')');
        var result = AdvManager.setAdventureState(adv.zoneID, 1);
        _caLog('setAdventureState(' + adv.zoneID + ', 1) = ' + result);
        // Update the joined count so the game tracks it
        try { AdvManager.increaseJoinedAdventuresCount(); } catch (e2) {}
        return !!result;
    } catch (e) { _caLog('ERR accept: ' + e); }
    return false;
}

// ---- Check if a zone buff is already running ----
function _caIsBuffRunning(buffName) {
    try {
        return game.gi.mZoneBuffManager.isBuffRunning(buffName);
    } catch (e) { return false; }
}

// ---- Find the first enemy camp grid on the current zone ----
function _caFindEnemyCampGrid() {
    var campGrid = null;
    try {
        var buildings = game.zone.mStreetDataMap.GetBuildings_vector();
        for (var i = 0; i < buildings.length; i++) {
            if (campGrid) break;
            var b = buildings[i];
            try {
                var owner = b.GetOwner ? b.GetOwner() : -1;
                var myId = game.gi.mCurrentPlayer.GetPlayerId();
                if (owner !== myId && owner > 0) {
                    campGrid = b.GetGrid();
                }
            } catch (e) {}
        }
    } catch (e) {}
    return campGrid;
}

// ---- Apply a star menu item by name ----
function _caApplyItem(itemName) {
    // First try as a zone buff (grid=0)
    var zoneBuffs = _caGetZoneBuffs();
    var isZoneBuff = zoneBuffs.indexOf(itemName) !== -1;

    if (isZoneBuff) {
        // Apply as zone buff
        var applied = false;
        try {
            var buffVector = game.getBuffs();
            for (var i = 0; i < buffVector.length; i++) {
                var data = buffVector[i];
                if (data.GetBuffDefinition().GetName_string() === itemName) {
                    applied = true;
                    game.gi.SendServerAction(61, 0, 0, 0, data.GetUniqueId());
                    _caLog('Applied zone buff: ' + loca.GetText('RES', itemName));
                    break;
                }
            }
        } catch (e) {}
        return applied;
    }

    // Not a zone buff — it's an arrow/combat item, apply to enemy camp
    var applied = false;
    try {
        var vec = game.gi.mCurrentPlayer.mAvailableBuffs_vector;
        for (var i = 0; i < vec.length; i++) {
            var item = vec[i];
            try {
                if (item.GetResourceName_string() === itemName) {
                    var campGrid = _caFindEnemyCampGrid();
                    if (!campGrid) {
                        _caLog('No enemy camp found to apply ' + itemName);
                        break;
                    }
                    applied = true;
                    game.gi.SendServerAction(61, 0, campGrid, 1, item.GetUniqueId());
                    _caLog('Applied ' + (loca.GetText('RES', itemName) || itemName) + ' to enemy camp at grid ' + campGrid);
                    break;
                }
            } catch (e) {}
        }
    } catch (e) {}
    return applied;
}

// ---- Phase machine ----
// Phases: idle → detected → traveling → applying → returning → idle
function _caPoll() {
    if (!_caRunning) return;

    if (!_caState) {
        // IDLE — look for new adventures I've been invited to
        var currentAdvs = _caGetAllAdventures();
        var myId = game.gi.mCurrentPlayer.GetPlayerId();

        // Detect NEW adventures that weren't in our last snapshot
        var newJoined = [];
        currentAdvs.forEach(function (adv) {
            if (adv.ownerPlayerID === myId) return; // my own adventure
            var wasKnown = false;
            _caLastKnownAdventures.forEach(function (old) {
                if (old.zoneID === adv.zoneID) wasKnown = true;
            });
            if (!wasKnown) {
                newJoined.push(adv);
            }
        });

        // Update snapshot
        _caLastKnownAdventures = currentAdvs.map(function (a) {
            return { zoneID: a.zoneID, adventureName: a.adventureName, ownerPlayerID: a.ownerPlayerID };
        });

        if (newJoined.length > 0) {
            var adv = newJoined[0];
            var advName = loca.GetText('ADN', adv.adventureName) || adv.adventureName;
            _caLog('Invitation detected: ' + advName + ' (zone ' + adv.zoneID + ')');

            if (!_caSelectedBuff) {
                _caLog('No buff selected — skipping auto-travel. Select a buff first.');
                return;
            }

            _caState = {
                phase: 'detected',
                advVO: adv,
                advName: advName,
                buffName: _caSelectedBuff,
                startTime: Date.now(),
                retries: 0
            };
        }

        // Also check existing joined adventures that we might need to act on
        if (!_caState) {
            var joined = _caGetJoinedAdventures();
            for (var ji = 0; ji < joined.length; ji++) {
                if (_caState) break;
                var adv = joined[ji];
                if (_caSelectedBuff) {
                    // If pending, try to accept first
                    if (adv._myStatus === 0) {
                        _caAcceptAdventure(adv);
                    }
                    _caState = {
                        phase: 'detected',
                        advVO: adv,
                        advName: loca.GetText('ADN', adv.adventureName) || adv.adventureName,
                        buffName: _caSelectedBuff,
                        startTime: Date.now(),
                        retries: 0
                    };
                    _caLog('Acting on adventure: ' + _caState.advName + ' (myStatus=' + (adv._myStatus || '?') + ')');
                }
            }
        }
        _caUpdateStatus();
        return;
    }

    // State machine
    switch (_caState.phase) {
        case 'detected':
            // Travel to adventure zone
            if (!game.gi.isOnHomzone() && game.gi.mCurrentViewedZoneID !== _caState.advVO.zoneID) {
                // Go home first, then travel to adventure
                _caLog('Going home first before traveling to adventure...');
                game.gi.visitZone(game.gi.mCurrentPlayer.GetHomeZoneId());
                _caState.phase = 'going_home_first';
                _caState.retries = 0;
            } else {
                _caLog('Traveling to ' + _caState.advName + '...');
                game.gi.visitZone(_caState.advVO.zoneID);
                _caState.phase = 'traveling';
                _caState.retries = 0;
            }
            break;

        case 'going_home_first':
            // Wait until we're home
            if (game.gi.isOnHomzone()) {
                _caLog('Home. Now traveling to ' + _caState.advName + '...');
                game.gi.visitZone(_caState.advVO.zoneID);
                _caState.phase = 'traveling';
                _caState.retries = 0;
            } else {
                _caState.retries++;
                if (_caState.retries > 30) {
                    _caLog('Timeout going home. Aborting.');
                    _caState = null;
                }
            }
            break;

        case 'traveling':
            // Wait until we arrive at the adventure zone
            if (game.gi.mCurrentViewedZoneID === _caState.advVO.zoneID) {
                _caLog('Arrived at ' + _caState.advName);
                _caState.phase = 'applying';
                _caState.retries = 0;
            } else {
                _caState.retries++;
                if (_caState.retries > 30) {
                    _caLog('Timeout traveling. Retrying...');
                    game.gi.visitZone(_caState.advVO.zoneID);
                    _caState.retries = 0;
                }
            }
            break;

        case 'applying':
            // Apply the selected item (zone buff or arrow/combat item)
            var isZB = _caGetZoneBuffs().indexOf(_caState.buffName) !== -1;
            if (isZB && _caIsBuffRunning(_caState.buffName)) {
                _caLog('Buff already running on this zone. Heading home...');
                _caState.phase = 'returning';
                _caState.retries = 0;
            } else {
                var applied = _caApplyItem(_caState.buffName);
                if (applied) {
                    _caState.phase = 'wait_buff';
                    _caState.retries = 0;
                } else {
                    _caLog('Could not apply item. Heading home anyway...');
                    _caState.phase = 'returning';
                    _caState.retries = 0;
                }
            }
            break;

        case 'wait_buff':
            // Brief wait then go home (arrows apply instantly, zone buffs we check)
            var isZB2 = _caGetZoneBuffs().indexOf(_caState.buffName) !== -1;
            if (!isZB2 || _caIsBuffRunning(_caState.buffName) || _caState.retries > 5) {
                _caLog('Done. Returning home...');
                game.gi.visitZone(game.gi.mCurrentPlayer.GetHomeZoneId());
                _caState.phase = 'returning';
                _caState.retries = 0;
            } else {
                _caState.retries++;
            }
            break;

        case 'returning':
            // Wait until we're home
            if (game.gi.isOnHomzone()) {
                _caLog('Back home! Co-op cycle complete for ' + _caState.advName);
                _caState = null;
            } else {
                _caState.retries++;
                if (_caState.retries > 30) {
                    _caLog('Timeout returning home. Retrying...');
                    game.gi.visitZone(game.gi.mCurrentPlayer.GetHomeZoneId());
                    _caState.retries = 0;
                }
            }
            break;

        default:
            _caState = null;
    }
    _caUpdateStatus();
}

// ---- Status display ----
function _caUpdateStatus() {
    var $status = $('#caStatusText');
    if (!$status.length) return;
    if (!_caRunning) {
        $status.text('Stopped').css('color', '#888');
        return;
    }
    if (!_caState) {
        $status.text('Watching for invitations...').css('color', '#8bc34a');
    } else {
        var phaseName = _caState.phase.replace(/_/g, ' ');
        $status.text(phaseName + ' — ' + _caState.advName).css('color', '#ffb74d');
    }
}

// ---- Start / Stop ----
function _caStart() {
    if (_caRunning) return;
    _caRunning = true;
    _caState = null;
    _caLastKnownAdventures = [];

    // Immediately check for existing adventures I've been invited to
    var existingJoined = _caGetJoinedAdventures();
    if (existingJoined.length > 0 && _caSelectedBuff) {
        var adv = existingJoined[0];
        var advName = loca.GetText('ADN', adv.adventureName) || adv.adventureName;
        _caLog('Found adventure: ' + advName + ' (zone ' + adv.zoneID + ', myStatus=' + (adv._myStatus || '?') + ')');

        // If our status is 0 (pending), try to accept first
        if (adv._myStatus === 0) {
            _caLog('Status is pending (0) — attempting to accept...');
            _caAcceptAdventure(adv);
        }

        _caState = {
            phase: 'detected',
            advVO: adv,
            advName: advName,
            buffName: _caSelectedBuff,
            startTime: Date.now(),
            retries: 0
        };
    } else if (existingJoined.length > 0) {
        _caLog('Found ' + existingJoined.length + ' existing invitation(s) but no item selected.');
    } else {
        // Log all adventures for debug even if none are "joined"
        var allAdvs = _caGetAllAdventures();
        _caLog('No joined adventures found. Total adventures in manager: ' + allAdvs.length);
    }

    // Snapshot current adventures for future NEW detection
    _caLastKnownAdventures = _caGetAllAdventures().map(function (a) {
        return { zoneID: a.zoneID, adventureName: a.adventureName, ownerPlayerID: a.ownerPlayerID };
    });

    _caPollTimer = setInterval(_caPoll, 3000);
    _caLog('Started — watching for adventure invitations');
    _caUpdateStatus();
    $('#caStartBtn').prop('disabled', true).addClass('disabled');
    $('#caStopBtn').prop('disabled', false).removeClass('disabled');
}

function _caStop() {
    _caRunning = false;
    if (_caPollTimer) { clearInterval(_caPollTimer); _caPollTimer = null; }
    _caState = null;
    _caLog('Stopped');
    _caUpdateStatus();
    $('#caStartBtn').prop('disabled', false).removeClass('disabled');
    $('#caStopBtn').prop('disabled', true).addClass('disabled');
}

// ---- Introspect helper (same as quest runner's approach) ----
function _caDescribe(obj) {
    var xml = window.runtime.flash.utils.describeType(obj);
    var parser = new DOMParser();
    return parser.parseFromString(xml, 'text/xml').firstChild;
}

// ---- Dump API to find invitation-related properties ----
function _caDumpAPI() {
    var lines = [];
    var filter = /invit|advent|coop|mail|message|notification|pending|request|accept|join/i;

    lines.push('=== Player API Dump ===');
    try {
        var root = _caDescribe(game.gi.mCurrentPlayer);
        var vars = root.querySelectorAll('variable');
        for (var i = 0; i < vars.length; i++) {
            var name = vars[i].getAttribute('name');
            var type = vars[i].getAttribute('type');
            if (filter.test(name + type)) {
                var val = '';
                try { val = game.gi.mCurrentPlayer[name]; } catch(e) { val = 'ERR'; }
                lines.push('P V: ' + name + ' : ' + type + ' = ' + val);
            }
        }
        var accs = root.querySelectorAll('accessor');
        for (var i = 0; i < accs.length; i++) {
            var name = accs[i].getAttribute('name');
            var type = accs[i].getAttribute('type');
            if (filter.test(name + type)) {
                var val = '';
                try { val = game.gi.mCurrentPlayer[name]; } catch(e) { val = 'ERR'; }
                lines.push('P A: ' + name + ' : ' + type + ' = ' + val);
            }
        }
        var meths = root.querySelectorAll('method');
        for (var i = 0; i < meths.length; i++) {
            var name = meths[i].getAttribute('name');
            var ret = meths[i].getAttribute('returnType');
            if (filter.test(name + ret)) {
                lines.push('P M: ' + name + '() -> ' + ret);
            }
        }
    } catch(e) { lines.push('Player describe err: ' + e); }

    // mClientMessages
    lines.push('');
    lines.push('=== mClientMessages ===');
    try {
        var root2 = _caDescribe(game.gi.mClientMessages);
        var meths2 = root2.querySelectorAll('method');
        for (var i = 0; i < meths2.length; i++) {
            lines.push('CM M: ' + meths2[i].getAttribute('name') + '() -> ' + meths2[i].getAttribute('returnType'));
        }
        var vars2 = root2.querySelectorAll('variable');
        for (var i = 0; i < vars2.length; i++) {
            lines.push('CM V: ' + vars2[i].getAttribute('name') + ' : ' + vars2[i].getAttribute('type'));
        }
    } catch(e) { lines.push('CM err: ' + e); }

    // Channels
    lines.push('');
    lines.push('=== Channels ===');
    try {
        var root3 = _caDescribe(game.gi.channels);
        var vars3 = root3.querySelectorAll('variable');
        for (var i = 0; i < vars3.length; i++) {
            lines.push('CH V: ' + vars3[i].getAttribute('name') + ' : ' + vars3[i].getAttribute('type'));
        }
        var accs3 = root3.querySelectorAll('accessor');
        for (var i = 0; i < accs3.length; i++) {
            lines.push('CH A: ' + accs3[i].getAttribute('name') + ' : ' + accs3[i].getAttribute('type'));
        }
    } catch(e) { lines.push('Channels err: ' + e); }

    // mMailWindow — deep exploration
    lines.push('');
    lines.push('=== mMailWindow deep ===');
    try {
        var mw = globalFlash.gui.mMailWindow;
        var root4 = _caDescribe(mw);
        var meths4 = root4.querySelectorAll('method');
        for (var i = 0; i < meths4.length; i++) {
            lines.push('MW M: ' + meths4[i].getAttribute('name') + '() -> ' + meths4[i].getAttribute('returnType'));
        }
        var vars4 = root4.querySelectorAll('variable');
        for (var i = 0; i < vars4.length; i++) {
            lines.push('MW V: ' + vars4[i].getAttribute('name') + ' : ' + vars4[i].getAttribute('type'));
        }
        var accs4 = root4.querySelectorAll('accessor');
        for (var i = 0; i < accs4.length; i++) {
            lines.push('MW A: ' + accs4[i].getAttribute('name') + ' : ' + accs4[i].getAttribute('type'));
        }
    } catch(e) { lines.push('MailWindow err: ' + e); }

    // getMPanel() — the actual panel component
    lines.push('');
    lines.push('=== MailWindow Panel (getMPanel) ===');
    try {
        var mp = globalFlash.gui.mMailWindow.getMPanel();
        var root4b = _caDescribe(mp);
        var vars4b = root4b.querySelectorAll('variable');
        for (var i = 0; i < vars4b.length; i++) {
            var vn = vars4b[i].getAttribute('name');
            var vt = vars4b[i].getAttribute('type');
            var vv = '';
            try { vv = mp[vn]; } catch(e) { vv = 'ERR'; }
            lines.push('MP V: ' + vn + ' : ' + vt + ' = ' + vv);
        }
        var accs4b = root4b.querySelectorAll('accessor');
        for (var i = 0; i < accs4b.length; i++) {
            var an = accs4b[i].getAttribute('name');
            var at = accs4b[i].getAttribute('type');
            var av = '';
            try { av = mp[an]; } catch(e) { av = 'ERR'; }
            lines.push('MP A: ' + an + ' : ' + at + ' = ' + av);
        }
        var meths4b = root4b.querySelectorAll('method');
        for (var i = 0; i < meths4b.length; i++) {
            var mn = meths4b[i].getAttribute('name');
            var mr = meths4b[i].getAttribute('returnType');
            var params = [];
            var pNodes = meths4b[i].querySelectorAll('parameter');
            for (var j = 0; j < pNodes.length; j++) {
                params.push(pNodes[j].getAttribute('type'));
            }
            lines.push('MP M: ' + mn + '(' + params.join(', ') + ') -> ' + mr);
        }
    } catch(e) { lines.push('MailPanel err: ' + e); }

    // Explore mail list via mailsList.dataProvider
    lines.push('');
    lines.push('=== Mail List (mailsList.dataProvider) ===');
    try {
        var mp2 = globalFlash.gui.mMailWindow.getMPanel();
        var grid = mp2.mailsList;
        lines.push('mailsList type: ' + window.runtime.flash.utils.getQualifiedClassName(grid));
        var dp = grid.dataProvider;
        if (dp) {
            var dpType = window.runtime.flash.utils.getQualifiedClassName(dp);
            lines.push('dataProvider type: ' + dpType);
            var len = dp.length;
            lines.push('dataProvider.length: ' + len);
            // Also check source
            try {
                if (dp.source) {
                    lines.push('dp.source type: ' + window.runtime.flash.utils.getQualifiedClassName(dp.source));
                    lines.push('dp.source.length: ' + dp.source.length);
                }
            } catch(e) {}
            // List all mails
            var max = Math.min(len, 30);
            for (var mi = 0; mi < max; mi++) {
                var mail = dp.getItemAt ? dp.getItemAt(mi) : dp[mi];
                if (!mail) continue;
                var mType = '';
                try { mType = window.runtime.flash.utils.getQualifiedClassName(mail); } catch(e) {}
                var mInfo = 'type=' + mail.type + ' sender="' + (mail.senderName || '') + '"' +
                    ' subject="' + (mail.subject || '') + '"' +
                    ' header="' + (mail.header || '') + '"' +
                    ' id=' + (mail.id || '') + ' ts=' + (mail.timestamp || '');
                lines.push('  [' + mi + '] (' + mType + '): ' + mInfo);
            }
            // Now find adventure invitation mails specifically
            lines.push('');
            lines.push('--- Adventure invitation mails (full dump) ---');
            var found = 0;
            for (var mi2 = 0; mi2 < len; mi2++) {
                var mail2 = dp.getItemAt ? dp.getItemAt(mi2) : dp[mi2];
                if (!mail2) continue;
                // Check all types we think might be adventure-related
                var isAdv = (mail2.type >= 14 && mail2.type <= 20) ||
                    /advent|invit/i.test((mail2.subject || '') + (mail2.senderName || '') + (mail2.header || ''));
                if (!isAdv) continue;
                found++;
                lines.push('  ADV MAIL [' + mi2 + ']:');
                try {
                    var mRoot = _caDescribe(mail2);
                    var mVars = mRoot.querySelectorAll('variable');
                    for (var mv = 0; mv < mVars.length; mv++) {
                        var mvn = mVars[mv].getAttribute('name');
                        var mvt = mVars[mv].getAttribute('type');
                        var mvv = '';
                        try { mvv = mail2[mvn]; } catch(e) { mvv = 'ERR'; }
                        lines.push('    V: ' + mvn + ' : ' + mvt + ' = ' + mvv);
                    }
                    var mAccs = mRoot.querySelectorAll('accessor');
                    for (var ma = 0; ma < mAccs.length; ma++) {
                        var man = mAccs[ma].getAttribute('name');
                        var mat = mAccs[ma].getAttribute('type');
                        var mav = '';
                        try { mav = mail2[man]; } catch(e) { mav = 'ERR'; }
                        lines.push('    A: ' + man + ' : ' + mat + ' = ' + mav);
                    }
                } catch(e) { lines.push('    describe err: ' + e); }
                if (found >= 5) break; // limit
            }
            if (found === 0) lines.push('  (none found)');
        } else {
            lines.push('dataProvider is null — try opening your mailbox first');
        }
    } catch(e) { lines.push('Mail list err: ' + e); }

    // Also try mailPager
    lines.push('');
    lines.push('=== mailPager ===');
    try {
        var mp3 = globalFlash.gui.mMailWindow.getMPanel();
        var pager = mp3.mailPager;
        if (pager) {
            var pRoot = _caDescribe(pager);
            var pMethods = pRoot.querySelectorAll('method');
            for (var pi = 0; pi < pMethods.length; pi++) {
                lines.push('PG M: ' + pMethods[pi].getAttribute('name') + '() -> ' + pMethods[pi].getAttribute('returnType'));
            }
            var pVars = pRoot.querySelectorAll('variable');
            for (var pi2 = 0; pi2 < pVars.length; pi2++) {
                var pvn = pVars[pi2].getAttribute('name');
                var pvt = pVars[pi2].getAttribute('type');
                var pvv = '';
                try { pvv = pager[pvn]; } catch(e) { pvv = 'ERR'; }
                lines.push('PG V: ' + pvn + ' : ' + pvt + ' = ' + pvv);
            }
            var pAccs = pRoot.querySelectorAll('accessor');
            for (var pi3 = 0; pi3 < pAccs.length; pi3++) {
                var pan = pAccs[pi3].getAttribute('name');
                var pat = pAccs[pi3].getAttribute('type');
                var pav = '';
                try { pav = pager[pan]; } catch(e) { pav = 'ERR'; }
                lines.push('PG A: ' + pan + ' : ' + pat + ' = ' + pav);
            }
        }
    } catch(e) { lines.push('mailPager err: ' + e); }

    // Describe dMailVO from an actual instance if we have one
    lines.push('');
    lines.push('=== dMailVO structure (from first mail) ===');
    try {
        var mp4 = globalFlash.gui.mMailWindow.getMPanel();
        var dp4 = mp4.mailsList.dataProvider;
        if (dp4 && dp4.length > 0) {
            var firstMail = dp4.getItemAt ? dp4.getItemAt(0) : dp4[0];
            if (firstMail) {
                var fRoot = _caDescribe(firstMail);
                var fVars = fRoot.querySelectorAll('variable');
                for (var fi = 0; fi < fVars.length; fi++) {
                    lines.push('  V: ' + fVars[fi].getAttribute('name') + ' : ' + fVars[fi].getAttribute('type'));
                }
                var fAccs = fRoot.querySelectorAll('accessor');
                for (var fi2 = 0; fi2 < fAccs.length; fi2++) {
                    lines.push('  A: ' + fAccs[fi2].getAttribute('name') + ' : ' + fAccs[fi2].getAttribute('type'));
                }
                var fMethods = fRoot.querySelectorAll('method');
                for (var fi3 = 0; fi3 < fMethods.length; fi3++) {
                    var fmn = fMethods[fi3].getAttribute('name');
                    var fmr = fMethods[fi3].getAttribute('returnType');
                    var fParams = [];
                    var fpNodes = fMethods[fi3].querySelectorAll('parameter');
                    for (var fj = 0; fj < fpNodes.length; fj++) {
                        fParams.push(fpNodes[fj].getAttribute('type'));
                    }
                    lines.push('  M: ' + fmn + '(' + fParams.join(', ') + ') -> ' + fmr);
                }
            }
        }
    } catch(e) { lines.push('dMailVO struct err: ' + e); }
    try {
        var cached = globalFlash.gui.mMailWindow.getMailInCache();
        if (cached) {
            var cType = window.runtime.flash.utils.getQualifiedClassName(cached);
            lines.push('cached mail type: ' + cType);
            var cRoot = _caDescribe(cached);
            var cVars = cRoot.querySelectorAll('variable');
            for (var ci = 0; ci < cVars.length; ci++) {
                var cvn = cVars[ci].getAttribute('name');
                var cvt = cVars[ci].getAttribute('type');
                var cvv = '';
                try { cvv = cached[cvn]; } catch(e) { cvv = 'ERR'; }
                lines.push('  ' + cvn + ' : ' + cvt + ' = ' + cvv);
            }
        } else {
            lines.push('getMailInCache() returned null/undefined');
        }
    } catch(e) { lines.push('getMailInCache err: ' + e); }

    // dMailVO describe (from class itself)
    lines.push('');
    lines.push('=== dMailVO class ===');
    try {
        var mailClass = swmmo.getDefinitionByName('Communication.VO.Mail::dMailVO');
        if (mailClass) {
            var mcRoot = _caDescribe(mailClass);
            var mcConsts = mcRoot.querySelectorAll('constant');
            for (var mci = 0; mci < mcConsts.length; mci++) {
                lines.push('MailVO C: ' + mcConsts[mci].getAttribute('name') + ' = ' + mailClass[mcConsts[mci].getAttribute('name')]);
            }
        }
    } catch(e) { lines.push('dMailVO err: ' + e); }

    // mAdventurePanel deep
    lines.push('');
    lines.push('=== mAdventurePanel deep ===');
    try {
        var panel = globalFlash.gui.mAdventurePanel;
        var root5 = _caDescribe(panel);
        var vars5 = root5.querySelectorAll('variable');
        for (var i = 0; i < vars5.length; i++) {
            var vn = vars5[i].getAttribute('name');
            var vt = vars5[i].getAttribute('type');
            var vv = '';
            try { vv = panel[vn]; } catch(e) { vv = 'ERR'; }
            lines.push('AP V: ' + vn + ' : ' + vt + ' = ' + vv);
        }
        var meths5 = root5.querySelectorAll('method');
        for (var i = 0; i < meths5.length; i++) {
            lines.push('AP M: ' + meths5[i].getAttribute('name') + '() -> ' + meths5[i].getAttribute('returnType'));
        }
    } catch(e) { lines.push('AP err: ' + e); }

    // AdventureManager deep
    lines.push('');
    lines.push('=== AdventureManager deep ===');
    try {
        var AdvManager = swmmo.getDefinitionByName("com.bluebyte.tso.adventure.logic::AdventureManager").getInstance();
        var root6 = _caDescribe(AdvManager);
        var meths6 = root6.querySelectorAll('method');
        for (var i = 0; i < meths6.length; i++) {
            var mn = meths6[i].getAttribute('name');
            var mr = meths6[i].getAttribute('returnType');
            var params = [];
            var pNodes = meths6[i].querySelectorAll('parameter');
            for (var j = 0; j < pNodes.length; j++) {
                params.push(pNodes[j].getAttribute('type'));
            }
            lines.push('AM M: ' + mn + '(' + params.join(', ') + ') -> ' + mr);
        }
        var vars6 = root6.querySelectorAll('variable');
        for (var i = 0; i < vars6.length; i++) {
            lines.push('AM V: ' + vars6[i].getAttribute('name') + ' : ' + vars6[i].getAttribute('type'));
        }
        var accs6 = root6.querySelectorAll('accessor');
        for (var i = 0; i < accs6.length; i++) {
            lines.push('AM A: ' + accs6[i].getAttribute('name') + ' : ' + accs6[i].getAttribute('type'));
        }
    } catch(e) { lines.push('AM err: ' + e); }

    // ServerAction constants
    lines.push('');
    lines.push('=== SendServerAction exploration ===');
    try {
        var saClass = swmmo.getDefinitionByName('Communication.VO::dServerAction');
        if (saClass) {
            var root7 = _caDescribe(saClass);
            var consts = root7.querySelectorAll('constant');
            for (var i = 0; i < consts.length; i++) {
                var cn = consts[i].getAttribute('name');
                if (/invit|advent|accept|join/i.test(cn)) {
                    lines.push('SA C: ' + cn + ' = ' + saClass[cn]);
                }
            }
        }
    } catch(e) { lines.push('SA err: ' + e); }

    // Write to file
    try {
        var f = air.File.documentsDirectory.resolvePath('coop_api_dump.txt');
        var fs = new air.FileStream();
        fs.open(f, air.FileMode.WRITE);
        fs.writeUTFBytes(lines.join('\n'));
        fs.close();
        _caLog('API dump saved to: ' + f.nativePath);
        game.chatMessage('Co-op API dump saved to ' + f.nativePath, 'adventurer');
    } catch(e) {
        _caLog('File write err: ' + e + '. Dumping to chat instead.');
        for (var li = 0; li < lines.length; li++) {
            game.chatMessage(lines[li], 'adventurer');
        }
    }
}

// ---- Modal ----
function _caOpenModal() {
    $("div[role='dialog']:not(#coopAdvModal):visible").modal('hide');

    _caModal = new Modal('coopAdvModal', '🤝 Co-op Adventure');
    _caModal.size = 'modal-md';
    _caModal.create();

    // Footer
    if (_caModal.withFooter('#caStartBtn').length === 0) {
        _caModal.Footer().prepend([
            $('<button>').attr({ 'class': 'btn btn-success', 'id': 'caStartBtn' })
                .text('▶ Start').click(_caStart),
            $('<button>').attr({ 'class': 'btn btn-danger', 'id': 'caStopBtn', 'style': 'margin-left:4px;' })
                .text('■ Stop').click(_caStop).prop('disabled', true).addClass('disabled'),
            $('<button>').attr({ 'class': 'btn btn-info', 'id': 'caDumpBtn', 'style': 'margin-left:4px;' })
                .text('Dump API').click(_caDumpAPI),
            $('<button>').attr({ 'class': 'btn btn-default', 'id': 'caMinBtn', 'style': 'margin-left:4px;' })
                .text('[−]').click(function () {
                    var $body = _caModal.Body();
                    if ($body.is(':visible')) {
                        $body.hide();
                        $('.modal-backdrop').hide();
                        $('#coopAdvModal').css({ 'pointer-events': 'none', 'overflow': 'hidden' });
                        $('#coopAdvModal .modal-dialog').css({ 'pointer-events': 'auto' });
                        $('#coopAdvModal .modal-footer').css({ 'border-top': '1px solid #333' });
                        $('#caRunLog').show();
                    } else {
                        $body.show();
                        $('.modal-backdrop').show();
                        $('#coopAdvModal').css({ 'pointer-events': '', 'overflow': '' });
                        $('#caRunLog').hide();
                    }
                })
        ]);
        // Log panel in footer (visible when minimized)
        _caModal.Footer().append(
            $('<div>').attr('id', 'caRunLog')
                .css({ 'display': 'none', 'width': '100%', 'margin-top': '4px',
                       'padding': '4px 8px', 'background': '#0d0d0d', 'max-height': '120px', 'overflow-y': 'auto',
                       'border': '1px solid #2a2a2a', 'border-radius': '4px', 'clear': 'both' })
        );
    }

    // Restore button states
    if (_caRunning) {
        $('#caStartBtn').prop('disabled', true).addClass('disabled');
        $('#caStopBtn').prop('disabled', false).removeClass('disabled');
    }

    _caRenderBody();
    _caModal.show();
}

function _caRenderBody() {
    var $body = _caModal.Body();
    $body.html('');

    // ---- Status row ----
    var $statusRow = $('<div>').css({ 'padding': '8px 12px', 'background': '#1a1a1a', 'border-radius': '4px', 'margin-bottom': '10px' });
    $statusRow.append(
        $('<span>').css({ 'font-weight': 'bold', 'color': '#ddd' }).text('Status: '),
        $('<span>').attr('id', 'caStatusText').css('color', '#888').text('Stopped')
    );
    $body.append($statusRow);
    _caUpdateStatus();

    // ---- Item selection (all star menu buffs, arrows, etc.) ----
    var $buffSection = $('<div>').css({ 'padding': '10px 12px', 'background': '#1a1a1a', 'border-radius': '4px', 'margin-bottom': '10px' });
    $buffSection.append($('<div>').css({ 'font-weight': 'bold', 'color': '#ddd', 'margin-bottom': '6px' }).text('Select Item to Use:'));

    var items = _caGetStarMenuItems();
    if (items.length === 0) {
        $buffSection.append($('<div>').css('color', '#888').text('No items available in your star menu.'));
    } else {
        // Search filter
        var $search = $('<input>').attr({ 'type': 'text', 'placeholder': 'Search items...', 'class': 'form-control input-sm' })
            .css({ 'margin-bottom': '6px', 'background': '#222', 'color': '#ddd', 'border-color': '#444' });
        $buffSection.append($search);

        var $list = $('<div>').css({ 'max-height': '250px', 'overflow-y': 'auto' });

        function renderItems(filter) {
            $list.html('');
            var filtered = items.filter(function (it) {
                if (!filter) return true;
                return it.displayName.toLowerCase().indexOf(filter.toLowerCase()) !== -1 ||
                       it.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
            });
            filtered.forEach(function (item) {
                var isSelected = _caSelectedBuff === item.name;
                var zoneBuffs = _caGetZoneBuffs();
                var isZoneBuff = zoneBuffs.indexOf(item.name) !== -1;
                var $row = $('<div>').css({
                    'display': 'flex', 'align-items': 'center', 'padding': '4px 8px', 'cursor': 'pointer',
                    'border-radius': '3px', 'margin-bottom': '2px',
                    'background': isSelected ? '#2a4a2a' : 'transparent',
                    'border': isSelected ? '1px solid #4caf50' : '1px solid transparent'
                }).data('itemName', item.name);

                $row.append(
                    $('<input>').attr({ 'type': 'radio', 'name': 'caBuffSelect', 'value': item.name })
                        .prop('checked', isSelected)
                        .css('margin-right', '8px'),
                    $('<span>').css({ 'flex': '1', 'color': '#ddd' }).text(item.displayName),
                    $('<span>').css({ 'color': '#888', 'font-size': '11px', 'margin-left': '8px' }).text('x' + item.amount)
                );

                // Type badge
                var badge = isZoneBuff ? 'zone buff' : item.type;
                var badgeColor = isZoneBuff ? '#2196f3' : '#ffb74d';
                $row.append($('<span>').css({ 'color': badgeColor, 'font-size': '10px', 'margin-left': '6px' }).text('(' + badge + ')'));

                $row.on('click', function () {
                    _caSelectedBuff = $(this).data('itemName');
                    $list.find('div').css({ 'background': 'transparent', 'border-color': 'transparent' });
                    $(this).css({ 'background': '#2a4a2a', 'border-color': '#4caf50' });
                    $list.find('input[name=caBuffSelect]').prop('checked', false);
                    $(this).find('input').prop('checked', true);
                });

                $list.append($row);
            });
        }

        renderItems('');
        $search.on('input', function () { renderItems($(this).val()); });
        $buffSection.append($list);
    }
    $body.append($buffSection);

    // ---- Current adventures info ----
    var $advSection = $('<div>').css({ 'padding': '10px 12px', 'background': '#1a1a1a', 'border-radius': '4px', 'margin-bottom': '10px' });
    $advSection.append($('<div>').css({ 'font-weight': 'bold', 'color': '#ddd', 'margin-bottom': '6px' }).text('Active Adventures:'));

    var allAdvs = _caGetAllAdventures();
    var myId = game.gi.mCurrentPlayer.GetPlayerId();
    if (allAdvs.length === 0) {
        $advSection.append($('<div>').css('color', '#888').text('No active adventures.'));
    } else {
        allAdvs.forEach(function (adv) {
            var advName = loca.GetText('ADN', adv.adventureName) || adv.adventureName;
            var isMine = adv.ownerPlayerID === myId;
            var $row = $('<div>').css({ 'padding': '3px 0', 'color': '#ccc', 'font-size': '12px' });
            $row.append(
                $('<span>').text(advName),
                $('<span>').css({ 'color': isMine ? '#4caf50' : '#2196f3', 'margin-left': '8px', 'font-size': '11px' })
                    .text(isMine ? '(mine)' : '(joined)'),
                $('<span>').css({ 'color': '#888', 'margin-left': '8px', 'font-size': '11px' })
                    .text('zone: ' + adv.zoneID + ', players: ' + adv.getNumPlayers())
            );
            // Quick travel button
            if (!isMine) {
                $row.append(
                    $('<button>').attr('class', 'btn btn-xs btn-info').css('margin-left', '8px')
                        .text('Go').click(function () {
                            game.gi.visitZone(adv.zoneID);
                            _caLog('Traveling to ' + advName);
                        })
                );
            }
            $advSection.append($row);
        });
    }
    $body.append($advSection);

    // ---- Log section ----
    var $logSection = $('<div>').css({ 'padding': '10px 12px', 'background': '#0d0d0d', 'border-radius': '4px',
                                       'max-height': '150px', 'overflow-y': 'auto' });
    $logSection.append($('<div>').css({ 'font-weight': 'bold', 'color': '#ddd', 'margin-bottom': '4px' }).text('Log:'));
    if (_caChatLog.length === 0) {
        $logSection.append($('<div>').css({ 'color': '#666', 'font-size': '11px' }).text('No activity yet.'));
    } else {
        _caChatLog.forEach(function (line) {
            $logSection.append(
                $('<div>').css({ 'font-size': '11px', 'color': '#aaa' }).text(line)
            );
        });
    }
    $body.append($logSection);
}
