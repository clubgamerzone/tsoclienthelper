// ========== MOVE GRID TESTER ==========
// Iterates a range of grid numbers and tests whether a general can move to each one.
// Reachable grids are recorded to mgt_results.json in the game app storage folder.
//
// Flow per grid G:
//   1. Send move command to G
//   2. Wait 1 second — if the general's position changed: move was accepted
//   3. If accepted: wait until general is idle at new position, record it, continue from there
//   4. If rejected: skip immediately to G+1
//
// Tools menu > "Move Grid Tester"

(function () {

// ── Helpers ────────────────────────────────────────────────────────────────

function _mgtFindSpecByUID(uid) {
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

function _mgtGetGenerals() {
    var myId = game.gi.mCurrentPlayer.GetPlayerId();
    var result = [], seen = {};
    function scan(zone) {
        if (!zone) { return; }
        try {
            zone.GetSpecialists_vector().forEach(function (s) {
                if (s.getPlayerID() !== myId) { return; }
                var k = s.GetUniqueID().toKeyString();
                if (seen[k]) { return; }
                seen[k] = true;
                result.push(s);
            });
        } catch (e) {}
    }
    scan(game.gi.mCurrentPlayerZone);
    scan(game.gi.mCurrentViewedZone);
    return result;
}

function _mgtSaveJSON(data) {
    try {
        var file = air.File.documentsDirectory.resolvePath('mgt_results.json');
        var fs   = new air.FileStream();
        fs.open(file, air.FileMode.WRITE);
        fs.writeUTFBytes(JSON.stringify(data, null, 2));
        fs.close();
        return file.nativePath;
    } catch (e) { return null; }
}

// ── Module state ───────────────────────────────────────────────────────────

var _mgtRunning = false;
var _mgtStop    = false;
var _mgtPause   = false;
var _mgtLogEl   = null;
var _mgtModal   = null;

var _mgtUI = {
    setGrid:    function () {},
    setStatus:  function () {},
    setBar:     function () {},
    setCounter: function () {},
    setGeneral: function () {}
};

function _mgtLog(msg, color) {
    if (!_mgtLogEl) { return; }
    var line = $('<div>').css({
        'font-size': '11px', 'color': color || '#ccc',
        'word-break': 'break-word', 'padding': '1px 0'
    }).text('[' + new Date().toLocaleTimeString() + '] ' + msg);
    _mgtLogEl.append(line);
    var el = _mgtLogEl[0];
    if (el) { el.scrollTop = el.scrollHeight; }
}

// ── Main test loop ─────────────────────────────────────────────────────────

var MGT_MAP_WIDTH = 68; // G = y * MGT_MAP_WIDTH + x

function _mgtGridToXY(g) {
    return { x: g % MGT_MAP_WIDTH, y: Math.floor(g / MGT_MAP_WIDTH) };
}

function _mgtGetSector(g) {
    try {
        var sm = game.def('Map::AdditionalDataTSO').Sector;
        return game.zone.mStreetDataMap.mAdditionalData.get(g, sm);
    } catch (e) { return null; }
}

// Scan all grids up to maxGrid and return {sectorId -> [grids]} map
function _mgtScanSectors(maxGrid) {
    var map = {};
    var sm;
    try { sm = game.def('Map::AdditionalDataTSO').Sector; } catch (e) { return map; }
    for (var g = 0; g <= maxGrid; g++) {
        var sid;
        try { sid = game.zone.mStreetDataMap.mAdditionalData.get(g, sm); } catch (e) { continue; }
        if (sid === null || sid === undefined) { continue; }
        if (!map[sid]) { map[sid] = []; }
        map[sid].push(g);
    }
    return map;
}

// meta: { mode:'xy', xFrom, xTo, yFrom, yTo } or { mode:'sector', sectorId }
function _mgtRun(genUID, grids, meta, $startBtn, $stopBtn, $pauseBtn) {
    _mgtRunning = true;
    _mgtStop    = false;
    _mgtPause   = false;
    $startBtn.prop('disabled', true);
    $stopBtn.prop('disabled', false);
    $pauseBtn.prop('disabled', false).text('\u23f8 Pause').removeClass('btn-success').addClass('btn-warning');

    // Show general name in status panel
    try {
        var specForName = _mgtFindSpecByUID(genUID);
        var dispName = genUID;
        if (specForName) { try { dispName = specForName.getName ? specForName.getName(false).replace(/<[^>]+>/g, '') : genUID; } catch (e) {} }
        _mgtUI.setGeneral(dispName);
    } catch (e) {}

    var total     = grids.length;
    var tested    = 0;
    var cursor    = 0;
    var reachable = [];

    function done() {
        _mgtRunning = false;
        _mgtStop    = false;
        _mgtPause   = false;
        $startBtn.prop('disabled', false);
        $stopBtn.prop('disabled', true);
        $pauseBtn.prop('disabled', true).text('\u23f8 Pause').removeClass('btn-success').addClass('btn-warning');

        var genName = genUID;
        try {
            var s = _mgtFindSpecByUID(genUID);
            if (s) { genName = s.getName ? s.getName(false).replace(/<[^>]+>/g, '') : genUID; }
        } catch (e) {}

        _mgtUI.setStatus('Done', '#4c4');
        _mgtUI.setGrid('\u2014');
        _mgtUI.setBar(1);
        _mgtUI.setCounter(tested, reachable.length, total);

        var data = Object.assign({
            general:    genName,
            generalUID: genUID,
            testedAt:   new Date().toISOString(),
            reachable:  reachable
        }, meta);
        var path = _mgtSaveJSON(data);
        _mgtLog('Saved to: ' + (path || '(error saving file)'));
        _mgtLog('Reachable (' + reachable.length + '): ' + reachable.map(function (g) {
            var xy = _mgtGridToXY(g); return 'G' + g + '(' + xy.x + ',' + xy.y + ')';
        }).join(', '));
    }

    // Poll every 500ms until general is idle, then fire onArrived(finalGrid).
    function waitIdle(onArrived) {
        var ticks = 0;
        var iv = setInterval(function () {
            ticks++;
            if (_mgtStop || ticks > 60) {
                clearInterval(iv);
                var s2 = _mgtFindSpecByUID(genUID);
                var g2 = 0;
                try { g2 = s2 ? s2.GetGarrisonGridIdx() : 0; } catch (e) {}
                onArrived(g2);
                return;
            }
            try {
                var s2 = _mgtFindSpecByUID(genUID);
                if (!s2) { clearInterval(iv); onArrived(0); return; }
                var idle = false;
                try { idle = s2.GetGarrison() != null && s2.GetTask() == null; } catch (e) {}
                if (idle) {
                    clearInterval(iv);
                    var g2 = 0;
                    try { g2 = s2.GetGarrisonGridIdx(); } catch (e) {}
                    onArrived(g2);
                }
            } catch (e) {}
        }, 500);
    }

    function testNext() {
        if (_mgtStop || cursor >= grids.length) { done(); return; }
        if (_mgtPause) {
            _mgtUI.setStatus('Paused', '#f90');
            var pausePoll = setInterval(function () {
                if (_mgtStop) { clearInterval(pausePoll); done(); return; }
                if (!_mgtPause) { clearInterval(pausePoll); testNext(); }
            }, 300);
            return;
        }

        var g = grids[cursor];
        cursor++;
        tested++;

        var xy  = _mgtGridToXY(g);
        var pct = total > 0 ? (tested / total) : 0;
        _mgtUI.setGrid(g + ' (' + xy.x + ',' + xy.y + ')');
        _mgtUI.setStatus('Testing', '#fa0');
        _mgtUI.setBar(pct);
        _mgtUI.setCounter(tested, reachable.length, total);

        var spec = _mgtFindSpecByUID(genUID);
        if (!spec) { _mgtLog('General not found \u2014 stopping.'); done(); return; }

        var prevGrid = 0;
        try { prevGrid = spec.GetGarrisonGridIdx ? spec.GetGarrisonGridIdx() : 0; } catch (e) {}

        // Already standing here — skip without recording
        if (g === prevGrid) { setTimeout(testNext, 50); return; }

        // Send move command
        try {
            var armySpecTaskDef = swmmo.getDefinitionByName('Communication.VO::dStartSpecialistTaskVO');
            var task = new armySpecTaskDef();
            task.uniqueID  = spec.GetUniqueID();
            task.subTaskID = 0;
            game.gi.mCurrentCursor.mCurrentSpecialist = spec;
            game.gi.SendServerAction(95, 4, g, 0, task);
        } catch (e) {
            setTimeout(testNext, 100);
            return;
        }

        // Wait 1 second then check whether the general left its previous position
        setTimeout(function () {
            if (_mgtStop) { done(); return; }

            var s = _mgtFindSpecByUID(genUID);
            if (!s) { _mgtLog('General lost \u2014 stopping.'); done(); return; }

            var nowGrid = 0;
            try { nowGrid = s.GetGarrisonGridIdx ? s.GetGarrisonGridIdx() : 0; } catch (e) {}

            if (nowGrid !== prevGrid) {
                // Move accepted — wait for general to arrive and be fully idle
                _mgtUI.setStatus('Moving', '#4af');
                waitIdle(function (arrivedGrid) {
                    if (arrivedGrid > 0) {
                        reachable.push(arrivedGrid);
                        _mgtUI.setCounter(tested, reachable.length, total);
                        var axy = _mgtGridToXY(arrivedGrid);
                        _mgtLog('\u2713 G:' + arrivedGrid + ' x:' + axy.x + ' y:' + axy.y + ' \u2014 settling\u2026', '#6f6');
                    }
                    // Wait for general to be fully settled at garrison before next test
                    _mgtUI.setStatus('Settling\u2026', '#8af');
                    waitIdle(function () {
                        setTimeout(testNext, 200);
                    });
                });
            } else {
                // Rejected
                _mgtUI.setStatus('Rejected', '#888');
                setTimeout(testNext, 50);
            }
        }, 1000);
    }

    // Wait for the general to be idle before starting, in case it's already moving
    _mgtUI.setStatus('Waiting\u2026', '#8af');
    _mgtLog('Waiting for general to be idle before starting\u2026');
    if (meta.mode === 'sector') {
        _mgtLog('Testing ' + total + ' grids in sector ' + meta.sectorId);
    } else {
        _mgtLog('Testing ' + total + ' grids: x ' + meta.xFrom + '\u2013' + meta.xTo + ', y ' + meta.yFrom + '\u2013' + meta.yTo);
    }
    waitIdle(function () {
        if (_mgtStop) { done(); return; }
        _mgtLog('General is idle \u2014 starting test loop.');
        testNext();
    });
}

// ── Grid probe: dumps all AdditionalDataTSO constants + building/deposit ──

function _mgtProbeGrid(grid, genUID) {
    var xy = _mgtGridToXY(grid);
    _mgtLog('── Probe G:' + grid + ' (' + xy.x + ',' + xy.y + ') ──', '#8af');
    try {
        var cls = game.def('Map::AdditionalDataTSO');
        var ad  = game.zone.mStreetDataMap.mAdditionalData;

        // Known type-key properties on AdditionalDataTSO
        ['Sector', 'Fog'].forEach(function(name) {
            try {
                var key = cls[name];
                if (key === undefined || key === null) return;
                var val = ad.get(grid, key);
                _mgtLog('  ' + name + ': ' + val, '#adf');
            } catch (e) {}
        });

        // Building at this grid
        try {
            var bld = game.zone.mStreetDataMap.GetBuildingByGridPos(grid);
            if (bld) {
                var bname = bld.GetBuildingName_string();
                var blevel = '';
                try {
                    var goc = bld.GetGOContainer ? bld.GetGOContainer() : null;
                    if (goc && goc.buildingUpgradeBonuses_vector != null) {
                        blevel = ' Lv' + (bld.GetUpgradeLevel() + 1);
                    }
                } catch(e) {}
                var bactive = '';
                try { bactive = bld.IsProductionActive() ? ' [active]' : ' [idle]'; } catch(e) {}
                _mgtLog('  Building: ' + bname + blevel + bactive, '#bde');
            } else {
                _mgtLog('  Building: none', '#555');
            }
        } catch (e) { _mgtLog('  Building: error', '#f66'); }

        // Deposit at this grid
        try {
            var depArr = game.zone.mStreetDataMap.mDepositContainer.mContainer;
            var dep = null;
            if (depArr) {
                for (var di = 0; di < depArr.length; di++) {
                    if (depArr[di] && depArr[di].GetGrid() === grid) { dep = depArr[di]; break; }
                }
            }
            if (dep) {
                _mgtLog('  Deposit: ' + dep.GetName_string() + ' (' + dep.GetAmount() + ')', '#db8');
            } else {
                _mgtLog('  Deposit: none', '#555');
            }
        } catch (e) { _mgtLog('  Deposit: error', '#f66'); }

        // Specialists standing on this grid
        try {
            var specs = [];
            game.zone.GetSpecialists_vector().forEach(function(s) {
                try {
                    var sg = s.GetGarrisonGridIdx ? s.GetGarrisonGridIdx() : -1;
                    if (sg === grid) {
                        var sname = s.GetUniqueID().toKeyString();
                        try { sname = s.getName(false).replace(/<[^>]+>/g, ''); } catch(e) {}
                        specs.push(sname);
                    }
                } catch(e) {}
            });
            _mgtLog('  Specialists here: ' + (specs.length ? specs.join(', ') : 'none'),
                    specs.length ? '#ffc' : '#555');
        } catch (e) { _mgtLog('  Specialists: error', '#f66'); }

        // Pathfinder reachability from selected general
        if (genUID) {
            try {
                var spec = _mgtFindSpecByUID(genUID);
                if (spec) {
                    var fromGrid = spec.GetGarrisonGridIdx();
                    var pf = game.gi.mPathFinder.CalculatePath(fromGrid, grid, null, true);
                    var reachable = pf && pf.pathLenX10000 > 0;
                    _mgtLog('  Pathfinder (from G:' + fromGrid + '): ' +
                            (reachable ? 'reachable (len=' + pf.pathLenX10000 + ')' : 'NOT reachable'),
                            reachable ? '#6f6' : '#f66');
                }
            } catch (e) { _mgtLog('  Pathfinder: error ' + e, '#f66'); }
        }

    } catch (e) {
        _mgtLog('Probe failed: ' + e, '#f88');
    }
}

// ── Modal ──────────────────────────────────────────────────────────────────

function _mgtOpen() {
    $("div[role='dialog']:not(#mgtModal):visible").modal('hide');

    _mgtModal = new Modal('mgtModal', 'Move Grid Tester');
    _mgtModal.create();

    var $body   = _mgtModal.Body();
    var $footer = _mgtModal.Footer();
    $body.css({ 'padding': '10px', 'background': '#1e1e1e', 'color': '#ddd', 'min-width': '380px' });

    // ── General picker ──────────────────────────────────────────────────────
    var $genRow = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px', 'margin-bottom': '8px' });
    $('<span>').css({ 'color': '#aaa', 'font-size': '11px', 'flex-shrink': '0' }).text('General:').appendTo($genRow);
    var $genSel = $('<select>').attr('class', 'form-control input-sm').css({ 'font-size': '11px', 'flex': '1' });
    $('<option>').val('').text('\u2014 select \u2014').appendTo($genSel);
    var $refreshBtn = $('<button>').attr({ 'class': 'btn btn-xs btn-default', 'title': 'Refresh' })
        .css({ 'flex-shrink': '0' }).text('\u21bb');

    function fillGenerals() {
        var prev = $genSel.val();
        $genSel.empty();
        $('<option>').val('').text('\u2014 select \u2014').appendTo($genSel);
        _mgtGetGenerals().forEach(function (s) {
            var uid  = s.GetUniqueID().toKeyString();
            var name = uid;
            try { name = s.getName ? s.getName(false).replace(/<[^>]+>/g, '') : uid; } catch (e) {}
            var grid = 0;
            try { grid = s.GetGarrisonGridIdx ? s.GetGarrisonGridIdx() : 0; } catch (e) {}
            $('<option>').val(uid).text(name + (grid ? '  [' + grid + ']' : '')).prop('selected', uid === prev).appendTo($genSel);
        });
    }
    fillGenerals();
    $refreshBtn.on('click', fillGenerals);
    $genRow.append($genSel).append($refreshBtn);
    $body.append($genRow);

    // ── Mode toggle ────────────────────────────────────────────────────────
    function mkNum(val, w) {
        return $('<input>').attr({ 'type': 'number', 'class': 'form-control input-sm', 'min': '0' })
            .css({ 'width': w || '60px' }).val(val);
    }
    function mkLabel(txt) {
        return $('<span>').css({ 'color': '#888', 'font-size': '11px', 'flex-shrink': '0' }).text(txt);
    }

    var mgtMode = 'xy'; // 'xy' or 'sector'
    var $modeRow = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '5px', 'margin-bottom': '8px' });
    mkLabel('Search by:').appendTo($modeRow);
    var $modeXY  = $('<button>').attr('class', 'btn btn-xs btn-primary').text('X/Y range');
    var $modeSec = $('<button>').attr('class', 'btn btn-xs btn-default').text('Sector');
    $modeRow.append($modeXY).append($modeSec);
    $body.append($modeRow);

    // ── x/y bounding box section ───────────────────────────────────────────
    var $xySection = $('<div>');
    var $xyRow1 = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px', 'margin-bottom': '5px' });
    mkLabel('X from:').appendTo($xyRow1);
    var $xFrom = mkNum(0).appendTo($xyRow1);
    mkLabel('to:').appendTo($xyRow1);
    var $xTo   = mkNum(67).appendTo($xyRow1);
    $xySection.append($xyRow1);

    var $xyRow2 = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px' });
    mkLabel('Y from:').appendTo($xyRow2);
    var $yFrom = mkNum(0).appendTo($xyRow2);
    mkLabel('to:').appendTo($xyRow2);
    var $yTo   = mkNum(99).appendTo($xyRow2);
    $xySection.append($xyRow2);
    $body.append($xySection);

    // ── Sector section ─────────────────────────────────────────────────────
    var _mgtSectorGrids = {}; // sectorId -> [grids]
    var $secSection = $('<div>').hide();
    var $secRow = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '6px' });
    mkLabel('Sector:').appendTo($secRow);
    var $secSel = $('<select>').attr('class', 'form-control input-sm').css({ 'font-size': '11px', 'flex': '1' });
    $('<option>').val('').text('\u2014 scan first \u2014').appendTo($secSel);
    var $scanBtn = $('<button>').attr({ 'class': 'btn btn-xs btn-default', 'title': 'Scan sectors' }).text('Scan \u21bb');
    $secRow.append($secSel).append($scanBtn);
    $secSection.append($secRow);
    $body.append($secSection);

    $scanBtn.on('click', function () {
        $scanBtn.prop('disabled', true).text('Scanning\u2026');
        _mgtLog('Scanning sectors\u2026', '#8af');
        setTimeout(function () {
            try {
                _mgtSectorGrids = _mgtScanSectors(MGT_MAP_WIDTH * 200);
                var ids = Object.keys(_mgtSectorGrids).sort(function (a, b) { return (+a) - (+b); });
                $secSel.empty();
                $('<option>').val('').text('\u2014 select sector \u2014').appendTo($secSel);
                ids.forEach(function (sid) {
                    $('<option>').val(sid).text('Sector ' + sid + '  (' + _mgtSectorGrids[sid].length + ' grids)').appendTo($secSel);
                });
                _mgtLog('Found ' + ids.length + ' sectors.', '#6f6');
            } catch (e) {
                _mgtLog('Scan error: ' + e, '#f88');
            }
            $scanBtn.prop('disabled', false).text('Scan \u21bb');
        }, 10);
    });

    // Mode switch
    $modeXY.on('click', function () {
        mgtMode = 'xy';
        $modeXY.removeClass('btn-default').addClass('btn-primary');
        $modeSec.removeClass('btn-primary').addClass('btn-default');
        $xySection.show();
        $secSection.hide();
    });
    $modeSec.on('click', function () {
        mgtMode = 'sector';
        $modeSec.removeClass('btn-default').addClass('btn-primary');
        $modeXY.removeClass('btn-primary').addClass('btn-default');
        $secSection.show();
        $xySection.hide();
    });

    // spacer
    $body.append($('<div>').css('margin-bottom', '10px'));

    // ── Status panel ────────────────────────────────────────────────────────
    var $statusPanel = $('<div>').css({
        'background': '#111', 'border': '1px solid #3a3a3a', 'border-radius': '5px',
        'padding': '8px 12px', 'margin-bottom': '8px'
    });

    // Row 0: general name
    var $genNameRow = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '5px', 'margin-bottom': '6px' });
    $('<span>').css({ 'font-size': '10px', 'color': '#666' }).text('General:').appendTo($genNameRow);
    var $genNameVal = $('<span>').css({ 'font-size': '11px', 'font-weight': 'bold', 'color': '#bde' }).text('\u2014');
    $genNameRow.append($genNameVal);
    $statusPanel.append($genNameRow);

    // Row 1: current grid (large) + status badge
    var $row1 = $('<div>').css({
        'display': 'flex', 'align-items': 'center',
        'justify-content': 'space-between', 'margin-bottom': '6px'
    });
    var $gridBlock = $('<div>').css({ 'display': 'flex', 'flex-direction': 'column', 'gap': '1px' });
    $('<span>').css({ 'font-size': '10px', 'color': '#666' }).text('Grid (x, y)').appendTo($gridBlock);
    var $gridVal = $('<span>').css({
        'font-size': '26px', 'font-weight': 'bold', 'color': '#fff',
        'letter-spacing': '2px', 'font-family': 'monospace', 'line-height': '1'
    }).text('\u2014');
    $gridBlock.append($gridVal);
    var $statusBadge = $('<span>').css({
        'font-size': '12px', 'font-weight': 'bold', 'padding': '3px 12px',
        'border-radius': '12px', 'background': '#2a2a2a', 'color': '#888',
        'border': '1px solid #444'
    }).text('Idle');
    $row1.append($gridBlock).append($statusBadge);
    $statusPanel.append($row1);

    // Row 2: progress bar
    var $barOuter = $('<div>').css({
        'height': '6px', 'background': '#2a2a2a', 'border-radius': '3px',
        'overflow': 'hidden', 'margin-bottom': '7px'
    });
    var $barFill = $('<div>').css({
        'height': '100%', 'width': '0%',
        'background': 'linear-gradient(90deg, #1a8a4a, #3cf)',
        'border-radius': '3px', 'transition': 'width 0.2s'
    });
    $barOuter.append($barFill);
    $statusPanel.append($barOuter);

    // Row 3: counters
    var $counters = $('<div>').css({ 'display': 'flex', 'gap': '18px', 'font-size': '11px' });
    var $cTested = $('<span>').css('color', '#aaa').html('<b style="color:#ddd">0</b> tested');
    var $cFound  = $('<span>').css('color', '#aaa').html('<b style="color:#6f6">0</b> reachable');
    var $cTotal  = $('<span>').css('color', '#555').text('/ 0 total');
    $counters.append($cTested).append($cFound).append($cTotal);
    $statusPanel.append($counters);
    $body.append($statusPanel);

    // Wire UI callbacks
    _mgtUI.setGrid    = function (g) { $gridVal.text(g); };
    _mgtUI.setGeneral = function (name) { $genNameVal.text(name); };
    _mgtUI.setStatus  = function (txt, col) {
        $statusBadge.text(txt).css({ 'color': col || '#aaa', 'border-color': col || '#444' });
    };
    _mgtUI.setBar    = function (pct) { $barFill.css('width', Math.min(100, Math.round(pct * 100)) + '%'); };
    _mgtUI.setCounter = function (t, f, total) {
        $cTested.html('<b style="color:#ddd">' + t + '</b> tested');
        $cFound.html('<b style="color:#6f6">'  + f + '</b> reachable');
        $cTotal.text('/ ' + total + ' total');
    };

    // ── Log ──────────────────────────────────────────────────────────────────
    $('<div>').css({ 'font-size': '10px', 'color': '#555', 'margin-bottom': '3px' }).text('Log').appendTo($body);
    _mgtLogEl = $('<div>').css({
        'height': '180px', 'overflow-y': 'auto', 'background': '#0b0b0b',
        'border': '1px solid #333', 'border-radius': '3px',
        'padding': '4px 7px', 'font-family': 'monospace'
    });
    $body.append(_mgtLogEl);

    // ── Quick Move ───────────────────────────────────────────────────────────
    $('<div>').css({ 'font-size': '10px', 'color': '#555', 'margin': '8px 0 3px' }).text('Quick Move').appendTo($body);
    var $qmRow = $('<div>').css({ 'display': 'flex', 'align-items': 'center', 'gap': '5px', 'flex-wrap': 'wrap' });
    $('<span>').css({ 'color': '#888', 'font-size': '11px' }).text('G:').appendTo($qmRow);
    var $qmG = $('<input>').attr({ 'type': 'number', 'class': 'form-control input-sm', 'min': '0', 'placeholder': 'grid' })
        .css({ 'width': '68px' }).appendTo($qmRow);
    $('<span>').css({ 'color': '#555', 'font-size': '11px' }).text('or').appendTo($qmRow);
    $('<span>').css({ 'color': '#888', 'font-size': '11px' }).text('x:').appendTo($qmRow);
    var $qmX = $('<input>').attr({ 'type': 'number', 'class': 'form-control input-sm', 'min': '0', 'max': '67', 'placeholder': '0' })
        .css({ 'width': '52px' }).appendTo($qmRow);
    $('<span>').css({ 'color': '#888', 'font-size': '11px' }).text('y:').appendTo($qmRow);
    var $qmY = $('<input>').attr({ 'type': 'number', 'class': 'form-control input-sm', 'min': '0', 'placeholder': '0' })
        .css({ 'width': '52px' }).appendTo($qmRow);
    var $qmBtn   = $('<button>').attr('class', 'btn btn-sm btn-info').css({ 'min-width': '50px' }).text('Go');
    var $probeBtn = $('<button>').attr('class', 'btn btn-sm btn-default').css({ 'min-width': '60px' }).text('Probe');
    $qmRow.append($qmBtn).append($probeBtn);
    $body.append($qmRow);

    // Sync G <-> x/y
    $qmG.on('input', function () {
        var g = parseInt($qmG.val(), 10);
        if (!isNaN(g)) { $qmX.val(g % MGT_MAP_WIDTH); $qmY.val(Math.floor(g / MGT_MAP_WIDTH)); }
    });
    function qmXYtoG() {
        var x = parseInt($qmX.val(), 10), y = parseInt($qmY.val(), 10);
        if (!isNaN(x) && !isNaN(y)) { $qmG.val(y * MGT_MAP_WIDTH + x); }
    }
    $qmX.on('input', qmXYtoG);
    $qmY.on('input', qmXYtoG);

    $qmBtn.on('click', function () {
        var uid = $genSel.val();
        if (!uid) { _mgtLog('Select a general first.', '#f88'); return; }
        var g = parseInt($qmG.val(), 10);
        if (isNaN(g) || g < 0) { _mgtLog('Enter a valid grid / x / y.', '#f88'); return; }
        var spec = _mgtFindSpecByUID(uid);
        if (!spec) { _mgtLog('General not found.', '#f88'); return; }
        try {
            var xy = _mgtGridToXY(g);
            var armySpecTaskDef = swmmo.getDefinitionByName('Communication.VO::dStartSpecialistTaskVO');
            var task = new armySpecTaskDef();
            task.uniqueID  = spec.GetUniqueID();
            task.subTaskID = 0;
            game.gi.mCurrentCursor.mCurrentSpecialist = spec;
            game.gi.SendServerAction(95, 4, g, 0, task);
            _mgtLog('Move sent \u2192 G:' + g + ' (' + xy.x + ',' + xy.y + ')', '#4af');
        } catch (e) {
            _mgtLog('Move error: ' + e, '#f88');
        }
    });

    $probeBtn.on('click', function () {
        var g = parseInt($qmG.val(), 10);
        if (isNaN(g) || g < 0) { _mgtLog('Enter a valid grid / x / y.', '#f88'); return; }
        _mgtProbeGrid(g, $genSel.val() || null);
    });

    // ── Footer ───────────────────────────────────────────────────────────────
    var $startBtn = $('<button>').attr('class', 'btn btn-sm btn-success')
        .css({ 'font-weight': 'bold', 'min-width': '80px' }).text('\u25b6 Start');
    var $stopBtn  = $('<button>').attr('class', 'btn btn-sm btn-danger')
        .css({ 'min-width': '70px' }).text('\u25a0 Stop').prop('disabled', true);
    var $clearBtn = $('<button>').attr('class', 'btn btn-sm btn-default').text('Clear log');

    $startBtn.on('click', function () {
        if (_mgtRunning) { return; }
        var uid = $genSel.val();
        if (!uid) { _mgtLog('Select a general first.', '#f88'); return; }

        var grids, meta;
        if (mgtMode === 'sector') {
            var sid = $secSel.val();
            if (!sid) { _mgtLog('Select a sector (scan first if needed).', '#f88'); return; }
            grids = _mgtSectorGrids[sid];
            if (!grids || !grids.length) { _mgtLog('No grids found for sector ' + sid + '.', '#f88'); return; }
            meta = { mode: 'sector', sectorId: +sid };
        } else {
            var xf = parseInt($xFrom.val(), 10);
            var xt = parseInt($xTo.val(),   10);
            var yf = parseInt($yFrom.val(), 10);
            var yt = parseInt($yTo.val(),   10);
            if (isNaN(xf)||isNaN(xt)||isNaN(yf)||isNaN(yt)||xt<xf||yt<yf) {
                _mgtLog('Invalid x/y range.', '#f88'); return;
            }
            grids = [];
            for (var gy = yf; gy <= yt; gy++) {
                for (var gx = xf; gx <= xt; gx++) { grids.push(gy * MGT_MAP_WIDTH + gx); }
            }
            meta = { mode: 'xy', xFrom: xf, xTo: xt, yFrom: yf, yTo: yt };
        }
        _mgtUI.setStatus('Starting', '#fa0');
        _mgtUI.setBar(0);
        _mgtUI.setCounter(0, 0, grids.length);
        _mgtRun(uid, grids, meta, $startBtn, $stopBtn, $pauseBtn);
    });

    var $pauseBtn = $('<button>').attr('class', 'btn btn-sm btn-warning')
        .css({ 'min-width': '85px' }).text('\u23f8 Pause').prop('disabled', true);
    $pauseBtn.on('click', function () {
        if (_mgtPause) {
            _mgtPause = false;
            $pauseBtn.text('\u23f8 Pause').removeClass('btn-success').addClass('btn-warning');
            _mgtUI.setStatus('Testing', '#fa0');
            _mgtLog('Resumed.', '#fa0');
        } else {
            _mgtPause = true;
            $pauseBtn.text('\u25b6 Resume').removeClass('btn-warning').addClass('btn-success');
            _mgtLog('Pausing after current grid\u2026', '#f90');
        }
    });

    $stopBtn.on('click', function () {
        _mgtStop  = true;
        _mgtPause = false;
        _mgtUI.setStatus('Stopping\u2026', '#f84');
        _mgtLog('Stop requested\u2026', '#f84');
    });

    $clearBtn.on('click', function () { if (_mgtLogEl) { _mgtLogEl.empty(); } });

    var $minBtn = $('<button>').attr('class', 'btn btn-sm btn-default').text('[\u2212]');
    $minBtn.on('click', function () {
        if ($body.is(':visible')) {
            $body.hide();
            $('.modal-backdrop').hide();
            $('#mgtModal').css({ 'pointer-events': 'none', 'overflow': 'hidden' });
            $('#mgtModal .modal-dialog').css({ 'pointer-events': 'auto' });
            $('#mgtModal .modal-footer').css({ 'border-top': '1px solid #333' });
            $('#mgtMiniLog').show();
            $minBtn.text('[\u25a1]');
        } else {
            $body.show();
            $('.modal-backdrop').show();
            $('#mgtModal').css({ 'pointer-events': '', 'overflow': '' });
            $('#mgtMiniLog').hide();
            $minBtn.text('[\u2212]');
        }
    });

    // Mini log strip shown in footer when minimized
    var $miniLog = $('<div>').attr('id', 'mgtMiniLog').css({
        'display': 'none', 'width': '100%', 'margin-top': '4px',
        'padding': '3px 8px', 'background': '#0d0d0d', 'max-height': '80px',
        'overflow-y': 'auto', 'border': '1px solid #2a2a2a',
        'border-radius': '4px', 'clear': 'both', 'font-family': 'monospace',
        'font-size': '11px', 'color': '#aaa'
    });
    // Keep mini log in sync: override _mgtLog to also write to mini log
    var _origMgtLog = _mgtLog;
    _mgtLog = function (msg, color) {
        _origMgtLog(msg, color);
        var mini = $('<div>').css('color', color || '#aaa').text(msg);
        $miniLog.append(mini);
        var el = $miniLog[0];
        if (el) { el.scrollTop = el.scrollHeight; }
    };

    $footer.prepend([$startBtn, $stopBtn, $pauseBtn, $clearBtn, $minBtn]);
    $footer.append($miniLog);
    _mgtModal.show();
}

// ── Register ───────────────────────────────────────────────────────────────
try { addToolsMenuItem('Move Grid Tester', _mgtOpen); } catch (e) {}

})();
