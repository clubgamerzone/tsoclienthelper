// ========== BUILDING STATUS VIEWER ==========
// Shows all buildings grouped by type, with status, deposit/depletion data, and warehouse storage.
// Accessible via Tools menu > "Building Status"

addToolsMenuItem('Building Status', _bsMenuHandler);

var _bsModalInitialized = false;
var _bsRefreshInterval  = null;
var _bsAutoUpdate       = true;

// ---- Section category definitions ----
var _bsSectionDefs = [
    {
        label:    'Weapons',
        patterns: ['WEAPON','SWORD','CROSSBOW','ARMORER','ARMOURER','BLACKSMITH','STEEL','BOW',
                   'FLETCHER','KNIGHTSM','GUNSMITH','MUNITION','MORTAR','CANNON',
                   'BARRACK','CARPENTER','COMBATACADEMY','STABLE','WHEELMAKER']
    },
    {
        label:    'Wood & Paper',
        patterns: ['WOODCUTTER','CUTTER','SAWMILL','FORESTER','CHARCOAL','LUMBERMILL','PAPERMILL',
                   'WOODWORK','LUMBERJACK','BARKMILL','BOOKBINDER','HARDWOOD',
                   'COKING','WOODYARD','FINESMITH','LETTERSMITH','ORNAMENTALSMITH','RECYCLING']
    },
    {
        label:    'Food & Farming',
        patterns: ['FARM','BAKER','BAKERY','WATERMILL','WATERWORK','WELL','SILO','BREWERY',
                   'FISH','FISHERMAN','FISHINGCABIN','HUNTER','BUTCHER','SLAUGHTER','GRAIN','MILL',
                   'PROVISION','WINDMILL','DEERSTALKER']
    }
];

// ---- Skip list ----
function _bsShouldSkip(nameKey, bld) {
    try { if (bld.isGarrison()) return true; } catch (e) {}
    var n = nameKey.toUpperCase();
    if (n.indexOf('BEDOFROSE')   !== -1) return true;
    if (n.indexOf('HANDCART')    !== -1) return true;
    if (n.indexOf('BROKENWHEEL') !== -1) return true;
    if (n.indexOf('TOPIARY')     !== -1) return true;
    if (n.indexOf('FLOWERY')     !== -1) return true;
    if (n.indexOf('GOLDENBENCH') !== -1) return true;
    if (n.indexOf('VASE')        !== -1) return true;
    if (n.indexOf('TRADEOFFICE') !== -1) return true;
    if (n.indexOf('BANDIT')      !== -1) return true;
    if (n.indexOf('DECORATION')  !== -1) return true;
    if (n.indexOf('MOUNTAIN')    !== -1) return true;
    if (n.indexOf('ROCK')        !== -1) return true;
    if (n.indexOf('HOUSE')       !== -1) return true;
    if (n.indexOf('RESIDENCE')   !== -1) return true;
    if (n.indexOf('FARMFIELD')   !== -1) return true;
    return false;
}

// ---- Classify building into a section ----
function _bsClassify(nameKey) {
    var n = nameKey.toUpperCase();
    for (var i = 0; i < _bsSectionDefs.length; i++) {
        var def = _bsSectionDefs[i];
        for (var j = 0; j < def.patterns.length; j++) {
            if (n.indexOf(def.patterns[j]) !== -1) return def.label;
        }
    }
    return 'Other';
}


// ---- Menu handler ----
function _bsMenuHandler() {
    if (!(swmmo.application.mGameInterface.mCurrentPlayer.GetHomeZoneId() ==
          swmmo.application.mGameInterface.mCurrentViewedZoneID)) {
        showGameAlert("Not in home zone");
        return;
    }

    $("div[role='dialog']:not(#bsModal):visible").modal("hide");

    if (!_bsModalInitialized) $('#bsModal').remove();

    try {
        if ($('#bsModal .modal-header .container-fluid').length === 0) {

            $('#bsStyle').remove();
            $("head").append($('<style>', { id: 'bsStyle' }).text(
                '#bsModal div .row:hover { background-color: #A65329; }' +
                '#bsModal .bs-upgrading { color: #ff5555; font-weight: bold; }' +
                '#bsModal .bs-producing { color: #66cc66; }' +
                '#bsModal .bs-buffed    { color: #ffaa00; }' +
                '#bsModal .bs-idle      { color: #999999; }' +
                '#bsModal .bs-section   { background: #4a3020; color: #ffcc88; font-weight: bold;' +
                                         ' padding: 4px 10px; margin: 6px 0 2px; border-radius: 4px;' +
                                         ' cursor: pointer; user-select: none; }' +
                '#bsModal .bs-section-arrow { float: right; transition: transform 0.15s; }' +
                '#bsModal .bs-exhausted { color: #cc4444; font-style: italic; }' +
                '#bsModal .bs-section.collapsed .bs-section-arrow { transform: rotate(-90deg); }'
            ));

            createModalWindow('bsModal', 'Building Status');

            $('#bsModal .modal-header').append(
                '<div class="container-fluid">' +
                $('<button>').attr({ id: 'bsRefreshBtn', 'class': 'btn btn-success' })
                             .text('Refresh').prop('outerHTML') +
                '&nbsp;&nbsp;' +
                $('<button>').attr({ id: 'bsAutoBtn', 'class': 'btn btn-warning' })
                             .text('Auto Update: ON').prop('outerHTML') +
                '&nbsp;&nbsp;<span id="bsTotalSpan" style="font-weight:bold;"></span>' +
                createTableRow([
                    [1, '#'], [2, 'Building'], [1, 'Lvl'], [1, 'Deposit'],
                    [2, 'Status'], [2, 'Time Left'], [2, 'Storage'], [1, 'Buffed']
                ], true) +
                '</div>'
            );

            $('#bsRefreshBtn').click(function () { _bsRefresh(); });

            $('#bsAutoBtn').click(function () {
                _bsAutoUpdate = !_bsAutoUpdate;
                $(this).text('Auto Update: ' + (_bsAutoUpdate ? 'ON' : 'OFF'))
                       .toggleClass('btn-warning', _bsAutoUpdate)
                       .toggleClass('btn-default', !_bsAutoUpdate);
                if (_bsAutoUpdate) {
                    _bsRefresh();
                } else {
                    if (_bsRefreshInterval) {
                        clearInterval(_bsRefreshInterval);
                        _bsRefreshInterval = null;
                    }
                }
            });

            $('#bsModal').on('shown.bs.modal', function () {
                $('#bsModal .modal-dialog').draggable({ handle: '#bsModal .modal-header', containment: 'window' });
            });
            $('#bsModal').on('hidden.bs.modal', function () {
                if (_bsRefreshInterval) {
                    clearInterval(_bsRefreshInterval);
                    _bsRefreshInterval = null;
                }
            });

            _bsModalInitialized = true;
        }

        _bsRefresh();

    } catch (e) {}

    $('#bsModal:not(:visible)').modal({ backdrop: false });
}

// ---- Refresh: collect data + render + schedule next auto-refresh ----
function _bsRefresh() {
    try {
        var groups = _bsGetData();
        _bsRenderData(groups);
    } catch (e) {}

    if (_bsRefreshInterval) clearInterval(_bsRefreshInterval);
    if (_bsAutoUpdate) {
        _bsRefreshInterval = setInterval(function () {
            if ($('#bsModal:visible').length > 0 && _bsAutoUpdate) {
                try {
                    var groups = _bsGetData();
                    _bsRenderData(groups);
                } catch (e) {}
            } else {
                clearInterval(_bsRefreshInterval);
                _bsRefreshInterval = null;
            }
        }, 30000);
    }
}

// ---- Collect data from Flash game object, grouped by category ----
function _bsGetData() {
    var mines     = [];
    var weapons   = [];
    var wood      = [];
    var food      = [];
    var other     = [];
    var exhausted = [];

    var gi         = swmmo.application.mGameInterface;
    var zone       = gi.mCurrentPlayerZone;
    var streetMap  = zone.mStreetDataMap;
    var clientTime = gi.GetClientTime();

    // Build deposit lookup: grid â†’ deposit object
    var depositMap = {};
    try {
        var depositArr = streetMap.mDepositContainer.mContainer;
        for (var di = 0; di < depositArr.length; di++) {
            var dep = depositArr[di];
            if (dep) depositMap[dep.GetGrid()] = dep;
        }
    } catch (e) {}

    // Warehouse resource manager (used for ore stock levels)
    var resources = null;
    try { resources = game.getResources(); } catch (e) {}

    // Economics singleton for depletion calculation
    var gEcon = null;
    try { gEcon = swmmo.getDefinitionByName("ServerState::gEconomics"); } catch (e) {}

    streetMap.mBuildingContainer.forEach(function (bld) {
        try {
            var nameKey = bld.GetBuildingName_string();
            var locName = loca.GetText("BUI", nameKey);
            if (!locName || locName.indexOf("undefined") > -1) return;

            // Always skip farmfields and garrisons regardless of deposit presence
            var nUp = nameKey.toUpperCase();
            if (nUp.indexOf('FARMFIELD') !== -1) return;
            try { if (bld.isGarrison()) return; } catch (e) {}

            // A building is a "mine" if a deposit exists at its grid position.
            // Quarries reference the deposit via GetDepositBuildingGridPos() rather than
            // sitting directly on the deposit grid, so check both.
            var deposit = depositMap[bld.GetGrid()] || null;
            if (!deposit) {
                try {
                    var depGrid = bld.GetResourceCreation().GetDepositBuildingGridPos();
                    if (depGrid > 0) deposit = depositMap[depGrid] || null;
                } catch (e) {}
            }
            var isMine  = deposit !== null;

            if (_bsShouldSkip(nameKey, bld)) return;
            var statusCode       = 0;   // 0=idle 1=producing 2=buffed 3=upgrading
            var isUpgrading      = false;
            var upgProgress      = 0;
            var upgradeRemaining = 0;
            var buffEndStr       = '';
            var buffName         = '';

            // -- Upgrade check --
            try {
                if (bld.IsUpgradeInProgress()) {
                    isUpgrading      = true;
                    upgProgress      = bld.mBuildingUpgradeProgress || 0;
                    statusCode       = 3;
                    var startTime    = bld.GetUpgradeStartTime ? bld.GetUpgradeStartTime() : 0;
                    var duration     = bld.GetUpgradeDuration  ? bld.GetUpgradeDuration()  : 0;
                    upgradeRemaining = Math.max(0, (startTime + duration) - clientTime);
                }
            } catch (e) {}

            // -- Production / buff check --
            try {
                if (!isUpgrading) {
                    statusCode = (isMine || bld.IsProductionActive()) ? 1 : 0;
                }
                var buff = bld.productionBuff;
                if (buff != null && buff.IsActive(clientTime)) {
                    var app             = buff.GetApplicanceMode();
                    var buffRemainingMs = (buff.GetStartTime() + buff.GetBuffDefinition().getDuration(app)) - clientTime;
                    if (buffRemainingMs > 0) {
                        buffEndStr = _bsFormatHMS(buffRemainingMs);
                        buffName   = loca.GetText("RES", buff.GetBuffDefinition().GetName_string());
                    }
                }
            } catch (e) {}

            // GetUIUpgradeLevel() triggers a Flash assert on buildings without upgrade bonuses.
            // GetUpgradeLevel() returns a 0-based index, so add 1 for the user-visible level.
            var bldLevel = 0;
            try { bldLevel = bld.GetUpgradeLevel(); } catch (e) {}

            var entry = {
                NameKey:          nameKey,
                Name:             locName,
                Level:            bldLevel,
                Grid:             bld.GetGrid(),
                Status:           statusCode,
                IsUpgrading:      isUpgrading,
                UpgProgress:      upgProgress,
                UpgradeRemaining: upgradeRemaining,
                BuffEnd:          buffEndStr,
                BuffName:         buffName,
                IsMine:           isMine,
                DepositAmt:       0,
                SecsToDeplete:    0,
                OreInStorage:     0,
                CycleMs:          0,
                QueueRemainingMs: 0
            };

            // Timed production buildings (Bookbinder, Brewery, etc.) expose their
            // queue so we can calculate exact remaining time â€” same formula as 6-timed.js
            if (!isMine) {
                try {
                    var pq = bld.productionQueue;
                    if (pq && pq.mTimedProductions_vector && pq.mTimedProductions_vector.length > 0) {
                        var qTotal = 0;
                        pq.mTimedProductions_vector.forEach(function (qi) {
                            qTotal += (((qi.GetAmount() - qi.GetProducedItems()) * qi.GetProductionTime()) - qi.GetCollectedTime()) / qi.GetProductionOrder().GetTimeBonus();
                        });
                        entry.QueueRemainingMs = Math.max(0, qTotal);
                    } else {
                        entry.CycleMs = bld.CalculateWays() || 0;
                    }
                } catch (e) {
                    try { entry.CycleMs = bld.CalculateWays() || 0; } catch (e2) {}
                }
            }

            if (isMine) {
                // ore name comes directly from the deposit object
                var oreName = '';
                try { oreName = deposit.GetName_string(); } catch (e) {}

                // Deposit amount remaining
                try {
                    entry.DepositAmt = deposit.GetAmount();
                } catch (e) {}

                if (entry.DepositAmt === 0) {
                    var exCat = _bsClassify(nameKey);
                    if (exCat !== 'Wood & Paper' && exCat !== 'Food & Farming') {
                        exhausted.push(entry);
                    }
                    return;
                }

                // Depletion time (seconds) when mine is actively working
                try {
                    if (gEcon) {
                        var cycleMs      = bld.CalculateWays();
                        var cycleSecs    = cycleMs > 0 ? cycleMs / 1000 : 1;
                        var rcd          = gEcon.GetResourcesCreationDefinitionForBuilding(nameKey);
                        var amtRemoved   = rcd ? rcd.amountRemoved : 0;
                        var totalRemoved = bld.GetResourceInputFactor() * amtRemoved;
                        var rps          = totalRemoved > 0 ? totalRemoved / cycleSecs : 0;
                        entry.SecsToDeplete = rps > 0 ? entry.DepositAmt / rps : 0;
                    }
                } catch (e) {}

                // How much of this ore the player has in their warehouse
                try {
                    if (resources && oreName) {
                        entry.OreInStorage = resources.GetResourceAmount(oreName) || 0;
                    }
                } catch (e) {}

                var mCat = _bsClassify(nameKey);
                if      (mCat === 'Wood & Paper')   wood.push(entry);
                else if (mCat === 'Food & Farming') food.push(entry);
                else                                mines.push(entry);
            } else {
                var cat = _bsClassify(nameKey);
                if      (cat === 'Weapons')        weapons.push(entry);
                else if (cat === 'Wood & Paper')   wood.push(entry);
                else if (cat === 'Food & Farming') food.push(entry);
                else                               other.push(entry);
            }
        } catch (e) {}
    });

    // Sort: by name first, then within same name lowest time left on top
    function _getTimeMs(e) {
        if (e.IsUpgrading)         return e.UpgradeRemaining;
        if (e.IsMine)              return e.SecsToDeplete * 1000;
        if (e.QueueRemainingMs > 0) return e.QueueRemainingMs;
        return e.CycleMs;
    }
    function _sortFn(a, b) {
        var nameA = a.Name.toUpperCase(), nameB = b.Name.toUpperCase();
        var nameCmp = nameA.localeCompare(nameB);
        if (nameCmp !== 0) return nameCmp;
        // Same name: lowest time left first; zeros (idle/unknown) go to the bottom
        var tA = _getTimeMs(a), tB = _getTimeMs(b);
        if (tA === 0 && tB === 0) return 0;
        if (tA === 0) return 1;
        if (tB === 0) return -1;
        return tA - tB;
    }
    function _sortName(a, b) { return a.Name.toUpperCase().localeCompare(b.Name.toUpperCase()); }

    mines.sort(_sortFn);
    weapons.sort(_sortFn);
    wood.sort(_sortFn);
    food.sort(_sortFn);
    other.sort(_sortFn);
    exhausted.sort(_sortName);

    return [
        { label: 'Mines',           items: mines    },
        { label: 'Weapons',         items: weapons  },
        { label: 'Wood & Paper',    items: wood     },
        { label: 'Food & Farming',  items: food     },
        { label: 'Other',           items: other    },
        { label: 'Exhausted Mines', items: exhausted }
    ];
}

// ---- Format milliseconds as HH:MM:SS (or Xd HH:MM:SS) ----
function _bsFormatHMS(ms) {
    if (ms <= 0) return '00:00:00';
    var totalSecs = Math.floor(ms / 1000);
    var d = Math.floor(totalSecs / 86400);
    var h = Math.floor((totalSecs % 86400) / 3600);
    var m = Math.floor((totalSecs % 3600) / 60);
    var s = totalSecs % 60;
    var hms = ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':' + ('0' + s).slice(-2);
    return d > 0 ? d + 'd ' + hms : hms;
}

// Track which sections are collapsed (persists across refreshes within the session)
var _bsCollapsed = {};

// ---- Render all groups into the modal body ----
function _bsRenderData(groups) {
    var out   = '';
    var total = 0;
    var sIdx  = 0;

    groups.forEach(function (group) {
        if (group.items.length === 0) return;

        var isExhausted = group.label === 'Exhausted Mines';
        var secId = 'bsSec_' + sIdx++;
        var collapsed = (_bsCollapsed[secId] !== undefined) ? _bsCollapsed[secId] : isExhausted;
        var arrow = '<span class="bs-section-arrow">&#9660;</span>';
        out += '<div class="bs-section' + (collapsed ? ' collapsed' : '') + '" data-sec="' + secId + '">' +
               group.label + ' (' + group.items.length + ')' + arrow + '</div>';
        out += '<div id="' + secId + '"' + (collapsed ? ' style="display:none"' : '') + '>';

        var idx = 0;
        group.items.forEach(function (b) {
            ++idx;
            ++total;

            var statusLabel = '';
            var statusClass = '';
            var timeLeft    = 'â€”';

            if (isExhausted) {
                statusLabel = 'Exhausted';
                statusClass = 'bs-exhausted';
            } else {
                var parts   = [];
                var classes = [];
                var isIdle  = false;

                if (b.IsUpgrading) {
                    parts.push('UP ' + b.UpgProgress + '%');
                    classes.push('bs-upgrading');
                    timeLeft = b.UpgradeRemaining > 0 ? _bsFormatHMS(b.UpgradeRemaining) : 'â€”';
                } else if (b.Status === 1) {
                    parts.push('Active');
                    classes.push('bs-producing');
                    if (b.IsMine && b.SecsToDeplete > 0) {
                        timeLeft = _bsFormatHMS(b.SecsToDeplete * 1000);
                    } else if (b.QueueRemainingMs > 0) {
                        timeLeft = _bsFormatHMS(b.QueueRemainingMs);
                    } else if (b.CycleMs > 0) {
                        timeLeft = _bsFormatHMS(b.CycleMs) + '/cyc';
                    }
                } else {
                    parts.push('Idle');
                    classes.push('bs-idle');
                    isIdle = true;
                }

                if (b.BuffEnd) {
                    parts.push('Buffed');
                    classes.push('bs-buffed');
                    if (isIdle) { timeLeft = b.BuffEnd; }
                }

                statusLabel = parts.join(' + ');
                statusClass = classes[0];
            }

            var gotoIcon = getImageTag('accuracy.png', '20px', '20px')
                .replace('<img', '<img id="bsGoto_' + b.Grid + '"')
                .replace('style="', 'style="cursor:pointer;vertical-align:middle;');

            var depositCell = b.IsMine ? b.DepositAmt.toLocaleString() : 'â€”';
            var storageCell = b.IsMine ? b.OreInStorage.toLocaleString() : 'â€”';
            var buffCell    = b.BuffEnd
                ? '<span class="bs-buffed" title="' + b.BuffName + '">' + b.BuffEnd + '</span>'
                : 'â€”';

            out += createTableRow([
                [1, idx + '&nbsp;' + gotoIcon],
                [2, b.Name],
                [1, b.Level],
                [1, depositCell],
                [2, '<span class="' + statusClass + '">' + statusLabel + '</span>'],
                [2, timeLeft],
                [2, storageCell],
                [1, buffCell]
            ], false);
        }); // end items

        out += '</div>'; // close section content div
    }); // end groups

    $('#bsTotalSpan').text('Buildings: ' + total);
    $('#bsModalData').html('<div class="container-fluid">' + out + '</div>');

    // Click the map icon to scroll to that building
    $('#bsModalData img[id^="bsGoto_"]').click(function () {
        var grid = this.id.replace('bsGoto_', '');
        swmmo.application.mGameInterface.mCurrentPlayerZone.ScrollToGrid(grid);
    });

    // Toggle section collapse on header click
    $('#bsModalData .bs-section').off('click').on('click', function () {
        var secId      = $(this).data('sec');
        var content    = $('#' + secId);
        var nowHidden  = content.is(':visible');
        _bsCollapsed[secId] = nowHidden;
        content.toggle(!nowHidden);
        $(this).toggleClass('collapsed', nowHidden);
    });
}
