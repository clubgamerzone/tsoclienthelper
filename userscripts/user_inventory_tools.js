// ========== INVENTORY TOOLS
// Shows transferable star-menu items (AddResource etc.) and lets you apply them
// to the Mayor's House in bulk or one by one.
// Accessible via a new top-level "Inventory Tools" menu after "Tools".

(function () {

// ---- Language ----
var _itLang = {
    'en-uk': {
        title:          'Inventory Tools',
        tabAddRes:      'Add Resources',
        useAll:         'Use All',
        refresh:        'Refresh',
        noItems:        'No transferable items found in the star menu.',
        noMayorHouse:   'Mayor\'s House not found on the map. Make sure you are on your home zone.',
        notHomeZone:    'You must be on your home zone to use this tool.',
        colResource:    'Resource',
        colAmount:      'Amount',
        colAction:      'Action',
        use:            'Use',
        done:           'Done!',
        applying:       'Applying {0} / {1}...',
        select:         'Select',
        selectAll:      'All',
        selectNone:     'None',
    },
    'pt-br': {
        title:          'Ferramentas de Inventário',
        tabAddRes:      'Adicionar Recursos',
        useAll:         'Usar Todos',
        refresh:        'Atualizar',
        noItems:        'Nenhum item transferível encontrado no menu estelar.',
        noMayorHouse:   'Casa do Prefeito não encontrada. Certifique-se de estar na sua ilha.',
        notHomeZone:    'Você deve estar na sua ilha para usar esta ferramenta.',
        colResource:    'Recurso',
        colAmount:      'Quantidade',
        colAction:      'Ação',
        use:            'Usar',
        done:           'Concluído!',
        applying:       'Aplicando {0} / {1}...',
        select:         'Selecionar',
        selectAll:      'Todos',
        selectNone:     'Nenhum',
    }
};

function _itT(key) {
    var lang = typeof gameLang !== 'undefined' ? gameLang : 'en-uk';
    var t = _itLang[lang] || _itLang['en-uk'];
    return t[key] !== undefined ? t[key] : (_itLang['en-uk'][key] || key);
}

// ---- Register top-level menu "Inventory Tools" after "Tools" ----
(function _itRegisterMenu() {
    try {
        var nativeMenu = window.nativeWindow.menu;
        // Find the "Tools" top-level item
        var toolsIdx = -1;
        for (var i = 0; i < nativeMenu.numItems; i++) {
            if (nativeMenu.getItemAt(i).name === 'Tools') { toolsIdx = i; break; }
        }
        // Remove any previous registration (on script reload)
        for (var j = 0; j < nativeMenu.numItems; j++) {
            if (nativeMenu.getItemAt(j).name === 'InventoryTools') {
                nativeMenu.removeItemAt(j);
                break;
            }
        }

        var topItem   = new air.NativeMenuItem(_itT('title'));
        topItem.name  = 'InventoryTools';
        var subMenu   = new air.NativeMenu();
        var openItem  = new air.NativeMenuItem(_itT('tabAddRes') + '...');
        openItem.addEventListener(air.Event.SELECT, _itMenuHandler);
        subMenu.addItem(openItem);
        topItem.submenu = subMenu;

        if (toolsIdx >= 0) {
            nativeMenu.addItemAt(topItem, toolsIdx + 1);
        } else {
            nativeMenu.addItem(topItem);
        }
    } catch (e) {
        // Fallback: add inside the Tools submenu
        try { addToolsMenuItem(_itT('title'), _itMenuHandler); } catch (e2) { debug(e2); }
    }
})();

// ---- Locate Mayor's House grid on the current zone ----
function _itGetMayorHouseGrid() {
    var zone = game.gi.mCurrentPlayerZone;
    // Try known building name variants
    var candidates = ['MayorHouse', 'Mayorhouse', 'mayorhouse', 'Mayor_House'];
    for (var i = 0; i < candidates.length; i++) {
        try {
            var v = zone.mStreetDataMap.getBuildingsByName_vector(candidates[i]);
            if (v && v.length > 0) { return v[0].GetGrid(); }
        } catch (e) {}
    }
    // Fallback: iterate all buildings looking for any that contains "mayor" (case-insensitive)
    try {
        var allBuildings = zone.mStreetDataMap.GetBuildings_vector();
        for (var b = 0; b < allBuildings.length; b++) {
            var bld = allBuildings[b];
            if (!bld) { continue; }
            var bname = '';
            try { bname = bld.GetBuildingName_string().toLowerCase(); } catch (e) { continue; }
            if (bname.indexOf('mayor') !== -1) { return bld.GetGrid(); }
        }
    } catch (e) { debug(e); }
    return null;
}

// ---- Types that represent transferable star-menu resource items ----
// AddResource  → applied to Mayor's House to add to warehouse
// FillDeposit  → applied to a deposit building (quarry / mine)
// Both are in the "res" group in hideItemsGroup.
var _itResTypes = ['AddResource', 'FillDeposit'];

function _itIsResType(type) {
    for (var i = 0; i < _itResTypes.length; i++) {
        if (type.indexOf(_itResTypes[i]) === 0) { return true; }
    }
    return false;
}

// ---- Collect ALL resource star-menu items (AddResource + FillDeposit) ----
function _itGetResItems() {
    var items = [];
    try {
        game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function (item) {
            var type = '';
            try { type = item.GetType(); } catch (e) { return; }
            if (!_itIsResType(type)) { return; }
            var resName = '';
            try { resName = item.GetResourceName_string(); } catch (e) {}
            var amount = 0;
            try { amount = item.GetAmount(); } catch (e) { amount = 1; }
            // Call GetUniqueId() twice (same pattern as buffs script) for proxy safety
            var uid1 = 0, uid2 = 0;
            try { uid1 = item.GetUniqueId().uniqueID1; } catch (e) {}
            try { uid2 = item.GetUniqueId().uniqueID2; } catch (e) {}
            var iconData = null;
            try { iconData = item.GetBuffIconData(); } catch (e) {}
            var isAddRes = (type.indexOf('AddResource') === 0);
            items.push({
                type:     type,
                isAddRes: isAddRes,
                resName:  resName,
                amount:   amount,
                id:       uid1 + '_' + uid2,
                iconData: iconData
            });
        });
    } catch (e) { debug(e); }
    return items;
}

// ---- Debug: dump all star-menu items to chat ----
function _itDebugDump() {
    var lines = [];
    try {
        game.gi.mCurrentPlayer.mAvailableBuffs_vector.forEach(function (item) {
            var type = '', res = '', amt = '', id = '?';
            try { type = item.GetType(); } catch (e) {}
            try { res  = item.GetResourceName_string(); } catch (e) {}
            try { amt  = item.GetAmount(); } catch (e) {}
            try { id   = item.GetUniqueId().uniqueID1 + '_' + item.GetUniqueId().uniqueID2; } catch (e) {}
            lines.push(type + '|' + res + ' x' + amt + ' [' + id + ']');
        });
    } catch (e) { debug(e); }
    if (lines.length === 0) {
        game.chatMessage('[InventoryTools] Star menu vector is empty or inaccessible.', 'it');
        return;
    }
    game.chatMessage('[InventoryTools] Star menu dump (' + lines.length + ' items):', 'it');
    lines.forEach(function (l) { game.chatMessage('  ' + l, 'it'); });
}

// ---- Debug: dump all buildings in current zone to chat ----
function _itDumpBuildings() {
    var lines = [];
    var mayorGrid = null;
    try {
        var allBuildings = game.gi.mCurrentPlayerZone.mStreetDataMap.GetBuildings_vector();
        for (var b = 0; b < allBuildings.length; b++) {
            var bld = allBuildings[b];
            if (!bld) { continue; }
            var bname = '', grid = '';
            try { bname = bld.GetBuildingName_string(); } catch (e) { bname = '?'; }
            try { grid  = bld.GetGrid(); } catch (e) { grid = '?'; }
            if (bname.toLowerCase().indexOf('mayor') !== -1) { mayorGrid = grid; }
            lines.push(bname + ' [grid=' + grid + ']');
        }
    } catch (e) { debug(e); }
    game.chatMessage('[InventoryTools] Buildings in zone (' + lines.length + '):', 'it');
    lines.forEach(function (l) { game.chatMessage('  ' + l, 'it'); });
    if (mayorGrid !== null) {
        game.chatMessage('[InventoryTools] Mayor grid found: ' + mayorGrid, 'it');
    } else {
        game.chatMessage('[InventoryTools] Mayor grid NOT found! Candidates checked: MayorHouse, Mayorhouse, Mayor_House', 'it');
    }
}

// ---- Look up the LIVE unique ID of a specific item from the vector ----
// Always called at apply-time to avoid stale IDs after a server re-sync.
function _itGetLiveId(type, resName) {
    try {
        var vec = game.gi.mCurrentPlayer.mAvailableBuffs_vector;
        for (var i = 0; i < vec.length; i++) {
            var item = vec[i];
            var t = '', r = '';
            try { t = item.GetType(); }              catch (e) { continue; }
            try { r = item.GetResourceName_string(); } catch (e) {}
            if (t === type && r === resName) {
                var uid1 = 0, uid2 = 0;
                try { uid1 = item.GetUniqueId().uniqueID1; } catch (e) {}
                try { uid2 = item.GetUniqueId().uniqueID2; } catch (e) {}
                return uid1 + '_' + uid2;
            }
        }
    } catch (e) { debug(e); }
    return null;
}

// ---- Send the star-menu item to the target building grid ----
function _itApplyItem(id, grid, amount) {
    try {
        var parts    = id.split('_');
        var uniqueID = game.def("Communication.VO::dUniqueID").Create(parts[0], parts[1]);
        game.gi.SendServerAction(61, 0, grid, amount, uniqueID);
    } catch (e) { debug(e); }
}

// ---- Modal state ----
var _itModalReady = false;

// ---- Open / rebuild modal ----
function _itMenuHandler() {
    if (!game.gi.isOnHomzone()) {
        showGameAlert(_itT('notHomeZone'));
        return;
    }
    $("div[role='dialog']:not(#itModal):visible").modal('hide');

    if (!_itModalReady) { $('#itModal').remove(); }

    if ($('#itModal .modal-header .container-fluid').length === 0) {
        // --- Stylesheet ---
        $('#itStyle').remove();
        $('head').append($('<style>', { id: 'itStyle' }).text(
            '#itModal .it-row:hover { background-color: #5a3520; }' +
            '#itModal .it-amount    { color: #aaffaa; font-weight: bold; }' +
            '#itModal .it-hdr       { background: #3a2010; color: #ffcc88; font-weight: bold; padding: 4px 8px; border-radius: 4px; margin-bottom: 4px; }' +
        '#itModal .it-badge-add { background:#2a6; color:#fff; border-radius:3px; padding:1px 4px; font-size:10px; }' +
        '#itModal .it-badge-fill{ background:#56a; color:#fff; border-radius:3px; padding:1px 4px; font-size:10px; }'
        ));

        // --- Window shell ---
        createModalWindow('itModal', getImageTag('icon_warehouse.png', '45px') + ' ' + _itT('title'));

        $('#itModal .modal-header').append(
            '<div class="container-fluid">' +
            '<div style="margin-bottom:6px;">' +
            $('<button>').attr({ id: 'itRefreshBtn', 'class': 'btn btn-success btn-sm' }).text(_itT('refresh')).prop('outerHTML') +
            '&nbsp;' +
            $('<button>').attr({ id: 'itUseAllBtn', 'class': 'btn btn-danger btn-sm' }).text(_itT('useAll')).prop('outerHTML') +
            '&nbsp;' +
            $('<button>').attr({ id: 'itSelAllBtn', 'class': 'btn btn-default btn-sm' }).text(_itT('selectAll')).prop('outerHTML') +
            '&nbsp;' +
            $('<button>').attr({ id: 'itSelNoneBtn', 'class': 'btn btn-default btn-sm' }).text(_itT('selectNone')).prop('outerHTML') +
            '&nbsp;&nbsp;<span id="itStatus" style="font-style:italic;"></span>' +
            '</div>' +
            createTableRow([
                [1, _itT('select')],
                [1, ''],
                [1, 'Type'],
                [4, _itT('colResource')],
                [3, _itT('colAmount')],
                [2, _itT('colAction')]
            ], true) +
            '</div>'
        );

        _itModalReady = true;
    }

    // Wire header controls (re-bind on each open to avoid stale closures)
    $('#itRefreshBtn').off('click').on('click', _itRender);
    $('#itUseAllBtn').off('click').on('click', _itUseAll);
    $('#itSelAllBtn').off('click').on('click', function () {
        $('#itModalData input[type=checkbox]').prop('checked', true);
    });
    $('#itSelNoneBtn').off('click').on('click', function () {
        $('#itModalData input[type=checkbox]').prop('checked', false);
    });

    _itRender();

    if (!$('#itModal').is(':visible')) {
        $('#itModal').modal({ backdrop: 'static' });
    }
}

// ---- Localized display name for a res item ----
function _itResLabel(type, resName) {
    var label = '';
    try { label = loca.GetText('RES', type, ['', resName]); } catch (e) {}
    // Fallback: just the resource name
    if (!label || label === resName) {
        try { label = loca.GetText('RES', resName); } catch (e) {}
    }
    if (!label) { label = resName; }
    return label;
}

// ---- Get current and max storehouse amounts for a resource ----
function _itGetStoreInfo(resName) {
    var current = null, max = null;
    try {
        var res = game.getResources();
        current = res.GetResourceAmount(resName);
    } catch (e) {}
    // Try various possible API names for the max capacity
    try { max = game.getResources().GetMaxResourceAmount(resName); } catch (e) {}
    if (max === null || max === undefined) {
        try {
            game.getResources().GetResources_Vector().some(function (r) {
                if (r.name_string === resName) {
                    var m = r.max_amount !== undefined ? r.max_amount
                          : r.maxAmount  !== undefined ? r.maxAmount
                          : r.capacity   !== undefined ? r.capacity
                          : null;
                    if (m !== null) { max = m; return true; }
                }
                return false;
            });
        } catch (e) {}
    }
    return { current: current, max: max };
}

// ---- Render item list into modal body ----
function _itRender() {
    var items = _itGetResItems();
    var html  = '<div class="container-fluid">';

    if (items.length === 0) {
        html += '<p class="text-muted" style="margin:12px 0;">' + _itT('noItems') + '</p>';
    } else {
        items.forEach(function (item, idx) {
            var icon = item.iconData
                ? getImageByModule(item.iconData[0], item.iconData[1], 24, 24)
                : '';
            var resDisplay = _itResLabel(item.type, item.resName);
            // Storehouse current/max for AddResource items
            var amountHtml = '<span class="it-amount">' + item.amount + '</span>';
            if (item.isAddRes && item.resName) {
                var si = _itGetStoreInfo(item.resName);
                if (si.current !== null) {
                    var storeStr = si.current.toLocaleString();
                    if (si.max !== null) { storeStr += ' / ' + si.max.toLocaleString(); }
                    // Red if adding this item would exceed capacity
                    var wouldExceed = (si.max !== null && si.current + item.amount > si.max);
                    var storeColor  = wouldExceed ? '#e55' : '#8f8';
                    amountHtml = '<span class="it-amount">' + item.amount.toLocaleString() + '</span>'
                               + '<br><small style="color:' + storeColor + ';">' + storeStr + '</small>';
                }
            }
            // Type badge: green = AddResource (mayor's house), purple = FillDeposit
            var badgeCls  = item.isAddRes ? 'it-badge-add' : 'it-badge-fill';
            var badgeTxt  = item.isAddRes ? 'store' : 'deposit';
            var badge     = '<span class="' + badgeCls + '">' + badgeTxt + '</span>';
            var cb        = '<input type="checkbox" class="it-cb" data-idx="' + idx + '" '
                          + (item.isAddRes ? 'checked' : '') + ' />';
            var useBtn = $('<button>').attr({
                'class':    'btn btn-xs ' + (item.isAddRes ? 'btn-primary' : 'btn-default') + ' it-use-btn',
                'data-idx': idx,
                'data-id':  item.id,
                'title':    item.isAddRes ? 'Apply to Mayor\'s House' : 'FillDeposit items go on deposit buildings, not the mayor\'s house'
            }).text(_itT('use')).prop('outerHTML');

            html += createTableRow([
                [1, cb],
                [1, icon],
                [1, badge],
                [4, resDisplay, 'it-row'],
                [3, amountHtml],
                [2, useBtn]
            ]);
        });
    }

    html += '</div>';
    $('#itModalData').html(html);
    $('#itStatus').text('');

    // Bind single-use buttons
    $('#itModalData .it-use-btn').on('click', function () {
        var idx  = $(this).data('idx');
        var items = _itGetResItems();
        var itm  = items[idx];
        if (!itm) { return; }
        if (!itm.isAddRes) {
            showGameAlert('This is a FillDeposit item — it must be used on its deposit building, not the Mayor\'s House.\nType: ' + itm.type + ' / Resource: ' + itm.resName);
            return;
        }
        var grid = _itGetMayorHouseGrid();
        if (grid === null) { showGameAlert(_itT('noMayorHouse')); return; }
        // Re-fetch the live ID from the vector right now (never use stale render-time IDs)
        var liveId = _itGetLiveId(itm.type, itm.resName);
        if (!liveId) { showGameAlert('Item no longer found in star menu.'); return; }
        // Use min(item amount, available space) to avoid server rejection
        var si  = _itGetStoreInfo(itm.resName);
        var amt = itm.amount;
        if (si.current !== null && si.max !== null) {
            amt = Math.min(amt, si.max - si.current);
        }
        if (amt <= 0) { showGameAlert('Storehouse is full for ' + itm.resName + '.'); return; }
        _itApplyItem(liveId, grid, amt);
        var btn = $(this);
        btn.prop('disabled', true).text('✓');
        setTimeout(_itRender, 1800);
    });
}

// ---- Apply all selected items with a timed queue ----
function _itUseAll() {
    var grid = _itGetMayorHouseGrid();
    if (grid === null) { showGameAlert(_itT('noMayorHouse')); return; }

    var allItems = _itGetResItems();
    // Gather selected AddResource items (type+resName for live lookup at apply time)
    var selected = [];
    $('#itModalData .it-cb:checked').each(function () {
        var idx = $(this).data('idx');
        var itm = allItems[idx];
        if (!itm || !itm.isAddRes) { return; }  // skip FillDeposit
        selected.push({ type: itm.type, resName: itm.resName, amount: itm.amount });
    });

    // Only send AddResource items to mayor's house — skip FillDeposit
    if (selected.length === 0) { return; }

    $('#itUseAllBtn').prop('disabled', true);
    var total = selected.length;
    var done  = 0;

    var q = new TimedQueue(1200);
    selected.forEach(function (entry) {
        (function (e) {
            q.add(function () {
                // Always get the live ID right before sending
                var liveId = _itGetLiveId(e.type, e.resName);
                if (liveId) {
                    var si  = _itGetStoreInfo(e.resName);
                    var amt = e.amount;
                    if (si.current !== null && si.max !== null) {
                        amt = Math.min(amt, si.max - si.current);
                    }
                    if (amt > 0) { _itApplyItem(liveId, grid, amt); }
                }
                done++;
                $('#itStatus').text(_itT('applying').replace('{0}', done).replace('{1}', total));
            });
        })(entry);
    });
    q.add(function () {
        $('#itStatus').text(_itT('done'));
        $('#itUseAllBtn').prop('disabled', false);
        _itRender();
    });
    q.run();
}

})(); // end IIFE
