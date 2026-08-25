var ZumTester = (function() {

    function buildSandbox() {
        var logs = [];
        var warns = [];
        var errors = [];
        var startTime = Date.now();

        function makeColor3(r,g,b) { return {r:r,g:g,b:b,toString:function(){return'Color3('+r+','+g+','+b+')'}}; }
        function makeVector3(x,y,z) { return {x:x||0,y:y||0,z:z||0,Magnitude:Math.sqrt((x||0)**2+(y||0)**2+(z||0)**2),toString:function(){return'Vector3('+x+','+y+','+z+')'}}; }
        function makeVector2(x,y) { return {x:x||0,y:y||0,toString:function(){return'Vector2('+x+','+y+')'}}; }
        function makeCFrame(x,y,z) { return {X:x||0,Y:y||0,Z:z||0,Position:makeVector3(x,y,z),toString:function(){return'CFrame('+x+','+y+','+z+')'}}; }
        function makeUDim2(xs,xo,ys,yo) { return {toString:function(){return'UDim2('+xs+','+xo+','+ys+','+yo+')'}}; }

        function fakeInstance(className, name) {
            var props = { Name: name || className, ClassName: className, Parent: null };
            var children = [];
            var connections = {};
            var inst = {
                Name: name || className,
                ClassName: className,
                Parent: null,
                WalkSpeed: 16,
                JumpPower: 50,
                Health: 100,
                MaxHealth: 100,
                Position: makeVector3(0,0,0),
                Size: makeVector3(4,1,2),
                Anchored: false,
                Transparency: 0,
                BrickColor: 'Medium stone grey',
                Material: 'Plastic',
                CFrame: makeCFrame(0,0,0),
                Value: 0,
                Text: '',
                BackgroundColor3: makeColor3(1,1,1),
                TextColor3: makeColor3(0,0,0),
                Visible: true,
                ZIndex: 1,
                IsA: function(cn) { return className === cn; },
                FindFirstChild: function(n) { return children.find(function(c){return c.Name===n;})||null; },
                FindFirstChildOfClass: function(cn) { return children.find(function(c){return c.ClassName===cn;})||null; },
                WaitForChild: function(n) { return children.find(function(c){return c.Name===n;})||fakeInstance('Instance',n); },
                GetChildren: function() { return children.slice(); },
                GetDescendants: function() { return children.slice(); },
                Clone: function() { return fakeInstance(className, name); },
                Destroy: function() {},
                Remove: function() {},
                GetPropertyChangedSignal: function() { return {Connect:function(){return{Disconnect:function(){}}}}; },
                Changed: {Connect:function(){return{Disconnect:function(){}}}},
                AncestryChanged: {Connect:function(){return{Disconnect:function(){}}}},
                ChildAdded: {Connect:function(){return{Disconnect:function(){}}}},
                ChildRemoved: {Connect:function(){return{Disconnect:function(){}}}},
                Touched: {Connect:function(){return{Disconnect:function(){}}}},
                Heartbeat: {Connect:function(){return{Disconnect:function(){}}}},
            };
            return inst;
        }

        var humanoid = fakeInstance('Humanoid','Humanoid');
        humanoid.WalkSpeed = 16;
        humanoid.JumpPower = 50;
        humanoid.Health = 100;
        humanoid.MaxHealth = 100;

        var hrp = fakeInstance('Part','HumanoidRootPart');
        var character = fakeInstance('Model','Character');
        character.FindFirstChild = function(n) {
            if (n === 'Humanoid') return humanoid;
            if (n === 'HumanoidRootPart') return hrp;
            return null;
        };
        character.WaitForChild = character.FindFirstChild;

        var localPlayer = fakeInstance('Player','Player1');
        localPlayer.Name = 'Player1';
        localPlayer.UserId = 12345678;
        localPlayer.Character = character;
        localPlayer.CharacterAdded = { Connect:function(){return{Disconnect:function(){}}}, Wait:function(){return character;} };
        localPlayer.Backpack = fakeInstance('Backpack','Backpack');
        localPlayer.PlayerGui = fakeInstance('PlayerGui','PlayerGui');
        localPlayer.Kick = function(msg) { logs.push({type:'warn',msg:'[Player:Kick] '+msg,time:Date.now()-startTime}); };
        localPlayer.GetMouse = function() { return {X:0,Y:0,Hit:makeCFrame(0,0,0),Target:null}; };

        var playersService = fakeInstance('Players','Players');
        playersService.LocalPlayer = localPlayer;
        playersService.GetPlayers = function() { return [localPlayer]; };
        playersService.GetPlayerByUserId = function() { return localPlayer; };
        playersService.PlayerAdded = { Connect:function(){return{Disconnect:function(){}}}, Wait:function(){return localPlayer;} };
        playersService.PlayerRemoving = { Connect:function(){return{Disconnect:function(){}}}, Wait:function(){return localPlayer;} };

        var runService = fakeInstance('RunService','RunService');
        runService.IsClient = function() { return true; };
        runService.IsServer = function() { return false; };
        runService.IsStudio = function() { return false; };
        runService.Heartbeat = { Connect:function(){return{Disconnect:function(){}}}, Wait:function(){return 1/60;} };
        runService.RenderStepped = { Connect:function(){return{Disconnect:function(){}}}, Wait:function(){return 1/60;} };
        runService.Stepped = { Connect:function(){return{Disconnect:function(){}}}, Wait:function(){return 1/60;} };

        var tweenService = fakeInstance('TweenService','TweenService');
        tweenService.Create = function(inst, info, props) {
            return { Play:function(){}, Pause:function(){}, Cancel:function(){}, Completed:{Connect:function(){return{Disconnect:function(){}}}} };
        };

        var userInputService = fakeInstance('UserInputService','UserInputService');
        userInputService.GetKeysPressed = function() { return []; };
        userInputService.IsKeyDown = function() { return false; };
        userInputService.InputBegan = { Connect:function(){return{Disconnect:function(){}}}, Wait:function(){return null;} };
        userInputService.InputEnded = { Connect:function(){return{Disconnect:function(){}}}, Wait:function(){return null;} };

        var replicatedStorage = fakeInstance('ReplicatedStorage','ReplicatedStorage');
        var serverStorage = fakeInstance('ServerStorage','ServerStorage');
        var lighting = fakeInstance('Lighting','Lighting');
        var soundService = fakeInstance('SoundService','SoundService');
        var starterGui = fakeInstance('StarterGui','StarterGui');

        var gameObj = {
            Players: playersService,
            Workspace: fakeInstance('Workspace','Workspace'),
            ReplicatedStorage: replicatedStorage,
            ServerStorage: serverStorage,
            Lighting: lighting,
            SoundService: soundService,
            StarterGui: starterGui,
            RunService: runService,
            TweenService: tweenService,
            UserInputService: userInputService,
            HttpService: {
                JSONEncode: function(t) { try { return JSON.stringify(t); } catch(e) { return '{}'; } },
                JSONDecode: function(s) { try { return JSON.parse(s); } catch(e) { return {}; } },
                GetAsync: function(url) { return '[mocked HTTP response for: ' + url + ']'; },
                PostAsync: function(url) { return '[mocked POST response]'; }
            },
            GetService: function(name) {
                var map = {
                    Players: playersService,
                    RunService: runService,
                    TweenService: tweenService,
                    UserInputService: userInputService,
                    ReplicatedStorage: replicatedStorage,
                    ServerStorage: serverStorage,
                    Lighting: lighting,
                    SoundService: soundService,
                    StarterGui: starterGui,
                    HttpService: this.HttpService,
                    MarketplaceService: fakeInstance('MarketplaceService','MarketplaceService'),
                    DataStoreService: fakeInstance('DataStoreService','DataStoreService'),
                    PhysicsService: fakeInstance('PhysicsService','PhysicsService'),
                    CollectionService: { GetTagged:function(){return[];}, AddTag:function(){}, RemoveTag:function(){}, HasTag:function(){return false;} },
                    ContextActionService: { BindAction:function(){}, UnbindAction:function(){} },
                    GuiService: fakeInstance('GuiService','GuiService'),
                    VirtualInputManager: fakeInstance('VirtualInputManager','VirtualInputManager'),
                };
                return map[name] || fakeInstance(name, name);
            },
            Workspace: fakeInstance('Workspace','Workspace'),
            workspace: fakeInstance('Workspace','Workspace'),
        };

        var captured = { logs:[], startTime: Date.now() };

        function captureLog(type, args) {
            var msg = Array.from(args).map(function(a) {
                if (a === null) return 'nil';
                if (a === undefined) return 'nil';
                if (typeof a === 'object') {
                    try { return JSON.stringify(a); } catch(e) { return '[object]'; }
                }
                return String(a);
            }).join('\t');
            captured.logs.push({ type:type, msg:msg, time:Date.now()-captured.startTime });
        }

        var fakePrint = function() { captureLog('print', arguments); };
        var fakeWarn = function() { captureLog('warn', arguments); };
        var fakeError = function(msg) { captureLog('error', [msg]); };

        var fakeRequire = function(mod) { return {}; };

        var fakeMath = Object.assign({}, Math, {
            huge: Infinity, pi: Math.PI, random: function(a,b) {
                if (a===undefined) return Math.random();
                if (b===undefined) return Math.floor(Math.random()*a)+1;
                return Math.floor(Math.random()*(b-a+1))+a;
            },
            max: Math.max.bind(Math), min: Math.min.bind(Math),
            abs: Math.abs.bind(Math), floor: Math.floor.bind(Math),
            ceil: Math.ceil.bind(Math), sqrt: Math.sqrt.bind(Math),
            sin: Math.sin.bind(Math), cos: Math.cos.bind(Math),
            tan: Math.tan.bind(Math), pow: Math.pow.bind(Math),
            exp: Math.exp.bind(Math), log: Math.log.bind(Math),
            fmod: function(a,b){return a%b;},
            modf: function(a){var f=a%1;return[a-f,f];}
        });

        var fakeString = {
            format: function(fmt) {
                var args = Array.prototype.slice.call(arguments,1), i=0;
                return fmt.replace(/%[sdfqiuxXo]/g,function(m){
                    var v=args[i++];
                    if(m==='%d'||m==='%i')return Math.floor(Number(v));
                    if(m==='%f')return Number(v).toFixed(6);
                    if(m==='%s')return String(v);
                    if(m==='%q')return '"'+String(v)+'"';
                    if(m==='%x')return Number(v).toString(16);
                    if(m==='%X')return Number(v).toString(16).toUpperCase();
                    return String(v);
                });
            },
            len: function(s){return String(s).length;},
            sub: function(s,i,j){s=String(s);i=i>0?i-1:s.length+i;j=j===undefined?s.length:j>0?j:s.length+j;return s.slice(i,j);},
            rep: function(s,n,sep){return Array(n).fill(s).join(sep||'');},
            reverse: function(s){return String(s).split('').reverse().join('');},
            upper: function(s){return String(s).toUpperCase();},
            lower: function(s){return String(s).toLowerCase();},
            byte: function(s,i){return String(s).charCodeAt((i||1)-1);},
            char: function(){return Array.from(arguments).map(function(c){return String.fromCharCode(c);}).join('');},
            find: function(s,p,i,pl){s=String(s);var idx=s.indexOf(p,(i||1)-1);return idx===-1?null:idx+1;},
            match: function(s,p){var m=String(s).match(p);return m?m[0]:null;},
            gmatch: function(s,p){var re=new RegExp(p,'g'),m,res=[];while((m=re.exec(s))!==null)res.push(m[0]);var i=0;return function(){return res[i++];};},
            gsub: function(s,p,r){return[String(s).replace(new RegExp(p,'g'),r),0];},
            split: function(s,sep){return String(s).split(sep);},
        };

        var fakeTable = {
            insert: function(t,pos,val){if(val===undefined){t.push(pos);}else{t.splice(pos-1,0,val);}},
            remove: function(t,pos){return t.splice((pos||t.length)-1,1)[0];},
            concat: function(t,sep,i,j){return t.slice((i||1)-1,j||t.length).join(sep||'');},
            sort: function(t,fn){t.sort(fn||function(a,b){return a<b?-1:a>b?1:0;});},
            move: function(a1,f,e,t,a2){a2=a2||a1;var seg=a1.slice(f-1,e);seg.forEach(function(v,i){a2[t-1+i]=v;});return a2;},
            unpack: function(t,i,j){return t.slice((i||1)-1,j||t.length);},
            getn: function(t){return t.length;},
            maxn: function(t){return t.length;},
        };

        var fakeTask = {
            wait: function(n) { return n||0; },
            spawn: function(fn) { try { fn(); } catch(e) {} },
            delay: function(t,fn) { try { fn(); } catch(e) {} },
            defer: function(fn) { try { fn(); } catch(e) {} },
            cancel: function() {},
        };

        var fakeBit32 = {
            bxor: function(a,b){return a^b;},
            band: function(a,b){return a&b;},
            bor: function(a,b){return a|b;},
            bnot: function(a){return~a;},
            lshift: function(a,b){return a<<b;},
            rshift: function(a,b){return a>>>b;},
            arshift: function(a,b){return a>>b;},
            btest: function(a,b){return(a&b)!==0;},
            extract: function(n,f,w){return(n>>>f)&((1<<(w||1))-1);},
            replace: function(n,v,f,w){var mask=((1<<(w||1))-1)<<f;return(n&~mask)|((v<<f)&mask);},
        };

        return {
            env: {
                game: gameObj,
                workspace: gameObj.Workspace,
                script: fakeInstance('LocalScript','Script'),
                print: fakePrint,
                warn: fakeWarn,
                error: fakeError,
                require: fakeRequire,
                math: fakeMath,
                string: fakeString,
                table: fakeTable,
                task: fakeTask,
                bit32: fakeBit32,
                wait: function(n) { return n||0; },
                tick: function() { return (Date.now()-captured.startTime)/1000; },
                os: { time:function(){return Math.floor(Date.now()/1000);}, clock:function(){return performance.now()/1000;}, date:function(){return new Date().toString();} },
                tostring: function(v) { if(v===null||v===undefined)return'nil'; if(typeof v==='boolean')return v?'true':'false'; return String(v); },
                tonumber: function(v,b) { return b?parseInt(v,b):Number(v)||null; },
                type: function(v) { if(v===null||v===undefined)return'nil'; if(typeof v==='boolean')return'boolean'; if(typeof v==='number')return'number'; if(typeof v==='string')return'string'; if(typeof v==='function')return'function'; return'table'; },
                pairs: function(t) { var keys=Object.keys(t),i=0; return function(){var k=keys[i++];return k!==undefined?[k,t[k]]:null;}; },
                ipairs: function(t) { var i=0; return function(){i++;return t[i-1]!==undefined?[i,t[i-1]]:null;}; },
                next: function(t,k) { var keys=Object.keys(t),i=k===null||k===undefined?0:keys.indexOf(String(k))+1; return keys[i]!==undefined?[keys[i],t[keys[i]]]:null; },
                select: function(i){if(i==='#')return arguments.length-1;return Array.prototype.slice.call(arguments,i);},
                unpack: function(t,i,j){return t.slice((i||1)-1,j||t.length);},
                rawget: function(t,k){return t[k];},
                rawset: function(t,k,v){t[k]=v;return t;},
                rawequal: function(a,b){return a===b;},
                rawlen: function(t){return t.length||Object.keys(t).length;},
                setmetatable: function(t,mt){if(mt&&mt.__index){Object.setPrototypeOf(t,mt.__index);}return t;},
                getmetatable: function(t){return null;},
                pcall: function(fn){try{var r=fn();return[true,r];}catch(e){return[false,e.message];}},
                xpcall: function(fn,handler){try{var r=fn();return[true,r];}catch(e){try{handler(e.message);}catch(e2){}return[false,e.message];}},
                loadstring: function(code){return function(){captureLog('warn',['[loadstring] external script would run here']);}; },
                typeof: function(v){return typeof v;},
                Instance: { new: function(cn,parent){return fakeInstance(cn,cn);} },
                Vector3: { new: makeVector3 },
                Vector2: { new: makeVector2 },
                CFrame: { new: makeCFrame },
                Color3: { new: makeColor3, fromRGB: function(r,g,b){return makeColor3(r/255,g/255,b/255);} },
                UDim2: { new: makeUDim2 },
                UDim: function(s,o){return{Scale:s,Offset:o};},
                BrickColor: { new: function(n){return{Name:n||'Medium stone grey'};} },
                TweenInfo: { new: function(){return {};} },
                Enum: new Proxy({},{get:function(t,k){return new Proxy({},{get:function(t2,k2){return {Name:k2,Value:0};}});}}),
                NumberRange: function(a,b){return{Min:a,Max:b||a};},
                NumberSequence: function(){return{};},
                ColorSequence: function(){return{};},
                _G: {},
                shared: {},
                _VERSION: 'Luau',
                coroutine: {
                    create: function(fn){return{fn:fn,status:'suspended'};},
                    resume: function(co){try{co.status='running';var r=co.fn();co.status='dead';return[true,r];}catch(e){co.status='dead';return[false,e.message];}},
                    wrap: function(fn){return function(){try{return fn();}catch(e){throw e;}};},
                    status: function(co){return co.status||'dead';},
                    yield: function(){return null;},
                    isyieldable: function(){return false;},
                    running: function(){return null;},
                },
                getfenv: function(){return {};},
                setfenv: function(){},
            },
            captured: captured
        };
    }

    function luaToJS(code) {
        var js = code;
        js = js.replace(/--\[\[[\s\S]*?\]\]/g, '');
        js = js.replace(/--[^\n]*/g, '');
        js = js.replace(/\blocal\s+function\s+(\w+)/g, 'function $1');
        js = js.replace(/\blocal\s+/g, 'var ');
        js = js.replace(/\bnil\b/g, 'null');
        js = js.replace(/\band\b/g, '&&');
        js = js.replace(/\bor\b/g, '||');
        js = js.replace(/\bnot\b\s*([^\s(]+)/g, '!$1');
        js = js.replace(/\bthen\b/g, '{');
        js = js.replace(/\bdo\b/g, '{');
        js = js.replace(/\brepeat\b/g, 'do {');
        js = js.replace(/\buntil\b/g, '} while(!(');
        js = js.replace(/\belseif\b/g, '} else if');
        js = js.replace(/\belse\b/g, '} else {');
        js = js.replace(/\bend\b/g, '}');
        js = js.replace(/\bfor\s+(\w+)\s*=\s*([^,]+),\s*([^,\n{]+)(?:,\s*([^\n{]+))?\s*\{/g, function(m,v,s,e,st) {
            var step = st ? st.trim() : '1';
            return 'for (var '+v+'='+s.trim()+'; '+v+' <= '+e.trim()+'; '+v+' += '+step+') {';
        });
        js = js.replace(/\bfor\s+(\w+)\s*,\s*(\w+)\s+in\s+pairs\s*\(([^)]+)\)\s*\{/g, 'for (var [$1,$2] of Object.entries($3)) {');
        js = js.replace(/\bfor\s+(\w+)\s*,\s*(\w+)\s+in\s+ipairs\s*\(([^)]+)\)\s*\{/g, 'for (var [$1,$2] of $3.entries()) {');
        js = js.replace(/\bfunction\s+(\w+)\s*\(([^)]*)\)\s*\{/g, 'function $1($2) {');
        js = js.replace(/~=/g, '!==');
        js = js.replace(/==/g, '===');
        js = js.replace(/#(\w+)/g, '$1.length');
        js = js.replace(/\.\.(?!=)/g, '+');
        js = js.replace(/\bstring\.([a-z]+)\s*\(/g, 'string.$1(');
        js = js.replace(/\btable\.([a-z]+)\s*\(/g, 'table.$1(');
        js = js.replace(/\bmath\.([a-z]+)\s*\(/g, 'math.$1(');
        js = js.replace(/\btask\.([a-z]+)\s*\(/g, 'task.$1(');
        js = js.replace(/\bbit32\.([a-z]+)\s*\(/g, 'bit32.$1(');
        return js;
    }

    function run(code, timeoutMs) {
        timeoutMs = timeoutMs || 3000;
        var sandbox = buildSandbox();
        var env = sandbox.env;
        var captured = sandbox.captured;
        var t0 = performance.now();
        var status = 'success';
        var errorMsg = null;

        var jsCode = luaToJS(code);

        try {
            var fnBody = 'with(env) { ' + jsCode + ' }';
            var fn = new Function('env', 'math', 'string', 'table', 'task', 'bit32', fnBody);
            fn(env, env.math, env.string, env.table, env.task, env.bit32);
        } catch(e) {
            status = 'error';
            errorMsg = e.message;
            captured.logs.push({ type:'error', msg: e.message, time: performance.now()-t0 });
        }

        var elapsed = performance.now() - t0;
        return {
            logs: captured.logs,
            status: status,
            error: errorMsg,
            elapsed: elapsed.toFixed(2),
            jsCode: jsCode
        };
    }

    return { run: run, luaToJS: luaToJS };
})();
