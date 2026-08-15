var ZumMangle = (function() {

    var _usedNames = new Set();

    function reset() { _usedNames = new Set(); }

    function hexName() {
        var n;
        do {
            n = '_0x' + Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6,'0');
        } while (_usedNames.has(n));
        _usedNames.add(n);
        return n;
    }

    var _unicodeLike = ['ℓ','ℊ','ℴ','ℬ','ℰ','ℳ','ℛ','ℭ','ℌ','ℑ','ℜ','ℨ'];

    function unicodeName() {
        var n;
        do {
            var len = 4 + Math.floor(Math.random() * 5);
            n = '';
            for (var i = 0; i < len; i++) {
                if (i === 0) {
                    n += _unicodeLike[Math.floor(Math.random() * _unicodeLike.length)];
                } else {
                    var r = Math.random();
                    if (r < 0.4) n += _unicodeLike[Math.floor(Math.random() * _unicodeLike.length)];
                    else if (r < 0.7) n += String.fromCharCode(65 + Math.floor(Math.random() * 26));
                    else n += Math.floor(Math.random() * 9);
                }
            }
        } while (_usedNames.has(n));
        _usedNames.add(n);
        return n;
    }

    function mixedName() {
        var n;
        do {
            var hexPart = Math.floor(Math.random() * 0xFFFF).toString(16);
            var letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            var randPart = '';
            var len = 3 + Math.floor(Math.random() * 4);
            for (var i = 0; i < len; i++) randPart += letters[Math.floor(Math.random() * letters.length)];
            var forms = [
                '_' + hexPart + randPart,
                '__' + randPart + hexPart,
                '_' + hexPart + '_' + randPart
            ];
            n = forms[Math.floor(Math.random() * forms.length)];
        } while (_usedNames.has(n));
        _usedNames.add(n);
        return n;
    }

    function longName() {
        var n;
        do {
            var words = ['local','function','value','table','string','number','boolean','return','index','data','cache','result','buffer','memory','handle','process','compute','resolve','execute','transform'];
            var len = 4 + Math.floor(Math.random() * 4);
            var parts = [];
            for (var i = 0; i < len; i++) parts.push(words[Math.floor(Math.random() * words.length)]);
            n = '_' + parts.join('_') + '_' + Math.floor(Math.random() * 999);
        } while (_usedNames.has(n));
        _usedNames.add(n);
        return n;
    }

    function getName(style) {
        if (style === 'hex') return hexName();
        if (style === 'unicode') return unicodeName();
        if (style === 'mixed') return mixedName();
        if (style === 'long') return longName();
        var styles = ['hex','unicode','mixed','long'];
        return getName(styles[Math.floor(Math.random() * styles.length)]);
    }

    function mangleNames(code, style) {
        var identPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        var luaKeywords = new Set([
            'and','break','do','else','elseif','end','false','for','function',
            'if','in','local','nil','not','or','repeat','return','then','true',
            'until','while','goto','continue'
        ]);
        var robloxGlobals = new Set([
            'game','workspace','script','require','Instance','Vector3','Vector2',
            'CFrame','Color3','UDim','UDim2','Enum','table','string','math','os',
            'print','warn','error','pcall','xpcall','tostring','tonumber','pairs',
            'ipairs','next','select','unpack','type','rawget','rawset','rawequal',
            'setmetatable','getmetatable','loadstring','coroutine','tick','wait',
            'spawn','delay','RunService','Players','UserInputService','TweenService',
            'getfenv','setfenv','newproxy','typeof','task','shared','_G',
            'BrickColor','Ray','NumberRange','NumberSequence','ColorSequence',
            'tostring','rawlen','load','collectgarbage','gcinfo','_VERSION',
            'player','Player','LocalPlayer','Character','Humanoid','HumanoidRootPart'
        ]);

        var found = {};
        var match;
        identPattern.lastIndex = 0;
        while ((match = identPattern.exec(code)) !== null) {
            var name = match[1];
            if (!luaKeywords.has(name) && !robloxGlobals.has(name) && !found[name]) {
                if (/^[a-zA-Z_]/.test(name) && name.length > 1) {
                    found[name] = getName(style);
                }
            }
        }

        var result = code;
        Object.keys(found).sort(function(a,b) { return b.length - a.length; }).forEach(function(orig) {
            result = result.replace(new RegExp('\\b' + orig.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b', 'g'), found[orig]);
        });

        return result;
    }

    return { getName, mangleNames, reset, hexName, unicodeName, mixedName, longName };
})();
