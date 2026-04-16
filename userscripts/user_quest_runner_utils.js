// ========== QUEST RUNNER UTILITIES
// Shared army helper functions used by user_quest_runner.js (and any other script that needs them).
// Exposed as window._qrUtils so they are accessible from any userscript.

(function () {

    window._qrUtils = window._qrUtils || {};

    /**
     * Unload ALL units from an array of specialist specs simultaneously,
     * then poll until every general confirms HasUnits() === false (or 30s timeout).
     *
     * @param {Array}    specs  - array of specialist spec objects (already resolved, may contain nulls — they are skipped)
     * @param {Function} onDone - called when all are confirmed empty (or timed out)
     */
    window._qrUtils.unloadAll = function (specs, onDone) {
        var validSpecs = (specs || []).filter(function (s) { return s && s.CreateSpecialistVOFromSpecialist; });
        if (validSpecs.length === 0) { onDone(); return; }

        // Fire unload for every general simultaneously (empty unitSquads = unload all)
        validSpecs.forEach(function (spec) {
            try {
                var vo = new dRaiseArmyVODef();
                vo.armyHolderSpecialistVO = spec.CreateSpecialistVOFromSpecialist();
                // unitSquads intentionally left empty
                game.gi.mClientMessages.SendMessagetoServer(1031, game.gi.mCurrentViewedZoneID, vo, armyResponder);
            } catch (e) {}
        });

        // Poll every 2s until all generals have no units, timeout after 30s (15 ticks)
        var ticks = 0;
        var iv = setInterval(function () {
            ticks++;
            var allEmpty = validSpecs.every(function (spec) {
                try { return !spec.HasUnits || !spec.HasUnits(); } catch (e) { return true; }
            });
            if (allEmpty || ticks > 15) {
                clearInterval(iv);
                onDone();
            }
        }, 2000);
    };

})();
