var ZumAntiTamper = (function() {

    function rand(a,b) { return Math.floor(Math.random() * (b-a+1)) + a; }
    function randHex(l) { return '_0x' + Math.floor(Math.random() * Math.pow(16,l||5)).toString(16).padStart(l||5,'0'); }

    function buildAntiTamperHeader(options) {
        options = options || {};
        var lines = [];
        var checksum = randHex(), startTime = randHex(), elapsed = randHex();
        var env = randHex(), src = randHex(), hash = randHex();

        lines.push('-- [antitamper] ' + randHex(4));

        if (options.antiDebug !== false) {
            lines.push('local ' + startTime + ' = tick()');
            lines.push('task.defer(function()');
            lines.push('    while true do');
            lines.push('        local ' + elapsed + ' = tick() - ' + startTime);
            lines.push('        if debug and debug.getinfo then');
            lines.push('            game:GetService("Players").LocalPlayer:Kick("integrity violation")');
            lines.push('        end');
            lines.push('        task.wait(' + (rand(5,15) / 10).toFixed(1) + ')');
            lines.push('    end');
            lines.push('end)');
        }

        if (options.envCheck !== false) {
            lines.push('local ' + env + ' = getfenv and getfenv(1) or {}');
            lines.push('if type(' + env + ') ~= "table" then');
            lines.push('    error("' + randHex(4) + '")');
            lines.push('end');
        }

        if (options.sourceCheck !== false) {
            lines.push('if script and script.Source and #script.Source > 0 then');
            lines.push('    local ' + src + ' = script.Source');
            lines.push('    if string.find(' + src + ', "deobfuscate") or string.find(' + src + ', "hookfunction") then');
            lines.push('        error("' + randHex(4) + '")');
            lines.push('    end');
            lines.push('end');
        }

        if (options.hookCheck !== false) {
            lines.push('if hookfunction or hookmetamethod or replaceclosure then');
            lines.push('    game:GetService("Players").LocalPlayer:Kick("' + randHex(3) + '")');
            lines.push('end');
        }

        if (options.integrityLoop !== false) {
            var loopKey = randHex(3);
            lines.push('local ' + checksum + ' = ' + rand(10000,99999));
            lines.push('task.spawn(function()');
            lines.push('    while true do');
            lines.push('        if ' + checksum + ' ~= ' + rand(10000,99999) + ' then break end');
            lines.push('        task.wait(' + rand(30,120) + ')');
            lines.push('    end');
            lines.push('end)');
        }

        return lines.join('\n');
    }

    function compressToOneLine(code) {
        var result = code
            .replace(/--[^\n]*/g, '')
            .replace(/\n+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
        return result;
    }

    function addWatermark(code) {
        var watermarkLine = '-- DoggoJr Is Here';
        var hiddenWatermark = 'local ' + randHex() + ' = \"DoggoJr Is Here\"';
        return watermarkLine + '\n' + hiddenWatermark + '\n' + code;
    }

    function buildOutputPad(code, targetKb) {
        if (!targetKb || targetKb <= 0) return code;
        var targetBytes = targetKb * 1024;
        var currentSize = new TextEncoder().encode(code).length;
        if (currentSize >= targetBytes) return code;

        var needed = targetBytes - currentSize;
        var padLines = [];
        while (new TextEncoder().encode(padLines.join('\n')).length < needed) {
            var padFn = randHex();
            var padArg = randHex();
            var padLocal = randHex();
            padLines.push(
                'local function ' + padFn + '(' + padArg + ') ' +
                'local ' + padLocal + ' = ' + padArg + ' * ' + rand(1,999) + ' + ' + rand(1,999) + '; ' +
                'return ' + padLocal + ' end -- ' + randHex(4)
            );
        }

        return code + '\n' + padLines.join('\n');
    }

    return { buildAntiTamperHeader, compressToOneLine, addWatermark, buildOutputPad };
})();
