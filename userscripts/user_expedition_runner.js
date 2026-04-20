// ========== EXPEDITION RUNNER ==========
// Automate expedition attacks: configure a marshal + a wave list (each wave = an army composition),
// then hit Run. The script loads the first wave's army onto the marshal, sends the attack,
// waits for the marshal to leave garrison (= attack accepted), then reloads the next wave's army
// on the marshal while the battle is in progress, so it is ready to attack again immediately.
//
// How expedition attacks differ from normal attacks:
//   • Generals are replaced by MARSHALS (specialists whose type contains "expedition").
//   • After each wave the player must swap the marshal's army to the next wave composition
//     before the marshal returns — this script automates that swap.
//   • The attack server action uses the same SendServerAction(95, 5, grid, 0, task) call,
//     identical to a normal ATTACK, just on a marshal spec instead of a general spec.
//   • Unit types in the marshal's pool are "expedition" types (e.g. ExpeditionSword),
//     separate from normal unit pools.
//
// Tools menu > "Expedition Runner"

(function () {

// ---- Helpers shared with the game's client API ----
function _erFindSpecByUID(uid) {
    var result = null;
    function search(zone) {
        if (!zone || result) { return; }
        try {
            zone.GetSpecialists_vector().forEach(function (s) {
                if (!result && s.GetUniqueID().toKeyString() === uid) { result = s; }
            });
        } catch (e) {}
    }
    search(game.gi.mCurrentPlayerZone);
    if (!result) { search(game.gi.mCurrentViewedZone); }
    return result;
}

// Returns all marshals on the current zone owned by the player (type name contains "expedition").
function _erGetMarshals() {
    var myId   = game.gi.mCurrentPlayer.GetPlayerId();
    var result = [];
    try {
        game.gi.mCurrentPlayerZone.GetSpecialists_vector().forEach(function (s) {
            if (s.getPlayerID() !== myId) { return; }
            var t = '';
            try { t = s.GetType ? s.GetType() : ''; } catch (e) {}
            if (t.toLowerCase().indexOf('expedition') >= 0) { result.push(s); }
        });
    } catch (e) {}
    return result;
}

// Discover expedition unit types available in the zone free pool or on any marshal.
function _erGetExpeditionUnitTypes() {
    var types = {};
    try {
        game.zone.GetArmy(game.gi.mCurrentPlayer.GetPlayerId())
            .GetSquadsCollection_vector()
            .forEach(function (sq) {
                var t = sq.GetType ? sq.GetType() : '';
                if (t && t.toLowerCase().indexOf('expedition') >= 0) { types[t] = true; }
            });
    } catch (e) {}
    var myId = game.gi.mCurrentPlayer.GetPlayerId();
    try {
        game.gi.mCurrentPlayerZone.GetSpecialists_vector().forEach(function (s) {
            if (s.getPlayerID() !== myId) { return; }
            try {
                s.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                    var t = sq.GetType ? sq.GetType() : '';
                    if (t && t.toLowerCase().indexOf('expedition') >= 0) { types[t] = true; }
                });
            } catch (e2) {}
        });
    } catch (e) {}
    return Object.keys(types);
}

// Load a given army map onto a marshal, unloading it first, then poll until confirmed or timeout.
function _erLoadArmy(marshalUID, armyMap, onDone) {
    var dRaiseArmyVODef = swmmo.getDefinitionByName('Communication.VO::dRaiseArmyVO');
    var dResourceVODef  = swmmo.getDefinitionByName('Communication.VO::dResourceVO');
    var spec = _erFindSpecByUID(marshalUID);
    if (!spec) { onDone('marshal not found'); return; }

    // Step 1: Unload all
    try {
        var voUnload = new dRaiseArmyVODef();
        voUnload.armyHolderSpecialistVO = spec.CreateSpecialistVOFromSpecialist();
        game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, voUnload, armyResponder);
    } catch (e) { onDone('unload error: ' + e); return; }

    // Step 2: Load after 2 s
    setTimeout(function () {
        var spec2 = _erFindSpecByUID(marshalUID);
        if (!spec2) { onDone('marshal lost after unload'); return; }
        var unitKeys = Object.keys(armyMap).filter(function (t) { return armyMap[t] > 0; });
        if (unitKeys.length === 0) { onDone(null); return; } // nothing to load — fine
        try {
            var voLoad = new dRaiseArmyVODef();
            voLoad.armyHolderSpecialistVO = spec2.CreateSpecialistVOFromSpecialist();
            unitKeys.forEach(function (t) {
                var res = new dResourceVODef();
                res.name_string = t;
                res.amount = armyMap[t];
                voLoad.unitSquads.addItem(res);
            });
            game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, voLoad, armyResponder);
        } catch (e) { onDone('load error: ' + e); return; }

        // Step 3: Poll until army confirmed or 20 s timeout
        var total = unitKeys.reduce(function (s, t) { return s + armyMap[t]; }, 0);
        var ticks = 0;
        var iv = setInterval(function () {
            ticks++;
            if (ticks > 10) { clearInterval(iv); onDone('load timeout'); return; }
            try {
                var s3 = _erFindSpecByUID(marshalUID);
                var cur = 0;
                s3.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                    cur += sq.GetAmount ? sq.GetAmount() : 0;
                });
                if (cur >= total) { clearInterval(iv); onDone(null); }
            } catch (e) { clearInterval(iv); onDone('poll error: ' + e); }
        }, 2000);
    }, 2000);
}

// ---- State ----
var _erRunning     = false;
var _erStopped     = false;
var _erProfile     = null;          // currently loaded profile { name, marshalUID, marshalName, buildingName, buildingKey, buildingDisplay, waves: [{...unitMap}] }
var _erProfileList = [];            // [{ name, file }]
var _erModal       = null;

var _erSettingsKey = 'expeditionRunnerProfiles';

// ---- Persistence ----
function _erProfileDir() {
    var dir = air.File.documentsDirectory.resolvePath('expedition_runner_profiles');
    if (!dir.exists) { dir.createDirectory(); }
    return dir;
}
function _erProfileFileFor(name) {
    var safe = (name || 'unnamed').replace(/[^\w\s\-]/g, '').replace(/\s+/g, '_');
    return _erProfileDir().resolvePath(safe + '.json');
}
function _erScanProfiles() {
    _erProfileList = [];
    try {
        var listing = _erProfileDir().getDirectoryListing();
        for (var i = 0; i < listing.length; i++) {
            var f = listing[i];
            if (!f.isDirectory && f.name.match(/\.json$/i)) {
                var name = f.name.replace(/\.json$/i, '').replace(/_/g, ' ');
                _erProfileList.push({ name: name, file: f });
            }
        }
    } catch (e) {}
}
function _erSaveProfile(profile) {
    try {
        var f = _erProfileFileFor(profile.name);
        var fs = new air.FileStream();
        fs.open(f, air.FileMode.WRITE);
        fs.writeUTFBytes(JSON.stringify(profile, null, 2));
        fs.close();
    } catch (e) { game.chatMessage('ExpeditionRunner: save error: ' + e, 'adventurer'); }
}
function _erLoadProfileFile(name) {
    try {
        var f = _erProfileFileFor(name);
        if (!f.exists) { return null; }
        var fs = new air.FileStream();
        fs.open(f, air.FileMode.READ);
        var raw = fs.readUTFBytes(fs.bytesAvailable);
        fs.close();
        return JSON.parse(raw);
    } catch (e) { return null; }
}

// ---- Find building grid on current zone ----
function _erFindBuildingGrid(buildingName, buildingKey) {
    var grid = 0;
    try {
        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
            if (grid) { return; }
            var nm = '';
            try { nm = b.GetName ? b.GetName() : ''; } catch (e) {}
            if ((buildingKey && nm === buildingKey) || (!buildingKey && nm === buildingName)) {
                try { grid = b.GetGrid(); } catch (e) {}
            }
        });
    } catch (e) {}
    return grid;
}

// ---- UI helpers ----
function _erLog(msg) {
    game.chatMessage('[ExpeditionRunner] ' + msg, 'adventurer');
    var $log = $('#erLog');
    if ($log.length) {
        var t = new Date();
        var ts = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2);
        var $entry = $('<div>').text(ts + '  ' + msg)
            .css({ 'font-size': '11px', 'color': '#ccc', 'border-bottom': '1px solid #333', 'padding': '2px 0' });
        $log.prepend($entry);
        // Keep at most 80 lines
        $log.children().slice(80).remove();
    }
}

function _erUpdateControls() {
    if (!_erModal) { return; }
    $('#erRunBtn').prop('disabled', _erRunning);
    $('#erStopBtn').prop('disabled', !_erRunning);
    $('#erStatus').text(_erRunning ? 'Running…' : 'Idle');
}

// ---- Modal ----
addToolsMenuItem('Expedition Runner', _erOpenModal);

var _erModalInitialized = false;

function _erOpenModal() {
    $("div[role='dialog']:not(#erModal):visible").modal('hide');
    _erModal = new Modal('erModal', getImageTag('BuffKingdomOfCaliphs_Reward_Adventurer', '24px') + ' Expedition Runner');
    _erModal.size = 'modal-lg';
    _erModal.create();

    if (!_erModalInitialized) {
        _erModalInitialized = true;
        _erBuildModal();
    }
    _erScanProfiles();
    _erRebuildProfileList();
    _erRenderEditor();
    _erUpdateControls();

    $('#erModal').modal({ backdrop: false });
}

function _erBuildModal() {
    var $body = _erModal.Body();
    $body.css({ 'padding': '10px', 'background': '#222', 'color': '#eee' });

    // ---- Top bar: profile selector + buttons ----
    var $topBar = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px', 'margin-bottom': '10px', 'flex-wrap': 'wrap' });

    $('<span>').css({ 'font-weight': 'bold', 'color': '#f0c040' }).text('Profile:').appendTo($topBar);
    $('<select>').attr({ 'id': 'erProfileSel', 'class': 'form-control input-sm' })
        .css({ 'width': '200px' })
        .on('change', function () {
            var name = $(this).val();
            if (!name) { return; }
            var loaded = _erLoadProfileFile(name);
            if (loaded) {
                _erProfile = loaded;
                _erRenderEditor();
            }
        }).appendTo($topBar);

    $('<button>').attr({ 'id': 'erNewBtn', 'class': 'btn btn-sm btn-default' }).text('New')
        .click(function () {
            _erProfile = { name: 'New Expedition', marshalUID: '', marshalName: '', buildingName: '', buildingKey: '', buildingDisplay: '', waves: [{}] };
            _erRenderEditor();
        }).appendTo($topBar);

    $('<button>').attr({ 'id': 'erSaveBtn', 'class': 'btn btn-sm btn-success' }).text('Save')
        .click(function () {
            _erReadEditorIntoProfile();
            if (!_erProfile || !_erProfile.name) { showGameAlert('Set a profile name first.'); return; }
            _erSaveProfile(_erProfile);
            _erScanProfiles();
            _erRebuildProfileList();
            showGameAlert('Saved: ' + _erProfile.name);
        }).appendTo($topBar);

    $('<button>').attr({ 'id': 'erDeleteBtn', 'class': 'btn btn-sm btn-danger' }).text('Delete')
        .click(function () {
            var name = $('#erProfileSel').val();
            if (!name) { return; }
            if (!confirm('Delete profile "' + name + '"?')) { return; }
            try { _erProfileFileFor(name).deleteFile(); } catch (e) {}
            _erProfile = null;
            _erScanProfiles();
            _erRebuildProfileList();
            _erRenderEditor();
        }).appendTo($topBar);

    $body.append($topBar);

    // ---- Editor area ----
    $('<div>').attr('id', 'erEditor').appendTo($body);

    // ---- Controls ----
    var $ctrlBar = $('<div>').css({ 'display': 'flex', 'gap': '6px', 'margin-top': '10px', 'align-items': 'center' });
    $('<button>').attr({ 'id': 'erRunBtn', 'class': 'btn btn-sm btn-primary' }).text('\u25b6 Run')
        .click(_erRun).appendTo($ctrlBar);
    $('<button>').attr({ 'id': 'erStopBtn', 'class': 'btn btn-sm btn-danger' }).text('\u25a0 Stop')
        .prop('disabled', true)
        .click(function () { _erStopped = true; _erLog('Stopped by user.'); _erRunning = false; _erUpdateControls(); })
        .appendTo($ctrlBar);
    $('<span>').attr('id', 'erStatus').css({ 'font-size': '12px', 'color': '#aaa', 'margin-left': '8px' }).text('Idle').appendTo($ctrlBar);
    $body.append($ctrlBar);

    // ---- Log ----
    $('<div>').css({ 'font-weight': 'bold', 'color': '#aaa', 'margin-top': '12px', 'font-size': '11px' }).text('Log').appendTo($body);
    $('<div>').attr('id', 'erLog')
        .css({ 'height': '150px', 'overflow-y': 'auto', 'background': '#111', 'border': '1px solid #444',
               'padding': '4px 6px', 'border-radius': '3px' }).appendTo($body);
}

function _erRebuildProfileList() {
    var $sel = $('#erProfileSel').empty();
    $('<option>').val('').text('— select profile —').appendTo($sel);
    _erProfileList.forEach(function (p) {
        var selected = _erProfile && _erProfile.name === p.name;
        $('<option>').val(p.name).text(p.name).prop('selected', selected).appendTo($sel);
    });
}

// ---- Editor rendering ----
function _erRenderEditor() {
    var $ed = $('#erEditor').empty();
    if (!_erProfile) {
        $('<div>').css({ 'color': '#aaa', 'font-style': 'italic' }).text('Select or create a profile.').appendTo($ed);
        return;
    }
    var p = _erProfile;

    // Profile name
    var $nameRow = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px', 'margin-bottom': '8px' });
    $('<span>').css({ 'min-width': '90px', 'color': '#ccc', 'font-size': '12px' }).text('Profile name:').appendTo($nameRow);
    $('<input>').attr({ 'id': 'erName', 'class': 'form-control input-sm', 'placeholder': 'Profile name' })
        .css({ 'width': '220px' }).val(p.name || '').appendTo($nameRow);
    $ed.append($nameRow);

    // Marshal selector
    var $marshRow = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px', 'margin-bottom': '8px' });
    $('<span>').css({ 'min-width': '90px', 'color': '#ccc', 'font-size': '12px' }).text('Marshal:').appendTo($marshRow);
    var $marshSel = $('<select>').attr({ 'id': 'erMarshalSel', 'class': 'form-control input-sm' })
        .css({ 'width': '260px' });
    $('<option>').val('').text('— select marshal —').appendTo($marshSel);
    _erGetMarshals().forEach(function (s) {
        var uid  = s.GetUniqueID().toKeyString();
        var name = '';
        try { name = s.getName(false).replace(/<[^>]+>/g, ''); } catch (e) { name = uid; }
        $('<option>').val(uid).text(name).prop('selected', uid === p.marshalUID).appendTo($marshSel);
    });
    $marshRow.append($marshSel);

    // Snap army from marshal button
    $('<button>').attr({ 'class': 'btn btn-xs btn-info', 'title': 'Capture the selected marshal\'s current army into the first wave' })
        .text('Snap Wave 1')
        .click(function () {
            var uid = $marshSel.val();
            var sp = uid ? _erFindSpecByUID(uid) : null;
            if (!sp) { game.chatMessage('ExpeditionRunner: select a marshal first', 'adventurer'); return; }
            var snapped = {};
            try {
                sp.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                    var t = sq.GetType ? sq.GetType() : '';
                    var a = sq.GetAmount ? sq.GetAmount() : 0;
                    if (t && a > 0) { snapped[t] = a; }
                });
            } catch (e) {}
            if (Object.keys(snapped).length === 0) {
                game.chatMessage('ExpeditionRunner: marshal has no units loaded — load units first, then Snap', 'adventurer');
                return;
            }
            _erReadEditorIntoProfile();
            _erProfile.waves[0] = snapped;
            _erRenderEditor();
        }).appendTo($marshRow);

    $ed.append($marshRow);

    // Target building selector
    var $bldRow = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px', 'margin-bottom': '8px' });
    $('<span>').css({ 'min-width': '90px', 'color': '#ccc', 'font-size': '12px' }).text('Target camp:').appendTo($bldRow);
    var $bldSel = $('<select>').attr({ 'id': 'erBldSel', 'class': 'form-control input-sm' }).css({ 'width': '320px' });
    $('<option>').val('').text('— select building —').appendTo($bldSel);
    // All buildings on zone that are alive (IsReadyToIntercept)
    try {
        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
            try {
                if (!b.IsReadyToIntercept || !b.IsReadyToIntercept()) { return; }
                var nm  = b.GetName ? b.GetName() : '';
                var grd = b.GetGrid ? b.GetGrid() : 0;
                var lbl = nm + ' (grid ' + grd + ')';
                $('<option>').val(nm).attr('data-grid', grd)
                    .text(lbl)
                    .prop('selected', nm === p.buildingName)
                    .appendTo($bldSel);
            } catch (e2) {}
        });
    } catch (e) {}
    $bldRow.append($bldSel);

    // Refresh buildings list
    $('<button>').attr({ 'class': 'btn btn-xs btn-default' }).text('Refresh')
        .click(function () { _erReadEditorIntoProfile(); _erRenderEditor(); })
        .appendTo($bldRow);
    $ed.append($bldRow);

    // ---- Wave list ----
    $('<div>').css({ 'font-weight': 'bold', 'color': '#40c0a0', 'margin-bottom': '6px', 'margin-top': '4px', 'font-size': '13px' })
        .text('Waves — army composition per round').appendTo($ed);

    $('<div>').css({ 'font-size': '10px', 'color': '#888', 'margin-bottom': '8px' })
        .html('Each wave is loaded onto the marshal before its attack. After a wave is sent the script immediately<br>reloads the next wave army so the marshal is ready the moment it returns.')
        .appendTo($ed);

    var $waveList = $('<div>').attr('id', 'erWaveList').appendTo($ed);
    var waves = p.waves && p.waves.length > 0 ? p.waves : [{}];
    p.waves = waves;

    var expTypes = _erGetExpeditionUnitTypes();

    function rebuildWaveList() {
        $waveList.empty();
        waves.forEach(function (waveArmy, wi) {
            var $wb = $('<div>')
                .css({ 'background': 'rgba(13,107,92,0.18)', 'border': '1px solid #336655',
                       'border-radius': '4px', 'padding': '8px', 'margin-bottom': '8px' });

            var $wh = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px', 'margin-bottom': '6px' });
            $('<span>').css({ 'font-weight': 'bold', 'color': '#f0c040', 'font-size': '13px' })
                .text('Wave ' + (wi + 1)).appendTo($wh);

            // Snap this wave from marshal's current army
            $('<button>').attr({ 'class': 'btn btn-xs btn-info', 'title': 'Capture marshal\'s current army into this wave' })
                .text('Snap')
                .click(function () {
                    var uid = $('#erMarshalSel').val();
                    var sp = uid ? _erFindSpecByUID(uid) : null;
                    if (!sp) { game.chatMessage('ExpeditionRunner Snap: select a marshal first', 'adventurer'); return; }
                    var snapped = {};
                    try {
                        sp.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                            var t = sq.GetType ? sq.GetType() : '';
                            var a = sq.GetAmount ? sq.GetAmount() : 0;
                            if (t && a > 0) { snapped[t] = a; }
                        });
                    } catch (e) {}
                    if (Object.keys(snapped).length === 0) {
                        game.chatMessage('ExpeditionRunner Snap: marshal has no army — load first', 'adventurer');
                        return;
                    }
                    waves[wi] = snapped;
                    rebuildWaveList();
                }).appendTo($wh);

            // Clear wave
            $('<button>').attr({ 'class': 'btn btn-xs btn-warning' }).text('Clear')
                .click(function () { waves[wi] = {}; rebuildWaveList(); }).appendTo($wh);

            // Remove wave (only if > 1)
            if (waves.length > 1) {
                $('<button>').attr({ 'class': 'btn btn-xs btn-danger' }).html('&times; Remove')
                    .click(function () { waves.splice(wi, 1); rebuildWaveList(); }).appendTo($wh);
            }

            $wb.append($wh);

            // Unit type rows
            var waveTypes = Object.keys(waveArmy).filter(function (t) { return waveArmy[t] > 0; });
            // Merge snapped types with discovered expedition types
            expTypes.forEach(function (t) { if (waveTypes.indexOf(t) < 0) { waveTypes.push(t); } });
            if (waveTypes.length === 0) {
                $('<div>').css({ 'font-size': '10px', 'color': '#888', 'font-style': 'italic' })
                    .text('No expedition unit types found yet. Load units on the marshal and click Snap, or add types manually below.')
                    .appendTo($wb);
                // Manual add input
                var $addRow = $('<div>').css({ 'display': 'flex', 'gap': '5px', 'margin-top': '4px' });
                var $typeIn = $('<input>').attr({ 'class': 'form-control input-xs', 'placeholder': 'unit type name' }).css({ 'width': '180px' });
                $('<button>').attr('class', 'btn btn-xs btn-success').text('+ Add type')
                    .click(function () {
                        var t = $typeIn.val().trim();
                        if (!t) { return; }
                        if (!waveArmy[t]) { waveArmy[t] = 0; }
                        rebuildWaveList();
                    }).appendTo($addRow);
                $addRow.prepend($typeIn);
                $wb.append($addRow);
            } else {
                waveTypes.forEach(function (type) {
                    var $row2 = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '8px', 'margin-bottom': '3px' });
                    $('<span>').css({ 'min-width': '200px', 'font-size': '11px', 'color': '#ccc' }).text(type).appendTo($row2);
                    var $in = $('<input>').attr({ 'type': 'number', 'min': '0', 'class': 'erWaveInput', 'data-type': type })
                        .css({ 'width': '80px', 'padding': '1px 4px', 'font-size': '11px', 'color': '#000', 'background': '#fff' })
                        .val(waveArmy[type] || 0)
                        .on('input change', function () {
                            var v = parseInt($(this).val(), 10) || 0;
                            waveArmy[type] = v;
                        });
                    $row2.append($in);
                    $wb.append($row2);
                });
            }

            $waveList.append($wb);
        });

        // Add wave button
        $('<button>').attr('class', 'btn btn-sm btn-success').css('margin-top', '4px')
            .text('+ Add Wave')
            .click(function () {
                // Clone last wave as starting point for next
                var last = waves.length > 0 ? JSON.parse(JSON.stringify(waves[waves.length - 1])) : {};
                waves.push(last);
                rebuildWaveList();
            }).appendTo($waveList);
    }

    rebuildWaveList();
}

// Read editor form values back into _erProfile (without re-rendering)
function _erReadEditorIntoProfile() {
    if (!_erProfile) { return; }
    _erProfile.name        = $('#erName').val()  || 'Unnamed';
    _erProfile.marshalUID  = $('#erMarshalSel').val()  || '';
    _erProfile.marshalName = $('#erMarshalSel option:selected').text().trim() || '';
    _erProfile.buildingName = $('#erBldSel').val() || '';
    _erProfile.buildingKey  = $('#erBldSel').val() || '';
    _erProfile.buildingDisplay = $('#erBldSel option:selected').text().trim() || '';
    var targetGrid = parseInt($('#erBldSel option:selected').attr('data-grid') || '0', 10) || 0;
    _erProfile.targetGrid = targetGrid;
    // waves are already written live via input events; just sync
    if (!_erProfile.waves) { _erProfile.waves = [{}]; }
}

// ---- Runner ----
function _erRun() {
    _erReadEditorIntoProfile();
    var p = _erProfile;
    if (!p) { showGameAlert('No profile loaded.'); return; }
    if (!p.marshalUID) { showGameAlert('Select a marshal first.'); return; }
    if (!p.buildingName && !p.targetGrid) { showGameAlert('Select a target camp first.'); return; }
    var waves = p.waves;
    if (!waves || waves.length === 0) { showGameAlert('Add at least one wave.'); return; }

    var spec = _erFindSpecByUID(p.marshalUID);
    if (!spec) { showGameAlert('Marshal not found on current zone.'); return; }

    // Determine target building grid
    var grid = p.targetGrid || _erFindBuildingGrid(p.buildingName, p.buildingKey);
    if (!grid) { showGameAlert('Target camp not found on current zone.'); return; }

    // Check camp is still alive
    var alive = false;
    try {
        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
            if (alive) { return; }
            try {
                if (b.GetGrid() === grid && b.IsReadyToIntercept && b.IsReadyToIntercept()) { alive = true; }
            } catch (e2) {}
        });
    } catch (e) {}
    if (!alive) { showGameAlert('Target camp is already defeated or not found.'); return; }

    _erRunning = true;
    _erStopped = false;
    _erUpdateControls();
    _erLog('Starting expedition — marshal: ' + (p.marshalName || p.marshalUID) + ', target: ' + (p.buildingDisplay || p.buildingName) + ', ' + waves.length + ' wave(s).');

    var waveIdx = 0;

    function runNextWave() {
        if (_erStopped) { _erLog('Stopped.'); _erRunning = false; _erUpdateControls(); return; }
        if (waveIdx >= waves.length) {
            _erLog('All ' + waves.length + ' wave(s) dispatched. Done.');
            _erRunning = false;
            _erUpdateControls();
            showGameAlert('Expedition Runner: all waves dispatched!');
            return;
        }

        var wi = waveIdx;
        var waveArmy = waves[wi];
        _erLog('Wave ' + (wi + 1) + '/' + waves.length + ': loading army…');

        // 1. Load this wave's army onto the marshal
        _erLoadArmy(p.marshalUID, waveArmy, function (err) {
            if (_erStopped) { _erLog('Stopped.'); _erRunning = false; _erUpdateControls(); return; }
            if (err) { _erLog('Load error for wave ' + (wi + 1) + ': ' + err + ' — halting.'); _erRunning = false; _erUpdateControls(); return; }

            _erLog('Wave ' + (wi + 1) + ': army loaded, sending attack…');

            // 2. Verify camp still alive
            var stillAlive = false;
            try {
                game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                    if (stillAlive) { return; }
                    try {
                        if (b.GetGrid() === grid && b.IsReadyToIntercept && b.IsReadyToIntercept()) { stillAlive = true; }
                    } catch (e2) {}
                });
            } catch (e) {}
            if (!stillAlive) {
                _erLog('Wave ' + (wi + 1) + ': target camp defeated before attack — stopping.');
                _erRunning = false;
                _erUpdateControls();
                return;
            }

            // 3. Snapshot garrison grid before attack
            var sp = _erFindSpecByUID(p.marshalUID);
            if (!sp) { _erLog('Marshal not found before attack — halting.'); _erRunning = false; _erUpdateControls(); return; }
            var origGrid = sp.GetGarrisonGridIdx ? sp.GetGarrisonGridIdx() : -1;

            // 4. Send attack
            function doSendAttack() {
                var sp2 = _erFindSpecByUID(p.marshalUID);
                if (!sp2) { return; }
                var armySpecTaskDef = swmmo.getDefinitionByName('Communication.VO::dStartSpecialistTaskVO');
                var stask = new armySpecTaskDef();
                stask.uniqueID  = sp2.GetUniqueID();
                stask.subTaskID = 0;
                game.gi.mCurrentCursor.mCurrentSpecialist = sp2;
                game.gi.SendServerAction(95, 5, grid, 0, stask);
            }
            doSendAttack();
            _erLog('Wave ' + (wi + 1) + ': attack sent, waiting for departure…');

            // 5. Poll until marshal leaves garrison (= attack accepted) or camp is gone
            var retryTicks   = 0;
            var routeRetries = 0;
            var ivAtk = setInterval(function () {
                if (_erStopped) { clearInterval(ivAtk); _erLog('Stopped.'); _erRunning = false; _erUpdateControls(); return; }
                try {
                    var sp3 = _erFindSpecByUID(p.marshalUID);
                    var left = sp3 && sp3.GetGarrisonGridIdx() !== origGrid;
                    var campGone = false;
                    try {
                        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                            if (campGone) { return; }
                            try {
                                if (b.GetGrid() === grid && (!b.IsReadyToIntercept || !b.IsReadyToIntercept())) { campGone = true; }
                            } catch (e2) {}
                        });
                    } catch (e) {}

                    if (left || campGone) {
                        clearInterval(ivAtk);
                        _erLog('Wave ' + (wi + 1) + ': attack accepted' + (campGone ? ' (camp defeated)' : '') + '.');
                        waveIdx++;

                        // If more waves and camp still alive, pre-load the NEXT wave's army
                        // immediately while the marshal is travelling — so it's ready on return.
                        if (waveIdx < waves.length && !campGone) {
                            _erLog('Pre-loading wave ' + (waveIdx + 1) + ' army while marshal is away…');
                            // Small delay to let the server process the attack first
                            setTimeout(function () {
                                if (_erStopped) { _erLog('Stopped.'); _erRunning = false; _erUpdateControls(); return; }
                                _erLoadArmy(p.marshalUID, waves[waveIdx], function (preErr) {
                                    if (preErr) { _erLog('Pre-load wave ' + (waveIdx + 1) + ' warning: ' + preErr); }
                                    else { _erLog('Wave ' + (waveIdx + 1) + ' army pre-loaded on marshal.'); }
                                    // Now wait for marshal to return before sending next attack
                                    _erWaitMarshalReturn(p.marshalUID, function () {
                                        if (_erStopped) { _erLog('Stopped.'); _erRunning = false; _erUpdateControls(); return; }
                                        _erLog('Marshal returned. Launching wave ' + (waveIdx + 1) + '…');
                                        // Army is already loaded — skip load step, go straight to attack
                                        _erAttackWithCurrentArmy(waveIdx, function () {
                                            waveIdx++;
                                            setTimeout(runNextWave, 500);
                                        });
                                    });
                                });
                            }, 2000);
                        } else {
                            setTimeout(runNextWave, 500);
                        }
                    } else {
                        retryTicks++;
                        if (retryTicks % 60 === 0) { // every 30 s
                            routeRetries++;
                            if (routeRetries >= 10) {
                                clearInterval(ivAtk);
                                _erLog('Wave ' + (wi + 1) + ': route blocked 10 times — halting.');
                                _erRunning = false;
                                _erUpdateControls();
                            } else {
                                _erLog('Wave ' + (wi + 1) + ': route blocked, retrying (' + routeRetries + '/10)…');
                                doSendAttack();
                            }
                        }
                    }
                } catch (e) { clearInterval(ivAtk); _erLog('Poll error: ' + e); _erRunning = false; _erUpdateControls(); }
            }, 500);
        });
    }

    // Helper: wait for marshal to return (garrison grid is valid and task is null)
    function _erWaitMarshalReturn(uid, onReturn) {
        _erLog('Waiting for marshal to return to garrison…');
        var iv = setInterval(function () {
            if (_erStopped) { clearInterval(iv); return; }
            try {
                var s = _erFindSpecByUID(uid);
                var garrisoned = s && s.GetGarrisonGridIdx() > 0;
                var idle = s && s.GetTask && s.GetTask() == null;
                if (garrisoned && idle) {
                    clearInterval(iv);
                    onReturn();
                }
            } catch (e) { clearInterval(iv); _erLog('Wait marshal error: ' + e); _erRunning = false; _erUpdateControls(); }
        }, 3000);
    }

    // Helper: send attack with currently loaded army (no load step), then advance waveIdx via callback
    function _erAttackWithCurrentArmy(wi, onDone) {
        var sp = _erFindSpecByUID(p.marshalUID);
        if (!sp) { _erLog('Marshal gone before wave ' + (wi + 1) + ' attack — halting.'); _erRunning = false; _erUpdateControls(); return; }

        // Verify camp still alive
        var alive2 = false;
        try {
            game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                if (alive2) { return; }
                try {
                    if (b.GetGrid() === grid && b.IsReadyToIntercept && b.IsReadyToIntercept()) { alive2 = true; }
                } catch (e2) {}
            });
        } catch (e) {}
        if (!alive2) {
            _erLog('Wave ' + (wi + 1) + ': camp already defeated. Stopping.');
            _erRunning = false;
            _erUpdateControls();
            return;
        }

        var origGrid2 = sp.GetGarrisonGridIdx ? sp.GetGarrisonGridIdx() : -1;
        function doAtk() {
            var sp4 = _erFindSpecByUID(p.marshalUID);
            if (!sp4) { return; }
            var armySpecTaskDef = swmmo.getDefinitionByName('Communication.VO::dStartSpecialistTaskVO');
            var stask = new armySpecTaskDef();
            stask.uniqueID  = sp4.GetUniqueID();
            stask.subTaskID = 0;
            game.gi.mCurrentCursor.mCurrentSpecialist = sp4;
            game.gi.SendServerAction(95, 5, grid, 0, stask);
        }
        doAtk();
        _erLog('Wave ' + (wi + 1) + ': attack sent (pre-loaded army), waiting for departure…');

        var ticks2 = 0, rRetries2 = 0;
        var iv2 = setInterval(function () {
            if (_erStopped) { clearInterval(iv2); _erLog('Stopped.'); _erRunning = false; _erUpdateControls(); return; }
            try {
                var sp5 = _erFindSpecByUID(p.marshalUID);
                var left2 = sp5 && sp5.GetGarrisonGridIdx() !== origGrid2;
                var campGone2 = false;
                try {
                    game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                        if (campGone2) { return; }
                        try {
                            if (b.GetGrid() === grid && (!b.IsReadyToIntercept || !b.IsReadyToIntercept())) { campGone2 = true; }
                        } catch (e2) {}
                    });
                } catch (e) {}
                if (left2 || campGone2) {
                    clearInterval(iv2);
                    _erLog('Wave ' + (wi + 1) + ': attack accepted' + (campGone2 ? ' (camp defeated)' : '') + '.');
                    onDone();
                } else {
                    ticks2++;
                    if (ticks2 % 60 === 0) {
                        rRetries2++;
                        if (rRetries2 >= 10) {
                            clearInterval(iv2);
                            _erLog('Wave ' + (wi + 1) + ': route permanently blocked — halting.');
                            _erRunning = false;
                            _erUpdateControls();
                        } else {
                            doAtk();
                        }
                    }
                }
            } catch (e) { clearInterval(iv2); _erLog('Poll error: ' + e); _erRunning = false; _erUpdateControls(); }
        }, 500);
    }

    runNextWave();
}

})();
