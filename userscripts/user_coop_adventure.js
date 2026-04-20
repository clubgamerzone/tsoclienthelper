// Co-op Adventure — Accept adventure invitations, apply a buff, and return home.
// Access via: Tools -> Co-op Adventure
//
// This tool runs in the background even when the modal is closed/minimized.
// It polls for incoming adventure invitations, accepts them, travels to the
// adventure zone, applies the selected zone buff, and returns to the home island.

try { addToolsMenuItem('Co-op Adventure', _caOpenModal); } catch (e) {}
try { addToolsMenuItem('CA Test Click', _caTestClick); } catch (e) {}

// ---- Test click dispatcher (without needing window) ----
function _caTestClick() {
    try {
        // Dump star menu item types to find arrow internal names
        var types = [];
        game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function(item) {
            var type = '', res = '', amt = 0;
            try { type = item.GetType(); } catch(e) { return; }
            try { res  = item.GetResourceName_string(); } catch(e) {}
            try { amt  = item.GetAmount(); } catch(e) {}
            types.push(type + (res ? '|' + res : '') + ' x' + amt);
        });
        game.chatMessage('CA types (' + types.length + '): ' + types.join(' / '), 'adventurer');
    } catch(e) {
        game.chatMessage('CA TEST ERR: ' + e, 'adventurer');
    }
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
                // Wrap in plain JS object to avoid sealed Flash object errors
                joined.push({
                    zoneID: adv.zoneID,
                    adventureName: adv.adventureName,
                    ownerPlayerID: adv.ownerPlayerID,
                    _myStatus: myStatus,
                    _raw: adv
                });
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

// ---- Module-level state ----
var _caRunning = false;
var _caState = null;
var _caModal = null;
var _caChatLog = [];
var _caSelectedBuff = null;
var _caPollTimer = null;
var _caPollCount = 0;
var _caLastKnownAdventures = [];
var _caHandledZones = {};

// ---- Logging ----
function _caLog(msg) {
    var line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    _caChatLog.push(line);
    if (_caChatLog.length > 100) _caChatLog.shift();
    try { game.chatMessage('CA: ' + msg, 'adventurer'); } catch(e) {}
    // Also update the log panel in the modal if open
    try {
        var $log = $('#coopAdvModal .modal-body [id$="logSection"], #coopAdvModal .modal-body div:last-child');
        if (_caModal) {
            var $body = _caModal.Body();
            var $lastDiv = $body.find('div').last();
            if ($lastDiv.length) {
                $lastDiv.append($('<div>').css({ 'font-size': '11px', 'color': '#aaa' }).text(line));
                $lastDiv.scrollTop($lastDiv[0].scrollHeight);
            }
        }
    } catch(e) {}
}

// ---- Check mailbox for adventure invitation mails (type 23) ----
var _caLastMailRefresh = 0;
function _caFindInvitationMail() {
    try {
        var mw = globalFlash.gui.mMailWindow;
        // Open and close the mail window to force a fetch from server (~every 10s)
        var now = Date.now();
        if (now - _caLastMailRefresh > 10000) {
            _caLastMailRefresh = now;
            try {
                mw.Show();
                mw.Hide();
            } catch (e) {}
        }
        var panel = mw.getMPanel();
        var dp = panel.mailsList.dataProvider;
        if (!dp || !dp.length) return null;
        var type23mails = [];
        var bestMail = null;
        var bestId = -1;
        for (var i = 0; i < dp.length; i++) {
            var mail = dp.getItemAt ? dp.getItemAt(i) : dp[i];
            if (mail && mail.type === 23) {
                var active = true;
                try { active = mail.isActive(); } catch(e) {}
                var expired = false;
                try { expired = mail.isExpired(); } catch(e) {}
                type23mails.push({
                    id: mail.id, subject: mail.subject,
                    active: active, expired: expired
                });
                // Track the most recent (highest id) active, non-expired mail
                if (active && !expired && mail.id > bestId) {
                    bestId = mail.id;
                    bestMail = mail;
                }
            }
        }
        if (bestMail) {
            if (type23mails.length > 1) {
                _caLog('Type 23 mails: ' + JSON.stringify(type23mails) + ' — picking most recent id=' + bestId);
            }
            return bestMail;
        }
        if (type23mails.length > 0) {
            _caLog('Type 23 mails found but none usable: ' + JSON.stringify(type23mails));
        }
    } catch (e) {}
    return null;
}

// ---- Accept adventure invitation via the mail system ----
// Phase 1: Show the mail window and select the invitation mail
function _caSelectMailInvitation(mailVO) {
    try {
        var mw = globalFlash.gui.mMailWindow;
        var panel = mw.getMPanel();
        // Show the mail window so the view is active
        mw.Show();
        // Select the mail via the controller
        mw.setMail(mailVO);

        // Also select in the list to trigger view switch
        var list = panel.mailsList;
        if (list) {
            // Try setting selectedItem directly
            list.selectedItem = mailVO;
            _caLog('Set mailsList.selectedItem');

            // Also try finding by index in dataProvider
            var dp = list.dataProvider;
            if (dp) {
                for (var i = 0; i < dp.length; i++) {
                    var item = dp.getItemAt(i);
                    if (item && item.id === mailVO.id) {
                        list.selectedIndex = i;
                        _caLog('Set mailsList.selectedIndex=' + i);
                        // Dispatch a ListEvent.CHANGE to trigger the handler
                        try {
                            var ListEvent = swmmo.getDefinitionByName("mx.events::ListEvent");
                            list.dispatchEvent(new ListEvent(ListEvent.CHANGE));
                            _caLog('Dispatched ListEvent.CHANGE');
                        } catch (le) {
                            _caLog('ListEvent dispatch err: ' + le);
                        }
                        break;
                    }
                }
            }
        }

        // Force the ViewStack to show the adventure invite content
        var vs = panel.mailContent;
        var invitePanel = panel.contentAdventureInvite;
        if (vs && invitePanel) {
            try {
                vs.selectedChild = invitePanel;
                _caLog('Set mailContent.selectedChild = contentAdventureInvite');
            } catch (ve) {
                _caLog('ViewStack switch err: ' + ve);
            }
        }

        _caLog('Opened mail window, selected invitation from ' + mailVO.senderName);
        return true;
    } catch (e) { _caLog('ERR selectMail: ' + e); }
    return false;
}

// Phase 2: Click the accept button (re-select mail + force ViewStack each time)
function _caClickAcceptButton() {
    try {
        var mw = globalFlash.gui.mMailWindow;
        var panel = mw.getMPanel();

        // Temporarily make Co-op modal invisible (opacity) so it can't interfere,
        // WITHOUT calling jQuery .hide() which corrupts Bootstrap's isShown state.
        var $modal = $('#coopAdvModal');
        var $backdrop = $('.modal-backdrop');
        var modalWasVisible = $modal.is(':visible');
        if (modalWasVisible) { $modal.css({'opacity': '0', 'pointer-events': 'none'}); $backdrop.hide(); }

        // Re-select the mail in case view drifted
        if (_caState && _caState.mailVO) {
            try {
                mw.Show();
                mw.setMail(_caState.mailVO);
                var list = panel.mailsList;
                var dp = list.dataProvider;
                if (dp) {
                    for (var i = 0; i < dp.length; i++) {
                        var item = dp.getItemAt ? dp.getItemAt(i) : dp[i];
                        if (item && item.id === _caState.mailVO.id) {
                            list.selectedIndex = i;
                            list.selectedItem = item;
                            try {
                                var ListEvent = swmmo.getDefinitionByName("mx.events::ListEvent");
                                list.dispatchEvent(new ListEvent(ListEvent.CHANGE));
                            } catch(le) {}
                            break;
                        }
                    }
                }
            } catch(e) { _caLog('Re-select err: ' + e); }
        }

        // Force ViewStack to adventure invite panel
        var vs = panel.mailContent;
        var invitePanel = panel.contentAdventureInvite;
        if (vs && invitePanel) {
            try { vs.selectedChild = invitePanel; } catch(e) {}
            try { invitePanel.visible = true; } catch(e) {}
        }

        var btn = panel.btnAdventureInviteAccept;
        if (!btn) {
            _caLog('Accept button not found on panel');
            return false;
        }

        _caLog('Accept btn visible=' + btn.visible + ', enabled=' + btn.enabled);

        if (!btn.enabled) {
            _caLog('Button disabled — wrong mail selected or already accepted');
            return false;
        }

        // Dispatch DIRECTLY on the button with LOCAL coords.
        // Stage-level dispatch was intercepted by the Co-op modal overlay.
        var ME = window.runtime.flash.events.MouseEvent;
        var cx = btn.width / 2, cy = btn.height / 2;
        btn.dispatchEvent(new ME('mouseDown', true, false, cx, cy, null, false, false, false, true));
        btn.dispatchEvent(new ME('mouseUp', true, false, cx, cy));
        btn.dispatchEvent(new ME('click', true, false, cx, cy));
        _caLog('Dispatched direct click on button (local coords ' + cx + ',' + cy + ')');

        // Restore modal visibility
        if (modalWasVisible) { $modal.css({'opacity': '', 'pointer-events': ''}); $backdrop.show(); }
        return true;
    } catch (e) {
        // Always restore modal even on error
        try { $('#coopAdvModal').css({'opacity': '', 'pointer-events': ''}); $('.modal-backdrop').show(); } catch(e2) {}
        _caLog('ERR clickAccept: ' + e);
    }
    return false;
}

// ---- Scan quest pool for adventure-related quests ----
function _caScanQuestPool(zoneID) {
    var results = [];
    try {
        var pool = game.quests.GetQuestPool();
        var quests = pool.GetQuest_vector();
        _caLog('Quest pool has ' + quests.length + ' quests. Scanning for adventure zone ' + zoneID + '...');
        for (var i = 0; i < quests.length; i++) {
            var q = quests[i];
            if (!q) continue;
            try {
                var def = q.mQuestDefinition;
                var triggers = [];
                var questName = '';
                if (def && def.questTriggers_vector) {
                    for (var t = 0; t < def.questTriggers_vector.length; t++) {
                        var trig = def.questTriggers_vector[t];
                        if (trig && trig.name_string) triggers.push(trig.name_string);
                    }
                }
                // Try to get the quest name
                try { questName = triggers.length > 0 ? triggers[0].replace(/_p\d+$/, '') : ''; } catch(e) {}
                var active = false;
                try { active = q.IsQuestActive(); } catch(e) {}
                var finished = false;
                try { finished = q.isFinished(); } catch(e) {}

                // Log all adventure-related quests (contain 'adv', 'coop', 'invitation')
                var trigStr = triggers.join(',');
                var isAdv = /adv|coop|invit/i.test(trigStr + questName);
                if (isAdv || i < 5) { // log first 5 plus any adventure-related
                    var locaName = '';
                    try { locaName = loca.GetText('ADN', questName) || loca.GetText('QUL', questName) || ''; } catch(e) {}
                    _caLog('  Q[' + i + '] name="' + questName + '" loca="' + locaName + '" active=' + active + ' finished=' + finished + ' triggers=' + trigStr);
                }
                results.push({
                    index: i,
                    quest: q,
                    name: questName,
                    triggers: triggers,
                    active: active,
                    finished: finished
                });
            } catch(e) {}
        }
    } catch(e) { _caLog('ERR scanQuestPool: ' + e); }
    return results;
}

// ---- Accept adventure via Quest Book UI (like quest runner does) ----
function _caAcceptViaQuestBook(mailVO, callback) {
    var zoneID = mailVO ? mailVO.subject : '';
    _caLog('Trying Quest Book approach for zone ' + zoneID + '...');

    // First scan the quest pool for any adventure-related quest
    var quests = _caScanQuestPool(zoneID);

    // Look for a quest that might be the adventure invitation
    // Adventure quests often have triggers containing the adventure name
    var candidateQuest = null;
    for (var i = 0; i < quests.length; i++) {
        var q = quests[i];
        // Check if any trigger matches adventure-related patterns
        var trigStr = q.triggers.join(',').toLowerCase();
        if (/adv|coop|invit/i.test(trigStr) && !q.finished) {
            candidateQuest = q;
            _caLog('Candidate quest found: Q[' + q.index + '] name="' + q.name + '"');
            break;
        }
    }

    if (!candidateQuest) {
        _caLog('No adventure quest found in quest pool. Dumping all ' + quests.length + ' quests...');
        // Dump all quest names for diagnostics
        for (var j = 0; j < quests.length; j++) {
            _caLog('  Q[' + quests[j].index + '] "' + quests[j].name + '" active=' + quests[j].active + ' finished=' + quests[j].finished + ' triggers=' + quests[j].triggers.join(','));
        }
        if (callback) callback(false);
        return;
    }

    // Try to open the Quest Book for this quest (same pattern as questlist.js)
    try {
        _caLog('Calling finishQuest to open Quest Book...');
        game.quests.finishQuest(candidateQuest.quest);
    } catch(e) {
        _caLog('finishQuest error: ' + e);
        if (callback) callback(false);
        return;
    }

    // Wait for Quest Book to appear on stage, then look for accept/close buttons
    setTimeout(function() {
        try {
            var stage = swmmo.application.stage;
            var ME = window.runtime.flash.events.MouseEvent;

            // Find the QuestBook on stage
            var questBook = null;
            function findQB(obj, depth) {
                if (depth > 5 || questBook) return;
                try {
                    var nc = obj.numChildren;
                    for (var i = 0; i < nc; i++) {
                        var child = obj.getChildAt(i);
                        var cs = '' + child;
                        if (cs.indexOf('QuestBook') !== -1 && cs.indexOf('btnQuestBook') === -1) {
                            questBook = child;
                            return;
                        }
                        findQB(child, depth + 1);
                    }
                } catch(e) {}
            }
            findQB(stage, 0);

            if (!questBook) {
                _caLog('QuestBook not found on stage after finishQuest');
                if (callback) callback(false);
                return;
            }
            _caLog('QuestBook found on stage');

            // Find named children recursively
            function findChild(obj, name, depth) {
                if (depth > 12) return null;
                try {
                    var nc = obj.numChildren;
                    for (var i = 0; i < nc; i++) {
                        var c = obj.getChildAt(i);
                        if (c.name === name) return c;
                        var f = findChild(c, name, depth + 1);
                        if (f) return f;
                    }
                } catch(e) {}
                return null;
            }

            function clickAS3(obj) {
                var cx = obj.width / 2, cy = obj.height / 2;
                obj.dispatchEvent(new ME('mouseDown', true, false, cx, cy));
                obj.dispatchEvent(new ME('mouseUp', true, false, cx, cy));
                obj.dispatchEvent(new ME('click', true, false, cx, cy));
            }

            // Log all buttons we can find
            var btnNames = ['btnCloseQuest', 'btnPayQuest', 'btnInstantFinish', 'btnCloseBook',
                            'btnAccept', 'btnAdventureInviteAccept', 'btnJoin', 'btnStart', 'OK', 'btnOk', 'btnYes'];
            btnNames.forEach(function(n) {
                var b = findChild(questBook, n, 0);
                _caLog('  QB btn ' + n + ' = ' + (b ? 'vis=' + b.visible + ' enabled=' + b.enabled : 'NOT FOUND'));
            });

            // Also dump all named children to find what buttons exist
            var allChildren = [];
            function walkChildren(obj, depth) {
                if (depth > 8) return;
                try {
                    var nc = obj.numChildren;
                    for (var i = 0; i < nc; i++) {
                        var c = obj.getChildAt(i);
                        if (c.name && /btn|accept|join|invit|ok|yes|confirm/i.test(c.name)) {
                            allChildren.push({ name: c.name, vis: c.visible, depth: depth });
                        }
                        walkChildren(c, depth + 1);
                    }
                } catch(e) {}
            }
            walkChildren(questBook, 0);
            if (allChildren.length > 0) {
                _caLog('QB button-like children: ' + JSON.stringify(allChildren));
            }

            // Try clicking accept/join/close buttons
            var acceptNames = ['btnAccept', 'btnAdventureInviteAccept', 'btnJoin', 'btnStart',
                               'btnCloseQuest', 'btnPayQuest', 'OK', 'btnOk'];
            var clicked = false;
            for (var bi = 0; bi < acceptNames.length; bi++) {
                var btn = findChild(questBook, acceptNames[bi], 0);
                if (btn && btn.visible) {
                    _caLog('Clicking QB button: ' + acceptNames[bi]);
                    clickAS3(btn);
                    clicked = true;
                    break;
                }
            }

            if (!clicked) {
                _caLog('No clickable accept button found in Quest Book');
                // Close the quest book
                var closeBtn = findChild(questBook, 'btnCloseBook', 0);
                if (closeBtn) clickAS3(closeBtn);
            }

            // Wait and check for confirmation dialogs
            setTimeout(function() {
                // Look for confirmation dialog (same as questlist)
                var found = false;
                var confirmNames = ['OK', 'btnOk', 'btnYes', 'btnConfirm', 'btnAccept'];
                function walkConfirm(obj, depth) {
                    if (depth > 10 || found) return;
                    try {
                        var nc = obj.numChildren;
                        for (var i = 0; i < nc; i++) {
                            var c = obj.getChildAt(i);
                            if (!c.visible) continue;
                            for (var ci = 0; ci < confirmNames.length; ci++) {
                                if (c.name === confirmNames[ci]) {
                                    clickAS3(c);
                                    _caLog('Confirmed dialog: ' + c.name);
                                    found = true;
                                    return;
                                }
                            }
                            walkConfirm(c, depth + 1);
                        }
                    } catch(e) {}
                }
                walkConfirm(stage, 0);
                if (callback) callback(clicked);
            }, 2000);
        } catch(e) {
            _caLog('ERR questBook approach: ' + e);
            if (callback) callback(false);
        }
    }, 1500);
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

// ---- Get list of zone buff names ----
function _caGetZoneBuffs() {
    var result = [];
    try {
        var zbm = game.gi.mZoneBuffManager;
        var buffs = zbm.getAvailableBuffs_vector ? zbm.getAvailableBuffs_vector() : zbm.mAvailableBuffs_vector;
        if (buffs) {
            for (var i = 0; i < buffs.length; i++) {
                var b = buffs[i];
                if (b && b.buffName) result.push(b.buffName);
            }
        }
    } catch (e) { _caLog('ERR _caGetZoneBuffs: ' + e); }
    return result;
}

// ---- Get list of usable items from star menu ----
function _caGetStarMenuItems() {
    var result = [];
    try {
        var zoneBuffs = _caGetZoneBuffs();
        game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function(item) {
            var type = '';
            try { type = item.GetType(); } catch(e) { return; }
            if (!type) return;
            if (type.toLowerCase().indexOf('bomb') === -1) return; // only show bomb/arrow items
            var amount = 0;
            try { amount = item.GetAmount(); } catch(e) { amount = 1; }
            if (amount <= 0) return;
            var resName = '';
            try { resName = item.GetResourceName_string(); } catch(e) {}
            var displayName = '';
            try { displayName = loca.GetText('RES', type, ['', resName]); } catch(e) {}
            if (!displayName || displayName === resName) { try { displayName = loca.GetText('RES', resName) || type; } catch(e) {} }
            if (!displayName) displayName = type;
            var iconData = null;
            try { iconData = item.GetBuffIconData(); } catch(e) {}
            var isZoneBuff = zoneBuffs.indexOf(type) !== -1;
            result.push({
                name: type,
                resName: resName,
                displayName: displayName,
                amount: amount,
                iconData: iconData,
                type: isZoneBuff ? 'zone buff' : 'buff'
            });
        });
    } catch (e) { _caLog('ERR _caGetStarMenuItems: ' + e); }
    return result;
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
    var campName = null;
    try {
        var buildings = game.zone.mStreetDataMap.GetBuildings_vector();
        for (var i = 0; i < buildings.length; i++) {
            if (campGrid) break;
            var b = buildings[i];
            if (!b) continue;
            try {
                // Only consider combat buildings (enemy camps have IsReadyToIntercept)
                if (b.IsReadyToIntercept == null) continue;
                // Must be alive (ready to intercept)
                if (!b.IsReadyToIntercept()) continue;
                var bName = b.GetBuildingName_string ? b.GetBuildingName_string() : '?';
                var bDisp = bName;
                try { bDisp = loca.GetText('BUI', bName) || bName; } catch(e) {}
                var grid = typeof b.GetGrid === 'function' ? b.GetGrid() : 0;
                if (!grid) continue;
                campGrid = grid;
                campName = bDisp;
                _caLog('Target: "' + bDisp + '" (' + bName + ') grid=' + grid);
            } catch (e) {}
        }
        if (!campGrid) {
            _caLog('No alive enemy camp found in zone');
        }
    } catch (e) { _caLog('ERR scanning buildings: ' + e); }
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
        var campGrid = _caFindEnemyCampGrid();
        if (!campGrid) {
            _caLog('No alive enemy camp found to apply ' + itemName);
            return false;
        }
        var vec = game.gi.mCurrentPlayer.mAvailableBuffs_vector;
        _caLog('Searching ' + vec.length + ' buffs for "' + itemName + '"...');
        var foundItem = null;
        for (var i = 0; i < vec.length; i++) {
            var item = vec[i];
            try {
                var resName = item.GetResourceName_string();
                if (resName === itemName) {
                    foundItem = item;
                    break;
                }
            } catch (e) {}
        }
        if (!foundItem) {
            // Also try game.getBuffs()
            try {
                var buffVector = game.getBuffs();
                for (var j = 0; j < buffVector.length; j++) {
                    var bd = buffVector[j];
                    if (bd.GetBuffDefinition().GetName_string() === itemName) {
                        foundItem = bd;
                        _caLog('Found in game.getBuffs() instead');
                        break;
                    }
                }
            } catch(e) {}
        }
        if (foundItem) {
            var uid = foundItem.GetUniqueId();
            _caLog('Applying ' + (loca.GetText('RES', itemName) || itemName) + ' (uid=' + uid + ') to camp grid=' + campGrid);
            game.gi.SendServerAction(61, 0, campGrid, 1, uid);
            applied = true;
        } else {
            _caLog('Item "' + itemName + '" not found in player buffs');
        }
    } catch (e) { _caLog('ERR applyItem: ' + e); }
    return applied;
}

// ---- Phase machine ----
// Phases: idle → detected → traveling → applying → wait_buff → waiting_in_zone → idle
function _caPoll() {
    if (!_caRunning) return;

    // --- Check for Flash error dialogs (e.g. "adventure already finished", "zone expired") ---
    try {
        var stage = swmmo.application.stage;
        function _caScanForDialog(obj, depth) {
            if (!obj || depth > 8) return null;
            var txt = '';
            try { txt = obj.text || ''; } catch(e) {}
            if (/already finished|not available|expired|could not load|no longer|adventure.*end/i.test(txt)) {
                return obj;
            }
            try {
                var n = obj.numChildren;
                for (var ci = 0; ci < n; ci++) {
                    var found = _caScanForDialog(obj.getChildAt(ci), depth + 1);
                    if (found) return found;
                }
            } catch(e) {}
            return null;
        }
        var dialogText = _caScanForDialog(stage, 0);
        if (dialogText) {
            _caLog('Error dialog detected: "' + dialogText.text + '" — dismissing and resetting');
            // Try clicking an OK/Close button near the dialog
            try {
                var parent = dialogText.parent;
                for (var bi = 0; bi < parent.numChildren; bi++) {
                    var child = parent.getChildAt(bi);
                    var ME = window.runtime.flash.events.MouseEvent;
                    try {
                        child.dispatchEvent(new ME('click', true, false, child.width/2, child.height/2));
                    } catch(e) {}
                }
            } catch(e) {}
            // Send Escape as fallback
            try {
                var KE = window.runtime.flash.events.KeyboardEvent;
                stage.dispatchEvent(new KE('keyDown', true, false, 0, 27));
                stage.dispatchEvent(new KE('keyUp', true, false, 0, 27));
            } catch(e) {}
            _caState = null;
            _caPollCount = 0;
            return;
        }
    } catch(e) {}

    if (!_caState) {
        _caPollCount++;
        // IDLE — first check AdventureManager for adventures already accepted/pending
        var currentAdvs = _caGetAllAdventures();
        var myId = game.gi.mCurrentPlayer.GetPlayerId();

        // Periodic diagnostic (every ~30s)
        if (_caPollCount % 10 === 0) {
            var mailCount = 0;
            try {
                var dp = globalFlash.gui.mMailWindow.getMPanel().mailsList.dataProvider;
                mailCount = dp ? dp.length : 0;
            } catch(e) {}
            _caLog('Poll #' + _caPollCount + ': advs=' + currentAdvs.length +
                ', handled=' + Object.keys(_caHandledZones).length +
                ', mails=' + mailCount +
                ', phase=' + (_caState ? _caState.phase : 'idle'));
        }

        // Clean up handled zones: if an adventure left the manager, it ended — allow re-invites
        var activeZones = {};
        currentAdvs.forEach(function (a) { activeZones[a.zoneID] = true; });
        Object.keys(_caHandledZones).forEach(function (z) {
            if (!activeZones[z]) { delete _caHandledZones[z]; }
        });

        // Detect NEW adventures that weren't in our last snapshot
        var newJoined = [];
        currentAdvs.forEach(function (adv) {
            if (adv.ownerPlayerID === myId) return; // my own adventure
            if (_caHandledZones[adv.zoneID]) return; // already handled
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
                if (_caHandledZones[adv.zoneID]) continue; // already handled
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

        // Last resort: check mailbox for unaccepted invitation mails (type 23)
        if (!_caState) {
            var inviteMail = _caFindInvitationMail();
            if (inviteMail && _caSelectedBuff) {
                _caLog('Found invitation mail from ' + inviteMail.senderName + ' (id=' + inviteMail.id + ', subject=' + inviteMail.subject + ')');
                _caSelectMailInvitation(inviteMail);
                _caState = {
                    phase: 'accepting_mail_select',
                    mailVO: inviteMail,
                    buffName: _caSelectedBuff,
                    startTime: Date.now(),
                    retries: 0
                };
            }
        }

        _caUpdateStatus();
        return;
    }

    // State machine
    switch (_caState.phase) {
        case 'accepting_mail_select':
            // Mail was just selected. Wait for the ViewStack to fully render
            // before clicking. The panel needs time to transition.
            _caState.retries++;
            if (_caState.retries === 1) {
                // First poll — wait for panel to render
                _caLog('Waiting for mail panel to render...');
            } else if (_caState.retries === 2) {
                // Second poll (6s after select) — now click the accept button ONCE
                _caLog('Clicking Accept button...');
                _caClickAcceptButton();
                _caState.phase = 'accepting_mail_wait';
                _caState.retries = 0;
            }
            break;

        case 'accepting_mail_wait':
            // Wait for adventure to appear in AdventureManager after clicking accept
            // Give it plenty of time — server needs to process
            var advs = _caGetAllAdventures();
            var myId2 = game.gi.mCurrentPlayer.GetPlayerId();
            var foundAdv = null;
            for (var ai = 0; ai < advs.length; ai++) {
                if (advs[ai].ownerPlayerID !== myId2) {
                    foundAdv = advs[ai];
                    break;
                }
            }
            if (foundAdv) {
                var advName = loca.GetText('ADN', foundAdv.adventureName) || foundAdv.adventureName;
                _caLog('Adventure accepted: ' + advName + ' (zone ' + foundAdv.zoneID + ')');
                try { globalFlash.gui.mMailWindow.Hide(); } catch(e) {}
                _caState = {
                    phase: 'detected',
                    advVO: foundAdv,
                    advName: advName,
                    buffName: _caState.buffName,
                    startTime: Date.now(),
                    retries: 0
                };
            } else {
                _caState.retries++;
                if (_caState.retries <= 5) {
                    // Wait up to 15s (5 polls × 3s) for server to process
                    _caLog('Waiting for acceptance... (' + _caState.retries + '/5)');
                } else {
                    // Acceptance didn't register. Close mail, reopen fresh, try again.
                    _caLog('Click did not register. Resetting mail window for fresh attempt...');
                    try { globalFlash.gui.mMailWindow.Hide(); } catch(e) {}

                    // Track total attempts across resets
                    if (!_caState.totalAttempts) _caState.totalAttempts = 0;
                    _caState.totalAttempts++;

                    if (_caState.totalAttempts >= 5) {
                        _caLog('Failed after 5 full attempts. Trying Quest Book approach...');
                        _caState.phase = 'accepting_questbook';
                        _caState.retries = 0;
                    } else {
                        _caLog('Attempt ' + _caState.totalAttempts + '/5 — reopening mail window...');
                        // Reopen and reselect from scratch
                        try {
                            globalFlash.gui.mMailWindow.Show();
                            globalFlash.gui.mMailWindow.Hide();
                        } catch(e) {}
                        setTimeout(function() {
                            try {
                                _caSelectMailInvitation(_caState.mailVO);
                                _caState.phase = 'accepting_mail_select';
                                _caState.retries = 0;
                            } catch(e) { _caLog('Reset err: ' + e); }
                        }, 2000);
                        // Prevent poll from doing anything until setTimeout fires
                        _caState.phase = 'accepting_mail_resetting';
                        _caState.retries = 0;
                    }
                }
            }
            break;

        case 'accepting_mail_resetting':
            // Waiting for setTimeout to reset mail window — just idle
            _caState.retries++;
            if (_caState.retries > 3) {
                // Safety: if setTimeout didn't fire, force back to select
                _caState.phase = 'accepting_mail_select';
                _caState.retries = 0;
            }
            break;

        case 'accepting_questbook':
            // Try to accept via Quest Book — scan quest pool and use finishQuest to open UI
            if (_caState.retries === 0) {
                _caState.retries = 1; // mark as in-progress so we don't re-trigger
                _caAcceptViaQuestBook(_caState.mailVO, function(clicked) {
                    // After quest book attempt, check if adventure appeared
                    setTimeout(function() {
                        var advs = _caGetAllAdventures();
                        var myId3 = game.gi.mCurrentPlayer.GetPlayerId();
                        var foundAdv = null;
                        for (var ai = 0; ai < advs.length; ai++) {
                            if (advs[ai].ownerPlayerID !== myId3) {
                                foundAdv = advs[ai];
                                break;
                            }
                        }
                        if (foundAdv) {
                            var advName = loca.GetText('ADN', foundAdv.adventureName) || foundAdv.adventureName;
                            _caLog('Quest Book approach worked! Adventure: ' + advName);
                            _caState = {
                                phase: 'detected',
                                advVO: foundAdv,
                                advName: advName,
                                buffName: _caState.buffName,
                                startTime: Date.now(),
                                retries: 0
                            };
                        } else {
                            _caLog('Quest Book approach did not produce an adventure. Will retry on next poll.');
                            _caState = null;
                        }
                        _caUpdateStatus();
                    }, 3000);
                });
            }
            // Don't do anything else — the callback handles state transition
            break;

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
            // Brief wait to confirm item applied, then stay in zone
            var isZB2 = _caGetZoneBuffs().indexOf(_caState.buffName) !== -1;
            if (!isZB2 || _caIsBuffRunning(_caState.buffName) || _caState.retries > 5) {
                _caLog('Item applied. Staying in zone until adventure finishes...');
                _caState.phase = 'waiting_in_zone';
                _caState.retries = 0;
            } else {
                _caState.retries++;
            }
            break;

        case 'waiting_in_zone':
            // Stay in the adventure zone until it disappears (adventure ended)
            var zoneStillExists = _caGetAllAdventures().some(function(a) { return a.zoneID === _caState.advVO.zoneID; });
            if (!zoneStillExists) {
                _caLog('Adventure finished! Cycle complete for ' + _caState.advName);
                _caHandledZones[_caState.advVO.zoneID] = true;
                _caState = null;
            } else {
                // Still running — log occasionally
                if (_caState.retries % 10 === 0) {
                    _caLog('Waiting for adventure to finish (' + _caState.retries * 3 + 's elapsed)...');
                }
                _caState.retries++;
            }
            break;

        case 'returning':
            // Wait until we're home (kept for any legacy path that may set this)
            if (game.gi.isOnHomzone()) {
                _caLog('Back home! Co-op cycle complete for ' + _caState.advName);
                _caHandledZones[_caState.advVO.zoneID] = true;
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
    } else if (/^accepting_/.test(_caState.phase)) {
        var sender = _caState.mailVO ? _caState.mailVO.senderName : '?';
        var method = _caState.phase === 'accepting_questbook' ? ' (Quest Book)' : '';
        $status.text('Accepting invitation from ' + sender + method + '...').css('color', '#ffb74d');
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

    // Immediately check mailbox for adventure invitation (type 23)
    var inviteMail = _caFindInvitationMail();
    if (inviteMail && _caSelectedBuff) {
        _caLog('Found invitation mail from ' + inviteMail.senderName + ' (id=' + inviteMail.id + ')');
        _caSelectMailInvitation(inviteMail);
        _caState = {
            phase: 'accepting_mail_select',
            mailVO: inviteMail,
            buffName: _caSelectedBuff,
            startTime: Date.now(),
            retries: 0
        };
    }

    // Also check for existing adventures already in AdventureManager
    if (!_caState) {
        var existingJoined = _caGetJoinedAdventures();
        if (existingJoined.length > 0 && _caSelectedBuff) {
            var adv = existingJoined[0];
            var advName = loca.GetText('ADN', adv.adventureName) || adv.adventureName;
            _caLog('Found adventure: ' + advName + ' (zone ' + adv.zoneID + ', myStatus=' + (adv._myStatus || '?') + ')');
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
            var allAdvs = _caGetAllAdventures();
            _caLog('No joined adventures found. Total adventures in manager: ' + allAdvs.length);
            var mailCheck = _caFindInvitationMail();
            if (mailCheck) {
                _caLog('But found invitation mail from ' + mailCheck.senderName + ' — will auto-accept when polling starts');
            }
        }
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
    _caHandledZones = {};
    _caLog('Stopped');
    _caUpdateStatus();
    $('#caStartBtn').prop('disabled', false).removeClass('disabled');
    $('#caStopBtn').prop('disabled', true).addClass('disabled');
}




// ---- Modal ----
function _caOpenModal() {
  try {
    game.chatMessage('CA: _caOpenModal called', 'adventurer');
    $("div[role='dialog']:not(#coopAdvModal):visible").modal('hide');

    game.chatMessage('CA: creating Modal...', 'adventurer');
    _caModal = new Modal('coopAdvModal', '🤝 Co-op Adventure');
    _caModal.size = 'modal-md';
    _caModal.create();
    game.chatMessage('CA: Modal created', 'adventurer');

    // Footer
    if (_caModal.withFooter('#caStartBtn').length === 0) {
        _caModal.Footer().prepend([
            $('<button>').attr({ 'class': 'btn btn-success', 'id': 'caStartBtn' })
                .text('▶ Start').click(_caStart),
            $('<button>').attr({ 'class': 'btn btn-danger', 'id': 'caStopBtn', 'style': 'margin-left:4px;' })
                .text('■ Stop').click(_caStop).prop('disabled', true).addClass('disabled'),
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

    game.chatMessage('CA: calling show...', 'adventurer');
    // Reset any stale Bootstrap modal state, then force-show
    $('#coopAdvModal').data('bs.modal', null).modal({ backdrop: false });
    // Ensure modal and backdrop are fully visible (opacity trick in _caClickAcceptButton may have left remnants)
    $('#coopAdvModal').css({ 'opacity': '', 'pointer-events': '' });
    $('.modal-backdrop').show();
    game.chatMessage('CA: modal shown OK', 'adventurer');
    // Render body AFTER modal is shown so the DOM is fully live
    game.chatMessage('CA: calling _caRenderBody...', 'adventurer');
    _caRenderBody();
  } catch(e) {
    game.chatMessage('CA OPEN ERROR: ' + e, 'adventurer');
  }
}

function _caRenderBody() {
  try {
    var $body = _caModal.Body();
    game.chatMessage('CA: renderBody start, body.length=' + $body.length + ', modal in DOM=' + $('#coopAdvModal').length, 'adventurer');
    if ($body.length === 0) {
        game.chatMessage('CA: modal-body not found! HTML=' + $('#coopAdvModal').html().substring(0,200), 'adventurer');
        return;
    }
    game.chatMessage('CA: body display=' + $body.css('display') + ' visibility=' + $body.css('visibility'), 'adventurer');
    $body.show(); // ensure body is visible (minimize button may have hidden it)
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
                        .css('margin-right', '8px')
                );
                // Icon
                if (item.iconData) {
                    try {
                        var $icon = $(getImageByModule(item.iconData[0], item.iconData[1], 24, 24));
                        $icon.css({ 'margin-right': '6px', 'vertical-align': 'middle', 'flex-shrink': '0' });
                        $row.append($icon);
                    } catch(e) {}
                }
                $row.append(
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
    game.chatMessage('CA: renderBody done', 'adventurer');
  } catch(e) {
    game.chatMessage('CA RENDER ERROR: ' + e, 'adventurer');
  }
}
