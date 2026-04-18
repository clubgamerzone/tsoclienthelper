// ========== FRIEND ISLAND BUILDING FINDER ==========
// Search for buildings by name on any visited zone (home or friend island).
// Tools menu > "Building Finder"

(function () {

// ---- Language ----
var _fbfLang = {
    'en-uk': {
        'title':       'Building Finder',
        'search':      'Search building name...',
        'colName':     'Building',
        'colLevel':    'Lvl',
        'colGrid':     'Grid',
        'noResults':   'No buildings found.',
        'goTo':        'Go',
        'searchBtn':   'Search',
    },
    'pt-br': {
        'title':       'Buscador de Edifícios',
        'search':      'Buscar nome do edifício...',
        'colName':     'Edifício',
        'colLevel':    'Nív',
        'colGrid':     'Grid',
        'noResults':   'Nenhum edifício encontrado.',
        'goTo':        'Ir',
        'searchBtn':   'Buscar',
    },
    'de-de': {
        'title':       'Gebäude-Suche',
        'search':      'Gebäudename suchen...',
        'colName':     'Gebäude',
        'colLevel':    'Stufe',
        'colGrid':     'Grid',
        'noResults':   'Keine Gebäude gefunden.',
        'goTo':        'Gehe',
        'searchBtn':   'Suchen',
    },
    'es-es': {
        'title':       'Buscador de Edificios',
        'search':      'Buscar nombre del edificio...',
        'colName':     'Edificio',
        'colLevel':    'Niv',
        'colGrid':     'Grid',
        'noResults':   'No se encontraron edificios.',
        'goTo':        'Ir',
        'searchBtn':   'Buscar',
    },
    'fr-fr': {
        'title':       'Recherche de bâtiments',
        'search':      'Rechercher un bâtiment...',
        'colName':     'Bâtiment',
        'colLevel':    'Niv',
        'colGrid':     'Grid',
        'noResults':   'Aucun bâtiment trouvé.',
        'goTo':        'Aller',
        'searchBtn':   'Chercher',
    },
    'pl-pl': {
        'title':       'Wyszukiwarka budynków',
        'search':      'Szukaj nazwy budynku...',
        'colName':     'Budynek',
        'colLevel':    'Poz',
        'colGrid':     'Grid',
        'noResults':   'Nie znaleziono budynków.',
        'goTo':        'Idź',
        'searchBtn':   'Szukaj',
    }
};
extendBaseLang(_fbfLang, 'fbf');

function _fbfT(key) { return getText(key, 'fbf'); }

// ---- Menu registration ----
addToolsMenuItem(_fbfT('title'), _fbfMenuHandler);

var _fbfModalInit = false;

// ---- Open modal ----
function _fbfMenuHandler() {
    $("div[role='dialog']:not(#fbfModal):visible").modal('hide');

    if (!_fbfModalInit) {
        $('#fbfModal').remove();
    }

    try {
        if ($('#fbfModal').length === 0) {
            $('<style id="fbfStyle">').text(
                '#fbfModal .row:hover { background-color: #A65329; }' +
                '#fbfResultsBody { max-height: 420px; overflow-y: auto; }'
            ).appendTo('head');

            createModalWindow('fbfModal', _fbfT('title'));

            $('#fbfModal .modal-header').append(
                '<div class="container-fluid" style="margin-top:6px">' +
                    '<div class="row" style="margin-bottom:4px">' +
                        '<div class="col-xs-9">' +
                            $('<input>', {
                                type: 'text',
                                id: 'fbfSearchInput',
                                'class': 'form-control',
                                placeholder: _fbfT('search'),
                                autocomplete: 'off'
                            }).prop('outerHTML') +
                        '</div>' +
                        '<div class="col-xs-3">' +
                            $('<button>', {
                                id: 'fbfSearchBtn',
                                'class': 'btn btn-success'
                            }).text(_fbfT('searchBtn')).prop('outerHTML') +
                        '</div>' +
                    '</div>' +
                    createTableRow([
                        [6, _fbfT('colName')],
                        [2, _fbfT('colLevel')],
                        [2, _fbfT('colGrid')],
                        [2, '']
                    ], true) +
                '</div>'
            );

            $('#fbfSearchBtn').click(_fbfDoSearch);
            $('#fbfSearchInput').keyup(function (e) {
                if (e.key === 'Enter') _fbfDoSearch();
            });

            _fbfModalInit = true;
        }

        _fbfDoSearch();
    } catch (e) {}

    $('#fbfModal:not(:visible)').modal({ backdrop: false });
}

// ---- Collect and render results ----
function _fbfDoSearch() {
    try {
        var query = ($('#fbfSearchInput').val() || '').trim().toUpperCase();
        var results = [];

        swmmo.application.mGameInterface.mCurrentPlayerZone
            .mStreetDataMap.mBuildingContainer.forEach(function (bld) {
                try {
                    var key  = bld.GetBuildingName_string();
                    var name = loca.GetText('BUI', key);
                    if (!name || name.indexOf('undefined') !== -1) return;

                    if (query && name.toUpperCase().indexOf(query) === -1) return;

                    var grid  = bld.GetGrid();
                    var level = '';
                    try { level = bld.GetUIUpgradeLevel(); } catch (e2) {}

                    results.push({ name: name, grid: grid, level: level });
                } catch (e2) {}
            });

        results.sort(function (a, b) {
            var cmp = a.name.toUpperCase().localeCompare(b.name.toUpperCase());
            return cmp !== 0 ? cmp : a.grid - b.grid;
        });

        var out = '';
        if (results.length === 0) {
            out = '<div class="container-fluid"><div class="row" style="padding:8px">' +
                  _fbfT('noResults') + '</div></div>';
        } else {
            var rows = '';
            results.forEach(function (r) {
                var goBtn = $('<button>', {
                    'class': 'btn btn-xs btn-primary fbfGoBtn',
                    'data-grid': r.grid,
                    'style': 'cursor:pointer'
                }).text(_fbfT('goTo')).prop('outerHTML');

                rows += createTableRow([
                    [6, r.name],
                    [2, r.level],
                    [2, r.grid],
                    [2, goBtn]
                ], false);
            });
            out = '<div class="container-fluid">' + rows + '</div>';
        }

        $('#fbfModal .modal-body').html(
            '<div id="fbfResultsBody">' + out + '</div>'
        );

        $('#fbfResultsBody .fbfGoBtn').click(_fbfGoToBuilding);
    } catch (e) {}
}

// ---- Scroll map to building and select it ----
function _fbfGoToBuilding(e) {
    try {
        var grid = parseInt($(this).attr('data-grid'));
        var zone = swmmo.application.mGameInterface.mCurrentPlayerZone;
        zone.ScrollToGrid(grid);
        try {
            var bld = zone.mStreetDataMap.GetBuildingByGridPos(grid);
            if (bld) game.gi.SelectBuilding(bld);
        } catch (e2) {}
    } catch (e) {}
}

})();
