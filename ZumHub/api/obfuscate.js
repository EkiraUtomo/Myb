import { createRequire } from 'module';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let fengari;
try {
    fengari = await import('fengari');
} catch(e) {
    fengari = require('fengari');
}

const lua = fengari.lua;
const lauxlib = fengari.lauxlib;
const lualib = fengari.lualib;

function makeState(luaBase) {
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);
    const enc = new TextEncoder();

    function runCode(code, name) {
        const buf = enc.encode(code);
        const r = lauxlib.luaL_loadbuffer(L, buf, buf.length, enc.encode(name || 'chunk'));
        if (r !== 0) {
            const err = fengari.to_jsstring(lua.lua_tostring(L, -1));
            lua.lua_pop(L, 1);
            throw new Error('Load error in ' + name + ': ' + err);
        }
        const r2 = lua.lua_pcall(L, 0, -1, 0);
        if (r2 !== 0) {
            const err = fengari.to_jsstring(lua.lua_tostring(L, -1));
            lua.lua_pop(L, 1);
            throw new Error('Run error in ' + name + ': ' + err);
        }
        lua.lua_settop(L, 0);
    }

    function preload(mod, code) {
        const buf = enc.encode(code);
        lua.lua_getglobal(L, enc.encode('package'));
        lua.lua_getfield(L, -1, enc.encode('preload'));
        const r = lauxlib.luaL_loadbuffer(L, buf, buf.length, enc.encode('@' + mod));
        if (r !== 0) { lua.lua_pop(L, 3); return; }
        lua.lua_setfield(L, -2, enc.encode(mod));
        lua.lua_pop(L, 2);
    }

    function walkAndPreload(dir, pfx) {
        for (const f of readdirSync(dir)) {
            const full = join(dir, f);
            const rel = pfx ? pfx + '/' + f : f;
            if (statSync(full).isDirectory()) walkAndPreload(full, rel);
            else if (f.endsWith('.lua')) {
                const code = readFileSync(full, 'utf8');
                const modSlash = rel.replace(/\.lua$/, '');
                const modDot = modSlash.replace(/\//g, '.');
                preload(modSlash, code);
                preload(modDot, code);
            }
        }
    }

    runCode(`
arg = arg or {}
debug = debug or {}
debug.getinfo = function() return {source = "@src/"} end
math.ldexp = math.ldexp or function(x, n) return x * 2 ^ n end
math.frexp = math.frexp or function(x)
    if x == 0 then return 0, 0 end
    local exp = math.floor(math.log(math.abs(x)) / math.log(2)) + 1
    local m = x / 2 ^ exp
    return m, exp
end
io = io or {}
io.open = function() return nil end
io.popen = function() return nil end
os.exit = function() end
`, 'patch');

    walkAndPreload(luaBase, '');

    const output = [];
    lua.lua_pushcfunction(L, (L2) => {
        const n = lua.lua_gettop(L2);
        const parts = [];
        for (let i = 1; i <= n; i++) {
            try { parts.push(fengari.to_jsstring(lua.lua_tostring(L2, i))); } catch(e) { parts.push(''); }
        }
        output.push(parts.join('\t'));
        return 0;
    });
    lua.lua_setglobal(L, enc.encode('print'));

    return { L, runCode, output, enc };
}

function runPrometheus(code) {
    const luaBase = join(__dirname, '../lua/prometheus');
    const { L, runCode, output, enc } = makeState(luaBase);

    const scriptBuf = enc.encode(code);
    lua.lua_pushlstring(L, scriptBuf, scriptBuf.length);
    lua.lua_setglobal(L, enc.encode('__input_code'));

    runCode(`
local Pipeline = require("prometheus.pipeline")
local Steps = require("prometheus.steps")

local settings = {
    LuaVersion = "Lua51",
    VarNamePrefix = "",
    NameGenerator = "MangledShuffled",
    PrettyPrint = false,
    Seed = os.time(),
    Steps = {
        { Name = "VariableRenaming", Settings = {} },
        { Name = "EncryptStrings", Settings = {} },
        { Name = "WrapInFunction", Settings = {} },
        { Name = "ConstantArray", Settings = { Treshold = 1, StringsOnly = false, Shuffle = true, Rotate = true } },
    }
}

local pipeline = Pipeline.fromConfig(settings)
local ok, result = pcall(function()
    return pipeline:apply(__input_code)
end)
if ok then
    _result = result
else
    error(result)
end
`, 'prometheus_run');

    lua.lua_getglobal(L, enc.encode('_result'));
    const result = fengari.to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_pop(L, 1);
    return result;
}

function runHercules(code) {
    const luaBase = join(__dirname, '../lua/hercules');
    const { L, runCode, output, enc } = makeState(luaBase);

    const scriptBuf = enc.encode(code);
    lua.lua_pushlstring(L, scriptBuf, scriptBuf.length);
    lua.lua_setglobal(L, enc.encode('__input_code'));

    runCode(`
local config = require("config")
local manifest = require("manifest")
local Pipeline = require("pipeline")

config.target = "luau"
for _, method in ipairs(manifest.modules) do
    config.settings[method.config_key].enabled = true
end
config.settings.watermark_enabled = false

local ok, result = pcall(function()
    return Pipeline.process(__input_code)
end)
if ok then
    _result = result
else
    error(result)
end
`, 'hercules_run');

    lua.lua_getglobal(L, enc.encode('_result'));
    const result = fengari.to_jsstring(lua.lua_tostring(L, -1));
    lua.lua_pop(L, 1);
    return result;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
    catch(e) { return res.status(400).json({ error: 'invalid body' }); }

    const { code, engine } = body;
    if (!code) return res.status(400).json({ error: 'no code provided' });

    try {
        let result;
        const t0 = Date.now();

        if (engine === 'hercules') {
            result = runHercules(code);
        } else {
            result = runPrometheus(code);
        }

        return res.status(200).json({
            result,
            engine: engine || 'prometheus',
            elapsed: Date.now() - t0
        });
    } catch(e) {
        return res.status(500).json({ error: e.message });
    }
}
