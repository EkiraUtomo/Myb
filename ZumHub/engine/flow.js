var ZumFlow = (function() {

    function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
    function randHex(l) { return '_0x' + Math.floor(Math.random() * Math.pow(16, l||5)).toString(16).padStart(l||5,'0'); }

    function obfuscateNumbers(code) {
        return code.replace(/\b(\d+)\b/g, function(match, num) {
            var n = parseInt(num);
            if (n === 0 || n > 99999) return match;
            var r = Math.random();
            if (r < 0.33) {
                var a = rand(1, Math.max(1, n - 1));
                return '(' + a + ' + ' + (n - a) + ')';
            } else if (r < 0.66) {
                var a = rand(1, 99);
                return '(' + (n + a) + ' - ' + a + ')';
            } else {
                return '((' + (n * 2) + ') / 2)';
            }
        });
    }

    function flattenToDispatch(code) {
        var lines = code.split('\n').filter(function(l) { return l.trim(); });
        var stateVar = randHex();
        var dispatchVar = randHex();
        var n = lines.length;

        var order = [];
        for (var i = 0; i < n; i++) order.push(i);
        for (var i = order.length - 1; i > 0; i--) {
            var j = rand(0, i);
            var tmp = order[i]; order[i] = order[j]; order[j] = tmp;
        }

        var nextMap = {};
        for (var i = 0; i < order.length - 1; i++) nextMap[order[i]] = order[i+1];

        var cases = [];
        for (var i = 0; i < n; i++) {
            cases.push(
                '    if ' + stateVar + ' == ' + i + ' then\n' +
                '        ' + lines[i] + '\n' +
                (nextMap[i] !== undefined ? '        ' + stateVar + ' = ' + nextMap[i] + '\n' : '') +
                '    end'
            );
        }

        return [
            'local ' + stateVar + ' = ' + order[0],
            'while ' + stateVar + ' ~= nil do',
            cases.join('\n    else\n'),
            '    ' + stateVar + ' = nil',
            'end'
        ].join('\n');
    }

    function wrapAllInFunctions(code) {
        var fn = randHex();
        return 'local function ' + fn + '()\n' +
            code.split('\n').map(function(l) { return '    ' + l; }).join('\n') +
            '\nend\n' + fn + '()';
    }

    function insertGotoJumps(code) {
        var lines = code.split('\n');
        var result = [];
        for (var i = 0; i < lines.length; i++) {
            if (Math.random() < 0.15 && !lines[i].trim().startsWith('--')) {
                var lbl = randHex(4);
                result.push('do');
                result.push(lines[i]);
                result.push('end');
            } else {
                result.push(lines[i]);
            }
        }
        return result.join('\n');
    }

    function obfuscateBooleans(code) {
        code = code.replace(/\btrue\b/g, function() {
            return ['(1 == 1)', '(not false)', '(not (1 > 2))'][rand(0,2)];
        });
        code = code.replace(/\bfalse\b/g, function() {
            return ['(1 == 2)', '(not true)', '(not (1 == 1))'][rand(0,2)];
        });
        return code;
    }

    function obfuscateStrings(code, method) {
        return code.replace(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/g, function(match) {
            var inner = match.slice(1, -1);
            if (inner.length === 0) return match;
            var hexStr = '';
            for (var i = 0; i < inner.length; i++) {
                hexStr += '\\' + inner.charCodeAt(i);
            }
            return '"' + hexStr + '"';
        });
    }

    return {
        obfuscateNumbers,
        flattenToDispatch,
        wrapAllInFunctions,
        insertGotoJumps,
        obfuscateBooleans,
        obfuscateStrings
    };
})();
