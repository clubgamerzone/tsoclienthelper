try {
    addToolsMenuItem("Quest List", questListMenuHandler);
} catch(e) {}

function questListMenuHandler(event) {
    $("div[role='dialog']:not(#questListModal):visible").modal("hide");
    var w = new Modal('questListModal', 'Quest List');
    w.create();
    $('#questListModalData').html('<p>Loading quest names...</p>');
    w.show();
    questListRefresh();
}

function questListRefresh() {
    $('#questListModalData').html('<p>Loading quest names...</p>');
    qlScrapeBookNames(function() {
        $('#questListModalData').html(questListBuild());
        $('#questListModalData').off('click', '.ql-claim-btn');
        $('#questListModalData').off('click', '#ql-refresh-btn');
        $('#questListModalData').on('click', '.ql-claim-btn', function() {
            var idx = parseInt($(this).data('idx'), 10);
            questListClaim(idx);
        });
        $('#questListModalData').on('click', '#ql-refresh-btn', function() {
            questListRefresh();
        });
    });
}

function qlScrapeBookNames(callback) {
    try {
        var pool = game.quests.GetQuestPool();
        var quests = pool.GetQuest_vector();
        var firstFinished = null;
        for (var fi = 0; fi < quests.length; fi++) {
            try { if (quests[fi].isFinished()) { firstFinished = quests[fi]; break; } } catch(e) {}
        }
        if (!firstFinished) { callback(); return; }

        game.quests.finishQuest(firstFinished);

        setTimeout(function() {
            try {
                var stage = swmmo.application.stage;
                var qb = null;
                (function walkQB(o, d) {
                    if (d > 5 || qb) return;
                    try { var n = o.numChildren; for (var i = 0; i < n; i++) {
                        var c = o.getChildAt(i);
                        if (('' + c).indexOf('QuestBook') !== -1) { qb = c; return; }
                        walkQB(c, d + 1);
                    }} catch(e) {}
                })(stage, 0);

                if (qb) {
                    var items = [];
                    (function findR(o, d) {
                        if (d > 15) return;
                        try { var n = o.numChildren; for (var i = 0; i < n; i++) {
                            var c = o.getChildAt(i);
                            var cs = '' + c;
                            if (cs.indexOf('QuestListItemRenderer') !== -1 || cs.indexOf('QuestListGroupItemRenderer') !== -1) {
                                var lbl = '';
                                try { var nc2 = c.numChildren; for (var j = 0; j < nc2; j++) {
                                    var ic = c.getChildAt(j);
                                    if (ic.name === 'btnItem') {
                                        var nc3 = ic.numChildren;
                                        for (var k = 0; k < nc3; k++) {
                                            if (ic.getChildAt(k).name === 'buttonLabel')
                                                lbl = ic.getChildAt(k).text || '';
                                        }
                                    }
                                }} catch(e) {}
                                items.push({ label: lbl, data: c.data });
                            }
                            findR(c, d + 1);
                        }} catch(e) {}
                    })(qb, 0);

                    // Match scraped labels to quest pool objects
                    items.forEach(function(item) {
                        if (!item.label) return;
                        // Method 1: object identity
                        for (var qi = 0; qi < quests.length; qi++) {
                            if (item.data === quests[qi]) { _qlBookNames[qi] = item.label; return; }
                        }
                        // Method 2: match by trigger key
                        try {
                            var d = item.data;
                            var def = d && (d.mQuestDefinition || d);
                            if (def && def.questTriggers_vector && def.questTriggers_vector.length > 0) {
                                var tkey = def.questTriggers_vector[0].name_string;
                                if (tkey) {
                                    for (var qi2 = 0; qi2 < quests.length; qi2++) {
                                        try {
                                            var qd = quests[qi2].mQuestDefinition;
                                            if (qd && qd.questTriggers_vector && qd.questTriggers_vector.length > 0 &&
                                                qd.questTriggers_vector[0].name_string === tkey) {
                                                _qlBookNames[qi2] = item.label;
                                                break;
                                            }
                                        } catch(e) {}
                                    }
                                }
                            }
                        } catch(e) {}
                    });

                    // Close the Quest Book
                    (function findClose(o, d) {
                        if (d > 12) return;
                        try { var n = o.numChildren; for (var i = 0; i < n; i++) {
                            var c = o.getChildAt(i);
                            if (c.name === 'btnCloseBook' && c.visible) {
                                var ME = window.runtime.flash.events.MouseEvent;
                                c.dispatchEvent(new ME('click', true, false, 5, 5));
                                return;
                            }
                            findClose(c, d + 1);
                        }} catch(e) {}
                    })(qb, 0);
                }
            } catch(e) {}
            callback();
        }, 1500);
    } catch(e) { callback(); }
}

var _qlLocaNs = ['QUL','ADN','QUE','QBO','EVE','ADV','DAI','TUT','GUI','NAM','TIT','DES','BUI','RES','LAB','ALT','HIL','SHG','MEL'];
var _qlLocaCache = {};
var _qlBookNames = {}; // pool index → display name scraped from Quest Book

function questListLocaName(key) {
    if (!key) return '';
    if (_qlLocaCache[key]) return _qlLocaCache[key];
    // Try key as-is across all namespaces
    var variants = [key, 'Gui' + key];
    // Also try stripping trailing digits and _p\d+ suffix
    var stripped = key.replace(/_p\d+$/, '').replace(/\d+$/, '');
    if (stripped !== key && stripped.length > 2) variants.push(stripped, 'Gui' + stripped);
    for (var v = 0; v < variants.length; v++) {
        for (var i = 0; i < _qlLocaNs.length; i++) {
            try {
                var t = loca.GetText(_qlLocaNs[i], variants[v]);
                if (t && t.indexOf('[') === -1 && t !== variants[v]) {
                    _qlLocaCache[key] = t;
                    return t;
                }
            } catch(e) {}
        }
    }
    // Fallback: prettify CamelCase → "Daily Login Bonus Adv 1"
    var pretty = key.replace(/_p\d+$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/_/g, ' ');
    _qlLocaCache[key] = pretty;
    return pretty;
}

function questListGetUid(q) {
    try { return ('' + q.GetUniqueId()).replace(/<[^>]+>/g, '').trim().replace(/\.0$/, ''); } catch(e) { return ''; }
}

function questListProbeNamespaces() {
    // Discover extra namespaces from the loca object
    try {
        for (var p in loca) {
            if (typeof loca[p] === 'object' && loca[p] !== null && p.length <= 4 && p === p.toUpperCase()) {
                if (_qlLocaNs.indexOf(p) === -1) _qlLocaNs.push(p);
            }
        }
    } catch(e) {}
}

function questListResolveName(q, poolIdx) {
    var def = q.mQuestDefinition;
    var triggers = [];
    if (def && def.questTriggers_vector) {
        $.each(def.questTriggers_vector, function(n, t) {
            if (t.name_string) triggers.push(t.name_string);
        });
    }
    // 0) Check scraped Quest Book label first
    if (poolIdx !== undefined && _qlBookNames[poolIdx]) {
        return { name: _qlBookNames[poolIdx], triggers: triggers };
    }
    // 1) Try trigger parent key
    if (triggers.length > 0) {
        var parentKey = triggers[0].replace(/_p\d+$/, '');
        var resolved = questListLocaName(parentKey);
        if (resolved !== parentKey) return { name: resolved, triggers: triggers };
    }
    // 2) Try definition string properties as loca keys
    if (def) {
        var props = ['mName','name_string','questName','mTitle','title','mLocaName','locaKey'];
        for (var pi = 0; pi < props.length; pi++) {
            try {
                var val = def[props[pi]];
                if (val && typeof val === 'string' && val.length > 1) {
                    var r = questListLocaName(val);
                    if (r !== val && r.indexOf('[') === -1) return { name: r, triggers: triggers };
                }
            } catch(e) {}
        }
    }
    // 3) Try UID-based loca
    var uid = questListGetUid(q);
    if (uid) {
        var tryKeys = [uid, 'quest_' + uid, 'Quest_' + uid, 'Gui' + uid];
        for (var ki = 0; ki < tryKeys.length; ki++) {
            var n = questListLocaName(tryKeys[ki]);
            if (n !== tryKeys[ki] && n.indexOf('[') === -1) return { name: n, triggers: triggers };
        }
    }
    // 4) Prettified trigger or UID
    if (triggers.length > 0) {
        return { name: questListLocaName(triggers[0].replace(/_p\d+$/, '')), triggers: triggers };
    }
    return { name: uid ? 'ID:' + uid : '???', triggers: triggers };
}

function questListBuild() {
    _qlLocaCache = {};
    questListProbeNamespaces();
    var out = '<div class="container-fluid">';
    out += '<button id="ql-refresh-btn" class="btn btn-sm btn-primary" style="margin-bottom:8px">&#x21bb; Refresh</button>';
    try {
        var pool = game.quests.GetQuestPool();
        var quests = pool.GetQuest_vector();

        var hasFinished = false;
        $.each(quests, function(i, q) {
            try { if (q.isFinished()) hasFinished = true; } catch(e) {}
        });
        if (!hasFinished) {
            return out + '<p>No finished quests to claim.</p></div>';
        }

        out += createTableRow([
            [4, 'Quest'],
            [5, 'Step'],
            [3, 'Action']
        ], true);

        $.each(quests, function(i, q) {
            try {
                if (!q.isFinished()) return;

                var info = questListResolveName(q, i);
                var questName = info.name;
                var triggers = info.triggers;

                var statusHtml = '<span class="buffReady">&nbsp;Finished&nbsp;</span>' +
                    '<br><button class="btn btn-xs btn-success ql-claim-btn" data-idx="' + i + '">Claim</button>';

                if (triggers.length > 1) {
                    var parentKey2 = triggers[0].replace(/_p\d+$/, '');
                    var isMultiStep = (parentKey2 !== triggers[0]);
                    if (isMultiStep) {
                        triggers.forEach(function(key, ti) {
                            out += createTableRow([
                                [4, ti === 0 ? questName : ''],
                                [5, questListLocaName(key)],
                                [3, ti === 0 ? statusHtml : '']
                            ]);
                        });
                        return;
                    }
                }

                var stepText = triggers.length > 0
                    ? triggers.map(function(k) { return questListLocaName(k); }).join('<br>')
                    : '—';
                out += createTableRow([
                    [4, questName],
                    [5, stepText],
                    [3, statusHtml]
                ]);
            } catch(e) {
                out += createTableRow([[12, 'Error reading quest ' + i + ': ' + e]]);
            }
        });
    } catch(e) {
        out += '<p>Error: ' + e + '</p>';
    }
    return out + '</div>';
}

// Debug log to file
var _qlLog = [];
function qlLog(msg) {
    _qlLog.push('[' + new Date().toTimeString().substr(0,8) + '] ' + msg);
    game.chatMessage(msg, 'questlist');
}
function qlSaveLog() {
    try {
        var f = new air.File(air.File.documentsDirectory.resolvePath('questlist_debug.txt').nativePath);
        var fs = new air.FileStream();
        fs.open(f, 'write');
        fs.writeUTFBytes(_qlLog.join('\n'));
        fs.close();
        game.chatMessage('[QL] log saved to ' + f.nativePath, 'questlist');
    } catch(e) {
        game.chatMessage('[QL] log save err: ' + e, 'questlist');
    }
}

function questListClaim(idx) {
    try {
        _qlLog = [];
        var q = game.quests.GetQuestPool().GetQuest_vector()[idx];
        if (!q || !q.isFinished()) { game.chatMessage('[QL] quest not finished', 'questlist'); return; }

        var AS3MouseEvent = window.runtime.flash.events.MouseEvent;
        if (!AS3MouseEvent || typeof AS3MouseEvent !== 'function') {
            // Fallback: access via bracket notation to avoid proxy issues
            var evts = window.runtime.flash.events;
            AS3MouseEvent = evts['MouseEvent'];
        }
        if (!AS3MouseEvent || typeof AS3MouseEvent !== 'function') {
            try { AS3MouseEvent = flash.events.MouseEvent; } catch(e2) {}
        }

        // Get quest name so we can match it in the list
        var questName = _qlBookNames[idx] || '';
        if (!questName) {
            try {
                var def = q.mQuestDefinition;
                if (def && def.questTriggers_vector) {
                    var t0 = def.questTriggers_vector[0];
                    if (t0 && t0.name_string) {
                        var key = t0.name_string.replace(/_p\d+$/, '');
                        questName = questListLocaName(key);
                    }
                }
            } catch(e) {}
        }

        // Probe definition for more name info
        var defDump = '';
        try {
            var def2 = q.mQuestDefinition;
            if (def2) {
                var dprops = [];
                for (var dp in def2) { dprops.push(dp + '=' + typeof def2[dp]); }
                defDump = dprops.join(', ');
            }
        } catch(e) {}

        qlLog('[QL-v12] calling finishQuest idx=' + idx + ' name="' + questName + '"');
        if (defDump) qlLog('[QL-v12] def props: ' + defDump);
        game.quests.finishQuest(q);

        setTimeout(function() {
            try {
                var stage = swmmo.application.stage;
                var questBook = null;
                function findByType(obj, match, depth) {
                    if (depth > 5 || questBook) return;
                    try {
                        var nc = obj.numChildren;
                        if (nc === undefined) return;
                        for (var i = 0; i < nc; i++) {
                            try {
                                var child = obj.getChildAt(i);
                                if (('' + child).indexOf(match) !== -1) { questBook = child; return; }
                                findByType(child, match, depth + 1);
                            } catch(e) {}
                        }
                    } catch(e) {}
                }
                findByType(stage, 'QuestBook', 0);
                if (!questBook) { qlLog('[QL-v12] QuestBook not found'); qlSaveLog(); return; }

                function findChild(obj, name, depth) {
                    if (depth > 12) return null;
                    try {
                        var nc = obj.numChildren;
                        if (nc === undefined) return null;
                        for (var i = 0; i < nc; i++) {
                            try {
                                var child = obj.getChildAt(i);
                                if (child.name === name) return child;
                                var found = findChild(child, name, depth + 1);
                                if (found) return found;
                            } catch(e) {}
                        }
                    } catch(e) {}
                    return null;
                }

                function clickAS3(obj) {
                    if (!AS3MouseEvent || typeof AS3MouseEvent !== 'function') {
                        qlLog('[QL] AS3MouseEvent not a constructor: ' + typeof AS3MouseEvent + ' val=' + AS3MouseEvent);
                        return;
                    }
                    var cx = obj.width / 2, cy = obj.height / 2;
                    obj.dispatchEvent(new AS3MouseEvent('mouseDown', true, false, cx, cy));
                    obj.dispatchEvent(new AS3MouseEvent('mouseUp', true, false, cx, cy));
                    obj.dispatchEvent(new AS3MouseEvent('click', true, false, cx, cy));
                }

                var footerNames = ['btnInstantFinish','btnPayQuest','btnCloseQuest','btnCloseFailedQuest','btnCloseBook'];

                function logFooter(prefix) {
                    footerNames.forEach(function(n) {
                        var b = findChild(questBook, n, 0);
                        qlLog(prefix + n + ' vis=' + (b ? b.visible : 'NOT_FOUND'));
                    });
                }

                function tryClaimFooter() {
                    var c = findChild(questBook, 'btnCloseQuest', 0);
                    if (c && c.visible) {
                        clickAS3(c);
                        qlLog('[QL] btnCloseQuest clicked!');
                        // Check for confirmation dialog after a short delay
                        setTimeout(function() { tryConfirmDialog(stage); }, 2000);
                        return true;
                    }
                    var p = findChild(questBook, 'btnPayQuest', 0);
                    if (p && p.visible) {
                        clickAS3(p);
                        qlLog('[QL] btnPayQuest clicked!');
                        setTimeout(function() { tryConfirmDialog(stage); }, 2000);
                        return true;
                    }
                    return false;
                }

                // Auto-confirm "Complete Adventure/Expedition?" dialog
                function tryConfirmDialog(root) {
                    var confirmNames = ['OK','btnOk','btnYes','btnConfirm','btnAccept','okButton','yesButton','confirmButton'];
                    // Walk the stage for any visible confirm-like popup
                    var found = false;
                    function walkForConfirm(obj, depth) {
                        if (depth > 10 || found) return;
                        try {
                            var nc = obj.numChildren;
                            if (nc === undefined) return;
                            for (var i = 0; i < nc; i++) {
                                try {
                                    var child = obj.getChildAt(i);
                                    if (!child.visible) continue;
                                    // Check if this child is a confirm button by name
                                    for (var cn = 0; cn < confirmNames.length; cn++) {
                                        if (child.name === confirmNames[cn]) {
                                            clickAS3(child);
                                            qlLog('[QL] confirm dialog: clicked ' + child.name);
                                            found = true;
                                            qlSaveLog();
                                            return;
                                        }
                                    }
                                    walkForConfirm(child, depth + 1);
                                } catch(e) {}
                            }
                        } catch(e) {}
                    }
                    walkForConfirm(root, 0);
                    if (!found) {
                        // Dump top-level visible popups for debugging
                        function dumpPopups(obj, depth) {
                            if (depth > 6) return;
                            try {
                                var nc = obj.numChildren;
                                if (nc === undefined) return;
                                for (var i = 0; i < nc; i++) {
                                    try {
                                        var child = obj.getChildAt(i);
                                        if (!child.visible) continue;
                                        var cs = '' + child;
                                        if (cs.indexOf('Dialog') !== -1 || cs.indexOf('Popup') !== -1 ||
                                            cs.indexOf('Confirm') !== -1 || cs.indexOf('MessageBox') !== -1 ||
                                            cs.indexOf('Alert') !== -1) {
                                            qlLog('[QL] found dialog: ' + cs + ' name=' + child.name);
                                            // Dump its children to find button names
                                            try {
                                                var dnc = child.numChildren;
                                                for (var di = 0; di < dnc; di++) {
                                                    var dc = child.getChildAt(di);
                                                    qlLog('[QL]   child[' + di + '] name=' + dc.name + ' vis=' + dc.visible + ' type=' + dc);
                                                    try {
                                                        var dnc2 = dc.numChildren;
                                                        for (var di2 = 0; di2 < dnc2; di2++) {
                                                            var dc2 = dc.getChildAt(di2);
                                                            qlLog('[QL]     grandchild[' + di2 + '] name=' + dc2.name + ' vis=' + dc2.visible + ' type=' + dc2);
                                                        }
                                                    } catch(e3) {}
                                                }
                                            } catch(e2) {}
                                        }
                                        dumpPopups(child, depth + 1);
                                    } catch(e) {}
                                }
                            } catch(e) {}
                        }
                        dumpPopups(root, 0);
                        qlLog('[QL] no confirm dialog found (may not be needed)');
                        qlSaveLog();
                    }
                }

                logFooter('[QL-v12] initial: ');

                // Try footer buttons first (works for sub-quests after finishQuest)
                if (tryClaimFooter()) {
                    qlLog('[QL-v12] === DONE ===');
                    qlSaveLog();
                    return;
                }

                // Main quest case: need to select the quest in the list first
                qlLog('[QL-v12] no footer buttons, searching list items...');

                function findAllListItems(obj, depth, results) {
                    if (depth > 15) return;
                    try {
                        var nc = obj.numChildren;
                        if (nc === undefined) return;
                        for (var i = 0; i < nc; i++) {
                            try {
                                var child = obj.getChildAt(i);
                                var cstr = '' + child;
                                if (cstr.indexOf('QuestListItemRenderer') !== -1 || cstr.indexOf('QuestListGroupItemRenderer') !== -1) {
                                    var btn = null, checkbox = null, label = null, deleteBtn = null;
                                    try {
                                        var innerNc = child.numChildren;
                                        for (var j = 0; j < innerNc; j++) {
                                            var ic = child.getChildAt(j);
                                            if (ic.name === 'btnItem') {
                                                btn = ic;
                                                try {
                                                    var bnc = ic.numChildren;
                                                    for (var k = 0; k < bnc; k++) {
                                                        var bc = ic.getChildAt(k);
                                                        if (bc.name === 'buttonCheckbox') checkbox = bc;
                                                        if (bc.name === 'buttonLabel') label = bc;
                                                        if (bc.name === 'buttonDelete') deleteBtn = bc;
                                                    }
                                                } catch(e2) {}
                                            }
                                        }
                                    } catch(e3) {}
                                    if (btn) {
                                        var labelText = '';
                                        try { labelText = label ? label.text || label.htmlText || '' : ''; } catch(e4) {}
                                        results.push({
                                            obj: btn,
                                            parent: child,
                                            checkbox: checkbox,
                                            deleteBtn: deleteBtn,
                                            checkVis: checkbox ? checkbox.visible : false,
                                            delVis: deleteBtn ? deleteBtn.visible : false,
                                            btnVis: btn.visible,
                                            label: labelText,
                                            type: cstr
                                        });
                                    }
                                }
                                findAllListItems(child, depth + 1, results);
                            } catch(e) {}
                        }
                    } catch(e) {}
                }

                var listItems = [];
                findAllListItems(questBook, 0, listItems);

                // Find matching item by quest name if we have one
                var targetItem = null;
                if (questName) {
                    for (var li = 0; li < listItems.length; li++) {
                        if (listItems[li].label === questName) {
                            targetItem = listItems[li];
                            qlLog('[QL-v12] matched by name [' + li + '] "' + questName + '"');
                            break;
                        }
                    }
                }

                // If no name match, list all items with delVis=true (deletable = claimable main quests)
                if (!targetItem) {
                    qlLog('[QL-v12] no name match, listing items with delVis or checkVis:');
                    var candidates = [];
                    listItems.forEach(function(li, i) {
                        if (li.checkVis && li.btnVis) {
                            qlLog('[QL-v12]   [' + i + '] label="' + li.label + '" checkVis=' + li.checkVis + ' delVis=' + li.delVis);
                            candidates.push({ item: li, idx: i });
                        }
                    });

                    // Try each checked item until we get a footer button response
                    function tryCandidate(cIdx) {
                        if (cIdx >= candidates.length) {
                            qlLog('[QL-v12] exhausted all candidates');
                            qlLog('[QL-v12] === DONE ===');
                            qlSaveLog();
                            return;
                        }
                        var c = candidates[cIdx];
                        qlLog('[QL-v12] trying candidate [' + c.idx + '] "' + c.item.label + '"...');
                        clickAS3(c.item.obj);
                        if (c.item.checkbox && c.item.checkVis) {
                            clickAS3(c.item.checkbox);
                        }

                        setTimeout(function() {
                            try {
                                questBook = null;
                                findByType(stage, 'QuestBook', 0);
                                if (!questBook) { qlLog('[QL-v12] QuestBook gone'); qlSaveLog(); return; }
                                logFooter('[QL-v12] after [' + c.idx + ']: ');
                                if (tryClaimFooter()) {
                                    qlLog('[QL-v12] claimed via candidate [' + c.idx + '] "' + c.item.label + '"!');
                                    qlLog('[QL-v12] === DONE ===');
                                    qlSaveLog();
                                } else {
                                    // Try next candidate
                                    tryCandidate(cIdx + 1);
                                }
                            } catch(e) { qlLog('[QL-v12] candidate err: ' + e); qlSaveLog(); }
                        }, 800);
                    }

                    // Only try first 5 candidates to avoid infinite loop
                    if (candidates.length > 5) candidates = candidates.slice(0, 5);
                    tryCandidate(0);
                    return;
                }

                // We have a target - click it
                qlLog('[QL-v12] clicking target "' + targetItem.label + '"...');
                clickAS3(targetItem.obj);
                if (targetItem.checkbox && targetItem.checkVis) {
                    clickAS3(targetItem.checkbox);
                }

                setTimeout(function() {
                    try {
                        questBook = null;
                        findByType(stage, 'QuestBook', 0);
                        if (!questBook) { qlLog('[QL-v12] QuestBook gone'); qlSaveLog(); return; }
                        logFooter('[QL-v12] after select: ');
                        if (tryClaimFooter()) {
                            qlLog('[QL-v12] claimed after select!');
                        } else {
                            qlLog('[QL-v12] no footer after select');
                        }
                        qlLog('[QL-v12] === DONE ===');
                        qlSaveLog();
                    } catch(e) { qlLog('[QL-v12] step2 err: ' + e); qlSaveLog(); }
                }, 1000);

            } catch(e) {
                qlLog('[QL-v12] error: ' + e);
                qlSaveLog();
            }
        }, 1500);

    } catch(e) {
        game.chatMessage('[QL-v12] error: ' + e, 'questlist');
    }
}

// ── Global auto-claim function for quest runner integration ──
// Calls callback(claimed) when done, where claimed = number of quests successfully claimed.
function qlAutoClaimAll(callback) {
    var pool = game.quests.GetQuestPool();
    var quests = pool.GetQuest_vector();
    var finished = [];
    $.each(quests, function(i, q) {
        try { if (q && q.isFinished()) finished.push(q); } catch(e) {}
    });
    if (finished.length === 0) {
        game.chatMessage('[QL] No finished quests to claim.', 'questlist');
        if (callback) callback(0);
        return;
    }
    game.chatMessage('[QL] Auto-claiming ' + finished.length + ' quest(s)...', 'questlist');
    var claimed = 0;

    function claimNext(fi) {
        if (fi >= finished.length) {
            game.chatMessage('[QL] Done — claimed ' + claimed + '/' + finished.length + ' quest(s).', 'questlist');
            if (callback) callback(claimed);
            return;
        }
        _qlAutoClaimOne(finished[fi], function(ok) {
            if (ok) claimed++;
            setTimeout(function() { claimNext(fi + 1); }, 1000);
        });
    }
    claimNext(0);
}

function _qlAutoClaimOne(q, done) {
    try {
        game.quests.finishQuest(q);
        game.chatMessage('[QL] finishQuest called, waiting for Quest Book...', 'questlist');
    } catch(e) {
        game.chatMessage('[QL] finishQuest error: ' + e, 'questlist');
        done(false);
        return;
    }

    setTimeout(function() {
        try {
            var stage = swmmo.application.stage;
            var ME = window.runtime.flash.events.MouseEvent;
            if (!ME || typeof ME !== 'function') {
                var evts = window.runtime.flash.events;
                ME = evts['MouseEvent'];
            }
            if (!ME || typeof ME !== 'function') {
                try { ME = flash.events.MouseEvent; } catch(e2) {}
            }
            if (!ME || typeof ME !== 'function') {
                game.chatMessage('[QL] MouseEvent constructor not found', 'questlist');
                done(false);
                return;
            }

            function _findQB(obj, d) {
                if (d > 5) return null;
                try { var nc = obj.numChildren; for (var i = 0; i < nc; i++) {
                    var c = obj.getChildAt(i);
                    var cs = '' + c;
                    if (cs.indexOf('QuestBook') !== -1 && cs.indexOf('btnQuestBook') === -1) return c;
                    var f = _findQB(c, d + 1);
                    if (f) return f;
                }} catch(e) {}
                return null;
            }
            function _findN(obj, name, d) {
                if (d > 12) return null;
                try { var nc = obj.numChildren; for (var i = 0; i < nc; i++) {
                    var c = obj.getChildAt(i);
                    if (c.name === name) return c;
                    var f = _findN(c, name, d + 1);
                    if (f) return f;
                }} catch(e) {}
                return null;
            }
            function _click(obj) {
                var cx = obj.width / 2, cy = obj.height / 2;
                obj.dispatchEvent(new ME('mouseDown', true, false, cx, cy));
                obj.dispatchEvent(new ME('mouseUp', true, false, cx, cy));
                obj.dispatchEvent(new ME('click', true, false, cx, cy));
            }
            function _confirmOK(root) {
                var found = false;
                (function walk(obj, d) {
                    if (d > 10 || found) return;
                    try { var nc = obj.numChildren; for (var i = 0; i < nc; i++) {
                        var c = obj.getChildAt(i);
                        if (!c.visible) continue;
                        if (c.name === 'OK') { _click(c); found = true; return; }
                        walk(c, d + 1);
                    }} catch(e) {}
                })(root, 0);
                return found;
            }

            var qb = _findQB(stage, 0);
            if (!qb) {
                game.chatMessage('[QL] QuestBook not found on stage', 'questlist');
                done(false);
                return;
            }
            var qbStr = '' + qb;
            var qbNc = 0;
            try { qbNc = qb.numChildren || 0; } catch(e) {}
            game.chatMessage('[QL] QuestBook found: ' + qbStr + ' numChildren=' + qbNc, 'questlist');
            // Dump immediate children to see what we have
            try { for (var di = 0; di < qbNc && di < 10; di++) {
                var dc = qb.getChildAt(di);
                game.chatMessage('[QL]   child[' + di + '] name=' + dc.name + ' type=' + dc + ' vis=' + dc.visible, 'questlist');
            }} catch(e) {}

            // Log footer button states
            var footerBtns = ['btnCloseQuest','btnPayQuest','btnInstantFinish','btnCloseBook'];
            footerBtns.forEach(function(n) {
                var b = _findN(qb, n, 0);
                game.chatMessage('[QL]   ' + n + ' = ' + (b ? 'vis=' + b.visible : 'NOT FOUND'), 'questlist');
            });

            // Try footer buttons
            var btn = _findN(qb, 'btnCloseQuest', 0);
            if (btn && btn.visible) {
                _click(btn);
                game.chatMessage('[QL] btnCloseQuest clicked!', 'questlist');
                setTimeout(function() {
                    var ok = _confirmOK(stage);
                    game.chatMessage('[QL] confirm dialog: ' + (ok ? 'clicked OK' : 'not found'), 'questlist');
                    done(true);
                }, 2000);
                return;
            }
            var btn2 = _findN(qb, 'btnPayQuest', 0);
            if (btn2 && btn2.visible) {
                _click(btn2);
                game.chatMessage('[QL] btnPayQuest clicked!', 'questlist');
                setTimeout(function() {
                    var ok = _confirmOK(stage);
                    game.chatMessage('[QL] confirm dialog: ' + (ok ? 'clicked OK' : 'not found'), 'questlist');
                    done(true);
                }, 2000);
                return;
            }

            // No footer buttons — try selecting a list item first
            game.chatMessage('[QL] no footer buttons visible, searching list items...', 'questlist');
            var items = [];
            (function findItems(obj, d) {
                if (d > 15) return;
                try { var nc = obj.numChildren; for (var i = 0; i < nc; i++) {
                    var c = obj.getChildAt(i);
                    var cs = '' + c;
                    if (cs.indexOf('QuestListItemRenderer') !== -1 || cs.indexOf('QuestListGroupItemRenderer') !== -1) {
                        try { var nc2 = c.numChildren; for (var j = 0; j < nc2; j++) {
                            var ic = c.getChildAt(j);
                            if (ic.name === 'btnItem') {
                                var lbl = '', chk = null, del = null;
                                try { var nc3 = ic.numChildren; for (var k = 0; k < nc3; k++) {
                                    var bc = ic.getChildAt(k);
                                    if (bc.name === 'buttonLabel') lbl = bc.text || '';
                                    if (bc.name === 'buttonCheckbox') chk = bc;
                                    if (bc.name === 'buttonDelete') del = bc;
                                }} catch(e) {}
                                items.push({ btn: ic, label: lbl, chk: chk, del: del, chkVis: chk ? chk.visible : false });
                            }
                        }} catch(e) {}
                    }
                    findItems(c, d + 1);
                }} catch(e) {}
            })(qb, 0);

            game.chatMessage('[QL] found ' + items.length + ' list items, ' + items.filter(function(x){return x.chkVis;}).length + ' with checkbox', 'questlist');
            items.forEach(function(it, i) {
                game.chatMessage('[QL]   [' + i + '] "' + it.label + '" chk=' + it.chkVis, 'questlist');
            });

            var candidates = items.filter(function(it) { return it.chkVis; });
            function tryItem(ci) {
                if (ci >= candidates.length || ci >= 5) {
                    game.chatMessage('[QL] exhausted ' + ci + ' candidates', 'questlist');
                    done(false);
                    return;
                }
                game.chatMessage('[QL] clicking candidate "' + candidates[ci].label + '"...', 'questlist');
                _click(candidates[ci].btn);
                if (candidates[ci].chk) _click(candidates[ci].chk);
                setTimeout(function() {
                    qb = _findQB(stage, 0);
                    if (!qb) { done(false); return; }
                    var b = _findN(qb, 'btnCloseQuest', 0);
                    if (b && b.visible) {
                        _click(b);
                        game.chatMessage('[QL] btnCloseQuest clicked after select!', 'questlist');
                        setTimeout(function() { _confirmOK(stage); done(true); }, 2000);
                    } else {
                        var b2 = _findN(qb, 'btnPayQuest', 0);
                        if (b2 && b2.visible) {
                            _click(b2);
                            game.chatMessage('[QL] btnPayQuest clicked after select!', 'questlist');
                            setTimeout(function() { _confirmOK(stage); done(true); }, 2000);
                        } else {
                            tryItem(ci + 1);
                        }
                    }
                }, 1000);
            }
            tryItem(0);
        } catch(e) {
            game.chatMessage('[QL] auto-claim error: ' + e, 'questlist');
            done(false);
        }
    }, 2500);
}
