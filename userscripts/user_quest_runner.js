// ========== ADVENTURER
// Automate quest dispatch: save profiles with general + army + adventure destination,
// then execute all steps with a single "Run" click.

(function () {

// ---- Language ----
var _qrLang = {
    'en-uk': {
        'title':             'Adventurer',
        'newProfile':        'New Profile',
        'deleteProfile':     'Delete',
        'profileName':       'Profile Name',
        'addStep':           '+ Add Step',
        'save':              'Save Profile',
        'saveAs':            'Save As',
        'run':               'Run',
        'colGeneral':        'General',
        'colAdventure':      'Adventure',
        'colArmy':           'Army',
        'snapshot':          'Snap',
        'assign':            'Assign',
        'stepMinArmy':       'Min. Army for General',
        'setMinArmy':        'Set Min Army',
        'insufficientForMinArmy': 'Not enough {0}: need {1} for min armies, have {2}',
        'notHomeZone':       'You must be on your home zone to run a quest profile.',
        'generalBusy':       'General is busy or not in garrison',
        'noGeneralSelected': 'No general selected in step',
        'noAdventure':       'No adventure selected in step',
        'adventureNotPlaced': 'Adventure not placed on map yet — open it from your star menu, then Run again',
        'adventureNotInInventory': 'Adventure not found in inventory',
        'placingAdventure':  'Placing adventure...',
        'openBattleTool':    'Open Battle Tool (F10)',
        'inventoryEmpty':    'No adventures in inventory',
        'validationFailed':  'Cannot run profile — fix the following:',
        'done':              'Quest profile dispatched!',
        'profileSaved':      'Profile saved.',
        'selectProfile':     '— select profile —',
        'unnamed':           'New Profile',
        'noProfiles':        'No profiles yet. Click "New Profile".',
        'confirm_delete':    'Delete this profile?',
        'running':           'Running...',
        'stepOf':            'Step {0} of {1}',
        'minArmy':           'Min. Army (total)',
        'colMin':            'Min',
        'colTotal':          'Total',
        'colDiff':           'Diff',
        'colOwned':          'Owned',
        'colLeft':           'Left',
    },
    'pt-br': {
        'title':             'Adventurer',
        'newProfile':        'Novo Perfil',
        'deleteProfile':     'Deletar',
        'profileName':       'Nome do Perfil',
        'addStep':           '+ Adicionar Passo',
        'save':              'Salvar Perfil',
        'saveAs':            'Salvar Como',
        'run':               'Executar',
        'colGeneral':        'General',
        'colAdventure':      'Aventura',
        'colArmy':           'Exercito',
        'snapshot':          'Cap.',
        'assign':            'Atribuir',
        'stepMinArmy':       'Exercito min. do General',
        'setMinArmy':        'Definir Min',
        'insufficientForMinArmy': 'Falta {0}: precisa {1} p/ min, tem {2}',
        'notHomeZone':       'Voce precisa estar na sua ilha para executar um perfil.',
        'generalBusy':       'General ocupado ou nao na guarnicao',
        'noGeneralSelected': 'Nenhum general selecionado no passo',
        'noAdventure':       'Nenhuma aventura selecionada no passo',
        'validationFailed':  'Nao e possivel executar — corrija:',
        'done':              'Perfil de quest enviado!',
        'profileSaved':      'Perfil salvo.',
        'selectProfile':     '— selecionar perfil —',
        'unnamed':           'Novo Perfil',
        'noProfiles':        'Nenhum perfil ainda. Clique em "Novo Perfil".',
        'confirm_delete':    'Deletar este perfil?',
        'running':           'Executando...',
        'stepOf':            'Passo {0} de {1}',
        'minArmy':           'Min. Exercito (total)',
        'colMin':            'Min',
        'colTotal':          'Total',
        'colDiff':           'Diferenca',
        'colOwned':          'Disponivel',
        'colLeft':           'Resto',
        'adventureNotPlaced':     'Aventura nao colocada no mapa ainda',
        'adventureNotInInventory': 'Aventura nao encontrada no inventario',
        'placingAdventure':       'Colocando aventura...',
        'openBattleTool':         'Abrir Ferramenta de Batalha (F10)',
    }
};

function _qrT(key) {
    var lang = typeof gameLang !== 'undefined' ? gameLang : 'en-uk';
    var table = _qrLang[lang] || _qrLang['en-uk'];
    return table[key] || (_qrLang['en-uk'][key] || key);
}

// ---- State ----
var _qrSettingsKey   = 'usQuestRunner';
var _qrProfiles      = [];   // Array of profile objects
var _qrSelectedIdx   = -1;   // Index of currently selected profile in sidebar
var _qrModal         = null;
var _qrRunning       = false;
var _qrBsState       = null;  // { steps, stepIdx, profile } while battle script is running or paused
var _qrGeneralsCollapsed   = false;  // collapsed state for Generals section
var _qrBattleFlowCollapsed = false;  // collapsed state for Battle Flow section
var _qrScrollToBsIdx       = -1;    // battle-script step index to scroll to after render (-1 = no scroll)
var _qrScrollToGenIdx      = -1;    // generals step index to scroll to after render (-1 = no scroll)

// ---- Modal minimize/restore ----
function _qrMinimizeModal() {
    if (!_qrModal) { return; }
    _qrModal.Body().hide();
    // Remove backdrop and make modal non-blocking so the game map is fully clickable
    $('.modal-backdrop').css('display', 'none');
    $('#questRunnerModal').css('pointer-events', 'none');
    $('#questRunnerModal .modal-footer').css('pointer-events', 'auto');
    $('#qrMinimizeBtn').text('[+]').attr('title', 'Restore window');
    _qrBsUpdateControls();
}
function _qrRestoreModal() {
    if (!_qrModal) { return; }
    _qrModal.Body().show();
    // Restore backdrop and pointer events
    $('.modal-backdrop').css('display', '');
    $('#questRunnerModal').css('pointer-events', '');
    $('#questRunnerModal .modal-footer').css('pointer-events', '');
    $('#qrMinimizeBtn').text('[−]').attr('title', 'Minimize window');
    _qrBsUpdateControls();
}

// ---- Persistence ----
// Profiles are stored in a dedicated file next to settings.json so they don't
// bloat the shared settings blob and can be exported/imported freely.
function _qrProfileFile() {
    return new air.File('file:///' + air.File.applicationDirectory.resolvePath('quest_runner_profiles.json').nativePath);
}

function _qrLoad() {
    try {
        var pf = _qrProfileFile();
        if (pf.exists) {
            var fs = new air.FileStream();
            fs.open(pf, air.FileMode.READ);
            var raw = fs.readUTFBytes(fs.bytesAvailable);
            fs.close();
            var parsed = JSON.parse(raw);
            _qrProfiles = Array.isArray(parsed) ? parsed : [];
            return;
        }
    } catch (e) {}
    // Legacy migration: read from settings.json and move to separate file on next save
    var d = readSettings(null, _qrSettingsKey);
    _qrProfiles = (d && Array.isArray(d.profiles)) ? d.profiles : [];
}

function _qrSave() {
    try {
        var pf = _qrProfileFile();
        var fs = new air.FileStream();
        fs.open(pf, air.FileMode.WRITE);
        fs.writeUTFBytes(JSON.stringify(_qrProfiles, null, '  '));
        fs.close();
        // Clear legacy entry from settings.json once successfully migrated
        var legacy = readSettings(null, _qrSettingsKey);
        if (legacy && legacy.profiles) {
            storeSettings({}, _qrSettingsKey);
        }
    } catch (e) {
        // Fallback: write to settings.json if file I/O fails
        storeSettings({ profiles: _qrProfiles }, _qrSettingsKey);
    }
}

function _qrExportProfiles() {
    try {
        _qrSaveCurrentFromUI();
        if (_qrSelectedIdx < 0 || _qrSelectedIdx >= _qrProfiles.length) {
            showGameAlert('No profile selected to export.'); return;
        }
        var profile = _qrProfiles[_qrSelectedIdx];
        var safeName = (profile.name || 'profile').replace(/[^\w\s\-]/g, '').replace(/\s+/g, '_');
        var json = JSON.stringify(profile, null, '  ');
        var f = new air.File(air.File.documentsDirectory.nativePath).resolvePath('qr_' + safeName + '.json');
        f.addEventListener(air.Event.COMPLETE, function () {
            game.chatMessage('Quest Runner: "' + profile.name + '" exported.', 'adventurer');
        });
        f.save(json, 'Export profile');
    } catch (e) { showGameAlert('Export failed: ' + e); }
}

function _qrImportProfiles() {
    try {
        var f = new air.File(air.File.documentsDirectory.nativePath);
        var filter = new air.FileFilter('JSON files', '*.json');
        f.addEventListener(air.Event.SELECT, function (ev) {
            ev.target.addEventListener(air.Event.COMPLETE, function (ev2) {
                try {
                    var parsed = JSON.parse(ev2.target.data);
                    // Accept a single profile object (not an array)
                    if (Array.isArray(parsed) || typeof parsed !== 'object' || !parsed.name) {
                        showGameAlert('Import failed: file does not contain a single profile object.\nExport a profile first to see the expected format.'); return;
                    }
                    if (!parsed.id) { parsed.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
                    // If a profile with the same id already exists, give the import a fresh id
                    var existingIds = {};
                    _qrProfiles.forEach(function (p) { existingIds[p.id] = true; });
                    if (existingIds[parsed.id]) { parsed.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
                    _qrProfiles.push(parsed);
                    _qrSave();
                    _qrSelectedIdx = _qrProfiles.length - 1;
                    _qrRenderAll();
                    game.chatMessage('Quest Runner: "' + parsed.name + '" imported.', 'adventurer');
                } catch (e) { showGameAlert('Import parse error: ' + e); }
            });
            ev.target.load();
        });
        f.browseForOpen('Import profile', [filter]);
    } catch (e) { showGameAlert('Import failed: ' + e); }
}

// -- Profile shape helper --
function _qrNewProfile() {
    return {
        id:                  Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name:                _qrT('unnamed'),
        adventureNameKey:    '',
        adventureDisplayName:'',
        adventureType:       '',
        minArmy:             {},   // { unitType: minAmount }
        steps:               [],
        battleScript:        []
    };
}

// -- Step shape helper --
function _qrNewStep() {
    return {
        generalUID:  '',
        generalName: '',
        army:        {},   // { unitType: amount } — adventure army (sent on run)
        stepMinArmy: {}    // { unitType: amount } — minimum starting army for this general
    };
}

// ---- Game helpers ----
function _qrGetOwnGenerals() {
    var SPEC_TYPE = swmmo.getDefinitionByName("Enums::SPECIALIST_TYPE");
    var myId      = game.gi.mCurrentPlayer.GetPlayerId();
    var result    = [];
    try {
        game.gi.mCurrentPlayerZone.GetSpecialists_vector().forEach(function (s) {
            if (!SPEC_TYPE.IsGeneral(s.GetType()))         { return; }
            if (s.getPlayerID() !== myId)                  { return; }
            result.push(s);
        });
    } catch (e) {}
    return result;
}

function _qrFindSpecByUID(uid) {
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

function _qrIsIdle(spec) {
    try {
        return spec.GetGarrison() != null && spec.GetTask() == null;
    } catch (e) { return false; }
}

// Returns adventures from inventory (not yet placed / active ones)
function _qrGetInventoryAdventures() {
    var counts  = {};
    var icons   = {};
    try {
        game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function (item) {
            if (item.GetType() !== 'Adventure') { return; }
            var name = item.GetResourceName_string();
            var qty  = (typeof item.GetAmount === 'function') ? (item.GetAmount() || 1) : 1;
            counts[name] = (counts[name] || 0) + qty;
            if (!icons[name]) {
                try { icons[name] = item.GetBuffIconData(); } catch (e) {}
            }
        });
    } catch (e) {}

    var advDefMap = null;
    try {
        advDefMap = swmmo.getDefinitionByName("AdventureSystem::cAdventureDefinition").map_AdventureName_AdventureDefinition;
    } catch (e) {}

    var result = [];
    Object.keys(counts).forEach(function (name) {
        var def  = advDefMap ? advDefMap.getItem(name) : null;
        var type = def ? def.GetType_string() : '';
        result.push({
            nameKey:     name,
            displayName: loca.GetText("ADN", name),
            type:        type,
            count:       counts[name],
            iconData:    icons[name] || null
        });
    });
    // Sort by type category then display name
    result.sort(function (a, b) {
        if (a.type !== b.type) { return a.type < b.type ? -1 : 1; }
        return a.displayName < b.displayName ? -1 : 1;
    });
    return result;
}

// Resolve an adventure name key to an active zone ID owned by the player
// Returns null if not currently placed on the map
function _qrResolveAdventureZone(nameKey) {
    var myId  = game.gi.mCurrentPlayer.GetPlayerId();
    var found = null;
    try {
        var AdvManager = swmmo.getDefinitionByName("com.bluebyte.tso.adventure.logic::AdventureManager").getInstance();
        AdvManager.getAdventures().forEach(function (item) {
            if (found) { return; }
            if (item.adventureName === nameKey && item.ownerPlayerID === myId) {
                found = item.zoneID;
            }
        });
    } catch (e) {}
    return found;
}

function _qrGetFreeUnitTypes() {
    var types = [];
    try {
        game.zone.GetArmy(game.gi.mCurrentPlayer.GetPlayerId())
            .GetSquadsCollection_vector()
            .forEach(function (sq) {
                var t = sq.GetType();
                // Exclude expedition-only unit types (marshals, not generals)
                if (t && t.toLowerCase().indexOf('expedition') < 0) {
                    types.push(t);
                }
            });
    } catch (e) {}
    return types;
}

// Returns total units owned across free pool + all generals
function _qrTotalOwned() {
    var owned = {};
    try {
        game.zone.GetArmy(game.gi.mCurrentPlayer.GetPlayerId())
            .GetSquadsCollection_vector()
            .forEach(function (sq) {
                var t = sq.GetType();
                if (t && t.toLowerCase().indexOf('expedition') < 0) {
                    owned[t] = (owned[t] || 0) + sq.GetAmount();
                }
            });
    } catch (e) {}
    try {
        _qrGetOwnGenerals().forEach(function (s) {
            s.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                var t = sq.GetType();
                if (t && t.toLowerCase().indexOf('expedition') < 0) {
                    owned[t] = (owned[t] || 0) + sq.GetAmount();
                }
            });
        });
    } catch (e) {}
    return owned;
}

// ---- Unit type sort order ----
var _qrUnitOrder = [
    'Recruit', 'Bowman', 'Militia', 'Cavalry', 'Longbowman',
    'Soldier', 'Crossbowman', 'EliteSoldier', 'Cannon'
];
function _qrSortTypes(types) {
    return types.slice().sort(function (a, b) {
        var ai = _qrUnitOrder.indexOf(a);
        var bi = _qrUnitOrder.indexOf(b);
        if (ai < 0) { ai = _qrUnitOrder.length; }
        if (bi < 0) { bi = _qrUnitOrder.length; }
        if (ai !== bi) { return ai - bi; }
        return a < b ? -1 : a > b ? 1 : 0;
    });
}

// ---- Menu ----
try {
    addToolsMenuItem(_qrT('title'), _qrOpenModal);
} catch (e) { }

// ---- Modal open ----
function _qrOpenModal() {
    _qrLoad();
    $("div[role='dialog']:not(#questRunnerModal):visible").modal('hide');

    _qrModal = new Modal('questRunnerModal', getImageTag('BuffKingdomOfCaliphs_Reward_Adventurer', '28px') + ' ' + _qrT('title'));
    _qrModal.size = 'modal-lg';
    _qrModal.create();

    // Footer buttons
    if (_qrModal.withFooter('.qrSaveBtn').length === 0) {
        _qrModal.Footer().prepend([
            $('<button>').attr({ 'class': 'btn btn-primary qrSaveBtn' }).text(_qrT('save')).click(_qrSaveAndPersist),
            $('<button>').attr({ 'class': 'btn btn-info', 'style': 'margin-left:4px;' }).text(_qrT('saveAs')).click(_qrSaveAs),
            $('<button>').attr({ 'class': 'btn btn-success pull-right qrRunBtn' }).text(_qrT('run')).click(_qrRun),
            $('<button>').attr({ 'class': 'btn btn-default', 'id': 'qrMinimizeBtn', 'title': 'Minimize window', 'style': 'margin-right:6px;' })
                .text('[−]')
                .click(function () {
                    if (_qrModal.Body().is(':visible')) { _qrMinimizeModal(); } else { _qrRestoreModal(); }
                }),
            $('<button>').attr({ 'class': 'btn btn-danger', 'id': 'qrBsStopBtnFtr', 'style': 'display:none;margin-right:4px;' })
                .text('\u25a0 Stop').click(function () { _qrBsStop(); }),
            $('<button>').attr({ 'class': 'btn btn-warning', 'id': 'qrBsContinueBtnFtr', 'style': 'display:none;margin-right:4px;' })
                .text('\u25b6 Continue').click(function () {
                    if (_qrBsState && _qrBsState.stopped) { _qrRunBattleScript(_qrBsState.stepIdx); }
                }),
            $('<button>').attr({ 'class': 'btn btn-default', 'id': 'qrBsRestartBtnFtr', 'style': 'display:none;margin-right:4px;' })
                .text('\u21ba Restart').click(function () { _qrBsState = null; _qrRunBattleScript(0); })
        ]);
        // Step progress panel — full-width row below buttons, shown only while minimized
        _qrModal.Footer().append(
            $('<div>').attr('id', 'qrBsStepProgress')
                .css({ 'display': 'none', 'width': '100%', 'margin-top': '5px',
                       'padding': '4px 8px', 'background': '#111',
                       'border': '1px solid #333', 'border-radius': '4px', 'clear': 'both' })
        );
    }

    _qrRenderAll();
    _qrModal.show();
}

// ---- Render everything inside the modal body ----
function _qrRenderAll() {
    var bodyId = '#questRunnerModalData';

    // Two-column layout: sidebar (3) + editor (9)
    var layout = $(
        '<div class="container-fluid">' +
            '<div class="row">' +
                '<div class="col-xs-3 col-sm-3 col-lg-3" id="qrSidebar" style="border-right:1px solid #555;padding-right:6px;"></div>' +
                '<div class="col-xs-9 col-sm-9 col-lg-9" id="qrEditor" style="padding-left:10px;"></div>' +
            '</div>' +
        '</div>'
    );

    $(bodyId).html('').append(layout);
    _qrRenderSidebar();
    _qrRenderEditor();
}

// ---- Sidebar ----
function _qrRenderSidebar() {
    var $sb = $('#qrSidebar').html('');

    $('<button>')
        .attr({ 'class': 'btn btn-primary btn-block qrNewBtn' })
        .css({ 'margin-bottom': '6px' })
        .text(_qrT('newProfile'))
        .click(function () {
            _qrSaveCurrentFromUI();
            var p = _qrNewProfile();
            _qrProfiles.push(p);
            _qrSelectedIdx = _qrProfiles.length - 1;
            _qrSave();
            _qrRenderAll();
        })
        .appendTo($sb);

    // Export / Import row
    $('<div>').css({ 'display': 'flex', 'gap': '4px', 'margin-bottom': '8px' }).append(
        $('<button>').attr({ 'class': 'btn btn-default btn-sm', 'title': 'Export all profiles to a JSON file' })
            .css({ 'flex': '1' })
            .text('\u2913 Export')
            .click(_qrExportProfiles),
        $('<button>').attr({ 'class': 'btn btn-default btn-sm', 'title': 'Import profiles from a JSON file (merges, skips duplicates)' })
            .css({ 'flex': '1' })
            .text('\u2912 Import')
            .click(_qrImportProfiles)
    ).appendTo($sb);

    if (_qrProfiles.length === 0) {
        $('<p>').css({ 'color': '#aaa', 'font-size': '12px' }).text(_qrT('noProfiles')).appendTo($sb);
        return;
    }

    var $list = $('<ul>').css({
        'list-style': 'none',
        'padding': '0',
        'margin': '0',
        'max-height': '380px',
        'overflow-y': 'auto'
    }).appendTo($sb);

    _qrProfiles.forEach(function (p, idx) {
        var active = idx === _qrSelectedIdx;
        $('<li>')
            .css({
                'padding':       '5px 8px',
                'margin-bottom': '3px',
                'border-radius': '4px',
                'cursor':        'pointer',
                'background':    active ? '#4a6fa5' : '#333',
                'color':         active ? '#fff' : '#ddd',
                'font-size':     '13px',
                'word-break':    'break-all'
            })
            .text(p.name || _qrT('unnamed'))
            .click((function (i) { return function () {
                _qrSaveCurrentFromUI();
                _qrSelectedIdx = i;
                _qrRenderAll();
            }; })(idx))
            .appendTo($list);
    });
}

// ---- Editor (right panel) ----
function _qrRenderEditor() {
    var $ed = $('#qrEditor').html('');

    if (_qrSelectedIdx < 0 || _qrSelectedIdx >= _qrProfiles.length) {
        $('<p>').css({ 'color': '#aaa', 'margin-top': '20px' }).text(_qrT('noProfiles')).appendTo($ed);
        return;
    }

    var profile = _qrProfiles[_qrSelectedIdx];

    // ---- Profile name row ----
    var $nameRow = $('<div>').attr({ 'class': 'row', 'style': 'margin-bottom:10px;' });
    $('<div>').attr({ 'class': 'col-xs-2 col-sm-2 col-lg-2' })
        .append($('<label>').css({ 'padding-top': '7px', 'font-weight': 'bold', 'color': '#ddd' }).text(_qrT('profileName') + ':'))
        .appendTo($nameRow);
    $('<div>').attr({ 'class': 'col-xs-7 col-sm-7 col-lg-7' })
        .append($('<input>').attr({ 'id': 'qrName', 'class': 'form-control', 'type': 'text' }).val(profile.name || ''))
        .appendTo($nameRow);
    $('<div>').attr({ 'class': 'col-xs-3 col-sm-3 col-lg-3' })
        .append(
            $('<button>').attr({ 'class': 'btn btn-danger btn-sm pull-right qrDelBtn' })
                .text(_qrT('deleteProfile'))
                .click(function () {
                    if (!confirm(_qrT('confirm_delete'))) { return; }
                    _qrProfiles.splice(_qrSelectedIdx, 1);
                    if (_qrSelectedIdx >= _qrProfiles.length) { _qrSelectedIdx = _qrProfiles.length - 1; }
                    _qrSave();
                    _qrRenderAll();
                })
        )
        .appendTo($nameRow);
    $ed.append($nameRow);

    // ---- Adventure row (profile-level, shared by all steps) ----
    var invAdvsForProfile = _qrGetInventoryAdventures();
    var $advRow = $('<div>').attr({ 'class': 'row', 'style': 'margin-bottom:10px;' });
    $('<div>').attr({ 'class': 'col-xs-2 col-sm-2 col-lg-2' })
        .append($('<label>').css({ 'padding-top': '7px', 'font-weight': 'bold', 'color': '#ddd' }).text(_qrT('colAdventure') + ':'))
        .appendTo($advRow);
    var $advSelP = $('<select>').attr({ 'id': 'qrAdvSel', 'class': 'form-control input-sm', 'style': 'font-size:12px;' });
    if (invAdvsForProfile.length === 0) {
        $('<option>').val('').text(_qrT('inventoryEmpty')).appendTo($advSelP);
    } else {
        $('<option>').val('').text('— ' + _qrT('colAdventure') + ' —').appendTo($advSelP);
        var typeGroupsP = {};
        invAdvsForProfile.forEach(function (a) {
            var g = a.type || 'other';
            typeGroupsP[g] = typeGroupsP[g] || [];
            typeGroupsP[g].push(a);
        });
        Object.keys(typeGroupsP).sort().forEach(function (typeName) {
            var $grp = $('<optgroup>').attr('label', typeName.charAt(0).toUpperCase() + typeName.slice(1));
            typeGroupsP[typeName].forEach(function (a) {
                $('<option>').val(a.nameKey).text(a.displayName + ' (x' + a.count + ')')
                    .attr('data-type', a.type)
                    .attr('data-display', a.displayName)
                    .prop('selected', profile.adventureNameKey === a.nameKey)
                    .appendTo($grp);
            });
            $grp.appendTo($advSelP);
        });
    }
    var $advInfoP = $('<div>').attr({ 'style': 'font-size:10px;margin-top:3px;' });
    function _updateAdvInfoP() {
        var key = $advSelP.val();
        if (!key) { $advInfoP.text(''); return; }
        var zoneId = _qrResolveAdventureZone(key);
        if (zoneId) {
            $advInfoP.css('color', '#8bc34a').text('\u2713 Active on map (zone ' + zoneId + ')');
        } else {
            $advInfoP.css('color', '#ff9800').text('\u26a0 Not placed — open from star menu before running');
        }
    }
    $advSelP.on('change', _updateAdvInfoP);
    _updateAdvInfoP();
    $('<div>').attr({ 'class': 'col-xs-7 col-sm-7 col-lg-7' })
        .append($advSelP)
        .append($advInfoP)
        .appendTo($advRow);
    $ed.append($advRow);

    // ---- Min Army section ----
    var minArmy = profile.minArmy || {};

    // Collect all relevant unit types: union of free pool + all generals' armies + saved min entries
    var minUnitTypes = [];
    function _addMinType(t) {
        if (t && t.toLowerCase().indexOf('expedition') < 0 && minUnitTypes.indexOf(t) < 0) {
            minUnitTypes.push(t);
        }
    }
    // Free pool
    try {
        game.zone.GetArmy(game.gi.mCurrentPlayer.GetPlayerId())
            .GetSquadsCollection_vector()
            .forEach(function (sq) { _addMinType(sq.GetType()); });
    } catch (e) {}
    // Every own general's assigned army
    try {
        _qrGetOwnGenerals().forEach(function (s) {
            s.GetArmy().GetSquadsCollection_vector().forEach(function (sq) { _addMinType(sq.GetType()); });
        });
    } catch (e) {}
    // Already saved min entries
    Object.keys(minArmy).forEach(function (t) { _addMinType(t); });
    // Apply consistent sort order
    minUnitTypes = _qrSortTypes(minUnitTypes);

    // Helper: compute sum of each unit type across all step army inputs
    function _qrStepTotals() {
        var totals = {};
        $('#qrSteps .qrStep').each(function (_, stepEl) {
            $(stepEl).find('.qrArmyInput').each(function () {
                var t = $(this).attr('data-type');
                var v = parseInt($(this).val(), 10) || 0;
                totals[t] = (totals[t] || 0) + v;
            });
        });
        return totals;
    }

    // Helper: refresh all live indicators
    function _qrRefreshDiff() {
        var totals = _qrStepTotals();
        var owned  = _qrTotalOwned();

        // Per-type min army rows
        $('#qrMinArmy .qrMinRow').each(function () {
            var $r    = $(this);
            var type  = $r.attr('data-type');
            // Min = sum of all per-step stepMinArmy inputs for this type
            var minV  = 0;
            $('#qrSteps .qrStep').each(function () {
                minV += parseInt($(this).find('.qrStepMinInput[data-type="' + type + '"]').val(), 10) || 0;
            });
            $r.find('.qrMinDisplay').text(minV);
            var total  = totals[type] || 0;
            var ownedV = owned[type] || 0;
            var diff   = total - minV;
            var left   = ownedV - total;
            var $diff  = $r.find('.qrMinDiff');
            if (minV === 0) {
                $diff.text(total).css('color', '#aaa');
            } else if (diff >= 0) {
                $diff.text('+' + diff).css('color', '#8bc34a');
            } else {
                $diff.text(diff).css('color', '#e53935');
            }
            $r.find('.qrMinTotal').text(total);
            $r.find('.qrMinOwned').text(ownedV);
            $r.find('.qrMinLeft').text(left).css('color', left >= 0 ? '#8bc34a' : '#e53935');
        });

        // Per-step unit total badges
        $('#qrSteps .qrStep').each(function () {
            var stepSum = 0;
            $(this).find('.qrArmyInput').each(function () {
                stepSum += parseInt($(this).val(), 10) || 0;
            });
            $(this).find('.qrStepTotal').text('Units: ' + stepSum);
        });

        // Colour army inputs: red background if type is over-allocated
        var inputsByType = {};
        $('#qrSteps .qrStep').each(function (_, stepEl) {
            $(stepEl).find('.qrArmyInput').each(function () {
                var t = $(this).attr('data-type');
                if (!inputsByType[t]) { inputsByType[t] = []; }
                inputsByType[t].push($(this));
            });
        });
        Object.keys(inputsByType).forEach(function (type) {
            var ownedV  = owned[type] || 0;
            var running = 0;
            inputsByType[type].forEach(function ($inp) {
                running += parseInt($inp.val(), 10) || 0;
                $inp.css('background', running > ownedV ? '#ffcccc' : '#fff');
            });
        });
    }

    var $minSection = $('<div>').attr({ 'id': 'qrMinArmy', 'style': 'margin-bottom:12px;' });
    $('<div>').css({ 'font-weight': 'bold', 'color': '#ddd', 'margin-bottom': '4px', 'font-size': '12px' })
        .text(_qrT('minArmy'))
        .appendTo($minSection);

    if (minUnitTypes.length > 0) {
        // Header row
        var $minTable = $('<div>').css({ 'display': 'table', 'width': '100%' });
        var $hdr = $('<div>').css({ 'display': 'table-row' });
        [['30px',''],['95px',''],['54px',_qrT('colMin')],['50px',_qrT('colTotal')],['50px',_qrT('colDiff')],['54px',_qrT('colOwned')],['50px',_qrT('colLeft')]].forEach(function (col) {
            $('<div>').css({ 'display': 'table-cell', 'font-size': '10px', 'color': '#aaa',
                             'padding': '0 4px 2px 0', 'width': col[0] }).text(col[1]).appendTo($hdr);
        });
        $minTable.append($hdr);

        minUnitTypes.forEach(function (type) {
            var minVal = (minArmy[type] != null) ? minArmy[type] : 0;
            var $mRow = $('<div>').css({ 'display': 'table-row' })
                .attr({ 'class': 'qrMinRow', 'data-type': type });
            // icon
            var $ico = $('<div>').css({ 'display': 'table-cell', 'width': '30px', 'vertical-align': 'middle', 'padding': '2px 4px 2px 0' });
            try { $ico.append($(getImageTag(type, '14px', '14px'))); } catch (e) {}
            // label
            var $lbl = $('<div>').css({ 'display': 'table-cell', 'width': '95px', 'vertical-align': 'middle',
                                       'color': '#ccc', 'font-size': '11px', 'padding-right': '4px' }).text(type);
            // min display (read-only — sum of per-step min armies, updated by _qrRefreshDiff)
            var $minCell = $('<div>').css({ 'display': 'table-cell', 'width': '54px', 'vertical-align': 'middle',
                                           'text-align': 'center', 'padding-right': '4px' })
                .append($('<span>').addClass('qrMinDisplay').css({ 'font-size': '11px', 'color': '#ccc' }).text(minVal));
            var cellStyle = { 'display': 'table-cell', 'width': '50px', 'vertical-align': 'middle',
                              'text-align': 'center', 'font-size': '11px' };
            // total
            var $totCell  = $('<div>').css(cellStyle)
                .append($('<span>').addClass('qrMinTotal').css('color','#ccc').text('0'));
            // diff vs min
            var $diffCell = $('<div>').css($.extend({}, cellStyle, { 'font-weight': 'bold' }))
                .append($('<span>').addClass('qrMinDiff'));
            // owned (static snapshot — call _qrTotalOwned once on render for display)
            var $ownedCell = $('<div>').css(cellStyle)
                .append($('<span>').addClass('qrMinOwned').css('color','#aaa').text('0'));
            // left = owned - total assigned
            var $leftCell  = $('<div>').css($.extend({}, cellStyle, { 'font-weight': 'bold' }))
                .append($('<span>').addClass('qrMinLeft'));
            $mRow.append($ico).append($lbl).append($minCell).append($totCell).append($diffCell).append($ownedCell).append($leftCell);
            $minTable.append($mRow);
        });
        $minSection.append($minTable);
    }

    // ---- Generals section (foldable) ----
    var $genSection = $('<div>').css({ 'margin-top': '12px', 'border': '1px solid #555', 'border-radius': '4px' });

    // Section header / toggle
    var $genHdr = $('<div>').css({
        'display': 'flex', 'align-items': 'center', 'cursor': 'pointer',
        'padding': '6px 10px', 'background': '#2a2a2a', 'border-radius': '4px',
        'user-select': 'none'
    });
    var $genArrow = $('<span>').css({ 'margin-right': '6px', 'font-size': '11px', 'color': '#aaa' })
                               .text(_qrGeneralsCollapsed ? '\u25b6' : '\u25bc');
    $('<span>').css({ 'font-weight': 'bold', 'color': '#ddd', 'font-size': '13px' })
               .text('\ud83d\udee1 Generals').appendTo($genHdr);
    $genHdr.prepend($genArrow);
    $genHdr.click(function () {
        _qrGeneralsCollapsed = !_qrGeneralsCollapsed;
        $genArrow.text(_qrGeneralsCollapsed ? '\u25b6' : '\u25bc');
        $genBody.toggle(!_qrGeneralsCollapsed);
    });
    $genSection.append($genHdr);

    var $genBody = $('<div>').css({ 'padding': '10px', 'display': _qrGeneralsCollapsed ? 'none' : 'block' });

    $genBody.append($minSection);

    // ---- Steps table header ----
    $genBody.append($(createTableRow([
        [5, _qrT('colGeneral')],
        [6, _qrT('colArmy')],
        [1, '']
    ], true)));

    // ---- Steps ----
    var $stepsDiv = $('<div>').attr({ 'id': 'qrSteps' });
    profile.steps.forEach(function (step, idx) {
        $stepsDiv.append(_qrMakeStepRow(step, idx));
    });
    $genBody.append($stepsDiv);

    // ---- Add Step button ----
    $('<button>')
        .attr({ 'class': 'btn btn-default btn-sm', 'style': 'margin-top:8px;' })
        .text(_qrT('addStep'))
        .click(function () {
            _qrSaveCurrentFromUI();
            profile.steps.push(_qrNewStep());
            _qrScrollToGenIdx = profile.steps.length - 1;
            _qrRenderEditor();
        })
        .appendTo($genBody);

    $genSection.append($genBody);
    $ed.append($genSection);

    // ---- Battle Script section ----
    _qrRenderBattleScript($ed, profile);

    // Live diff: refresh when any army input changes (delegated from editor root)
    $ed.on('input change', '.qrArmyInput', _qrRefreshDiff);
    // Also refresh when any per-step min input changes (updates the top Min column)
    $ed.on('input', '.qrStepMinInput', _qrRefreshDiff);
    // Allow step rows to trigger refresh via event (needed after _rebuildArmyDiv)
    $ed.on('qrRefreshNeeded', _qrRefreshDiff);
    // Initial diff calculation after everything is rendered
    setTimeout(_qrRefreshDiff, 0);

    // Auto-scroll to the targeted step after render
    setTimeout(function () {
        var $scrollParent = $('#questRunnerModalData').closest('.modal-body');
        if (!$scrollParent.length) { $scrollParent = $('#questRunnerModalData'); }
        if (_qrScrollToBsIdx >= 0) {
            var $target = $('#qrBsSteps .qrBsStep[data-idx="' + _qrScrollToBsIdx + '"]');
            if ($target.length && $scrollParent.length) {
                $scrollParent.animate({ scrollTop: $scrollParent.scrollTop() + $target.position().top - $scrollParent.height() / 3 }, 200);
            }
            _qrScrollToBsIdx = -1;
        }
        if (_qrScrollToGenIdx >= 0) {
            var $genTarget = $('#qrSteps .qrStep[data-idx="' + _qrScrollToGenIdx + '"]');
            if ($genTarget.length && $scrollParent.length) {
                $scrollParent.animate({ scrollTop: $scrollParent.scrollTop() + $genTarget.position().top - $scrollParent.height() / 3 }, 200);
            }
            _qrScrollToGenIdx = -1;
        }
    }, 50);
}

// ---- Build one step row ----
function _qrMakeStepRow(step, idx) {
    var generals = _qrGetOwnGenerals();

    // ----- Shared helpers (closures) -----

    // Build army object from a specialist's assigned army + free pool for missing types
    function _armyFromSpec(spec) {
        var obj = {};
        try {
            spec.GetArmy().GetSquadsCollection_vector()
                .sort(game.def("MilitarySystem::cSquad").SortByCombatPriority)
                .forEach(function (sq) {
                    var t = sq.GetType();
                    if (t && t.toLowerCase().indexOf('expedition') < 0) { obj[t] = sq.GetAmount(); }
                });
        } catch (e) {}
        // Append free-pool types not in general's army (at 0 so user can add them)
        try {
            game.zone.GetArmy(game.gi.mCurrentPlayer.GetPlayerId())
                .GetSquadsCollection_vector()
                .forEach(function (sq) {
                    var t = sq.GetType();
                    if (t && t.toLowerCase().indexOf('expedition') < 0 && !(t in obj)) { obj[t] = 0; }
                });
        } catch (e) {}
        // Ensure all canonical unit types are always shown (at 0 if not owned)
        _qrUnitOrder.forEach(function (t) { if (!(t in obj)) { obj[t] = 0; } });
        return obj;
    }

    // Rebuild the army div from a plain {type: amount} object
    // NOTE: no flex gap (unsupported in old AIR WebKit) — use margins instead
    function _rebuildArmyDiv(armyObj) {
        $armyDiv.html('');
        _qrSortTypes(Object.keys(armyObj)).forEach(function (type) {
            var $unitRow = $('<div>').css({ 'display': 'table', 'width': '100%', 'margin-bottom': '3px' });
            var $iconCell  = $('<div>').css({ 'display': 'table-cell', 'width': '18px', 'vertical-align': 'middle' });
            var $labelCell = $('<div>').css({ 'display': 'table-cell', 'width': '90px', 'vertical-align': 'middle',
                                             'color': '#ccc', 'font-size': '11px', 'padding-right': '4px' });
            var $inputCell = $('<div>').css({ 'display': 'table-cell', 'vertical-align': 'middle' });
            try { $iconCell.append($(getImageTag(type, '14px', '14px'))); } catch (e) {}
            $labelCell.text(type);
            $inputCell.append(
                $('<input>', {
                    type:        'number',
                    'class':     'qrArmyInput',
                    'data-type': type,
                    min:         0,
                    style:       'width:70px;padding:2px 4px;font-size:11px;color:#000;background:#fff;'
                }).val(armyObj[type])
            );
            $unitRow.append($iconCell).append($labelCell).append($inputCell);
            $armyDiv.append($unitRow);
        });
    }

    // ----- General select -----
    var $genSel = $('<select>').attr({ 'class': 'form-control qrGenSel input-sm', 'style': 'font-size:11px;' });
    $('<option>').val('').text('— ' + _qrT('colGeneral') + ' —').appendTo($genSel);
    generals.forEach(function (s) {
        var uid  = s.GetUniqueID().toKeyString();
        var idle = _qrIsIdle(s);
        var name = s.getName(false).replace(/<[^>]+>/g, '') + (idle ? '' : ' [busy]');
        $('<option>').val(uid).text(name)
            .prop('selected', step.generalUID === uid)
            .appendTo($genSel);
    });

    // ----- Army editor -----
    var $armyDiv = $('<div>').attr({ 'class': 'qrArmyDiv' });

    // Initial populate: saved army if non-empty, else from general's current army
    var initArmy = {};
    if (step.army && Object.keys(step.army).length > 0) {
        initArmy = step.army;
    } else if (step.generalUID) {
        var initSpec = _qrFindSpecByUID(step.generalUID);
        if (initSpec) { initArmy = _armyFromSpec(initSpec); }
    }
    // Fall back to free-pool types at 0 so there's always something to edit
    if (Object.keys(initArmy).length === 0) {
        try {
            game.zone.GetArmy(game.gi.mCurrentPlayer.GetPlayerId())
                .GetSquadsCollection_vector()
                .forEach(function (sq) {
                    var t = sq.GetType();
                    if (t && t.toLowerCase().indexOf('expedition') < 0) { initArmy[t] = 0; }
                });
        } catch (e) {}
    }
    // Always include all canonical unit types (at 0 if missing)
    _qrUnitOrder.forEach(function (t) { if (!(t in initArmy)) { initArmy[t] = 0; } });
    _rebuildArmyDiv(initArmy);

    // ----- Snap button (manual refresh from general's current army) -----
    var $snapBtn = $('<button>')
        .attr({ 'class': 'btn btn-default btn-xs', 'style': 'margin-right:4px;' })
        .text(_qrT('snapshot'))
        .attr('title', 'Refresh army inputs from the selected general')
        .click(function () {
            var uid = $genSel.val();
            if (!uid) { showGameAlert(_qrT('noGeneralSelected')); return; }
            var spec = _qrFindSpecByUID(uid);
            if (!spec) { showGameAlert(_qrT('noGeneralSelected')); return; }
            _rebuildArmyDiv(_armyFromSpec(spec));
            _triggerRefresh();
        });

    // ----- Assign button (send army inputs to server for this general) -----
    var $assignBtn = $('<button>')
        .attr({ 'class': 'btn btn-primary btn-xs' })
        .text(_qrT('assign'))
        .attr('title', 'Send the current army inputs to this general now')
        .click(function () {
            var uid = $genSel.val();
            if (!uid) { showGameAlert(_qrT('noGeneralSelected')); return; }
            var spec = _qrFindSpecByUID(uid);
            if (!spec) { showGameAlert(_qrT('noGeneralSelected')); return; }
            var army = {};
            $armyDiv.find('.qrArmyInput').each(function () {
                var t = $(this).attr('data-type');
                var v = parseInt($(this).val(), 10) || 0;
                if (t && v > 0) { army[t] = v; }
            });
            try {
                var dRaiseArmyVODef = swmmo.getDefinitionByName('Communication.VO::dRaiseArmyVO');
                var dResourceVODef  = swmmo.getDefinitionByName('Communication.VO::dResourceVO');
                var vo = new dRaiseArmyVODef();
                vo.armyHolderSpecialistVO = spec.CreateSpecialistVOFromSpecialist();
                Object.keys(army).forEach(function (type) {
                    var res = new dResourceVODef();
                    res.name_string = type;
                    res.amount = army[type];
                    vo.unitSquads.addItem(res);
                });
                game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, vo);
                // Snap after server processes the change
                setTimeout(function () {
                    _rebuildArmyDiv(_armyFromSpec(spec));
                    _triggerRefresh();
                }, 1500);
            } catch (e) {
                showGameAlert('Assign error: ' + e);
            }
        });

    // ----- Remove button -----
    var $removeBtn = $('<button>')
        .attr({ 'class': 'btn btn-danger btn-xs' })
        .html('&times;')
        .click((function (i) { return function () {
            _qrSaveCurrentFromUI();
            _qrProfiles[_qrSelectedIdx].steps.splice(i, 1);
            _qrScrollToGenIdx = Math.min(i, _qrProfiles[_qrSelectedIdx].steps.length - 1);
            _qrRenderEditor();
        }; })(idx));

    // Step-level unit total badge (updated by _qrRefreshDiff via event delegation)
    var $stepTotal = $('<div>').addClass('qrStepTotal')
        .css({ 'font-size': '10px', 'color': '#aaa', 'margin-top': '4px' })
        .text('Units: 0');

    // After any rebuild, trigger refresh so totals and colours update
    function _triggerRefresh() { $('#qrEditor').trigger('qrRefreshNeeded'); }

    // Auto-populate army when a new general is chosen, then refresh indicators
    $genSel.on('change', function () {
        var uid = $(this).val();
        if (!uid) { return; }
        var spec = _qrFindSpecByUID(uid);
        if (spec) { _rebuildArmyDiv(_armyFromSpec(spec)); _triggerRefresh(); }
    });

    // ----- Min army section (below general selector) -----
    var $minArmySection = $('<div>').css({ 'margin-top': '6px', 'border-top': '1px solid #555', 'padding-top': '4px' });
    $('<div>').css({ 'font-size': '10px', 'color': '#aaa', 'margin-bottom': '3px', 'font-weight': 'bold' })
        .text(_qrT('stepMinArmy')).appendTo($minArmySection);
    var stepMinArmyInit = step.stepMinArmy || {};
    _qrUnitOrder.forEach(function (type) {
        var $minRow  = $('<div>').css({ 'display': 'table', 'width': '100%', 'margin-bottom': '2px' });
        var $icCell  = $('<div>').css({ 'display': 'table-cell', 'width': '16px', 'vertical-align': 'middle' });
        var $lblCell = $('<div>').css({ 'display': 'table-cell', 'width': '80px', 'vertical-align': 'middle',
                                       'color': '#ccc', 'font-size': '10px', 'padding-left': '3px' }).text(type);
        var $inCell  = $('<div>').css({ 'display': 'table-cell', 'vertical-align': 'middle' });
        try { $icCell.append($(getImageTag(type, '12px', '12px'))); } catch (e) {}
        $inCell.append($('<input>', {
            type: 'number', 'class': 'qrStepMinInput', 'data-type': type, min: 0,
            style: 'width:50px;padding:1px 3px;font-size:10px;color:#000;background:#fff;'
        }).val(stepMinArmyInit[type] || 0));
        $minRow.append($icCell).append($lblCell).append($inCell);
        $minArmySection.append($minRow);
    });
    var $setMinBtn = $('<button>')
        .attr({ 'class': 'btn btn-warning btn-xs', 'style': 'margin-top:4px;display:block;width:100%;' })
        .text(_qrT('setMinArmy'))
        .click(function () {
            var uid = $genSel.val();
            if (!uid) { showGameAlert(_qrT('noGeneralSelected')); return; }
            var spec = _qrFindSpecByUID(uid);
            if (!spec) { showGameAlert(_qrT('noGeneralSelected')); return; }
            var minArmy = {};
            $minArmySection.find('.qrStepMinInput').each(function () {
                var t = $(this).attr('data-type');
                var v = parseInt($(this).val(), 10) || 0;
                if (t && v > 0) { minArmy[t] = v; }
            });
            // Check owned units cover the requested min army
            var owned = _qrTotalOwned();
            var short = [];
            Object.keys(minArmy).forEach(function (t) {
                if (minArmy[t] > (owned[t] || 0)) {
                    short.push(t + ' (' + minArmy[t] + ' needed, ' + (owned[t] || 0) + ' owned)');
                }
            });
            if (short.length > 0) {
                showGameAlert('Not enough:\n' + short.join('\n'));
                return;
            }
            try {
                var dRVODef = swmmo.getDefinitionByName('Communication.VO::dRaiseArmyVO');
                var dResVODef = swmmo.getDefinitionByName('Communication.VO::dResourceVO');
                var vo = new dRVODef();
                vo.armyHolderSpecialistVO = spec.CreateSpecialistVOFromSpecialist();
                Object.keys(minArmy).forEach(function (type) {
                    var res = new dResVODef();
                    res.name_string = type;
                    res.amount = minArmy[type];
                    vo.unitSquads.addItem(res);
                });
                game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, vo);
                // Override armyDiv inputs to match min army values
                $armyDiv.find('.qrArmyInput').each(function () {
                    var t = $(this).attr('data-type');
                    var minV = minArmy[t] || 0;
                    $(this).val(minV);
                });
                _triggerRefresh();
            } catch (e) { showGameAlert('Set Min Army error: ' + e); }
        });
    $minArmySection.append($setMinBtn);

    // Max capacity input (used by FILL_AND_RETURN)
    var $capRow = $('<div>').css({ 'margin-top': '6px', 'display': 'flex', 'align-items': 'center', 'gap': '6px' });
    $('<span>').css({ 'font-size': '10px', 'color': '#aaa', 'white-space': 'nowrap' })
        .text('Max capacity (FILL):').appendTo($capRow);
    $('<input>').attr({ 'type': 'number', 'class': 'form-control input-xs qrGenCapInput', 'min': '1', 'max': '2000' })
        .css({ 'width': '70px' })
        .val(step.generalCapacity || 200).appendTo($capRow);
    $minArmySection.append($capRow);

    // Enforce floor: when a min input changes, clamp the corresponding army input
    $minArmySection.on('input', '.qrStepMinInput', function () {
        var t    = $(this).attr('data-type');
        var minV = parseInt($(this).val(), 10) || 0;
        var $ai  = $armyDiv.find('.qrArmyInput[data-type="' + t + '"]');
        if ($ai.length && (parseInt($ai.val(), 10) || 0) < minV) { $ai.val(minV); }
        _triggerRefresh();
    });

    // Enforce floor: when an army input changes, clamp to its min value
    $armyDiv.on('input', '.qrArmyInput', function () {
        var t    = $(this).attr('data-type');
        var minV = parseInt($minArmySection.find('.qrStepMinInput[data-type="' + t + '"]').val(), 10) || 0;
        if ((parseInt($(this).val(), 10) || 0) < minV) { $(this).val(minV); }
    });

    // Build the 3-col step row
    var $stepRow = $('<div>').attr({
        'class':    'row qrStep',
        'data-idx': idx,
        'style':    'margin-bottom:6px;border-bottom:1px solid #444;padding-bottom:6px;'
    });
    $('<div>').attr({ 'class': 'col-xs-5 col-sm-5 col-lg-5' }).append($genSel).append($minArmySection).appendTo($stepRow);
    var $snapAssign = $('<div>').css('margin-bottom', '4px').append($snapBtn).append($assignBtn);
    $('<div>').attr({ 'class': 'col-xs-6 col-sm-6 col-lg-6' }).append($snapAssign).append($armyDiv).append($stepTotal).appendTo($stepRow);
    $('<div>').attr({ 'class': 'col-xs-1 col-sm-1 col-lg-1', 'style': 'padding-top:4px;' }).append($removeBtn).appendTo($stepRow);

    return $stepRow;
}

// ---- Read UI back into the selected profile ----
function _qrSaveCurrentFromUI() {
    if (_qrSelectedIdx < 0 || _qrSelectedIdx >= _qrProfiles.length) { return; }
    var profile = _qrProfiles[_qrSelectedIdx];
    profile.name = $('#qrName').val() || _qrT('unnamed');

    profile.adventureNameKey     = $('#qrAdvSel').val() || '';
    profile.adventureDisplayName  = $('#qrAdvSel option:selected').attr('data-display') || '';
    profile.adventureType         = $('#qrAdvSel option:selected').attr('data-type') || '';

    // minArmy is now derived from per-step stepMinArmy — recompute and save
    var newMinArmy = {};
    $('#qrSteps .qrStep').each(function () {
        $(this).find('.qrStepMinInput').each(function () {
            var t = $(this).attr('data-type');
            var v = parseInt($(this).val(), 10) || 0;
            if (t && v > 0) { newMinArmy[t] = (newMinArmy[t] || 0) + v; }
        });
    });
    profile.minArmy = newMinArmy;

    var newSteps = [];
    $('#qrSteps .qrStep').each(function (i, row) {
        var $row    = $(row);
        var genUID  = $row.find('.qrGenSel').val() || '';
        var genName = $row.find('.qrGenSel option:selected').text() || '';
        var army    = {};
        $row.find('.qrArmyInput').each(function () {
            var type   = $(this).attr('data-type');
            var amount = parseInt($(this).val(), 10) || 0;
            if (type && amount > 0) { army[type] = amount; }
        });
        var stepMinArmy = {};
        $row.find('.qrStepMinInput').each(function () {
            var type   = $(this).attr('data-type');
            var amount = parseInt($(this).val(), 10) || 0;
            if (type && amount > 0) { stepMinArmy[type] = amount; }
        });
        var generalCapacity = parseInt($row.find('.qrGenCapInput').val(), 10) || 0;
        newSteps.push({ generalUID: genUID, generalName: genName, army: army, stepMinArmy: stepMinArmy, generalCapacity: generalCapacity });
    });
    profile.steps = newSteps;

    // Read battle script steps back from DOM
    var newBs = [];
    $('#qrBsSteps .qrBsStep').each(function () {
        var $row     = $(this);
        var type     = $row.attr('data-type') || 'MOVE';
        var genUID   = $row.find('.qrBsGenSel').val()  || $row.attr('data-gen-uid') || '';
        var genName  = ($row.find('.qrBsGenSel option:selected').text() || '').replace(/^\u26a0\s*/, '').replace(/\s*\(away\)$/, '').trim() || $row.attr('data-gen-name') || '';
        var bldName  = $row.find('.qrBsBldSel').val()  || '';
        var bldDisp  = $row.find('.qrBsBldSel option:selected').attr('data-display') || bldName;
        var bldKey   = $row.attr('data-bld-key') || $row.find('.qrBsBldSel option:selected').attr('data-key') || '';
        var seconds  = parseInt($row.find('.qrBsDelayInput').val(), 10) || 5;
        var armyData = {};
        $row.find('.qrBsArmyInput').each(function () {
            var t = $(this).attr('data-type');
            var v = parseInt($(this).val(), 10) || 0;
            if (t && v > 0) { armyData[t] = v; }
        });
        if (Object.keys(armyData).length === 0) {
            try { armyData = JSON.parse($row.attr('data-army') || '{}'); } catch (e) {}
        }
        var claimWaitSecs = parseInt($row.find('.qrCqWait').val(), 10) || 5;
        var stepObj = { type: type, generalUID: genUID, generalName: genName, buildingName: bldName, buildingKey: bldKey, buildingDisplay: bldDisp, army: armyData, seconds: seconds, claimWaitSecs: claimWaitSecs };
        newBs.push(stepObj);
    });
    profile.battleScript = newBs;
}

// ---- Save & Persist button ----
function _qrSaveAndPersist() {
    _qrSaveCurrentFromUI();
    _qrSave();
    _qrRenderSidebar();   // refresh sidebar name
    showGameAlert(_qrT('profileSaved'));
}

// ---- Save As: duplicate current profile with a new name ----
function _qrSaveAs() {
    if (_qrSelectedIdx < 0 || _qrSelectedIdx >= _qrProfiles.length) {
        showGameAlert('No profile selected.'); return;
    }
    _qrSaveCurrentFromUI();
    var src = _qrProfiles[_qrSelectedIdx];
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    copy.name = src.name + ' (copy)';
    _qrProfiles.push(copy);
    _qrSelectedIdx = _qrProfiles.length - 1;
    _qrSave();
    _qrRenderAll();
    showGameAlert('Profile duplicated as "' + copy.name + '".');
}

// ---- Validation ----
function _qrValidate(profile) {
    var errors = [];
    if (!game.gi.isOnHomzone()) {
        errors.push(_qrT('notHomeZone'));
        return errors;
    }
    if (!profile.adventureNameKey) {
        errors.push(_qrT('noAdventure'));
        return errors;
    }
    // If not already placed, check inventory has one
    var resolvedZoneCheck = _qrResolveAdventureZone(profile.adventureNameKey);
    if (!resolvedZoneCheck) {
        var inInventory = false;
        try {
            game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function (item) {
                if (item.GetType() === 'Adventure' && item.GetResourceName_string() === profile.adventureNameKey) {
                    inInventory = true;
                }
            });
        } catch (e) {}
        if (!inInventory) {
            var advName = profile.adventureDisplayName || profile.adventureNameKey;
            errors.push('"' + advName + '" — ' + _qrT('adventureNotInInventory'));
            return errors;
        }
    }
    profile.steps.forEach(function (step, i) {
        var label = 'Step ' + (i + 1) + ': ';
        if (!step.generalUID) {
            errors.push(label + _qrT('noGeneralSelected'));
            return;
        }
        var spec = _qrFindSpecByUID(step.generalUID);
        if (!spec) {
            errors.push(label + _qrT('generalBusy') + ' (not found)');
            return;
        }
        if (!_qrIsIdle(spec)) {
            var name = step.generalName || step.generalUID;
            errors.push(label + name + ' — ' + _qrT('generalBusy'));
        }
    });
    // Check that owned units cover all per-step minimum armies combined
    var minNeeded = {};
    profile.steps.forEach(function (step) {
        if (!step.stepMinArmy) { return; }
        Object.keys(step.stepMinArmy).forEach(function (t) {
            minNeeded[t] = (minNeeded[t] || 0) + step.stepMinArmy[t];
        });
    });
    var ownedForVal = _qrTotalOwned();
    Object.keys(minNeeded).forEach(function (t) {
        if (minNeeded[t] > (ownedForVal[t] || 0)) {
            errors.push(_qrT('insufficientForMinArmy')
                .replace('{0}', t)
                .replace('{1}', minNeeded[t])
                .replace('{2}', ownedForVal[t] || 0));
        }
    });
    return errors;
}

// ---- Run profile ----
function _qrRun() {
    if (_qrRunning) { return; }
    _qrSaveCurrentFromUI();
    _qrSave();

    if (_qrSelectedIdx < 0 || _qrSelectedIdx >= _qrProfiles.length) { return; }
    var profile = _qrProfiles[_qrSelectedIdx];

    var errors = _qrValidate(profile);
    if (errors.length > 0) {
        showGameAlert(_qrT('validationFailed') + '\n' + errors.join('\n'));
        return;
    }

    var dRaiseArmyVODef = swmmo.getDefinitionByName("Communication.VO::dRaiseArmyVO");
    var dResourceVODef  = swmmo.getDefinitionByName("Communication.VO::dResourceVO");
    var qrServices      = swmmo.getDefinitionByName("com.bluebyte.tso.service::ServiceManager").getInstance();

    var profileZoneId = _qrResolveAdventureZone(profile.adventureNameKey);

    _qrRunning = true;
    _qrModal.withFooter('.qrRunBtn').prop('disabled', true).text(_qrT('running'));

    // Abort: restore button and optionally show an alert
    function abortRun(msg) {
        _qrRunning = false;
        _qrModal.withFooter('.qrRunBtn').prop('disabled', false).text(_qrT('run'));
        if (msg) { showGameAlert(msg); }
    }

    // Highlight a general step row red briefly
    function highlightStepRed(stepIdx) {
        var $row = $('#qrSteps .qrStep').eq(stepIdx);
        if (!$row.length) { return; }
        var origBg = $row.css('background-color');
        $row.css({ 'outline': '3px solid #e53935', 'background-color': '#5c1010' });
        setTimeout(function () { $row.css({ 'outline': '', 'background-color': origBg }); }, 2000);
    }

    // Check if a general's current army meets step.army
    function stepHasArmy(spec, step) {
        var target = step.army || {};
        var keys = Object.keys(target).filter(function (k) { return target[k] > 0; });
        if (keys.length === 0) { return true; }
        var cur = {};
        try {
            spec.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                var t = sq.GetType ? sq.GetType() : '';
                var a = sq.GetAmount ? sq.GetAmount() : 0;
                if (t) { cur[t] = (cur[t] || 0) + a; }
            });
        } catch (e) {}
        return keys.every(function (t) { return (cur[t] || 0) >= target[t]; });
    }

    // ── PHASE 4: navigate to island → wait 30s → start battle script ──
    function doNavigateAndStart() {
        if (profileZoneId) {
            try { game.gi.visitZone(profileZoneId); } catch (e) {
                game.chatMessage('Adventurer: could not navigate to zone: ' + e, 'adventurer');
            }
        }
        showGameAlert(_qrT('done'));
        var countdown = 30;
        game.chatMessage('Adventurer: battle script starts in ' + countdown + 's\u2026', 'adventurer');
        var ivCountdown = setInterval(function () {
            countdown -= 10;
            if (countdown > 0) {
                game.chatMessage('Adventurer: battle script starts in ' + countdown + 's\u2026', 'adventurer');
            } else {
                clearInterval(ivCountdown);
                game.chatMessage('Adventurer: starting battle script now.', 'adventurer');
                _qrRunBattleScript(0);
            }
        }, 10000);
    }

    // ── PHASE 3: send each general to the adventure zone ──
    function doDispatch() {
        game.chatMessage('Adventurer: all generals dispatched \u2014 navigating to adventure island\u2026', 'adventurer');
        var dispatchQ = new TimedQueue(1500);
        profile.steps.forEach(function (step, i) {
            dispatchQ.add(function () {
                var spec   = _qrFindSpecByUID(step.generalUID);
                var zoneId = profileZoneId;
                if (!spec) { game.chatMessage('Adventurer: general not found for dispatch (step ' + (i + 1) + ')', 'adventurer'); return; }
                if (!zoneId) { game.chatMessage('Adventurer: zone not resolved (step ' + (i + 1) + ')', 'adventurer'); return; }
                try {
                    qrServices.specialist.sendToZone(spec, zoneId);
                    var nm = ''; try { nm = spec.getName(false).replace(/<[^>]+>/g, ''); } catch (e) {}
                    game.chatMessage('Adventurer: \u2192 ' + nm + ' dispatched.', 'adventurer');
                } catch (e) {
                    game.chatMessage('Adventurer sendToZone error (step ' + (i + 1) + '): ' + e, 'adventurer');
                }
            });
        });
        dispatchQ.add(function () {
            _qrRunning = false;
            _qrModal.withFooter('.qrRunBtn').prop('disabled', false).text(_qrT('run'));
            doNavigateAndStart();
        }, 500);
        dispatchQ.run();
    }

    // ── PHASE 2: place adventure (if needed), then always poll until zone confirmed (60s) ──
    function doPlaceAndWaitZone() {
        if (!profileZoneId) {
            // Adventure not on map — place from inventory
            try {
                var buffItem = null;
                game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function (item) {
                    if (!buffItem && item.GetType() === 'Adventure' &&
                        item.GetResourceName_string() === profile.adventureNameKey) { buffItem = item; }
                });
                if (!buffItem) { abortRun(_qrT('adventureNotInInventory')); return; }
                var uniqueId = buffItem.GetUniqueId();
                game.gi.SendServerAction(61, 0, 0, 0, uniqueId);
                game.chatMessage('Adventurer: placing ' + (profile.adventureDisplayName || profile.adventureNameKey) + '\u2026', 'adventurer');
            } catch (e) { abortRun('Cannot place adventure: ' + e); return; }
        }
        // Poll until zone is registered (always, even if already placed — ensures fresh zoneId)
        game.chatMessage('Adventurer: waiting for adventure zone to become available\u2026', 'adventurer');
        var pollTicks = 0;
        var ivZone = setInterval(function () {
            pollTicks++;
            var found = _qrResolveAdventureZone(profile.adventureNameKey);
            if (found) {
                clearInterval(ivZone);
                profileZoneId = found;
                game.chatMessage('Adventurer: zone confirmed \u2713 \u2014 dispatching generals\u2026', 'adventurer');
                doDispatch();
            } else if (pollTicks > 30) { // 30 \u00d7 2s = 60s
                clearInterval(ivZone);
                abortRun('Adventure zone not confirmed after 60s \u2014 check the adventure was placed and try again.');
            } else {
                game.chatMessage('Adventurer: zone not ready yet (' + (pollTicks * 2) + 's)\u2026', 'adventurer');
            }
        }, 2000);
    }

    // ── PHASE 1: for each general with stepMinArmy configured, do: unload → load → poll confirm ──
    // stepMinArmy (left "in Army for General" column) is the army to load at dispatch.
    // Generals are processed ONE AT A TIME before any dispatch happens.
    var stepsWithArmy = profile.steps.filter(function (s) {
        return s.stepMinArmy && Object.keys(s.stepMinArmy).some(function (k) { return s.stepMinArmy[k] > 0; });
    });

    if (stepsWithArmy.length === 0) {
        game.chatMessage('Adventurer: no dispatch armies configured \u2014 skipping army load\u2026', 'adventurer');
        doPlaceAndWaitZone();
        return;
    }

    game.chatMessage('Adventurer: loading armies for ' + stepsWithArmy.length + ' general(s), one at a time\u2026', 'adventurer');

    // Process generals sequentially: armyStepIdx advances after each one is confirmed
    var armyStepIdx = 0;

    function doLoadNextGeneral() {
        if (armyStepIdx >= stepsWithArmy.length) {
            // All generals confirmed — move on
            game.chatMessage('Adventurer: all armies confirmed \u2713 \u2014 placing adventure\u2026', 'adventurer');
            doPlaceAndWaitZone();
            return;
        }

        var step = stepsWithArmy[armyStepIdx];
        var profileStepIdx = profile.steps.indexOf(step);
        var spec = _qrFindSpecByUID(step.generalUID);
        if (!spec) {
            abortRun('Adventurer: general not found for army load \u2014 ' + (step.generalName || step.generalUID));
            return;
        }
        var nm = ''; try { nm = spec.getName(false).replace(/<[^>]+>/g, ''); } catch (e) {}

        // Use stepMinArmy (left "in Army for General" column) as the dispatch army
        var targetArmy = step.stepMinArmy;
        var targetKeys = Object.keys(targetArmy).filter(function (k) { return targetArmy[k] > 0; });

        // Helper: read the general's current live army
        function getLiveArmy(s) {
            var cur = {};
            try {
                s.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                    var t = sq.GetType ? sq.GetType() : '';
                    var a = sq.GetAmount ? sq.GetAmount() : 0;
                    if (t) { cur[t] = (cur[t] || 0) + a; }
                });
            } catch (e) {}
            return cur;
        }

        // Helper: check if general's current army meets target
        function armyMet(s) {
            var cur = getLiveArmy(s);
            return targetKeys.every(function (t) { return (cur[t] || 0) >= targetArmy[t]; });
        }

        // Step 1: unload this general (so the pool is free and the load is clean)
        game.chatMessage('Adventurer [' + nm + ']: unloading before load\u2026', 'adventurer');
        var hasAnything = false;
        try { hasAnything = spec.HasUnits && spec.HasUnits(); } catch (e) {}

        function doFireLoad() {
            var spec2 = _qrFindSpecByUID(step.generalUID);
            if (!spec2) { abortRun('General ' + nm + ' not found after unload.'); return; }
            game.chatMessage('Adventurer [' + nm + ']: loading army\u2026', 'adventurer');
            try {
                var voLoad = new dRaiseArmyVODef();
                voLoad.armyHolderSpecialistVO = spec2.CreateSpecialistVOFromSpecialist();
                targetKeys.forEach(function (type) {
                    var res = new dResourceVODef();
                    res.name_string = type;
                    res.amount = targetArmy[type];
                    voLoad.unitSquads.addItem(res);
                });
                game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, voLoad, armyResponder);
            } catch (e) {
                abortRun('Army load error for ' + nm + ': ' + e);
                return;
            }

            // Step 3: poll every 2s until army confirmed (up to 30s), then advance to next general
            var pollTick = 0;
            var ivConfirm = setInterval(function () {
                pollTick++;
                var s3 = _qrFindSpecByUID(step.generalUID);
                if (!s3) { clearInterval(ivConfirm); abortRun('General ' + nm + ' not found during army confirm.'); return; }

                var cur = getLiveArmy(s3);
                var shortfall = targetKeys.filter(function (t) { return (cur[t] || 0) < targetArmy[t]; });

                if (shortfall.length === 0) {
                    clearInterval(ivConfirm);
                    var detail = targetKeys.map(function (t) { return cur[t] + ' ' + t; }).join(', ');
                    game.chatMessage('Adventurer [' + nm + ']: army confirmed \u2713 (' + detail + ')', 'adventurer');
                    armyStepIdx++;
                    doLoadNextGeneral();
                } else if (pollTick > 15) { // 15 \u00d7 2s = 30s
                    clearInterval(ivConfirm);
                    var missing = shortfall.map(function (t) { return 'needs ' + targetArmy[t] + ' ' + t + ', has ' + (cur[t] || 0); });
                    if (profileStepIdx >= 0) { highlightStepRed(profileStepIdx); }
                    abortRun(nm + ' army not confirmed after 30s:\n' + missing.join('\n'));
                } else {
                    var missing2 = shortfall.map(function (t) { return targetArmy[t] + ' ' + t; });
                    game.chatMessage('Adventurer [' + nm + ']: waiting for army (' + missing2.join(', ') + ')\u2026 (' + (pollTick * 2) + 's)', 'adventurer');
                }
            }, 2000);
        }

        if (!hasAnything) {
            // General is already empty — skip unload, fire load immediately
            game.chatMessage('Adventurer [' + nm + ']: already empty, loading directly\u2026', 'adventurer');
            doFireLoad();
        } else {
            // Step 2: send unload, then poll until confirmed empty (up to 30s) before loading
            try {
                var voUnload = new dRaiseArmyVODef();
                voUnload.armyHolderSpecialistVO = spec.CreateSpecialistVOFromSpecialist();
                // empty unitSquads = unload all
                game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, voUnload, armyResponder);
            } catch (e) {
                game.chatMessage('Adventurer [' + nm + ']: unload error: ' + e + ' — loading anyway', 'adventurer');
                doFireLoad();
                return;
            }
            var unloadTicks = 0;
            var ivUnload = setInterval(function () {
                unloadTicks++;
                var su = _qrFindSpecByUID(step.generalUID);
                var stillHas = false;
                try { stillHas = su && su.HasUnits && su.HasUnits(); } catch (e) {}
                if (!stillHas || unloadTicks > 15) { // 15 × 2s = 30s
                    clearInterval(ivUnload);
                    if (stillHas) {
                        game.chatMessage('Adventurer [' + nm + ']: unload timeout — loading anyway\u2026', 'adventurer');
                    } else {
                        game.chatMessage('Adventurer [' + nm + ']: unload confirmed \u2713', 'adventurer');
                    }
                    doFireLoad();
                }
            }, 2000);
        }
    }

    // Unload ALL generals referenced in the profile first, so the unit pool is fully free
    // before we start assigning specific armies to each general one by one.
    var allProfileSpecs = [];
    var _seenUnloadUIDs = {};
    profile.steps.forEach(function (s) {
        if (!s.generalUID || _seenUnloadUIDs[s.generalUID]) { return; }
        _seenUnloadUIDs[s.generalUID] = true;
        var sp = _qrFindSpecByUID(s.generalUID);
        if (sp) { allProfileSpecs.push(sp); }
    });

    if (allProfileSpecs.length > 0) {
        game.chatMessage('Adventurer: unloading all ' + allProfileSpecs.length + ' general(s) to free unit pool\u2026', 'adventurer');
        _qrUtils.unloadAll(allProfileSpecs, function () {
            game.chatMessage('Adventurer: all generals unloaded \u2713', 'adventurer');
            doLoadNextGeneral();
        });
    } else {
        doLoadNextGeneral();
    }
}

// ============================================================
// ---- Battle Script ----
// ============================================================

// Get all targetable buildings in the current zone
function _qrBsGetBuildings() {
    var result = [];
    try {
        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
            if (!b) { return; }
            try {
                if (b.IsReadyToIntercept && b.IsReadyToIntercept()) {
                    var name = b.GetBuildingName_string ? b.GetBuildingName_string() : '';
                    var grid = typeof b.GetGrid === 'function' ? b.GetGrid() : 0;
                    if (!name) { return; }
                    var displayName = name;
                    try { displayName = loca.GetText('BUI', name) || name; } catch (e) {}
                    // Collect defending units summary
                    var unitParts = [];
                    try {
                        var army = b.GetArmy ? b.GetArmy() : null;
                        if (army && army.HasUnits && army.HasUnits()) {
                            army.GetSquadsCollection_vector().forEach(function (sq) {
                                var t = sq.GetType ? sq.GetType() : '';
                                var a = sq.GetAmount ? sq.GetAmount() : 0;
                                if (t && a > 0) { unitParts.push(a + ' ' + t); }
                            });
                        }
                    } catch (e) {}
                    result.push({ name: name, displayName: displayName, grid: grid, units: unitParts });
                }
            } catch (e) {}
        });
    } catch (e) {}
    return result;
}

// Resolve a building name to its current grid in the active zone
function _qrBsGetBuildingGrid(buildingName, buildingKey) {
    // Raw grid:N — use directly (current-run snapshot)
    if (buildingName && buildingName.indexOf('grid:') === 0) {
        return parseInt(buildingName.substring(5), 10) || 0;
    }
    // name#index key — find the Nth building with that internal type name
    var keyToResolve = buildingKey || buildingName;
    if (keyToResolve && keyToResolve.indexOf('#') >= 0) {
        var parts   = keyToResolve.split('#');
        var bldName = parts[0];
        var bldIdx  = parseInt(parts[1], 10) || 0;
        var counter = 0, found = 0;
        try {
            game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                if (!b || found) { return; }
                try {
                    if ((b.GetBuildingName_string ? b.GetBuildingName_string() : '') === bldName) {
                        if (counter === bldIdx) { found = typeof b.GetGrid === 'function' ? b.GetGrid() : 0; }
                        counter++;
                    }
                } catch (e) {}
            });
        } catch (e) {}
        return found;
    }
    // Plain name — first match
    var found = 0;
    try {
        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
            if (!b || found) { return; }
            try {
                if ((b.GetBuildingName_string ? b.GetBuildingName_string() : '') === buildingName) {
                    found = typeof b.GetGrid === 'function' ? b.GetGrid() : 0;
                }
            } catch (e) {}
        });
    } catch (e) {}
    return found;
}

// Factory for a new battle script step
function _qrBsNewStep(type) {
    return { type: type || 'MOVE', generalUID: '', buildingName: '', buildingDisplay: '', army: {}, seconds: 5 };
}

// Snapshot current garrison positions of all generals and insert MOVE steps
function _qrBsSnapshot(profile) {
    if (!profile.battleScript) { profile.battleScript = []; }

    // Build a full grid→building map from ALL buildings, tracking index per name to disambiguate duplicates
    var gridToBld = {};
    var nameCount  = {}; // name → how many we've seen so far
    try {
        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
            if (!b) { return; }
            try {
                var grid = typeof b.GetGrid === 'function' ? b.GetGrid() : 0;
                if (!grid) { return; }
                var name = b.GetBuildingName_string ? b.GetBuildingName_string() : '';
                var displayName = name;
                try { displayName = loca.GetText('BUI', name) || name; } catch (e) {}
                var idx = nameCount[name] || 0;
                nameCount[name] = idx + 1;
                // Key format: "buildingName#index" — stable per adventure type, unique among duplicates
                var key = name ? (name + '#' + idx) : ('grid:' + grid);
                gridToBld[grid] = { key: key, name: name, displayName: displayName, grid: grid, idx: idx };
            } catch (e) {}
        });
    } catch (e) {}

    if (Object.keys(gridToBld).length === 0) {
        showGameAlert('No buildings visible in the current zone.\nNavigate to the adventure zone first and position the generals.');
        return;
    }

    // Collect UIDs we care about from the profile steps
    var wantedUIDs = {};
    (profile.steps || []).forEach(function (step) {
        if (step.generalUID) { wantedUIDs[step.generalUID] = step; }
    });

    // Search specialists in the CURRENT VIEWED zone (adventure zone), not home zone
    var specsInZone = [];
    try {
        game.zone.mStreetDataMap && game.zone.GetSpecialists &&
            game.zone.GetSpecialists().forEach(function (s) { specsInZone.push(s); });
    } catch (e) {}
    if (specsInZone.length === 0) {
        try {
            game.gi.mCurrentViewedZone && game.gi.mCurrentViewedZone.GetSpecialists_vector &&
                game.gi.mCurrentViewedZone.GetSpecialists_vector().forEach(function (s) { specsInZone.push(s); });
        } catch (e) {}
    }
    // Fallback: also check home zone (generals not yet dispatched)
    try {
        game.gi.mCurrentPlayerZone.GetSpecialists_vector().forEach(function (s) { specsInZone.push(s); });
    } catch (e) {}

    var added = 0;
    specsInZone.forEach(function (spec) {
        try {
            var uid = spec.GetUniqueID().toKeyString();
            if (!wantedUIDs[uid]) { return; }
            var grid = 0;
            try { grid = spec.GetGarrisonGridIdx(); } catch (e) {}
            if (!grid || grid <= 0) { return; }
            var bld = gridToBld[grid];
            if (!bld) {
                // No named building found — store raw grid as fallback
                bld = { name: 'grid:' + grid, displayName: 'Grid ' + grid, grid: grid };
            }
            var step = wantedUIDs[uid];
            var bld = gridToBld[grid];
            if (!bld) {
                bld = { key: 'grid:' + grid, displayName: 'Grid ' + grid };
            }
            // Always use grid:N as current-run key; also store the name#index key for future runs
            profile.battleScript.push({
                type: 'MOVE', generalUID: uid,
                buildingName: 'grid:' + grid,
                buildingKey: bld.key,         // stable key for next run
                buildingDisplay: bld.displayName || bld.name || ('Grid ' + grid),
                army: {}, seconds: 5
            });
            added++;
        } catch (e) {}
    });

    if (added === 0) {
        showGameAlert('No profile generals found garrisoned in the adventure zone.\n\nMake sure you are viewing the adventure zone and the generals are positioned at buildings.');
    } else {
        showGameAlert('Snapshot recorded ' + added + ' MOVE step(s).');
    }
}

// Render the Battle Script section into $ed
function _qrRenderBattleScript($ed, profile) {
    if (!profile.battleScript) { profile.battleScript = []; }

    var $outer = $('<div>').attr('id', 'qrBsWrap').css({ 'margin-top': '12px' });

    // ---- Foldable section header ----
    var $secHdr = $('<div>').css({
        'display': 'flex', 'align-items': 'center', 'cursor': 'pointer',
        'padding': '6px 10px', 'background': '#2a2a2a',
        'border': '1px solid #555', 'border-radius': '4px',
        'user-select': 'none'
    });
    var $secArrow = $('<span>').css({ 'margin-right': '6px', 'font-size': '11px', 'color': '#aaa' })
                               .text(_qrBattleFlowCollapsed ? '\u25b6' : '\u25bc');
    $('<span>').css({ 'font-weight': 'bold', 'color': '#ddd', 'font-size': '13px' })
               .text('\u2694 Battle Flow').appendTo($secHdr);
    $secHdr.prepend($secArrow);
    $secHdr.click(function () {
        _qrBattleFlowCollapsed = !_qrBattleFlowCollapsed;
        $secArrow.text(_qrBattleFlowCollapsed ? '\u25b6' : '\u25bc');
        $wrap.toggle(!_qrBattleFlowCollapsed);
    });
    $outer.append($secHdr);

    var $wrap = $('<div>').css({
        'padding': '10px', 'border': '1px solid #555', 'border-top': 'none',
        'border-radius': '0 0 4px 4px',
        'display': _qrBattleFlowCollapsed ? 'none' : 'block'
    });

    // Header controls row
    var $hdr = $('<div>').css({ 'display': 'flex', 'align-items': 'center',
                                'margin-bottom': '8px', 'gap': '6px', 'flex-wrap': 'wrap' });
    $('<span>').css({ 'flex': '1' }).appendTo($hdr);
    $('<button>').attr({ 'class': 'btn btn-xs btn-default',
                         'title': 'Read current garrison positions of all profile generals and add MOVE steps' })
        .text('Snapshot Positions')
        .click(function () {
            _qrSaveCurrentFromUI();
            var prevLen = profile.battleScript.length;
            _qrBsSnapshot(profile);
            _qrScrollToBsIdx = prevLen;
            _qrRenderEditor();
        }).appendTo($hdr);
    $('<button>').attr({ 'class': 'btn btn-xs btn-success', 'id': 'qrBsRunBtn' })
        .text('\u25b6 Run Battle Script')
        .click(function () { _qrRunBattleScript(0); }).appendTo($hdr);
    $('<button>').attr({ 'class': 'btn btn-xs btn-danger', 'id': 'qrBsStopBtn', 'style': 'display:none' })
        .text('\u25a0 Stop')
        .click(_qrBsStop).appendTo($hdr);
    $('<button>').attr({ 'class': 'btn btn-xs btn-warning', 'id': 'qrBsContinueBtn', 'style': 'display:none' })
        .text('\u25b6 Continue')
        .click(function () {
            if (_qrBsState && _qrBsState.stopped) {
                _qrRunBattleScript(_qrBsState.stepIdx);
            }
        }).appendTo($hdr);
    $('<button>').attr({ 'class': 'btn btn-xs btn-default', 'id': 'qrBsRestartBtn', 'style': 'display:none' })
        .text('\u21ba Restart')
        .click(function () { _qrBsState = null; _qrRunBattleScript(0); }).appendTo($hdr);
    _qrBsUpdateControls();
    $wrap.append($hdr);

    if (profile.battleScript.length === 0) {
        $('<p>').css({ 'color': '#888', 'font-size': '12px', 'margin': '0 0 8px' })
            .text('No steps yet. Add steps below, or use \u201cSnapshot Positions\u201d to auto-record current general garrison positions.')
            .appendTo($wrap);
    }

    var $stepsDiv = $('<div>').attr('id', 'qrBsSteps');
    profile.battleScript.forEach(function (bsStep, idx) {
        $stepsDiv.append(_qrMakeBsStepRow(bsStep, idx, profile));
    });
    $wrap.append($stepsDiv);

    // Single "New Step" button
    var $addRow = $('<div>').css('margin-top', '8px');
    $('<button>').attr('class', 'btn btn-sm btn-primary')
        .text('+ New Step')
        .click(function () {
            _qrSaveCurrentFromUI();
            profile.battleScript.push(_qrBsNewStep('MOVE'));
            _qrScrollToBsIdx = profile.battleScript.length - 1;
            _qrRenderEditor();
        }).appendTo($addRow);
    $wrap.append($addRow);
    $outer.append($wrap);
    $ed.append($outer);
}

// Build one battle script step row
function _qrMakeBsStepRow(bsStep, idx, profile) {
    var TYPE_BG = {
        MOVE:             '#2b4a6b',
        WAIT_ZONE:        '#1a5c3a',
        WAIT_AT_GARRISON: '#2a4a2a',
        WAIT_ATTACKING:   '#4a2a5c',
        WAIT_GARRISON:    '#1a5c5c',
        ATTACK:           '#6b1a1a',
        WAIT_IDLE:        '#6b4800',
        UNLOAD:           '#5c3a00',
        LOAD_ARMY:        '#1a5c2a',
        DELAY:            '#3a3a3a',
        COLLECTIBLES:     '#4a3a00',
        FILL_AND_RETURN:  '#1a3a6b',
        CLAIM_QUESTS:     '#1a5c1a'
    };
    var needsGeneral  = ['MOVE', 'WAIT_ZONE', 'WAIT_AT_GARRISON', 'WAIT_ATTACKING', 'WAIT_GARRISON', 'ATTACK', 'WAIT_IDLE', 'UNLOAD', 'LOAD_ARMY'].indexOf(bsStep.type) >= 0;
    var isFillReturn  = bsStep.type === 'FILL_AND_RETURN';
    var needsArmy     = bsStep.type === 'LOAD_ARMY';
    var needsBuilding = ['MOVE', 'WAIT_GARRISON', 'ATTACK'].indexOf(bsStep.type) >= 0;
    var isDelay       = bsStep.type === 'DELAY';

    var $row = $('<div>').attr({ 'class': 'qrBsStep', 'data-idx': idx, 'data-type': bsStep.type,
                                   'data-army': JSON.stringify(bsStep.army || {}),
                                   'data-bld-key': bsStep.buildingKey || '',
                                   'data-gen-uid': bsStep.generalUID || '',
                                   'data-gen-name': bsStep.generalName || '' })
        .css({ 'display': 'flex', 'align-items': 'center', 'flex-wrap': 'wrap',
               'background': TYPE_BG[bsStep.type] || '#333',
               'border-radius': '4px', 'margin-bottom': '4px',
               'padding': '4px 6px', 'gap': '5px' });

    // Step number badge
    $('<span>').css({ 'font-weight': 'bold', 'font-size': '11px', 'color': '#ccc',
                      'flex-shrink': '0', 'min-width': '20px' })
               .text((idx + 1) + '.').appendTo($row);

    // Type selector dropdown (replaces static label)
    var $typeSel = $('<select>').attr('class', 'form-control input-xs qrBsTypeSel')
        .css({ 'font-weight': 'bold', 'font-size': '11px', 'flex-shrink': '0', 'width': '175px' });
    var ALL_TYPES = [
        ['MOVE',             'MOVE \u2192 garrison'],
        ['ATTACK',           'ATTACK \u00d7 building'],
        ['WAIT_ZONE',        'WAIT \u2014 arrives on island'],
        ['WAIT_AT_GARRISON', 'WAIT \u2014 ready at garrison'],
        ['WAIT_ATTACKING',   'WAIT \u2014 leaves garrison'],
        ['WAIT_GARRISON',    'WAIT \u2014 reaches position'],
        ['WAIT_IDLE',        'WAIT \u2014 finishes task'],
        ['UNLOAD',           'UNLOAD army'],
        ['LOAD_ARMY',        'LOAD ARMY'],
        ['DELAY',            'DELAY'],
        ['COLLECTIBLES',     'COLLECT COLLECTIBLES'],
        ['FILL_AND_RETURN',  'FILL GENERALS \u2192 STAR'],
        ['CLAIM_QUESTS',     'COMPLETE QUEST'],
        ['RETURN_HOME',      'RETURN TO ISLAND']
    ];
    ALL_TYPES.forEach(function (pair) {
        $('<option>').val(pair[0]).text(pair[1]).prop('selected', bsStep.type === pair[0]).appendTo($typeSel);
    });
    $typeSel.on('change', function () {
        var newType = $(this).val();
        $row.attr('data-type', newType);        // keep data-type in sync for any mid-change save
        _qrSaveCurrentFromUI();
        profile.battleScript[idx].type = newType;
        _qrScrollToBsIdx = idx;
        _qrRenderEditor();
    });
    $row.append($typeSel);

    // General selector — only show generals assigned to this profile's steps
    if (needsGeneral) {
        // Collect UIDs assigned in the Generals section (profile.steps)
        var profileGenUIDs = {};
        (profile.steps || []).forEach(function (s) { if (s.generalUID) { profileGenUIDs[s.generalUID] = true; } });

        var $genSel = $('<select>').attr('class', 'form-control input-xs qrBsGenSel')
            .css({ 'width': '135px', 'flex-shrink': '0', 'font-size': '11px' });
        $('<option>').val('').text('-- General --').appendTo($genSel);
        _qrGetOwnGenerals().forEach(function (spec) {
            var uid  = spec.GetUniqueID().toKeyString();
            if (!profileGenUIDs[uid]) { return; } // only profile generals
            var name = uid;
            try { name = spec.getName(false).replace(/<[^>]+>/g, ''); } catch (e) {}
            $('<option>').val(uid).text(name).prop('selected', bsStep.generalUID === uid).appendTo($genSel);
        });
        // If the saved UID is not in the list (general is away), add an "away" placeholder so the UID round-trips
        if (bsStep.generalUID) {
            var uidFound = false;
            $genSel.find('option').each(function () { if ($(this).val() === bsStep.generalUID) { uidFound = true; } });
            if (!uidFound) {
                var awayLabel = bsStep.generalName || bsStep.generalUID;
                $('<option>').val(bsStep.generalUID)
                    .text('\u26a0 ' + awayLabel + ' (away)')
                    .css('color', '#f0a030')
                    .prop('selected', true)
                    .appendTo($genSel);
            }
        }
        // Keep data attrs in sync and cascade the change to every other step that referenced the old general
        $genSel.on('change', function () {
            var oldUID  = $row.attr('data-gen-uid') || '';
            var newUID  = $(this).val() || '';
            var newText = $(this).find('option:selected').text().replace(/^\u26a0\s*/, '').replace(/\s*\(away\)$/, '').trim();
            $row.attr('data-gen-uid', newUID);
            if (newUID) { $row.attr('data-gen-name', newText); }
            // Propagate to sibling steps that had the same old general
            if (oldUID && newUID && oldUID !== newUID) {
                $('#qrBsSteps .qrBsStep').not($row).each(function () {
                    var $sibling = $(this);
                    if ($sibling.attr('data-gen-uid') !== oldUID) { return; }
                    var $sibSel = $sibling.find('.qrBsGenSel');
                    if (!$sibSel.length) { return; }
                    // Check if newUID already exists as an option
                    var $existing = $sibSel.find('option[value="' + newUID + '"]');
                    if ($existing.length) {
                        $sibSel.find('option').prop('selected', false);
                        $existing.prop('selected', true);
                    } else {
                        // Remove old away-placeholder if present, add new one selected
                        $sibSel.find('option[value="' + oldUID + '"]').remove();
                        $('<option>').val(newUID).text(newText).prop('selected', true).appendTo($sibSel);
                    }
                    $sibling.attr('data-gen-uid', newUID);
                    $sibling.attr('data-gen-name', newText);
                });
            }
        });
        $row.append($genSel);
    }

    // Building selector
    if (needsBuilding) {
        // For ATTACK steps: show ALL buildings (including defeated) so we never lose the reference
        var isAttackStep = bsStep.type === 'ATTACK';
        var buildings = _qrBsGetBuildings(); // alive intercept buildings
        var allBuildings = [];
        if (isAttackStep) {
            // Build a full list with an 'alive' flag; key = grid:N (stable across runs)
            var _bldNameCount = {};
            try {
                game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                    if (!b) { return; }
                    try {
                        var bName = b.GetBuildingName_string ? b.GetBuildingName_string() : '';
                        if (!bName) { return; }
                        // Only include combat buildings (enemy camps) — skip Trees, Farms, Garrisons etc.
                        // IsReadyToIntercept is undefined/null on non-combat buildings,
                        // but may be a function (true/false) OR boolean false on defeated camps
                        if (b.IsReadyToIntercept == null) { return; }
                        var bGrid = typeof b.GetGrid === 'function' ? b.GetGrid() : 0;
                        if (!bGrid) { return; }
                        var bDisp = bName;
                        try { bDisp = loca.GetText('BUI', bName) || bName; } catch (e) {}
                        // Use grid:N as key — grid positions are stable for the same adventure type
                        // and are unambiguous even when multiple camps share the same internal name
                        var bKey  = 'grid:' + bGrid;
                        var alive = b.IsReadyToIntercept && b.IsReadyToIntercept();
                        var units = [];
                        try {
                            var army = b.GetArmy ? b.GetArmy() : null;
                            if (army && army.HasUnits && army.HasUnits()) {
                                army.GetSquadsCollection_vector().forEach(function (sq) {
                                    var t = sq.GetType ? sq.GetType() : '';
                                    var a = sq.GetAmount ? sq.GetAmount() : 0;
                                    if (t && a > 0) { units.push(a + ' ' + t); }
                                });
                            }
                        } catch (e) {}
                        allBuildings.push({ name: bName, key: bKey, displayName: bDisp, grid: bGrid, alive: alive, units: units });
                    } catch (e) {}
                });
            } catch (e) {}
        }

        var $bldSel = $('<select>').attr('class', 'form-control input-xs qrBsBldSel')
            .css({ 'flex': '1', 'min-width': '120px', 'font-size': '11px' });

        if (isAttackStep && allBuildings.length > 0) {
            $('<option>').val('').text('-- Target Building --').appendTo($bldSel);
            // savedKey may be 'grid:N' (new format) or 'name#idx' (old format) or plain name
            var savedKey = bsStep.buildingKey || bsStep.buildingName || '';
            // Check if savedKey matches any live building by grid key or by legacy name/index
            var savedMatchedGrid = allBuildings.some(function (b) {
                if (b.key === savedKey) { return true; }
                // Legacy: if savedKey is 'name#idx', resolve its grid and compare
                if (savedKey.indexOf('#') >= 0 && savedKey.indexOf('grid:') < 0) {
                    var parts = savedKey.split('#');
                    var legacyName = parts[0];
                    var legacyIdx  = parseInt(parts[1], 10) || 0;
                    var legacyCount = 0, legacyGrid = 0;
                    try {
                        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (lb) {
                            if (!lb || legacyGrid) { return; }
                            if ((lb.GetBuildingName_string ? lb.GetBuildingName_string() : '') === legacyName) {
                                if (legacyCount === legacyIdx) { legacyGrid = lb.GetGrid ? lb.GetGrid() : 0; }
                                legacyCount++;
                            }
                        });
                    } catch (e) {}
                    return legacyGrid && b.grid === legacyGrid;
                }
                return false;
            });
            if (savedKey && !savedMatchedGrid) {
                $('<option>').val(savedKey)
                    .text((bsStep.buildingDisplay || savedKey) + ' [saved]')
                    .attr({ 'data-display': bsStep.buildingDisplay || savedKey,
                            'data-key': savedKey })
                    .prop('selected', true).appendTo($bldSel);
            }
            allBuildings.forEach(function (b) {
                var unitStr   = b.units && b.units.length ? ' (' + b.units.join(', ') + ')' : '';
                var defeated  = b.alive ? '' : ' [defeated]';
                var isSelected = false;
                if (b.key === savedKey) {
                    isSelected = true;
                } else if (!isSelected && savedKey.indexOf('#') >= 0 && savedKey.indexOf('grid:') < 0) {
                    // Legacy name#idx — migrate: select the building whose grid matches resolved legacy grid
                    var parts = savedKey.split('#');
                    var legacyName = parts[0];
                    var legacyIdx  = parseInt(parts[1], 10) || 0;
                    var legacyCount = 0, legacyGrid = 0;
                    try {
                        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (lb) {
                            if (!lb || legacyGrid) { return; }
                            if ((lb.GetBuildingName_string ? lb.GetBuildingName_string() : '') === legacyName) {
                                if (legacyCount === legacyIdx) { legacyGrid = lb.GetGrid ? lb.GetGrid() : 0; }
                                legacyCount++;
                            }
                        });
                    } catch (e) {}
                    isSelected = !!(legacyGrid && b.grid === legacyGrid);
                }
                $('<option>').val(b.key)
                    .text(b.displayName + unitStr + defeated)
                    .attr({ 'data-display': b.displayName, 'data-key': b.key })
                    .prop('selected', isSelected)
                    .appendTo($bldSel);
            });
        } else if (buildings.length === 0) {
            $('<option>').val('').text('-- navigate to adventure zone to see buildings --').appendTo($bldSel);
            if (bsStep.buildingName) {
                $('<option>').val(bsStep.buildingName)
                    .text((bsStep.buildingDisplay || bsStep.buildingName) + ' [saved]')
                    .attr({ 'data-display': bsStep.buildingDisplay || bsStep.buildingName,
                            'data-key': bsStep.buildingKey || '' })
                    .prop('selected', true).appendTo($bldSel);
            }
        } else {
            $('<option>').val('').text('-- Target Building --').appendTo($bldSel);
            var savedInList = buildings.some(function (b) { return b.name === bsStep.buildingName; });
            if (bsStep.buildingName && !savedInList) {
                $('<option>').val(bsStep.buildingName)
                    .text((bsStep.buildingDisplay || bsStep.buildingName) + ' [saved]')
                    .attr({ 'data-display': bsStep.buildingDisplay || bsStep.buildingName,
                            'data-key': bsStep.buildingKey || '' })
                    .prop('selected', true).appendTo($bldSel);
            }
            buildings.forEach(function (b) {
                var unitStr = b.units && b.units.length > 0 ? ' (' + b.units.join(', ') + ')' : '';
                $('<option>').val(b.name)
                    .text(b.displayName + unitStr)
                    .attr({ 'data-display': b.displayName, 'data-key': b.key || '' })
                    .prop('selected', bsStep.buildingName === b.name)
                    .appendTo($bldSel);
            });
        }

        // When user picks a building, store its key in data-bld-key so save captures it
        $bldSel.on('change', function () {
            var selKey = $bldSel.find('option:selected').attr('data-key') || '';
            $row.attr('data-bld-key', selKey);
        });

        $row.append($bldSel);
    }

    // Minimum army check editor (ATTACK steps)
    if (bsStep.type === 'ATTACK') {
        var minArmyObj = bsStep.army || {};
        var $minSub = $('<div>').css({ 'flex-basis': '100%', 'width': '100%',
                                       'border-top': '1px solid #555', 'padding-top': '4px', 'margin-top': '2px' });
        $('<div>').css({ 'font-size': '10px', 'color': '#f0a030', 'margin-bottom': '3px', 'font-weight': 'bold' })
            .text('Minimum army (halt if below):').appendTo($minSub);
        _qrUnitOrder.forEach(function (type) {
            var $uRow    = $('<div>').css({ 'display': 'table', 'width': '100%', 'margin-bottom': '2px' });
            var $icCell  = $('<div>').css({ 'display': 'table-cell', 'width': '16px', 'vertical-align': 'middle' });
            var $lblCell = $('<div>').css({ 'display': 'table-cell', 'width': '90px', 'vertical-align': 'middle',
                                           'color': '#ccc', 'font-size': '10px', 'padding-left': '3px' }).text(type);
            var $inCell  = $('<div>').css({ 'display': 'table-cell', 'vertical-align': 'middle' });
            try { $icCell.append($(getImageTag(type, '12px', '12px'))); } catch (e) {}
            $inCell.append($('<input>', {
                type: 'number', 'class': 'qrBsArmyInput', 'data-type': type, min: 0,
                style: 'width:60px;padding:1px 3px;font-size:10px;color:#000;background:#fff;'
            }).val(minArmyObj[type] || 0));
            $uRow.append($icCell).append($lblCell).append($inCell);
            $minSub.append($uRow);
        });
        $row.append($minSub);
    }

    // Army editor (LOAD_ARMY only) — full-width sub-section inside flex-wrap row
    if (needsArmy) {
        var armyObj = bsStep.army || {};
        var $armySub = $('<div>').css({ 'flex-basis': '100%', 'width': '100%',
                                        'border-top': '1px solid #555', 'padding-top': '4px', 'margin-top': '2px' });
        $('<div>').css({ 'font-size': '10px', 'color': '#aaa', 'margin-bottom': '3px', 'font-weight': 'bold' })
            .text('Army to load:').appendTo($armySub);
        _qrUnitOrder.forEach(function (type) {
            var $uRow  = $('<div>').css({ 'display': 'table', 'width': '100%', 'margin-bottom': '2px' });
            var $icCell  = $('<div>').css({ 'display': 'table-cell', 'width': '16px', 'vertical-align': 'middle' });
            var $lblCell = $('<div>').css({ 'display': 'table-cell', 'width': '90px', 'vertical-align': 'middle',
                                           'color': '#ccc', 'font-size': '10px', 'padding-left': '3px' }).text(type);
            var $inCell  = $('<div>').css({ 'display': 'table-cell', 'vertical-align': 'middle' });
            try { $icCell.append($(getImageTag(type, '12px', '12px'))); } catch (e) {}
            $inCell.append($('<input>', {
                type: 'number', 'class': 'qrBsArmyInput', 'data-type': type, min: 0,
                style: 'width:60px;padding:1px 3px;font-size:10px;color:#000;background:#fff;'
            }).val(armyObj[type] || 0));
            $uRow.append($icCell).append($lblCell).append($inCell);
            $armySub.append($uRow);
        });
        $('<button>').attr('class', 'btn btn-xs btn-success').css('margin-top', '4px')
            .text('Assign Units')
            .click(function () {
                var uid = $row.find('.qrBsGenSel').val();
                var spec = uid ? _qrFindSpecByUID(uid) : null;
                if (!spec) { game.chatMessage('LOAD_ARMY Assign: general not found', 'adventurer'); return; }
                var army = {};
                $row.find('.qrBsArmyInput').each(function () {
                    var t = $(this).attr('data-type');
                    var v = parseInt($(this).val(), 10) || 0;
                    if (t && v > 0) { army[t] = v; }
                });
                var unitTypes = Object.keys(army);
                if (unitTypes.length === 0) { game.chatMessage('LOAD_ARMY Assign: no units configured', 'adventurer'); return; }
                // Unload first
                try {
                    var dUnload = new dRaiseArmyVODef();
                    dUnload.armyHolderSpecialistVO = spec.CreateSpecialistVOFromSpecialist();
                    game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, dUnload, armyResponder);
                } catch (e) { game.chatMessage('LOAD_ARMY Assign unload error: ' + e, 'adventurer'); return; }
                // Load after 2s
                setTimeout(function () {
                    try {
                        var spec2 = _qrFindSpecByUID(uid);
                        if (!spec2) { game.chatMessage('LOAD_ARMY Assign: general lost after unload', 'adventurer'); return; }
                        var dLoad = new dRaiseArmyVODef();
                        dLoad.armyHolderSpecialistVO = spec2.CreateSpecialistVOFromSpecialist();
                        unitTypes.forEach(function (unitType) {
                            var dRes = new dResourceVODef();
                            dRes.name_string = unitType;
                            dRes.amount = army[unitType];
                            dLoad.unitSquads.addItem(dRes);
                        });
                        game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, dLoad, armyResponder);
                        game.chatMessage('LOAD_ARMY Assign: units sent to general.', 'adventurer');
                    } catch (e) { game.chatMessage('LOAD_ARMY Assign load error: ' + e, 'adventurer'); }
                }, 2000);
            }).appendTo($armySub);
        $row.append($armySub);
    }

    // Delay seconds input
    if (isDelay) {
        $('<span>').css({ 'color': '#ccc', 'font-size': '11px', 'flex-shrink': '0' }).text('Seconds:').appendTo($row);
        $('<input>').attr({ 'type': 'number', 'class': 'form-control input-xs qrBsDelayInput',
                            'min': '1', 'max': '600' })
            .css({ 'width': '70px', 'flex-shrink': '0' })
            .val(bsStep.seconds || 5).appendTo($row);
    }

    // CLAIM_QUESTS: pause-and-wait seconds input
    if (bsStep.type === 'CLAIM_QUESTS') {
        var $cqSub = $('<div>').css({
            'flex-basis': '100%', 'width': '100%',
            'border-top': '1px solid #555', 'padding-top': '4px', 'margin-top': '2px',
            'display': 'flex', 'align-items': 'center', 'gap': '6px', 'flex-wrap': 'wrap'
        });
        $('<span>').css({ 'font-size': '10px', 'color': '#aaa' })
            .text('Opens Quest Book \u2014 pause for manual \u2713, then auto-continues. Wait (s):').appendTo($cqSub);
        $('<input>').attr({ 'type': 'number', 'class': 'form-control input-xs qrCqWait',
                            'min': '1', 'max': '120' })
            .css({ 'width': '60px' })
            .val(bsStep.claimWaitSecs || 5).appendTo($cqSub);
        $row.append($cqSub);
    }

    // Spacer
    $('<span>').css('flex', '1').appendTo($row);

    // Reorder / remove controls
    if (idx > 0) {
        $('<button>').attr('class', 'btn btn-xs btn-default').attr('title', 'Move to top').text('\u21d1')
            .click(function () {
                _qrSaveCurrentFromUI();
                var a = profile.battleScript;
                a.unshift(a.splice(idx, 1)[0]);
                _qrScrollToBsIdx = 0;
                _qrRenderEditor();
            }).appendTo($row);
        $('<button>').attr('class', 'btn btn-xs btn-default').text('\u2191')
            .click(function () {
                _qrSaveCurrentFromUI();
                var a = profile.battleScript;
                var t = a[idx - 1]; a[idx - 1] = a[idx]; a[idx] = t;
                _qrScrollToBsIdx = idx - 1;
                _qrRenderEditor();
            }).appendTo($row);
    }
    if (idx < profile.battleScript.length - 1) {
        $('<button>').attr('class', 'btn btn-xs btn-default').text('\u2193')
            .click(function () {
                _qrSaveCurrentFromUI();
                var a = profile.battleScript;
                var t = a[idx + 1]; a[idx + 1] = a[idx]; a[idx] = t;
                _qrScrollToBsIdx = idx + 1;
                _qrRenderEditor();
            }).appendTo($row);
        $('<button>').attr('class', 'btn btn-xs btn-default').attr('title', 'Move to bottom').text('\u21d3')
            .click(function () {
                _qrSaveCurrentFromUI();
                var a = profile.battleScript;
                a.push(a.splice(idx, 1)[0]);
                _qrScrollToBsIdx = profile.battleScript.length - 1;
                _qrRenderEditor();
            }).appendTo($row);
    }
    $('<button>').attr('class', 'btn btn-xs btn-success').attr('title', 'Start script from this step')
        .text('\u25b6 here')
        .click(function () {
            _qrSaveCurrentFromUI();
            _qrRunBattleScript(idx);
        }).appendTo($row);
    $('<button>').attr('class', 'btn btn-xs btn-danger').text('\u2715')
        .click(function () {
            _qrSaveCurrentFromUI();
            profile.battleScript.splice(idx, 1);
            _qrScrollToBsIdx = Math.min(idx, profile.battleScript.length - 1);
            _qrRenderEditor();
        }).appendTo($row);
    $('<button>').attr('class', 'btn btn-xs btn-default').attr('title', 'Add step below').text('+ Add step below')
        .css({ 'margin-left': '4px' })
        .click(function () {
            _qrSaveCurrentFromUI();
            profile.battleScript.splice(idx + 1, 0, _qrBsNewStep('MOVE'));
            _qrScrollToBsIdx = idx + 1;
            _qrRenderEditor();
        }).appendTo($row);

    return $row;
}

// Execute the battle script for the currently selected profile
function _qrBsUpdateControls() {
    var running = _qrRunning && _qrBsState && !_qrBsState.stopped;
    var paused  = _qrBsState && _qrBsState.stopped;
    var minimized = _qrModal && !_qrModal.Body().is(':visible');
    $('#qrBsRunBtn').text(running ? '\u25a0 Running\u2026' : '\u25b6 Run Battle Script').prop('disabled', running);
    $('#qrBsStopBtn').toggle(!!(running || paused));
    $('#qrBsContinueBtn').toggle(!!paused);
    $('#qrBsRestartBtn').toggle(!!paused);
    // Footer mirror controls — only visible while minimized
    $('#qrBsStopBtnFtr').toggle(minimized && !!(running || paused));
    $('#qrBsContinueBtnFtr').toggle(minimized && !!paused);
    $('#qrBsRestartBtnFtr').toggle(minimized && !!paused);
    // Step progress panel — only while minimized and script active
    var showProgress = minimized && !!(running || paused) && _qrBsState && _qrBsState.steps;
    $('#qrBsStepProgress').toggle(!!showProgress);
    if (showProgress && _qrBsState.activeIdx !== undefined) {
        _qrBsUpdateStepProgress(_qrBsState.activeIdx, _qrBsState.steps);
    }
}

function _qrBsUpdateStepProgress(idx, steps) {
    var $p = $('#qrBsStepProgress');
    if (!$p.length || !steps) { return; }
    var TYPE_LABEL = {
        MOVE: 'MOVE \u2192 garrison',       ATTACK: 'ATTACK \u00d7 building',
        WAIT_ZONE: 'WAIT \u2014 arrives',     WAIT_AT_GARRISON: 'WAIT \u2014 ready',
        WAIT_ATTACKING: 'WAIT \u2014 attacking', WAIT_GARRISON: 'WAIT \u2014 position',
        WAIT_IDLE: 'WAIT \u2014 idle',        UNLOAD: 'UNLOAD army',
        LOAD_ARMY: 'LOAD ARMY',               DELAY: 'DELAY',
        COLLECTIBLES: 'COLLECT',              FILL_AND_RETURN: 'FILL \u2192 STAR',
        CLAIM_QUESTS: 'CLAIM QUEST REWARDS'
    };
    function fmt(i) {
        if (i < 0 || i >= steps.length) { return null; }
        var s = steps[i];
        var text = (i + 1) + '. ' + (TYPE_LABEL[s.type] || s.type);
        if (s.generalName) { text += ' \u2014 ' + s.generalName; }
        if (s.buildingDisplay && (s.type === 'MOVE' || s.type === 'ATTACK' || s.type === 'WAIT_GARRISON')) {
            text += ' @ ' + s.buildingDisplay;
        }
        if (s.type === 'DELAY') { text += ' (' + (s.seconds || 5) + 's)'; }
        return text;
    }
    $p.empty();
    var prev = fmt(idx - 1), curr = fmt(idx), next = fmt(idx + 1);
    if (prev !== null) {
        $('<div>').css({ 'color': '#555', 'font-size': '10px', 'white-space': 'nowrap',
                         'overflow': 'hidden', 'text-overflow': 'ellipsis' })
            .text('\u25b2 ' + prev).appendTo($p);
    }
    $('<div>').css({ 'color': '#f0c040', 'font-size': '12px', 'font-weight': 'bold',
                     'white-space': 'nowrap', 'overflow': 'hidden', 'text-overflow': 'ellipsis',
                     'padding': '1px 0', 'border-top': prev ? '1px solid #333' : 'none',
                     'border-bottom': next !== null ? '1px solid #333' : 'none' })
        .text('\u25ba ' + (curr !== null ? curr : 'Complete')).appendTo($p);
    if (next !== null) {
        $('<div>').css({ 'color': '#555', 'font-size': '10px', 'white-space': 'nowrap',
                         'overflow': 'hidden', 'text-overflow': 'ellipsis' })
            .text('\u25bc ' + next).appendTo($p);
    }
}

function _qrBsStop() {
    if (!_qrBsState) { return; }
    _qrBsState.stopped = true;
    _qrRunning = false;
    _qrModal.withFooter('.qrRunBtn').prop('disabled', false);
    game.chatMessage('BattleScript: stopped at step ' + _qrBsState.stepIdx + '.', 'adventurer');
    _qrBsUpdateControls();
}

function _qrRunBattleScript(startIdx) {
    _qrSaveCurrentFromUI();
    var profile = _qrSelectedIdx >= 0 ? _qrProfiles[_qrSelectedIdx] : null;
    if (!profile) { showGameAlert('No profile selected'); return; }
    if (!profile.battleScript || profile.battleScript.length === 0) {
        showGameAlert('No battle script steps defined.'); return;
    }
    if (_qrRunning) { showGameAlert('Battle script is already running.'); return; }

    startIdx = startIdx || 0;
    _qrBsState = { steps: profile.battleScript.slice(), stepIdx: startIdx, stopped: false, profile: profile };
    _qrRunning = true;
    _qrModal.withFooter('.qrRunBtn').prop('disabled', true);
    _qrBsUpdateControls();

    function finish(msg) {
        _qrRunning = false;
        _qrBsState = null;
        $('#qrBsSteps .qrBsStep').css('outline', '');
        _qrModal.withFooter('.qrRunBtn').prop('disabled', false);
        _qrBsUpdateControls();
        if (msg) { game.chatMessage('BattleScript: ' + msg, 'adventurer'); }
    }

    function setActiveRow(i) {
        if (state) { state.activeIdx = i; }
        $('#qrBsSteps .qrBsStep').css('outline', '');
        var $active = $('#qrBsSteps .qrBsStep[data-idx="' + i + '"]').css('outline', '2px solid #f0c040');
        if ($active.length) {
            try { $active[0].scrollIntoView({ block: 'nearest' }); } catch (e) {
                try { $active[0].scrollIntoView(false); } catch (e2) {} }
        }
        _qrBsUpdateStepProgress(i, state.steps);
        _qrBsUpdateControls();
    }

    var state = _qrBsState;

    function runNextStep() {
        if (state.stopped) { return; }
        if (state.stepIdx >= state.steps.length) {
            $('#qrBsSteps .qrBsStep').css('outline', '');
            finish('All steps complete.');
            showGameAlert('Battle Script complete!');
            return;
        }
        setActiveRow(state.stepIdx);
        var step = state.steps[state.stepIdx++];
        var spec = step.generalUID ? _qrFindSpecByUID(step.generalUID) : null;
        var genName = '';
        if (spec) { try { genName = spec.getName(false).replace(/<[^>]+>/g, ''); } catch (e) { genName = step.generalUID; } }

        try {
            switch (step.type) {

                case 'MOVE': {
                    var grid = _qrBsGetBuildingGrid(step.buildingName, step.buildingKey);
                    if (!grid)  { game.chatMessage('MOVE: building "' + (step.buildingKey || step.buildingName) + '" not found on current zone', 'adventurer'); runNextStep(); return; }
                    if (!spec)  { game.chatMessage('MOVE: general not found', 'adventurer'); runNextStep(); return; }
                    var gUIDM  = step.generalUID;
                    var labelM = step.buildingDisplay || step.buildingKey || step.buildingName;
                    // 1. Already there? skip immediately
                    if (spec.GetGarrisonGridIdx && spec.GetGarrisonGridIdx() === grid) {
                        game.chatMessage('MOVE: ' + genName + ' already at ' + labelM + ' — skipping.', 'adventurer');
                        setTimeout(runNextStep, 1000);
                        break;
                    }
                    // 2. Send transfer command — record where they currently are
                    var originalGrid = spec.GetGarrisonGridIdx ? spec.GetGarrisonGridIdx() : 0;
                    var stask = new armySpecTaskDef();
                    stask.uniqueID  = spec.GetUniqueID();
                    stask.subTaskID = 0;
                    game.gi.mCurrentCursor.mCurrentSpecialist = spec;
                    game.gi.SendServerAction(95, 4, grid, 0, stask);
                    game.chatMessage('MOVE: ' + genName + ' \u2192 ' + labelM + ' (waiting for garrison to vacate\u2026)', 'adventurer');
                    // 3. Poll until the general has LEFT the original garrison (transfer started), timeout 30s
                    setTimeout(function () {
                        var ivMtick = 0;
                        var ivM = setInterval(function () {
                            if (state.stopped) { clearInterval(ivM); return; }
                            ivMtick++;
                            if (ivMtick > 15) { // 15 × 2s = 30s timeout
                                clearInterval(ivM);
                                game.chatMessage('MOVE: timeout — ' + genName + ' did not leave garrison (position may be occupied).', 'adventurer');
                                setTimeout(runNextStep, 1000);
                                return;
                            }
                            try {
                                var s = _qrFindSpecByUID(gUIDM);
                                // Transfer started = no longer at original grid
                                if (s && s.GetGarrisonGridIdx() !== originalGrid) {
                                    clearInterval(ivM);
                                    game.chatMessage('MOVE: ' + genName + ' has left garrison \u2014 transfer started.', 'adventurer');
                                    setTimeout(runNextStep, 1000);
                                }
                            } catch (e) { clearInterval(ivM); finish('MOVE error: ' + e); }
                        }, 2000);
                    }, 2000);
                    break;
                }

                case 'ATTACK': {
                    var grid = _qrBsGetBuildingGrid(step.buildingName, step.buildingKey);
                    if (!grid)  {
                        game.chatMessage('ATTACK: ' + (step.buildingDisplay || step.buildingKey || step.buildingName) + ' — not found (already defeated?), skipping.', 'adventurer');
                        setTimeout(runNextStep, 1000); return;
                    }
                    // Verify the building at that grid is still alive (intercept-ready)
                    var campAlive = false;
                    try {
                        game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                            if (b && typeof b.GetGrid === 'function' && b.GetGrid() === grid) {
                                if (b.IsReadyToIntercept && b.IsReadyToIntercept()) { campAlive = true; }
                            }
                        });
                    } catch (e) {}
                    if (!campAlive) {
                        game.chatMessage('ATTACK: ' + (step.buildingDisplay || step.buildingName) + ' — already defeated, skipping.', 'adventurer');
                        setTimeout(runNextStep, 1000); return;
                    }
                    if (!spec) { game.chatMessage('ATTACK: general not found', 'adventurer'); runNextStep(); return; }

                    var atkSpecUID = step.generalUID;
                    var atkLabel   = step.buildingDisplay || step.buildingName;
                    var atkMinArmy = step.army || {};
                    var atkMinKeys = Object.keys(atkMinArmy).filter(function (k) { return atkMinArmy[k] > 0; });

                    // Returns shortfall strings for the attacker's current army vs minimum
                    function atkGetShortfall() {
                        var sp = _qrFindSpecByUID(atkSpecUID);
                        if (!sp) { return ['general not found']; }
                        var cur = {};
                        try {
                            sp.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                                var t = sq.GetType ? sq.GetType() : '';
                                var a = sq.GetAmount ? sq.GetAmount() : 0;
                                if (t) { cur[t] = (cur[t] || 0) + a; }
                            });
                        } catch (e) {}
                        return atkMinKeys.filter(function (t) { return (cur[t] || 0) < atkMinArmy[t]; });
                    }

                    // Load atkMinArmy onto the attacker; poll until army confirmed (up to 10s) then call onDone
                    function atkLoadArmy(onDone) {
                        var sp = _qrFindSpecByUID(atkSpecUID);
                        if (!sp) { setTimeout(onDone, 2000); return; }
                        try {
                            var frLoad = new dRaiseArmyVODef();
                            frLoad.armyHolderSpecialistVO = sp.CreateSpecialistVOFromSpecialist();
                            atkMinKeys.forEach(function (t) {
                                var dRes = new dResourceVODef();
                                dRes.name_string = t;
                                dRes.amount = atkMinArmy[t];
                                frLoad.unitSquads.addItem(dRes);
                            });
                            game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, frLoad, armyResponder);
                        } catch (e) { game.chatMessage('ATTACK: load army error: ' + e, 'adventurer'); setTimeout(onDone, 2000); return; }
                        // Poll until the general's army reflects the load, or timeout after 10s
                        var laWait = 0;
                        var ivLoad = setInterval(function () {
                            if (state.stopped) { clearInterval(ivLoad); return; }
                            laWait++;
                            if (laWait > 10 || atkGetShortfall().length === 0) {
                                clearInterval(ivLoad);
                                onDone();
                            }
                        }, 1000);
                    }

                    // Unload ALL profile generals (to free all units back to pool); call onDone when done
                    function atkUnloadAll(onDone) {
                        var profileUIDs = {};
                        (profile.steps || []).forEach(function (s) { if (s.generalUID) { profileUIDs[s.generalUID] = true; } });
                        var q = new TimedQueue(1200);
                        Object.keys(profileUIDs).forEach(function (uid) {
                            q.add(function () {
                                var s = _qrFindSpecByUID(uid);
                                if (!s) { return; }
                                try {
                                    var uo = new dRaiseArmyVODef();
                                    uo.armyHolderSpecialistVO = s.CreateSpecialistVOFromSpecialist();
                                    game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, uo, armyResponder);
                                } catch (e) {}
                            });
                        });
                        q.add(function () { setTimeout(onDone, 1000); });
                        q.run();
                    }

                    // Send the attack server action
                    function doSendAttack() {
                        var sp = _qrFindSpecByUID(atkSpecUID);
                        if (!sp) { finish('ATTACK: general not found during retry'); return; }
                        var stask2 = new armySpecTaskDef();
                        stask2.uniqueID  = sp.GetUniqueID();
                        stask2.subTaskID = 0;
                        game.gi.mCurrentCursor.mCurrentSpecialist = sp;
                        game.gi.SendServerAction(95, 5, grid, 0, stask2);
                    }

                    // Start the attack and poll for departure confirmation
                    function doActualAttack() {
                        // Snapshot the general's current garrison grid before sending — leaving it means attack accepted
                        var atkSpec0 = _qrFindSpecByUID(atkSpecUID);
                        var atkOrigGrid = atkSpec0 ? atkSpec0.GetGarrisonGridIdx() : -1;
                        doSendAttack();
                        game.chatMessage('ATTACK: ' + genName + ' \u00d7 ' + atkLabel + ' (waiting for departure or battle\u2026)', 'adventurer');
                        var atkRetryTicks = 0;
                        var atkRouteRetries = 0; // counts full 30s blocked intervals
                        // Number of generals in profile = how many steps to rewind when route is permanently blocked
                        var atkRewindSteps = Math.max(1, (state.profile.steps || []).length);
                        var ivAtkRetry = setInterval(function () {
                            if (state.stopped) { clearInterval(ivAtkRetry); return; }
                            try {
                                var sp2 = _qrFindSpecByUID(atkSpecUID);
                                // Signal 1: general left their garrison (attack command accepted by server)
                                var generalLeft = sp2 && sp2.GetGarrisonGridIdx() !== atkOrigGrid;
                                // Signal 2: camp is no longer intercepting (battle started or camp defeated)
                                var campDone = false;
                                try {
                                    game.zone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                                        if (b && typeof b.GetGrid === 'function' && b.GetGrid() === grid) {
                                            if (!b.IsReadyToIntercept || !b.IsReadyToIntercept()) { campDone = true; }
                                        }
                                    });
                                } catch (e) {}
                                if (generalLeft || campDone) {
                                    clearInterval(ivAtkRetry);
                                    game.chatMessage('ATTACK: ' + genName + ' \u2014 ' + atkLabel + ' attack accepted.', 'adventurer');
                                    setTimeout(runNextStep, 500);
                                    return;
                                }
                                atkRetryTicks++;
                                if (atkRetryTicks % 60 === 0) { // 30s (60 × 500ms) — route still blocked
                                    atkRouteRetries++;
                                    if (atkRouteRetries >= 10) {
                                        // Route is permanently blocked — rewind N steps so MOVE steps can reposition
                                        clearInterval(ivAtkRetry);
                                        // state.stepIdx was already incremented past this ATTACK step,
                                        // so rewind by atkRewindSteps to land on the MOVE steps before it
                                        var rewindTo = Math.max(0, state.stepIdx - 1 - atkRewindSteps);
                                        game.chatMessage(
                                            'ATTACK: route blocked 10 times for ' + genName + ' \u2014 rewinding ' +
                                            atkRewindSteps + ' step(s) to re-run positioning moves (going to step ' + (rewindTo + 1) + ')\u2026',
                                            'adventurer'
                                        );
                                        state.stepIdx = rewindTo;
                                        setTimeout(runNextStep, 1000);
                                    } else {
                                        game.chatMessage('ATTACK: route still blocked for ' + genName + ' (attempt ' + atkRouteRetries + '/10), retrying\u2026', 'adventurer');
                                        doSendAttack();
                                    }
                                }
                            } catch (e) { clearInterval(ivAtkRetry); finish('ATTACK poll error: ' + e); }
                        }, 500);
                    }

                    // Entry point: check army requirement then proceed
                    if (atkMinKeys.length === 0) {
                        doActualAttack();
                    } else {
                        var sf0 = atkGetShortfall();
                        if (sf0.length === 0) {
                            doActualAttack();
                        } else {
                            // Attempt 1: load required army from free pool, wait 2s, check again
                            game.chatMessage('ATTACK: ' + genName + ' below minimum (' + sf0.join(', ') + ') \u2014 loading army\u2026', 'adventurer');
                            atkLoadArmy(function () {
                                if (state.stopped) { return; }
                                var sf1 = atkGetShortfall();
                                if (sf1.length === 0) {
                                    doActualAttack();
                                } else {
                                    // Attempt 2: unload all profile generals, reload, wait 2s, check again
                                    game.chatMessage('ATTACK: still insufficient (' + sf1.join(', ') + ') \u2014 unloading all profile generals\u2026', 'adventurer');
                                    atkUnloadAll(function () {
                                        if (state.stopped) { return; }
                                        atkLoadArmy(function () {
                                            if (state.stopped) { return; }
                                            var sf2 = atkGetShortfall();
                                            if (sf2.length === 0) {
                                                doActualAttack();
                                            } else {
                                                finish('ATTACK HALTED \u2014 ' + genName + ' cannot meet minimum army after all retries: ' + sf2.join(', '));
                                            }
                                        });
                                    });
                                }
                            });
                        }
                    }
                    break;
                }

                case 'WAIT_ARRIVE': // legacy alias
                case 'WAIT_ZONE': {
                    // Waits until the general has no active task (= finished traveling, arrived and idle)
                    var gUIDZ = step.generalUID;
                    game.chatMessage('WAIT_ZONE: waiting for ' + genName + ' to arrive (idle on island)', 'adventurer');
                    // Check immediately in case they're already there
                    var specNow = _qrFindSpecByUID(gUIDZ);
                    if (specNow && specNow.GetTask && specNow.GetTask() == null) {
                        game.chatMessage('WAIT_ZONE: ' + genName + ' already idle — proceeding.', 'adventurer');
                        setTimeout(runNextStep, 200);
                        break;
                    }
                    var ivZ = setInterval(function () {
                        if (state.stopped) { clearInterval(ivZ); return; }
                        try {
                            var s = _qrFindSpecByUID(gUIDZ);
                            if (s && s.GetTask && s.GetTask() == null) {
                                clearInterval(ivZ);
                                game.chatMessage('WAIT_ZONE: ' + genName + ' has arrived.', 'adventurer');
                                setTimeout(runNextStep, 1000);
                            }
                        } catch (e) { clearInterval(ivZ); finish('WAIT_ZONE error: ' + e); }
                    }, 3000);
                    break;
                }

                case 'WAIT_AT_GARRISON': {
                    // Waits until general has no task AND is garrisoned (ready after move or combat)
                    var gUIDAG = step.generalUID;
                    game.chatMessage('WAIT_AT_GARRISON: waiting for ' + genName + ' to be ready at garrison', 'adventurer');
                    var ivAG = setInterval(function () {
                        if (state.stopped) { clearInterval(ivAG); return; }
                        try {
                            var s = _qrFindSpecByUID(gUIDAG);
                            if (s && s.GetTask() == null && s.GetGarrisonGridIdx && s.GetGarrisonGridIdx() > 0) {
                                clearInterval(ivAG);
                                game.chatMessage('WAIT_AT_GARRISON: ' + genName + ' is ready.', 'adventurer');
                                setTimeout(runNextStep, 1000);
                            }
                        } catch (e) { clearInterval(ivAG); finish('WAIT_AT_GARRISON error: ' + e); }
                    }, 3000);
                    break;
                }

                case 'WAIT_ATTACKING': {
                    // Waits until the general has left their garrison (= attack departure)
                    var gUIDATK = step.generalUID;
                    var specATK0 = _qrFindSpecByUID(gUIDATK);
                    var atkOrigGrid = specATK0 ? specATK0.GetGarrisonGridIdx() : 0;
                    // If already not garrisoned (= already left before this step ran), proceed immediately
                    if (atkOrigGrid === 0) {
                        game.chatMessage('WAIT_ATTACKING: ' + genName + ' already left garrison — proceeding.', 'adventurer');
                        setTimeout(runNextStep, 1000);
                        break;
                    }
                    game.chatMessage('WAIT_ATTACKING: waiting for ' + genName + ' to leave garrison (grid ' + atkOrigGrid + ')', 'adventurer');
                    var atkTicks = 0;
                    var ivATK = setInterval(function () {
                        if (state.stopped) { clearInterval(ivATK); return; }
                        try {
                            var s = _qrFindSpecByUID(gUIDATK);
                            if (!s) { clearInterval(ivATK); finish('WAIT_ATTACKING: general not found'); return; }
                            atkTicks++;
                            if (atkTicks > 60) { // 30s timeout
                                clearInterval(ivATK);
                                game.chatMessage('WAIT_ATTACKING: timeout — proceeding anyway.', 'adventurer');
                                setTimeout(runNextStep, 1000);
                                return;
                            }
                            var curGrid = s.GetGarrisonGridIdx();
                            if (curGrid !== atkOrigGrid) {
                                clearInterval(ivATK);
                                game.chatMessage('WAIT_ATTACKING: ' + genName + ' has left garrison — attack confirmed.', 'adventurer');
                                setTimeout(runNextStep, 1000);
                            }
                        } catch (e) { clearInterval(ivATK); finish('WAIT_ATTACKING error: ' + e); }
                    }, 500);
                    break;
                }

                case 'WAIT_GARRISON': {
                    // Waits until general is garrisoned at a specific target building
                    var bNameG = step.buildingName;
                    var bKeyG  = step.buildingKey;
                    var gUIDG2 = step.generalUID;
                    game.chatMessage('WAIT_GARRISON: waiting for ' + genName + ' to reach ' + (step.buildingDisplay || bNameG), 'adventurer');
                    var ivG = setInterval(function () {
                        if (state.stopped) { clearInterval(ivG); return; }
                        try {
                            var s    = _qrFindSpecByUID(gUIDG2);
                            var tgrd = _qrBsGetBuildingGrid(bNameG, bKeyG);
                            if (s && tgrd && s.GetGarrisonGridIdx() === tgrd) {
                                clearInterval(ivG);
                                game.chatMessage('WAIT_GARRISON: ' + genName + ' is in position.', 'adventurer');
                                setTimeout(runNextStep, 1000);
                            }
                        } catch (e) { clearInterval(ivG); finish('WAIT_GARRISON error: ' + e); }
                    }, 3000);
                    break;
                }

                case 'WAIT_IDLE': {
                    var gUIDI = step.generalUID;
                    game.chatMessage('WAIT_IDLE: waiting for ' + genName + ' to finish task', 'adventurer');
                    var ivI = setInterval(function () {
                        if (state.stopped) { clearInterval(ivI); return; }
                        try {
                            var s = _qrFindSpecByUID(gUIDI);
                            if (s && s.GetTask() == null) {
                                clearInterval(ivI);
                                game.chatMessage('WAIT_IDLE: general is idle.', 'adventurer');
                                setTimeout(runNextStep, 1000);
                            }
                        } catch (e) { clearInterval(ivI); finish('WAIT_IDLE error: ' + e); }
                    }, 3000);
                    break;
                }

                case 'UNLOAD': {
                    var gUIDU = step.generalUID;
                    game.chatMessage('UNLOAD: unloading all units from ' + genName, 'adventurer');
                    try {
                        var specU = _qrFindSpecByUID(gUIDU);
                        if (specU && specU.HasUnits()) {
                            var dRaiseArmyVO = new dRaiseArmyVODef();
                            dRaiseArmyVO.armyHolderSpecialistVO = specU.CreateSpecialistVOFromSpecialist();
                            game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, dRaiseArmyVO, armyResponder);
                            game.chatMessage('UNLOAD: sent unload command for ' + genName, 'adventurer');
                        } else {
                            game.chatMessage('UNLOAD: ' + genName + ' has no units, skipping', 'adventurer');
                        }
                        setTimeout(function () { if (!state.stopped) { runNextStep(); } }, 1000);
                    } catch (e) { finish('UNLOAD error: ' + e); }
                    break;
                }

                case 'LOAD_ARMY': {
                    var gUIDLA = step.generalUID;
                    var armyLA = step.army || {};
                    var unitTypesLA = Object.keys(armyLA).filter(function (t) { return armyLA[t] > 0; });
                    if (unitTypesLA.length === 0) {
                        game.chatMessage('LOAD_ARMY: no army configured — use Capture button in the step row first', 'adventurer');
                        setTimeout(runNextStep, 1000);
                        break;
                    }
                    var specLA = _qrFindSpecByUID(gUIDLA);
                    if (!specLA) { game.chatMessage('LOAD_ARMY: general not found', 'adventurer'); runNextStep(); break; }
                    game.chatMessage('LOAD_ARMY: unloading ' + genName + ' first...', 'adventurer');
                    // Step 1: Unload all
                    try {
                        var dUnload = new dRaiseArmyVODef();
                        dUnload.armyHolderSpecialistVO = specLA.CreateSpecialistVOFromSpecialist();
                        game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, dUnload, armyResponder);
                    } catch (e) { finish('LOAD_ARMY unload error: ' + e); break; }
                    // Step 2: Load new army after 2s
                    setTimeout(function () {
                        if (state.stopped) { return; }
                        game.chatMessage('LOAD_ARMY: loading army for ' + genName + '...', 'adventurer');
                        try {
                            var specLA2 = _qrFindSpecByUID(gUIDLA);
                            if (!specLA2) { finish('LOAD_ARMY: general lost after unload'); return; }
                            var dLoad = new dRaiseArmyVODef();
                            dLoad.armyHolderSpecialistVO = specLA2.CreateSpecialistVOFromSpecialist();
                            unitTypesLA.forEach(function (unitType) {
                                var dRes = new dResourceVODef();
                                dRes.name_string = unitType;
                                dRes.amount = armyLA[unitType];
                                dLoad.unitSquads.addItem(dRes);
                            });
                            game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, dLoad, armyResponder);
                        } catch (e) { finish('LOAD_ARMY load error: ' + e); return; }
                        // Step 3: Poll until army confirmed (20s timeout)
                        var laTimeout = 0;
                        setTimeout(function () {
                            var ivLA = setInterval(function () {
                                if (state.stopped) { clearInterval(ivLA); return; }
                                laTimeout++;
                                if (laTimeout > 10) {
                                    clearInterval(ivLA);
                                    game.chatMessage('LOAD_ARMY: timeout — proceeding anyway.', 'adventurer');
                                    setTimeout(runNextStep, 1000);
                                    return;
                                }
                                try {
                                    var s = _qrFindSpecByUID(gUIDLA);
                                    if (!s) { clearInterval(ivLA); finish('LOAD_ARMY: general lost'); return; }
                                    var curArmy = {};
                                    s.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                                        if (sq.GetAmount() > 0) { curArmy[sq.GetType()] = sq.GetAmount(); }
                                    });
                                    var match = unitTypesLA.every(function (t) { return (curArmy[t] || 0) >= armyLA[t]; });
                                    if (match) {
                                        clearInterval(ivLA);
                                        game.chatMessage('LOAD_ARMY: ' + genName + ' army confirmed.', 'adventurer');
                                        setTimeout(runNextStep, 1000);
                                    }
                                } catch (e) { clearInterval(ivLA); finish('LOAD_ARMY poll error: ' + e); }
                            }, 2000);
                        }, 2000);
                    }, 2000);
                    break;
                }

                case 'DELAY': {
                    var secs = parseInt(step.seconds, 10) || 5;
                    game.chatMessage('DELAY: ' + secs + 's', 'adventurer');
                    setTimeout(function () { if (!state.stopped) { runNextStep(); } }, secs * 1000);
                    break;
                }

                case 'COLLECTIBLES': {
                    game.chatMessage('COLLECTIBLES: collecting all collectibles on zone...', 'adventurer');
                    try {
                        var collectMgr = swmmo.getDefinitionByName('Collections::CollectionsManager').getInstance();
                        var collectQueue = new TimedQueue(1000);
                        var questTriggersMapC = {};
                        if (game.gi.mCurrentPlayer.mIsAdventureZone && game.gi.mNewQuestManager.GetQuestPool().IsAnyQuestsActive()) {
                            $.each(game.gi.mNewQuestManager.GetQuestPool().GetQuest_vector(), function (i, q) {
                                if (q.isFinished() || !q.IsQuestActive()) { return; }
                                $.each(q.mQuestDefinition.questTriggers_vector, function (n, trig) {
                                    if (trig.name_string) { questTriggersMapC[trig.name_string] = true; }
                                });
                            });
                        }
                        game.gi.mCurrentPlayerZone.mStreetDataMap.GetBuildings_vector().forEach(function (b) {
                            if (!b) { return; }
                            var goc = b.GetGOContainer();
                            if (
                                collectMgr.getBuildingIsCollectible(b.GetBuildingName_string()) ||
                                (questTriggersMapC[b.GetBuildingName_string()] && b.mIsSelectable &&
                                 goc.mIsAttackable && !goc.mIsLeaderCamp && goc.ui !== 'enemy' &&
                                 (b.GetArmy() == null || !b.GetArmy().HasUnits()))
                            ) {
                                collectQueue.add(function () { game.gi.SelectBuilding(b); });
                            }
                        });
                        if (collectQueue.len() === 0) {
                            game.chatMessage('COLLECTIBLES: nothing to collect.', 'adventurer');
                            setTimeout(runNextStep, 1000);
                        } else {
                            game.chatMessage('COLLECTIBLES: collecting ' + collectQueue.len() + ' item(s).', 'adventurer');
                            collectQueue.add(function () { if (!state.stopped) { runNextStep(); } });
                            collectQueue.run();
                        }
                    } catch (e) { game.chatMessage('COLLECTIBLES error: ' + e, 'adventurer'); setTimeout(runNextStep, 1000); }
                    break;
                }

                case 'FILL_AND_RETURN': {
                    game.chatMessage('FILL_AND_RETURN: filling all profile generals then returning to star...', 'adventurer');
                    try {
                        // Collect unique general UIDs from all steps (first occurrence order)
                        var frUIDs = [];
                        var frSeen = {};
                        state.steps.forEach(function (s) {
                            if (s.generalUID && !frSeen[s.generalUID]) {
                                frSeen[s.generalUID] = true;
                                frUIDs.push(s.generalUID);
                            }
                        });
                        if (frUIDs.length === 0) {
                            game.chatMessage('FILL_AND_RETURN: no generals found in profile steps — skipping.', 'adventurer');
                            setTimeout(runNextStep, 1000);
                            break;
                        }

                        // Get manually-set capacity for a UID (generalCapacity field), no API fallback
                        function frGetCap(uid) {
                            var cap = 0;
                            (state.profile.steps || []).some(function (s) {
                                if (s.generalUID === uid && s.generalCapacity > 0) { cap = s.generalCapacity; return true; }
                                return false;
                            });
                            return cap || 200;
                        }

                        // Sort highest capacity first so big generals get first pick of the live pool
                        frUIDs.sort(function (a, b) { return frGetCap(b) - frGetCap(a); });

                        var frIdx = 0;

                        function frProcessNext() {
                            if (state.stopped) { return; }
                            if (frIdx >= frUIDs.length) {
                                game.chatMessage('FILL_AND_RETURN: all generals processed and sent home.', 'adventurer');
                                setTimeout(runNextStep, 1000);
                                return;
                            }
                            var uid = frUIDs[frIdx++];
                            var spec = _qrFindSpecByUID(uid);
                            if (!spec) {
                                game.chatMessage('FILL_AND_RETURN: general not found — skipping.', 'adventurer');
                                frProcessNext();
                                return;
                            }
                            var frGenName = '';
                            try { frGenName = spec.getName(false).replace(/<[^>]+>/g, ''); } catch (e) {}
                            var frMaxCap = frGetCap(uid);

                            game.chatMessage('FILL_AND_RETURN: unloading ' + frGenName + ' (cap ' + frMaxCap + ')...', 'adventurer');

                            // Step 1: Unload general
                            try {
                                var frUnload = new dRaiseArmyVODef();
                                frUnload.armyHolderSpecialistVO = spec.CreateSpecialistVOFromSpecialist();
                                game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, frUnload, armyResponder);
                            } catch (e) {
                                game.chatMessage('FILL_AND_RETURN: unload error for ' + frGenName + ': ' + e, 'adventurer');
                                setTimeout(frProcessNext, 1000);
                                return;
                            }

                            // Step 2: Poll until unload confirmed (HasUnits = false), timeout 30s
                            var frUnloadTicks = 0;
                            var ivFrUnload = setInterval(function () {
                                if (state.stopped) { clearInterval(ivFrUnload); return; }
                                frUnloadTicks++;
                                var s2 = _qrFindSpecByUID(uid);
                                var stillHas = false;
                                try { stillHas = s2 && s2.HasUnits && s2.HasUnits(); } catch (e) {}
                                if (!stillHas || frUnloadTicks > 15) { // 15 × 2s = 30s
                                    clearInterval(ivFrUnload);
                                    if (stillHas) {
                                        game.chatMessage('FILL_AND_RETURN: ' + frGenName + ' unload timeout — continuing anyway.', 'adventurer');
                                    }
                                    frDoLoad(uid, frGenName, frMaxCap);
                                }
                            }, 2000);
                        }

                        function frDoLoad(uid, frGenName, frMaxCap) {
                            if (state.stopped) { return; }
                            var spec = _qrFindSpecByUID(uid);
                            if (!spec) {
                                game.chatMessage('FILL_AND_RETURN: ' + frGenName + ' not found for load.', 'adventurer');
                                setTimeout(frProcessNext, 1000);
                                return;
                            }

                            // Read LIVE free pool from zone army (units returned after unload are now here)
                            var frArmy = {};
                            var frTotal = 0;
                            try {
                                var livePool = {};
                                game.zone.GetArmy(game.gi.mCurrentPlayer.GetPlayerId())
                                    .GetSquadsCollection_vector()
                                    .forEach(function (sq) {
                                        var t = sq.GetType ? sq.GetType() : null;
                                        var amt = sq.GetAmount ? sq.GetAmount() : 0;
                                        if (t && t.toLowerCase().indexOf('expedition') < 0 && amt > 0) {
                                            livePool[t] = (livePool[t] || 0) + amt;
                                        }
                                    });
                                // Fill using _qrUnitOrder priority up to capacity
                                _qrUnitOrder.forEach(function (t) {
                                    if (frTotal >= frMaxCap) { return; }
                                    var avail = livePool[t] || 0;
                                    if (avail <= 0) { return; }
                                    var take = Math.min(avail, frMaxCap - frTotal);
                                    frArmy[t] = take;
                                    frTotal += take;
                                });
                            } catch (e) {
                                game.chatMessage('FILL_AND_RETURN: pool read error for ' + frGenName + ': ' + e, 'adventurer');
                            }

                            var frUnitTypes = Object.keys(frArmy).filter(function (t) { return frArmy[t] > 0; });
                            if (frUnitTypes.length === 0) {
                                game.chatMessage('FILL_AND_RETURN: ' + frGenName + ' — pool empty, sending home empty.', 'adventurer');
                                frSendHome(uid, frGenName);
                                return;
                            }

                            game.chatMessage('FILL_AND_RETURN: loading ' + frGenName + ' with ' + frTotal + '/' + frMaxCap + ' units...', 'adventurer');

                            try {
                                var frLoad = new dRaiseArmyVODef();
                                frLoad.armyHolderSpecialistVO = spec.CreateSpecialistVOFromSpecialist();
                                frUnitTypes.forEach(function (t) {
                                    var dRes = new dResourceVODef();
                                    dRes.name_string = t;
                                    dRes.amount = frArmy[t];
                                    frLoad.unitSquads.addItem(dRes);
                                });
                                game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, frLoad, armyResponder);
                            } catch (e) {
                                game.chatMessage('FILL_AND_RETURN: load error for ' + frGenName + ': ' + e, 'adventurer');
                                frSendHome(uid, frGenName);
                                return;
                            }

                            // Step 3: Poll until army confirmed on general, timeout 30s
                            var frLoadTicks = 0;
                            var ivFrLoad = setInterval(function () {
                                if (state.stopped) { clearInterval(ivFrLoad); return; }
                                frLoadTicks++;
                                var liveLoaded = 0;
                                try {
                                    var s3 = _qrFindSpecByUID(uid);
                                    s3.GetArmy().GetSquadsCollection_vector().forEach(function (sq) {
                                        liveLoaded += sq.GetAmount ? sq.GetAmount() : 0;
                                    });
                                } catch (e) {}
                                if (liveLoaded >= frTotal || frLoadTicks > 15) { // 15 × 2s = 30s
                                    clearInterval(ivFrLoad);
                                    // Before sending home: check if general is underfilled with free units still available
                                    var freeLeft = 0;
                                    try {
                                        game.zone.GetArmy(game.gi.mCurrentPlayer.GetPlayerId())
                                            .GetSquadsCollection_vector()
                                            .forEach(function (sq) {
                                                if (sq.GetType && sq.GetType().toLowerCase().indexOf('expedition') < 0) {
                                                    freeLeft += sq.GetAmount ? sq.GetAmount() : 0;
                                                }
                                            });
                                    } catch (e) {}
                                    if (liveLoaded < frMaxCap && freeLeft > 0) {
                                        game.chatMessage('FILL_AND_RETURN: WARNING — ' + frGenName + ' has ' + liveLoaded + '/' + frMaxCap + ' but ' + freeLeft + ' units still unassigned!', 'adventurer');
                                    } else {
                                        game.chatMessage('FILL_AND_RETURN: ' + frGenName + ' confirmed ' + liveLoaded + '/' + frMaxCap + ' \u2713', 'adventurer');
                                    }
                                    frSendHome(uid, frGenName);
                                }
                            }, 2000);
                        }

                        function frSendHome(uid, frGenName) {
                            if (state.stopped) { return; }
                            try {
                                var spec = _qrFindSpecByUID(uid);
                                if (spec) {
                                    armyServices.specialist.sendToZone(spec, game.gi.mCurrentPlayer.GetHomeZoneId());
                                    game.chatMessage('FILL_AND_RETURN: ' + frGenName + ' \u2192 sent home.', 'adventurer');
                                }
                            } catch (e) {
                                game.chatMessage('FILL_AND_RETURN: send-home error for ' + frGenName + ': ' + e, 'adventurer');
                            }
                            setTimeout(frProcessNext, 1500);
                        }

                        frProcessNext();
                    } catch (e) { game.chatMessage('FILL_AND_RETURN error: ' + e, 'adventurer'); setTimeout(runNextStep, 1000); }
                    break;
                }

                case 'CLAIM_QUESTS': {
                    game.chatMessage('CLAIM_QUESTS: scanning for finished quests...', 'adventurer');
                    // Use auto-claim from questlist if available
                    if (typeof qlAutoClaimAll === 'function') {
                        _qrMinimizeModal();
                        qlAutoClaimAll(function(claimed) {
                            _qrRestoreModal();
                            game.chatMessage('CLAIM_QUESTS: auto-claimed ' + claimed + ' quest(s).', 'adventurer');
                            if (!state.stopped) { runNextStep(); }
                        });
                        break;
                    }
                    // Fallback: manual claim
                    try {
                        var cqMgr  = game.gi.mNewQuestManager;
                        var cqPool = cqMgr.GetQuestPool();
                        var cqFinished = [];
                        $.each(cqPool.GetQuest_vector(), function (i, q) {
                            try { if (q && q.isFinished && q.isFinished()) { cqFinished.push(q); } } catch (e) {}
                        });
                        if (cqFinished.length === 0) {
                            game.chatMessage('CLAIM_QUESTS: no finished quests found. Proceeding.', 'adventurer');
                            setTimeout(runNextStep, 1000);
                            break;
                        }
                        game.chatMessage('CLAIM_QUESTS: ' + cqFinished.length + ' finished quest(s) to claim.', 'adventurer');

                        var cqWaitSecs = parseInt(step.claimWaitSecs, 10) || 5;
                        var cqClaimQueue = new TimedQueue(1200);

                        // Minimize window so the Quest Book is accessible, open each dialog, wait, then restore
                        _qrMinimizeModal();
                        game.chatMessage('CLAIM_QUESTS: window minimized — confirm quest(s) in the Quest Book, auto-continuing in ' + (cqWaitSecs * cqFinished.length) + 's...', 'adventurer');
                        cqFinished.forEach(function (q) {
                            cqClaimQueue.add(function () {
                                if (state.stopped) { return; }
                                try { cqMgr.finishQuest(q); } catch (e) {
                                    game.chatMessage('CLAIM_QUESTS: finishQuest error: ' + e, 'adventurer');
                                }
                            });
                            cqClaimQueue.add(function () {
                                // just pause — user clicks ✓ manually
                            }, cqWaitSecs * 1000);
                        });
                        cqClaimQueue.add(function () {
                            _qrRestoreModal();
                            if (!state.stopped) { runNextStep(); }
                        });
                        cqClaimQueue.run();
                    } catch (e) {
                        game.chatMessage('CLAIM_QUESTS error: ' + e, 'adventurer');
                        setTimeout(runNextStep, 1000);
                    }
                    break;
                }

                case 'RETURN_HOME': {
                    var rhHomeId = game.gi.mCurrentPlayer.GetHomeZoneId();
                    if (game.gi.mCurrentViewedZoneID === rhHomeId) {
                        game.chatMessage('RETURN_HOME: already on home island.', 'adventurer');
                        setTimeout(runNextStep, 500);
                        break;
                    }
                    game.chatMessage('RETURN_HOME: navigating back to home island\u2026', 'adventurer');
                    try { game.gi.visitZone(rhHomeId); } catch (e) {
                        game.chatMessage('RETURN_HOME: visitZone error: ' + e, 'adventurer');
                        setTimeout(runNextStep, 1000);
                        break;
                    }
                    var rhPoll = setInterval(function () {
                        if (state.stopped) { clearInterval(rhPoll); return; }
                        if (game.gi.mCurrentViewedZoneID === rhHomeId) {
                            clearInterval(rhPoll);
                            game.chatMessage('RETURN_HOME: arrived on home island.', 'adventurer');
                            setTimeout(runNextStep, 2000);
                        }
                    }, 2000);
                    break;
                }

                default:
                    runNextStep();
            }
        } catch (e) {
            finish('Step ' + state.stepIdx + ' error: ' + e);
        }
    }

    // Army checking is handled by _qrRun before the battle script is ever called.
    // No pre-flight here — start immediately.
    game.chatMessage('BattleScript: starting from step ' + (startIdx + 1) + ' (' + state.steps.length + ' total)', 'adventurer');
    runNextStep();
}

})();
