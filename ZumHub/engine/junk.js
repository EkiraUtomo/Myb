var ZumJunk = (function() {

    function rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function randHex(len) {
        return '_0x' + Math.floor(Math.random() * Math.pow(16, len || 5)).toString(16).padStart(len || 5, '0');
    }

    function junkMath() {
        var exprs = [
            'local ' + randHex() + ' = ((' + rand(1,99) + ' * ' + rand(1,99) + ') + ' + rand(1,500) + ') % ' + rand(7,97) + ';',
            'local ' + randHex() + ' = math.floor(math.sqrt(' + rand(100,9999) + ') + ' + rand(1,100) + ');',
            'local ' + randHex() + ' = ((' + rand(2,9) + ' ^ ' + rand(2,5) + ') - ' + rand(1,30) + ') * ' + rand(1,10) + ';',
            'local ' + randHex() + ' = math.abs(' + rand(1,999) + ' - ' + rand(1000,9999) + ') + ' + rand(1,100) + ';',
            'local ' + randHex() + ' = math.max(' + rand(1,50) + ', math.min(' + rand(50,100) + ', ' + rand(1,200) + '));',
        ];
        return exprs[Math.floor(Math.random() * exprs.length)];
    }

    function fakeFunctionCall() {
        var names = [randHex(), randHex(), randHex()];
        var args = rand(1,99) + ', \"' + randHex(4) + '\", ' + (Math.random() > 0.5 ? 'true' : 'false');
        var fns = [
            'local function ' + names[0] + '(' + names[1] + ', ' + names[2] + ') local ' + randHex() + ' = ' + names[1] + ' + ' + names[2] + '; return ' + randHex() + ' end;',
            '-- ' + randHex() + ': 0x' + rand(0, 0xFFFF).toString(16),
            'local ' + names[0] + ' = function(' + names[1] + ') return ' + names[1] + ' end;',
        ];
        return fns[Math.floor(Math.random() * fns.length)];
    }

    function fakeIfElse() {
        var traps = [
            'if ' + rand(1,50) + ' > ' + rand(51,100) + ' then error("unreachable ' + randHex(3) + '") end',
            'if false then local ' + randHex() + ' = ' + rand(1,999) + '; end',
            'if (' + rand(2,9) + ' * ' + rand(2,9) + ') == ' + (rand(2,9) * rand(2,9) + 1) + ' then return end',
            'if type(nil) == "number" then error("trap") end',
            'if ' + rand(0,0) + ' ~= 0 then while true do end end',
        ];
        return traps[Math.floor(Math.random() * traps.length)];
    }

    function infiniteLoopTrap() {
        var traps = [
            'while ' + rand(1,999) + ' > ' + rand(1000,9999) + ' do task.wait() end',
            'repeat task.wait() until ' + rand(1,50) + ' > ' + rand(51,999),
            'for ' + randHex() + ' = 1, 0 do end',
        ];
        return traps[Math.floor(Math.random() * traps.length)];
    }

    function fakeRecursive() {
        var fn = randHex();
        var arg = randHex();
        return [
            'local ' + fn + ';',
            fn + ' = function(' + arg + ')',
            '    if ' + arg + ' <= 0 then return ' + rand(1,99) + ' end',
            '    return ' + fn + '(' + arg + ' - 1)',
            'end',
        ].join('\n');
    }

    function fakeBytecodeComment() {
        var bytes = [];
        for (var i = 0; i < rand(6,14); i++) bytes.push('0x' + rand(0,255).toString(16).padStart(2,'0'));
        return '-- .bc: [' + bytes.join(' ') + '] ;; ' + randHex(4);
    }

    function fakeTableLookup() {
        var tbl = randHex();
        var key = randHex(3);
        var keys = [];
        for (var i = 0; i < rand(3,7); i++) {
            keys.push('[\"' + randHex(3) + '\"] = ' + rand(1,9999));
        }
        return 'local ' + tbl + ' = {' + keys.join(', ') + '}; local ' + randHex() + ' = ' + tbl + '["' + key + '"] or ' + rand(0,0) + ';';
    }

    function wrapInFunction(block, name) {
        name = name || randHex();
        return [
            'local function ' + name + '()',
            block.split('\n').map(function(l) { return '    ' + l; }).join('\n'),
            'end',
            name + '()'
        ].join('\n');
    }

    function injectJunk(code, density, options) {
        density = density || 3;
        options = options || {};

        var lines = code.split('\n');
        var result = [];

        for (var i = 0; i < lines.length; i++) {
            result.push(lines[i]);

            if (Math.random() < (density / 10)) {
                var which = Math.floor(Math.random() * 7);

                if (which === 0 && options.junkMath !== false) result.push(junkMath());
                else if (which === 1 && options.fakeFn !== false) result.push(fakeFunctionCall());
                else if (which === 2 && options.fakeIf !== false) result.push(fakeIfElse());
                else if (which === 3 && options.loopTrap !== false) result.push(infiniteLoopTrap());
                else if (which === 4 && options.fakeRec !== false) result.push(fakeRecursive());
                else if (which === 5 && options.bytecodeComment !== false) result.push(fakeBytecodeComment());
                else if (which === 6 && options.fakeTable !== false) result.push(fakeTableLookup());
            }
        }

        return result.join('\n');
    }

    function shuffleTopLevel(code) {
        var blocks = [];
        var current = [];
        var depth = 0;
        var lines = code.split('\n');

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (/^(function|local function|if|for|while|repeat|do)\b/.test(line)) depth++;
            if (/^(end|until)\b/.test(line)) depth--;

            current.push(lines[i]);

            if (depth <= 0 && current.length > 0 && (line === 'end' || line === '' || i === lines.length - 1)) {
                if (current.join('').trim()) blocks.push(current.join('\n'));
                current = [];
                depth = 0;
            }
        }

        var localBlocks = [], execBlocks = [];
        blocks.forEach(function(b) {
            if (/^\s*local /.test(b) && !b.includes('\n')) localBlocks.push(b);
            else execBlocks.push(b);
        });

        for (var i = execBlocks.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = execBlocks[i];
            execBlocks[i] = execBlocks[j];
            execBlocks[j] = tmp;
        }

        return localBlocks.concat(execBlocks).join('\n');
    }

    return {
        junkMath, fakeFunctionCall, fakeIfElse,
        infiniteLoopTrap, fakeRecursive,
        fakeBytecodeComment, fakeTableLookup,
        wrapInFunction, injectJunk, shuffleTopLevel
    };
})();
