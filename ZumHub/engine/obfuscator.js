var ZumObfuscator = (function() {

    function removeComments(code) {
        code = code.replace(/--\[\[[\s\S]*?\]\]/g, '');
        code = code.replace(/--[^\n]*/g, '');
        return code;
    }

    function stripWhitespace(code) {
        return code.replace(/\r\n/g, '\n').replace(/\t/g, '    ').replace(/\n{3,}/g, '\n\n');
    }

    function obfuscate(code, options) {
        options = options || {};

        var steps = [];
        var result = code;

        steps.push({ name: 'strip comments', fn: function(c) { return removeComments(c); } });
        steps.push({ name: 'normalize', fn: function(c) { return stripWhitespace(c); } });

        if (options.nameMangling !== false) {
            var mangleStyle = options.mangleStyle || 'mixed';
            steps.push({ name: 'name mangling', fn: function(c) {
                ZumMangle.reset();
                return ZumMangle.mangleNames(c, mangleStyle);
            }});
        }

        if (options.obfuscateBooleans !== false) {
            steps.push({ name: 'boolean obf', fn: function(c) { return ZumFlow.obfuscateBooleans(c); } });
        }

        if (options.obfuscateNumbers !== false) {
            steps.push({ name: 'number obf', fn: function(c) { return ZumFlow.obfuscateNumbers(c); } });
        }

        if (options.stringObf !== false) {
            steps.push({ name: 'string obf', fn: function(c) { return ZumFlow.obfuscateStrings(c); } });
        }

        if (options.junkCode !== false) {
            var density = options.junkDensity || 4;
            steps.push({ name: 'junk injection', fn: function(c) {
                return ZumJunk.injectJunk(c, density, {
                    junkMath: options.junkMath !== false,
                    fakeFn: options.fakeFn !== false,
                    fakeIf: options.fakeIf !== false,
                    loopTrap: options.loopTrap !== false,
                    fakeRec: options.fakeRec !== false,
                    bytecodeComment: options.bytecodeComment !== false,
                    fakeTable: options.fakeTable !== false
                });
            }});
        }

        if (options.shuffleCode !== false) {
            steps.push({ name: 'code shuffle', fn: function(c) { return ZumJunk.shuffleTopLevel(c); } });
        }

        if (options.controlFlow !== false) {
            steps.push({ name: 'control flow', fn: function(c) { return ZumFlow.wrapAllInFunctions(c); } });
        }

        if (options.vmLayer !== false) {
            steps.push({ name: 'VM layer', fn: function(c) { return ZumVM.wrapInVM(c); } });
        }

        if (options.antiTamper !== false) {
            var atOptions = {
                antiDebug: options.antiDebug !== false,
                envCheck: options.envCheck !== false,
                sourceCheck: options.sourceCheck !== false,
                hookCheck: options.hookCheck !== false,
                integrityLoop: options.integrityLoop !== false
            };
            steps.push({ name: 'anti-tamper', fn: function(c) {
                return ZumAntiTamper.buildAntiTamperHeader(atOptions) + '\n\n' + c;
            }});
        }

        steps.push({ name: 'watermark', fn: function(c) {
            return ZumAntiTamper.addWatermark(c);
        }});

        if (options.oneLine) {
            steps.push({ name: 'compress to one line', fn: function(c) {
                return ZumAntiTamper.compressToOneLine(c);
            }});
        }

        if (options.targetKb && options.targetKb > 0) {
            steps.push({ name: 'output padding', fn: function(c) {
                return ZumAntiTamper.buildOutputPad(c, options.targetKb);
            }});
        }

        var log = [];
        for (var i = 0; i < steps.length; i++) {
            try {
                result = steps[i].fn(result);
                log.push({ step: steps[i].name, ok: true });
            } catch(e) {
                log.push({ step: steps[i].name, ok: false, error: e.message });
            }
        }

        return { code: result, log: log };
    }

    function getSize(str) {
        return new TextEncoder().encode(str).length;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    return { obfuscate, getSize, formatSize };
})();
