var ZumEncrypt = (function() {

    function xorStr(str, key) {
        var out = '';
        for (var i = 0; i < str.length; i++) {
            out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return out;
    }

    function doubleXor(str, k1, k2) {
        return xorStr(xorStr(str, k1), k2);
    }

    function tripleXor(str, k1, k2, k3) {
        return xorStr(xorStr(xorStr(str, k1), k2), k3);
    }

    var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    function customB64Encode(str) {
        var bytes = [];
        for (var i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
        var out = '';
        for (var i = 0; i < bytes.length; i += 3) {
            var b0 = bytes[i], b1 = bytes[i+1] || 0, b2 = bytes[i+2] || 0;
            out += B64_CHARS[(b0 >> 2) & 63];
            out += B64_CHARS[((b0 & 3) << 4) | ((b1 >> 4) & 15)];
            out += i+1 < bytes.length ? B64_CHARS[((b1 & 15) << 2) | ((b2 >> 6) & 3)] : '=';
            out += i+2 < bytes.length ? B64_CHARS[b2 & 63] : '=';
        }
        return out;
    }

    function customB64Decode(s) {
        var map = {};
        for (var i = 0; i < B64_CHARS.length; i++) map[B64_CHARS[i]] = i;
        var out = '';
        for (var i = 0; i < s.length; i += 4) {
            var c0 = map[s[i]], c1 = map[s[i+1]], c2 = s[i+2] === '=' ? 0 : map[s[i+2]], c3 = s[i+3] === '=' ? 0 : map[s[i+3]];
            out += String.fromCharCode((c0 << 2) | (c1 >> 4));
            if (s[i+2] !== '=') out += String.fromCharCode(((c1 & 15) << 4) | (c2 >> 2));
            if (s[i+3] !== '=') out += String.fromCharCode(((c2 & 3) << 6) | c3);
        }
        return out;
    }

    function splitReassemble(str, encStr) {
        var parts = [];
        var chunk = Math.max(3, Math.floor(encStr.length / 5));
        for (var i = 0; i < encStr.length; i += chunk) {
            parts.push(encStr.slice(i, i + chunk));
        }
        var varParts = parts.map(function(p, idx) {
            return '_p' + idx + ' = ' + JSON.stringify(p);
        });
        var joinLine = '_p0' + parts.slice(1).map(function(_, i) { return ' .. _p' + (i+1); }).join('');
        return { varParts: varParts, joinLine: joinLine };
    }

    function toHexStr(str) {
        var out = '';
        for (var i = 0; i < str.length; i++) {
            out += '\\x' + str.charCodeAt(i).toString(16).padStart(2, '0');
        }
        return out;
    }

    function encodeString(str, method, k1, k2, k3) {
        k1 = k1 || randKey(8);
        k2 = k2 || randKey(8);
        k3 = k3 || randKey(8);

        if (method === 'xor') {
            var enc = xorStr(str, k1);
            var hexEnc = toHexStr(enc);
            var hexKey = toHexStr(k1);
            return {
                encoded: hexEnc,
                key: hexKey,
                method: 'xor',
                decode: '_xd(\"' + hexEnc + '\", \"' + hexKey + '\")'
            };
        }

        if (method === 'dxor') {
            var enc = doubleXor(str, k1, k2);
            var hexEnc = toHexStr(enc);
            return {
                encoded: hexEnc,
                k1: toHexStr(k1),
                k2: toHexStr(k2),
                method: 'dxor',
                decode: '_dxd(\"' + hexEnc + '\", \"' + toHexStr(k1) + '\", \"' + toHexStr(k2) + '\")'
            };
        }

        if (method === 'txor') {
            var enc = tripleXor(str, k1, k2, k3);
            var hexEnc = toHexStr(enc);
            return {
                encoded: hexEnc,
                method: 'txor',
                decode: '_txd(\"' + hexEnc + '\", \"' + toHexStr(k1) + '\", \"' + toHexStr(k2) + '\", \"' + toHexStr(k3) + '\")'
            };
        }

        if (method === 'b64') {
            var enc = customB64Encode(str);
            return {
                encoded: enc,
                method: 'b64',
                decode: '_b64d(\"' + enc + '\")'
            };
        }

        var enc = customB64Encode(xorStr(str, k1));
        return {
            encoded: enc,
            k1: toHexStr(k1),
            method: 'mixed',
            decode: '_mxd(\"' + enc + '\", \"' + toHexStr(k1) + '\")'
        };
    }

    function randKey(len) {
        var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        var k = '';
        for (var i = 0; i < len; i++) k += chars[Math.floor(Math.random() * chars.length)];
        return k;
    }

    return {
        xorStr, doubleXor, tripleXor,
        customB64Encode, customB64Decode,
        encodeString, toHexStr, randKey,
        splitReassemble
    };
})();
