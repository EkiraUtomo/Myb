var ZumVM = (function() {

    function rand(a,b) { return Math.floor(Math.random() * (b-a+1)) + a; }
    function randHex(l) { return '_0x' + Math.floor(Math.random() * Math.pow(16,l||5)).toString(16).padStart(l||5,'0'); }

    function buildVMHeader() {
        var env = randHex(), exec = randHex(), ctx = randHex(), reg = randHex();
        var instr = randHex(), op = randHex(), pc = randHex(), stack = randHex();
        var vmVer = rand(2,9) + '.' + rand(0,9) + '.' + rand(100,999);

        return [
            '-- ZumHub VM ' + vmVer + ' | ' + randHex(4) + ' | luau_vm_exec',
            '-- .vm_header: [' + Array.from({length:8},()=>'0x'+rand(0,255).toString(16).padStart(2,'0')).join(' ') + ']',
            '',
            'local ' + env + ' = getfenv and getfenv(0) or _ENV or {}',
            'local ' + ctx + ' = {',
            '    [\"' + randHex(3) + '\"] = ' + rand(1,9999) + ',',
            '    [\"' + randHex(3) + '\"] = \"' + randHex(4) + '\",',
            '    [\"ver\"] = \"' + vmVer + '\",',
            '}',
            'local ' + reg + ' = {}',
            'local ' + stack + ' = {}',
            'local ' + pc + ' = 0',
            '',
            'local function ' + exec + '(' + instr + ')',
            '    ' + pc + ' = ' + pc + ' + 1',
            '    ' + reg + '[' + pc + '] = ' + instr,
            '    return ' + instr,
            'end',
            '',
            'local function ' + op + '(a, b, c)',
            '    if a == nil then return b end',
            '    if b == nil then return a end',
            '    return (a + b) % (c or ' + rand(97,997) + ')',
            'end',
            '',
            '-- vm_exec_start',
        ].join('\n');
    }

    function buildVMFooter() {
        return [
            '',
            '-- vm_exec_end',
            '-- .vm_footer: [' + Array.from({length:6},()=>'0x'+rand(0,255).toString(16).padStart(2,'0')).join(' ') + ']',
        ].join('\n');
    }

    function buildDecodeRuntime() {
        var xdFn = '_xd', dxdFn = '_dxd', txdFn = '_txd', b64Fn = '_b64d', mxdFn = '_mxd';
        return [
            'local function ' + xdFn + '(s, k)',
            '    local r = ""',
            '    for i = 1, #s do',
            '        r = r .. string.char(bit32.bxor(string.byte(s, i), string.byte(k, ((i-1) % #k) + 1)))',
            '    end',
            '    return r',
            'end',
            '',
            'local function ' + dxdFn + '(s, k1, k2)',
            '    return ' + xdFn + '(' + xdFn + '(s, k1), k2)',
            'end',
            '',
            'local function ' + txdFn + '(s, k1, k2, k3)',
            '    return ' + xdFn + '(' + xdFn + '(' + xdFn + '(s, k1), k2), k3)',
            'end',
            '',
            'local _b64c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"',
            'local function ' + b64Fn + '(s)',
            '    local r, m = "", {}',
            '    for i = 1, #_b64c do m[string.sub(_b64c,i,i)] = i-1 end',
            '    local i = 1',
            '    while i <= #s do',
            '        local c0 = m[string.sub(s,i,i)] or 0',
            '        local c1 = m[string.sub(s,i+1,i+1)] or 0',
            '        local c2 = string.sub(s,i+2,i+2)',
            '        local c3 = string.sub(s,i+3,i+3)',
            '        local v2 = c2 ~= "=" and (m[c2] or 0) or nil',
            '        local v3 = c3 ~= "=" and (m[c3] or 0) or nil',
            '        r = r .. string.char(bit32.bor(bit32.lshift(c0,2), bit32.rshift(c1,4)))',
            '        if v2 then r = r .. string.char(bit32.bor(bit32.lshift(bit32.band(c1,15),4), bit32.rshift(v2,2))) end',
            '        if v3 then r = r .. string.char(bit32.bor(bit32.lshift(bit32.band(v2 or 0,3),6), v3)) end',
            '        i = i + 4',
            '    end',
            '    return r',
            'end',
            '',
            'local function ' + mxdFn + '(s, k)',
            '    return ' + xdFn + '(' + b64Fn + '(s), k)',
            'end',
        ].join('\n');
    }

    function wrapInVM(code) {
        return buildVMHeader() + '\n\n' + buildDecodeRuntime() + '\n\n' + code + '\n' + buildVMFooter();
    }

    return { wrapInVM, buildVMHeader, buildVMFooter, buildDecodeRuntime };
})();
