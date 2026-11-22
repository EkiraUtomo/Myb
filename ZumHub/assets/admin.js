const __calls=[];
(function(){
    const orig=window.fetch.bind(window);
    window.fetch=async function(input,init){
        const t0=performance.now();
        const url=typeof input==='string'?input:input.url;
        const method=(init&&init.method)||'GET';
        try{
            const r=await orig(input,init);
            __calls.push({t:new Date().toISOString().slice(11,19),method,url:url.split('?')[0],status:r.status,ms:Math.round(performance.now()-t0)});
            if(__calls.length>40)__calls.shift();
            return r;
        }catch(e){
            __calls.push({t:new Date().toISOString().slice(11,19),method,url:url.split('?')[0],status:'ERR',ms:Math.round(performance.now()-t0)});
            throw e;
        }
    };
})();

const $=id=>document.getElementById(id);
function msg(id,text,type){const e=$(id);e.textContent=text;e.className='msg '+(type||'');}
function hmsg(id){$(id).className='msg';}

// ── tab switching ──
function setTab(name, btn) {
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('on'));
    if(btn) btn.classList.add('active');
    document.getElementById('tab-'+name).classList.add('on');
    if((name==='settings'||name==='links')&&!settingsLoaded) loadSettings();
    if(name==='security'){ loadSecurity(); loadHealth(); }
    if(name==='debug'){ dbgReport(); dbgCalls(); }
}

// ── settings ──
let currentSettings = null;
let settingsLoaded = false;

function parseButtons(raw) {
    return raw.trim().split('\n').filter(l=>l.trim()).map(l=>{
        const p = l.split('|').map(s=>s.trim());
        return { label: p[0]||'', url: p[1]||'', style: p[2]||'outline' };
    }).filter(b=>b.label&&b.url);
}

function parseCards(raw) {
    return raw.trim().split('\n').filter(l=>l.trim()).map(l=>{
        const p = l.split('|').map(s=>s.trim());
        return { title: p[0]||'', sub: p[1]||'', url: p[2]||'', icon: p[3]||'link' };
    }).filter(c=>c.title&&c.url);
}

function buttonsToText(btns) {
    return (btns||[]).map(b=>`${b.label} | ${b.url} | ${b.style||'outline'}`).join('\n');
}

function cardsToText(cards) {
    return (cards||[]).map(c=>`${c.title} | ${c.sub||''} | ${c.url} | ${c.icon||'link'}`).join('\n');
}

async function loadSettings() {
    msg('msg-settings', 'loading...', '');
    try {
        const r = await fetch('/api/settings', { cache:'no-store', headers:authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error||'failed');
        const s = d.settings;

        // banner
        $('st-banner-enabled').value = String(s.banner?.enabled||false);
        $('st-banner-color').value = s.banner?.color||'purple';
        $('st-banner-message').value = s.banner?.message||'';
        $('st-banner-link').value = s.banner?.link||'';
        $('st-banner-linktext').value = s.banner?.linkText||'learn more';
        $('st-banner-custom').value = s.banner?.customColor||'#7c5cbf';
        $('st-banner-dismissible').value = String(s.banner?.dismissible!==false);

        // seo
        $('st-seo-title').value = s.seo?.title||'DoggoJr';
        $('st-seo-desc').value = s.seo?.description||'';
        $('st-seo-favicon').value = s.seo?.favicon||'';

        // hero
        $('st-hero-name').value = s.hero?.name||'DoggoJr';
        $('st-hero-tag').value = s.hero?.tag||'Roblox Scripter';
        $('st-hero-bio').value = s.hero?.bio||'';
        $('st-hero-typewriter').value = (s.hero?.typewriterLines||[]).join('\n');
        $('st-hero-buttons').value = buttonsToText(s.hero?.extraButtons);
        $('st-hero-showava').value = String(s.hero?.showAvatar!==false);
        $('st-hero-ringspeed').value = s.hero?.avatarRingSpeed||14;
        $('st-hero-glow').value = String(s.hero?.avatarGlow!==false);

        // nav
        $('st-nav-links').value = (s.nav?.extraLinks||[]).map(l=>`${l.label} | ${l.url} | ${l.external!==false}`).join('\n');

        // extra cards
        $('st-extra-cards').value = cardsToText(s.extraCards);
        $('st-projects').value = (s.projects||[]).map(p=>`${p.title} | ${p.desc||''} | ${p.url||''} | ${(p.tags||[]).join(', ')}`).join('\n');

        // social
        $('st-social-twitter').value = s.social?.twitter||'';
        $('st-social-tiktok').value = s.social?.tiktok||'';
        $('st-social-twitch').value = s.social?.twitch||'';
        $('st-social-custom').value = (s.social?.custom||[]).map(c=>`${c.label} | ${c.url}`).join('\n');

        // footer
        $('st-footer-left').value = s.footer?.left||'DoggoJr — ZumHub';
        $('st-footer-right').value = s.footer?.right||'built by hand';
        $('st-footer-clock').value = String(s.footer?.showClock!==false);
        $('st-footer-egg').value = String(s.footer?.showEasterEggHint!==false);

        // particles
        $('st-particles-enabled').value = String(s.particles?.enabled!==false);
        $('st-particles-density').value = s.particles?.density||65;
        $('st-particles-dist').value = s.particles?.connectionDistance||85;
        $('st-particles-orbs').value = s.particles?.orbCount??3;

        // music
        $('st-music-enabled').value = String(s.music?.enabled||false);
        $('st-music-autoplay').value = String(s.music?.autoplay!==false);
        $('st-music-playlist').value = s.music?.playlistUrl||'';
        $('st-music-label').value = s.music?.label||'ZumHub Radio';
        $('st-music-volume').value = s.music?.volume??60;
        $('st-music-shuffle').value = String(s.music?.shuffle!==false);
        $('st-music-showplayer').value = String(s.music?.showPlayer!==false);

        // theme
        $('st-accent').value = s.theme?.accentColor||'#7c5cbf';
        $('st-accent-light').value = s.theme?.accentLight||'#a07ee0';
        $('st-accent-dim').value = s.theme?.accentDim||'#3d2475';
        $('st-bg-base').value = s.theme?.bgBase||'#07070f';
        $('st-theme-font').value = s.theme?.fontDisplay||'Syne';

        // locker
        $('st-locker-msg').value = s.locker?.message||'';
        $('st-locker-contact').value = s.locker?.contactText||'';

        fillLinksTab(s);
        currentSettings = s;
        settingsLoaded = true;
        hmsg('msg-settings');
    } catch(e) { msg('msg-settings', e.message, 'err'); }
}

async function saveSettings() {
    if (!settingsLoaded) { msg('msg-settings', 'settings have not loaded yet, open the site settings tab first', 'err'); msg('msg-links', 'settings have not loaded yet, open the site settings tab first', 'err'); return; }
    msg('msg-settings', 'saving...', '');
    msg('msg-links', 'saving...', '');

    function parseNavLinks(raw) {
        return raw.trim().split('\n').filter(l=>l.trim()).map(l=>{
            const p = l.split('|').map(s=>s.trim());
            return { label:p[0]||'', url:p[1]||'', external:p[2]!=='false' };
        }).filter(l=>l.label&&l.url);
    }
    function parseCustomSocial(raw) {
        return raw.trim().split('\n').filter(l=>l.trim()).map(l=>{
            const p = l.split('|').map(s=>s.trim());
            return { label:p[0]||'', url:p[1]||'' };
        }).filter(c=>c.label&&c.url);
    }

    const settings = {
        seo: {
            title: $('st-seo-title').value.trim()||'DoggoJr',
            description: $('st-seo-desc').value.trim(),
            favicon: $('st-seo-favicon').value.trim(),
        },
        banner: {
            enabled: $('st-banner-enabled').value==='true',
            message: $('st-banner-message').value.trim(),
            link: $('st-banner-link').value.trim(),
            linkText: $('st-banner-linktext').value.trim()||'learn more',
            color: $('st-banner-color').value,
            customColor: $('st-banner-custom').value,
            dismissible: $('st-banner-dismissible').value==='true',
        },
        hero: {
            name: $('st-hero-name').value.trim()||'DoggoJr',
            tag: $('st-hero-tag').value.trim()||'Roblox Scripter',
            bio: $('st-hero-bio').value.trim(),
            typewriterLines: $('st-hero-typewriter').value.trim().split('\n').filter(l=>l.trim()),
            extraButtons: parseButtons($('st-hero-buttons').value),
            showAvatar: $('st-hero-showava').value==='true',
            avatarRingSpeed: parseInt($('st-hero-ringspeed').value)||14,
            avatarGlow: $('st-hero-glow').value==='true',
        },
        nav: {
            extraLinks: parseNavLinks($('st-nav-links').value),
        },
        extraCards: parseCards($('st-extra-cards').value),
        projects: $('st-projects').value.split('\n').filter(l=>l.trim()).map(l=>{
            const p=l.split('|').map(s=>s.trim());
            return {title:p[0]||'',desc:p[1]||'',url:p[2]||'',tags:(p[3]||'').split(',').map(t=>t.trim()).filter(Boolean)};
        }).filter(p=>p.title),
        social: {
            twitter: $('st-social-twitter').value.trim(),
            tiktok: $('st-social-tiktok').value.trim(),
            twitch: $('st-social-twitch').value.trim(),
            custom: parseCustomSocial($('st-social-custom').value),
        },
        footer: {
            left: $('st-footer-left').value.trim()||'DoggoJr — ZumHub',
            right: $('st-footer-right').value.trim()||'built by hand',
            showClock: $('st-footer-clock').value==='true',
            showEasterEggHint: $('st-footer-egg').value==='true',
        },
        particles: {
            enabled: $('st-particles-enabled').value==='true',
            density: Math.min(200,Math.max(10,parseInt($('st-particles-density').value)||65)),
            connectionDistance: Math.min(200,Math.max(40,parseInt($('st-particles-dist').value)||85)),
            orbCount: Math.min(5,Math.max(0,parseInt($('st-particles-orbs').value)??3)),
        },
        music: {
            enabled: $('st-music-enabled').value==='true',
            autoplay: $('st-music-autoplay').value==='true',
            playlistUrl: $('st-music-playlist').value.trim(),
            label: $('st-music-label').value.trim()||'ZumHub Radio',
            volume: Math.min(100,Math.max(0,parseInt($('st-music-volume').value)||60)),
            shuffle: $('st-music-shuffle').value==='true',
            showPlayer: $('st-music-showplayer').value==='true',
        },
        theme: {
            accentColor: $('st-accent').value,
            accentLight: $('st-accent-light').value,
            accentDim: $('st-accent-dim').value,
            bgBase: $('st-bg-base').value,
            fontDisplay: $('st-theme-font').value,
        },
        locker: {
            message: $('st-locker-msg').value.trim(),
            contactText: $('st-locker-contact').value.trim(),
        },
        links: collectLinks(),
        layout: collectLayout(),
        profile: collectProfile(),
        stats: collectStats(),
        codeWindow: { show: $('cw-show').value==='true', file: $('cw-file').value.trim() },
        marquee: { show: $('mq-show').value==='true', words: $('mq-words').value.split(',').map(w=>w.trim()).filter(Boolean) },
    };

    try {
        const r = await fetch('/api/settings', {
            method:'POST', headers:authHeaders(), body:JSON.stringify({settings})
        });
        if(r.status===401){clearToken();showLogin();return;}
        const d = await r.json();
        if(!r.ok) throw new Error(d.error||'save failed');
        msg('msg-settings','✓ settings saved — changes live within about 30 seconds','ok');
        msg('msg-links','✓ saved — changes live within about 30 seconds','ok');
        if (d.settings) fillLinksTab(d.settings);
    } catch(e) { msg('msg-settings', e.message, 'err'); msg('msg-links', e.message, 'err'); }
}


function securityExpiryValue(choice){
    if(choice==='never') return null;
    const map={ '1h':3600000, '24h':86400000, '7d':604800000, '30d':2592000000 };
    return new Date(Date.now()+(map[choice]||0)).toISOString();
}

function formatBanExpiry(v){
    if(!v) return 'permanent';
    const d=new Date(v);
    return isNaN(d.getTime())?'invalid':d.toLocaleString();
}

async function loadSecurity(){
    const list=$('ban-list');
    if(!list) return;
    list.innerHTML='<div class="empty">loading bans...</div>';
    try{
        const r=await fetch('/api/security',{cache:'no-store',headers:authHeaders()});
        if(r.status===401){clearToken();showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'failed to load security');
        const bans=(d.bans||[]).filter(x=>!x.expiresAt||new Date(x.expiresAt)>new Date());
        $('ban-count').textContent=String(bans.length);
        const st=$('security-webhook-status');
        st.textContent=d.webhookConfigured?'Discord webhook: configured':'Discord webhook: not configured';
        st.className='msg '+(d.webhookConfigured?'ok':'warn');
        if(!bans.length){list.innerHTML='<div class="empty">no active bans</div>';return;}
        list.innerHTML='';
        bans.sort((a,b)=>String(a.ip).localeCompare(String(b.ip))).forEach(b=>{
            const el=document.createElement('div');
            el.className='entry';
            const meta=[b.reason||'manual ban',formatBanExpiry(b.expiresAt)].join(' &middot; ');
            el.innerHTML=`<div class="entry-left"><div class="entry-slug">${escapeHtml(b.ip)}</div><div class="entry-meta">${escapeHtml(meta)}</div></div><div class="entry-actions"><button class="btn btn-ghost btn-sm" data-ip="${escapeAttr(b.ip)}">unban</button></div>`;
            el.querySelector('button').onclick=(ev)=>{ev.stopPropagation();unbanIp(b.ip)};
            list.appendChild(el);
        });
    }catch(e){list.innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`;}
}

function escapeHtml(v){return String(v||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function escapeAttr(v){return escapeHtml(v);}

async function banIp(){
    const ip=$('sec-ban-ip').value.trim();
    const reason=$('sec-ban-reason').value.trim();
    if(!ip){msg('msg-security','enter an IP or CIDR','err');return;}
    if(!reason){msg('msg-security','enter a reason','err');return;}
    const expiresAt=securityExpiryValue($('sec-ban-expiry').value);
    msg('msg-security','saving ban...','');
    try{
        const r=await fetch('/api/security',{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'ban',ip,reason,expiresAt})});
        if(r.status===401){clearToken();showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'ban failed');
        $('sec-ban-ip').value='';$('sec-ban-reason').value='';$('sec-ban-expiry').value='never';
        msg('msg-security','✓ '+ip+' banned','ok');
        loadSecurity();
    }catch(e){msg('msg-security',e.message,'err');}
}

async function unbanIp(ip){
    if(!confirm('unban '+ip+'?')) return;
    msg('msg-security','removing ban...','');
    try{
        const r=await fetch('/api/security',{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'unban',ip})});
        if(r.status===401){clearToken();showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'unban failed');
        msg('msg-security','✓ '+ip+' unbanned','ok');
        loadSecurity();
    }catch(e){msg('msg-security',e.message,'err');}
}

// ── session cookie auth ──
function clearToken(){}

function authHeaders(){
    return { 'Content-Type': 'application/json', 'X-ZH-CSRF': '1' };
}

async function login(){
    const secret=$('inp-secret').value;
    msg('msg-login','signing in...','');
    try{
        const r=await fetch('/api/auth',{method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({secret})});
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'authentication failed');
        $('inp-secret').value='';
        showMain();
    }catch(e){msg('msg-login',e.message,'err');}
}

async function logout(){
    try{await fetch('/api/auth',{method:'POST',headers:authHeaders(),body:JSON.stringify({action:'logout'})});}catch(e){}
    location.reload();
}

async function checkAuth(){
    try{
        const r=await fetch('/api/auth',{cache:'no-store'});
        const d=await r.json();
        if(d.authenticated){showMain();return;}
    }catch(e){}
    showLogin();
}

function showLogin(){$('view-login').classList.add('on');$('view-main').classList.remove('on');setTimeout(()=>$('inp-secret').focus(),50);}
function showMain(){$('view-login').classList.remove('on');$('view-main').classList.add('on');loadList();}

// ── list ──
let searchTimer=null;
function schedSearch(){clearTimeout(searchTimer);searchTimer=setTimeout(loadList,220);}
async function loadList(){
    const list=$('script-list');
    const q=encodeURIComponent($('inp-search').value.trim());
    $('refresh-txt').innerHTML='<span class="spinner"></span>';
    list.innerHTML='<div class="empty">loading...</div>';
    try{
        const r=await fetch('/api/admin'+(q?'?q='+q:''),{cache:'no-store',headers:authHeaders()});
        if(r.status===401){clearToken();showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'failed to load');
        if(!d.scripts.length){list.innerHTML='<div class="empty">no scripts yet</div>';return;}
        list.innerHTML='';
        d.scripts.sort((a,b)=>a.slug.localeCompare(b.slug)).forEach(s=>{
            const el=document.createElement('div');
            el.className='entry';
            el.innerHTML=`<div class="entry-left"><div class="entry-slug">/l/${escapeHtml(s.slug)}</div>
                <div class="entry-meta">${escapeHtml(s.size)} bytes &middot; ${escapeHtml(s.path)}</div></div>
                <div class="entry-actions">
                <span class="badge badge-ok">active</span></div>`;
            el.onclick=()=>selectScript(s.slug);
            list.appendChild(el);
        });
    }catch(e){list.innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`;}
    finally{$('refresh-txt').textContent='refresh';}
}

// ── editor ──
async function selectScript(slug){
    $('inp-slug').value=slug;
    $('inp-slug').readOnly=true;
    $('inp-slug').style.color='var(--p2)';
    $('btn-delete').style.display='inline-flex';
    $('loader-box').classList.remove('on');
    hmsg('msg-save');
    $('editor-card').scrollIntoView({behavior:'smooth',block:'start'});
    try{
        const r=await fetch('/api/admin?slug='+encodeURIComponent(slug),{cache:'no-store',headers:authHeaders()});
        if(r.status===401){clearToken();showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'failed to load script');
        const s=d.script||{};
        $('inp-desc').value=s.description||'';
        $('inp-source').value=s.source||'';
        $('inp-enabled').value=s.enabled?'true':'false';
        if(s.expiresAt){
            $('inp-exp-type').value='custom';
            $('expiry-field').style.display='flex';
            const dt=new Date(s.expiresAt);
            $('inp-expires').value=isNaN(dt.getTime())?'':dt.toISOString().slice(0,16);
        }else{
            $('inp-exp-type').value='never';
            $('expiry-field').style.display='none';
            $('inp-expires').value='';
        }
        const sec=s.security||{};
        $('inp-game-ids').value=(sec.gameIds||[]).join(', ');
        $('inp-place-ids').value=(sec.placeIds||[]).join(', ');
        $('inp-executors').value=(sec.allowedExecutors||[]).join(', ');
        $('inp-capabilities').value=(sec.requiredCapabilities||[]).join(', ');
        $('inp-require-runtime').value=sec.requireRuntime===false?'false':'true';
        $('inp-require-executor').value=sec.requireExecutorId===false?'false':'true';
        $('inp-bind-mode').value=sec.bindMode||'off';
        $('inp-max-bindings').value=sec.maxBindings||1;
        $('inp-user-ids').value=(sec.allowedUserIds||[]).join(', ');
        $('inp-min-age').value=sec.minAccountAgeDays||0;
        loadBindings();
    }catch(e){msg('msg-save',e.message,'err');}
}
function clearEditor(){
    ['inp-slug','inp-desc','inp-source'].forEach(id=>$(id).value='');
    $('inp-slug').readOnly=false;
    $('inp-slug').style.color='';
    $('inp-enabled').value='true';
    $('inp-exp-type').value='never';
    $('inp-expires').value='';
    $('expiry-field').style.display='none';
    $('inp-game-ids').value='';
    $('inp-place-ids').value='';
    $('inp-executors').value='';
    $('inp-capabilities').value='';
    $('inp-require-runtime').value='true';
    $('inp-require-executor').value='true';
    $('inp-bind-mode').value='off';$('inp-max-bindings').value=1;$('inp-user-ids').value='';$('inp-min-age').value=0;
    $('bind-list').textContent='save the script, then open it to see who claimed the key.';
    $('btn-delete').style.display='none';
    $('loader-box').classList.remove('on');
    hmsg('msg-save');
}
function toggleExpiry(){$('expiry-field').style.display=$('inp-exp-type').value==='custom'?'flex':'none';}

async function saveScript(regenerateKey=false){
    const slug=$('inp-slug').value.trim().toLowerCase();
    const source=$('inp-source').value.trim();
    if(!slug){msg('msg-save','enter a slug','err');return;}
    if(!source&&!regenerateKey){msg('msg-save','paste a script first','err');return;}
    msg('msg-save','saving...','');
    let expiresAt=null;
    if($('inp-exp-type').value==='custom'){
        const raw=$('inp-expires').value;
        if(!raw){msg('msg-save','choose an expiration date','err');return;}
        expiresAt=new Date(raw).toISOString();
    }
    const listValue=id=>$(''+id).value.split(/[\s,;]+/).map(v=>v.trim()).filter(Boolean);
    const body={action:'upsert',slug,source,description:$('inp-desc').value.trim(),
        enabled:$('inp-enabled').value==='true',expiresAt,regenerateKey,
        security:{
            requireRuntime:$('inp-require-runtime').value==='true',
            requireExecutorId:$('inp-require-executor').value==='true',
            gameIds:listValue('inp-game-ids'),
            placeIds:listValue('inp-place-ids'),
            allowedExecutors:listValue('inp-executors'),
            requiredCapabilities:listValue('inp-capabilities'),
            bindMode:$('inp-bind-mode').value,
            maxBindings:Number($('inp-max-bindings').value)||1,
            allowedUserIds:listValue('inp-user-ids'),
            minAccountAgeDays:Number($('inp-min-age').value)||0,
        }};
    try{
        const r=await fetch('/api/admin',{method:'POST',headers:authHeaders(),body:JSON.stringify(body)});
        if(r.status===401){clearToken();showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'save failed');
        msg('msg-save','✓ saved — /l/'+d.slug,'ok');
        loadList();
        if(d.accessKey){
            const url=`${location.origin}/api/run?slug=${encodeURIComponent(d.slug)}&key=${encodeURIComponent(d.accessKey)}`;
            $('loader-text').textContent=`loadstring(game:HttpGet("${url}"))()`;
            $('loader-box').classList.add('on');
        }
    }catch(e){msg('msg-save',e.message,'err');}
}

async function deleteScript(){
    const slug=$('inp-slug').value.trim();
    if(!slug)return;
    if(!confirm('delete /l/'+slug+'? this cannot be undone.'))return;
    msg('msg-save','deleting...','');
    try{
        const r=await fetch('/api/admin',{method:'POST',headers:authHeaders(),
            body:JSON.stringify({action:'delete',slug})});
        if(r.status===401){clearToken();showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'delete failed');
        msg('msg-save','deleted /l/'+slug,'ok');
        clearEditor();loadList();
    }catch(e){msg('msg-save',e.message,'err');}
}

function regenKey(){
    if(confirm('regenerate the access key? the old loader will immediately stop working.'))
        saveScript(true);
}

async function copyLoader(btn){
    const text=$('loader-text').textContent;
    await navigator.clipboard.writeText(text);
    btn.textContent='copied!';
    setTimeout(()=>{btn.textContent='copy loader';},1800);
}


async function bindingsCall(action,extra){
    const slug=$('inp-slug').value.trim().toLowerCase();
    if(!slug) return null;
    const r=await fetch('/api/admin',{method:'POST',headers:authHeaders(),body:JSON.stringify(Object.assign({action,slug},extra||{}))});
    if(r.status===401){showLogin();return null;}
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||'request failed');
    return d.bindings;
}
function renderBindings(list){
    const box=$('bind-list');
    box.textContent='';
    if(!list||!list.length){box.textContent='nobody has claimed this key yet.';return;}
    list.forEach(b=>{
        const row=document.createElement('div');
        row.style.cssText='display:flex;gap:.6rem;align-items:center;justify-content:space-between;padding:.3rem 0;border-bottom:1px solid var(--bd);';
        const t=document.createElement('span');
        t.textContent='user '+(b.userId||'—')+' · client '+(b.client||'—')+' · '+b.uses+' uses · last '+String(b.last||'').slice(0,16).replace('T',' ');
        const x=document.createElement('button');
        x.className='btn btn-ghost btn-sm';x.type='button';x.textContent='remove';
        x.addEventListener('click',async()=>{try{renderBindings(await bindingsCall('unbind',{index:b.index}));}catch(e){box.textContent=e.message;}});
        row.appendChild(t);row.appendChild(x);box.appendChild(row);
    });
}
async function loadBindings(){
    try{renderBindings(await bindingsCall('bindings'));}catch(e){$('bind-list').textContent=e.message;}
}
async function resetBindingsUi(){
    if(!confirm('Clear every bound identity for this script?')) return;
    try{renderBindings(await bindingsCall('resetBindings'));}catch(e){$('bind-list').textContent=e.message;}
}

let __lastReport=null;
function dbgKV(obj,indent){
    return Object.entries(obj).map(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)
        ?(indent||'')+k+':\n'+dbgKV(v,(indent||'')+'  ')
        :(indent||'')+k+': '+(v===null?'—':String(v))).join('\n');
}
async function dbgReport(){
    const box=$('dbg-report');
    box.className='msg';box.textContent='loading...';
    try{
        const r=await fetch('/api/debug',{cache:'no-store',headers:authHeaders()});
        if(r.status===404){box.className='msg err';box.textContent='debug is off (set LOCKER_DEBUG=on on the server) or your session expired.';return;}
        const d=await r.json();
        __lastReport=d.report;
        box.className='msg';
        box.style.whiteSpace='pre-wrap';box.style.fontFamily='var(--mono)';
        box.textContent=dbgKV(d.report);
    }catch(e){box.className='msg err';box.textContent=e.message;}
}
function dbgCopy(){
    if(!__lastReport){return;}
    const text=JSON.stringify(__lastReport,null,2);
    (navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(()=>msg('dbg-summary','report copied','ok'),()=>msg('dbg-summary','copy failed','err'));
}
function dbgCalls(){
    const box=$('dbg-calls');
    box.style.whiteSpace='pre';box.style.fontFamily='var(--mono)';box.style.overflow='auto';
    box.textContent=__calls.length?__calls.slice().reverse().map(c=>c.t+'  '+c.method.padEnd(5)+' '+String(c.status).padEnd(4)+' '+String(c.ms).padStart(5)+'ms  '+c.url).join('\n'):'no calls yet';
}
async function dbgRun(){
    const secret=$('dbg-secret').value;
    if(!secret){msg('dbg-summary','enter the admin secret','err');return;}
    msg('dbg-summary','running...','');
    $('dbg-results').textContent='';
    try{
        const r=await fetch('/api/debug',{method:'POST',headers:authHeaders(),body:JSON.stringify({secret,deep:$('dbg-deep').value==='true',webhookPing:$('dbg-ping').value==='true'})});
        $('dbg-secret').value='';
        if(r.status===404){msg('dbg-summary','debug is off on the server or your session expired','err');return;}
        const d=await r.json();
        if(!r.ok){msg('dbg-summary',d.error||'failed','err');return;}
        const s=d.summary;
        msg('dbg-summary',s.pass+' passed · '+s.fail+' failed · '+(s.skip||0)+' skipped · '+(s.info||0)+' info',s.fail?'err':'ok');
        const out=$('dbg-results');
        let group='';
        d.results.forEach(t=>{
            if(t.group!==group){group=t.group;const g=document.createElement('div');g.className='card-title';g.style.marginTop='.9rem';g.textContent=group;out.appendChild(g);}
            const row=document.createElement('div');
            row.style.cssText='display:flex;gap:.6rem;padding:.3rem 0;border-bottom:1px solid var(--bd);font-size:.8rem;';
            const mark={pass:'✓',fail:'✗',skip:'–',info:'i'}[t.status]||'?';
            const m=document.createElement('b');m.textContent=mark;m.style.color=t.status==='pass'?'#4ade80':t.status==='fail'?'#f87171':'#a89fcc';
            const n=document.createElement('span');n.style.flex='1';n.textContent=t.name+(t.detail?' — '+t.detail:'');
            const ms=document.createElement('span');ms.style.opacity='.6';ms.textContent=t.ms+'ms';
            row.appendChild(m);row.appendChild(n);row.appendChild(ms);out.appendChild(row);
        });
        __lastReport=d.report;dbgCalls();
    }catch(e){msg('dbg-summary',e.message,'err');}
}

async function loadHealth(){
    const box=$('health-list');
    box.textContent='checking...';box.className='msg';
    try{
        const r=await fetch('/api/health',{cache:'no-store',headers:authHeaders()});
        if(r.status===401){showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'check failed');
        const bad=Object.entries(d.required).filter(([,v])=>v!=='set').map(([k,v])=>k+' ('+v+')');
        const opt=Object.entries(d.optional).filter(([,v])=>v!=='set').map(([k])=>k);
        box.textContent=(d.ok?'✓ all required variables are set':'✗ problems: '+bad.join(', '))+(opt.length?' · optional not set: '+opt.join(', '):'');
        box.className='msg '+(d.ok?'ok':'err');
    }catch(e){box.textContent=e.message;box.className='msg err';}
}

document.addEventListener('click',e=>{
    const t=e.target.closest('[data-tab],[data-click]');
    if(!t) return;
    if(t.dataset.tab){setTab(t.dataset.tab,t);return;}
    const fn=window[t.dataset.click];
    if(typeof fn==='function') (t.dataset.click==='copyLoader'?fn(t):fn());
});
document.addEventListener('input',e=>{
    const t=e.target.closest('[data-input]');
    if(t&&typeof window[t.dataset.input]==='function') window[t.dataset.input]();
});
document.addEventListener('change',e=>{
    const t=e.target.closest('[data-change]');
    if(t&&typeof window[t.dataset.change]==='function') window[t.dataset.change]();
});
document.addEventListener('keydown',e=>{
    const t=e.target.closest&&e.target.closest('[data-enter]');
    if(t&&e.key==='Enter'&&typeof window[t.dataset.enter]==='function') window[t.dataset.enter]();
});

checkAuth();


/* ---- links & layout editors ---- */
const ICON_LIST=['link','star','code','gamepad','heart','discord','youtube','doc','github','globe','mail','music','bolt','shield'];
let lkState=[];
let secState=[];
const PRESETS={
    purple:['#7c5cbf','#a07ee0','#3d2475'],
    teal:['#2a9d8f','#5ad1c3','#14504a'],
    pink:['#c45890','#f08bb8','#7a2a55'],
    ember:['#e2682f','#ffa66b','#7a3410'],
    mono:['#8a8aa0','#d0d0e0','#3a3a4a']
};

function el(tag,props,kids){
    const e=document.createElement(tag);
    Object.entries(props||{}).forEach(([k,v])=>{ if(k==='class')e.className=v; else if(k==='text')e.textContent=v; else if(k==='value')e.value=v; else if(k==='checked')e.checked=v; else e.setAttribute(k,v); });
    (kids||[]).forEach(c=>e.appendChild(c));
    return e;
}
function option(v,t,sel){const o=el('option',{value:v,text:t});if(sel)o.selected=true;return o;}

function syncLinksFromDom(){
    lkState=[...document.querySelectorAll('#lk-list .lk-row')].map(row=>({
        id:row.dataset.id,
        title:row.querySelector('.lk-title').value.trim(),
        sub:row.querySelector('.lk-sub').value.trim(),
        url:row.querySelector('.lk-url').value.trim(),
        icon:row.querySelector('.lk-icon').value,
        color:row.querySelector('.lk-color').value,
        size:row.querySelector('.lk-size').value,
        enabled:row.querySelector('.lk-on').checked,
        hero:row.querySelector('.lk-hero').checked,
        nav:row.querySelector('.lk-nav').checked
    }));
}
function collectLinks(){syncLinksFromDom();return lkState.filter(l=>l.title);}

function renderLinks(){
    const box=$('lk-list');
    box.textContent='';
    if(!lkState.length){box.appendChild(el('div',{class:'empty',text:'no links yet. add one.'}));return;}
    lkState.forEach((l,i)=>{
        const row=el('div',{class:'lk-row'+(l.enabled?'':' off'),'data-id':l.id||''});
        const up=el('button',{class:'btn btn-ghost btn-sm',type:'button',text:'↑','aria-label':'move up'});
        const down=el('button',{class:'btn btn-ghost btn-sm',type:'button',text:'↓','aria-label':'move down'});
        const del=el('button',{class:'btn btn-red btn-sm',type:'button',text:'delete'});
        up.addEventListener('click',()=>{syncLinksFromDom();if(i>0){[lkState[i-1],lkState[i]]=[lkState[i],lkState[i-1]];renderLinks();}});
        down.addEventListener('click',()=>{syncLinksFromDom();if(i<lkState.length-1){[lkState[i+1],lkState[i]]=[lkState[i],lkState[i+1]];renderLinks();}});
        del.addEventListener('click',()=>{syncLinksFromDom();if(confirm('Delete "'+(lkState[i].title||'this link')+'"?')){lkState.splice(i,1);renderLinks();}});
        const on=el('input',{type:'checkbox',class:'lk-on',checked:l.enabled});
        on.addEventListener('change',()=>row.classList.toggle('off',!on.checked));
        const head=el('div',{class:'lk-head'},[el('b',{text:String(i+1).padStart(2,'0')}),up,down,el('label',{},[on,document.createTextNode('visible')]),el('span',{class:'lk-status','data-st':'1',text:'unchecked'}),el('span',{class:'sp'}),del]);
        const icon=el('select',{class:'lk-icon'},ICON_LIST.map(n=>option(n,n,n===l.icon)));
        const size=el('select',{class:'lk-size'},[option('md','normal',l.size!=='lg'),option('lg','large (bento)',l.size==='lg')]);
        const grid=el('div',{class:'lk-grid'},[
            el('input',{class:'lk-title',placeholder:'title',value:l.title||'',maxlength:'40'}),
            el('input',{class:'lk-sub',placeholder:'subtitle (small text)',value:l.sub||'',maxlength:'60'}),
            el('input',{class:'lk-url full',placeholder:'https://... (leave empty to hide the card)',value:l.url||'',maxlength:'500'}),
            icon,size,
            el('input',{class:'lk-color',type:'color',value:l.color||'#a07ee0'}),
            el('div',{class:'lk-flags'},[
                el('label',{},[el('input',{type:'checkbox',class:'lk-hero',checked:!!l.hero}),document.createTextNode('hero button')]),
                el('label',{},[el('input',{type:'checkbox',class:'lk-nav',checked:!!l.nav}),document.createTextNode('top bar')])
            ])
        ]);
        row.appendChild(head);row.appendChild(grid);box.appendChild(row);
    });
}
function lkAdd(){
    syncLinksFromDom();
    if(lkState.length>=20){msg('msg-links','20 links max','err');return;}
    lkState.push({id:'',title:'New link',sub:'',url:'',icon:'link',color:'#a07ee0',size:'md',enabled:true,hero:false,nav:false});
    renderLinks();
    const rows=document.querySelectorAll('#lk-list .lk-row');
    const last=rows[rows.length-1];
    if(last){last.scrollIntoView({block:'center'});last.querySelector('.lk-title').select();}
}
async function lkCheck(){
    syncLinksFromDom();
    const targets=lkState.map((l,i)=>({i,url:l.url})).filter(t=>t.url);
    if(!targets.length){msg('msg-links','no urls to check','err');return;}
    msg('msg-links','checking '+targets.length+' link(s)...','');
    const rows=document.querySelectorAll('#lk-list .lk-row');
    targets.forEach(t=>{const s=rows[t.i].querySelector('[data-st]');s.textContent='checking';s.className='lk-status';});
    try{
        const r=await fetch('/api/linkcheck',{method:'POST',headers:authHeaders(),body:JSON.stringify({urls:targets.map(t=>t.url)})});
        if(r.status===401){showLogin();return;}
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'check failed');
        let bad=0;
        d.results.forEach((res,k)=>{
            const s=rows[targets[k].i].querySelector('[data-st]');
            s.className='lk-status '+(res.status==='ok'?'ok':res.status==='dead'?'dead':'');
            s.textContent=res.status==='ok'?'✓ '+res.detail:res.status==='dead'?'✗ '+res.detail:'? '+res.detail;
            if(res.status==='dead')bad++;
        });
        msg('msg-links',bad?bad+' dead link(s). fix the url and save.':'no dead links found','ok');
    }catch(e){msg('msg-links',e.message,'err');}
}

function renderSections(){
    const box=$('lay-sections');
    box.textContent='';
    secState.forEach((s,i)=>{
        const up=el('button',{class:'btn btn-ghost btn-sm',type:'button',text:'↑'});
        const down=el('button',{class:'btn btn-ghost btn-sm',type:'button',text:'↓'});
        const title=el('input',{type:'text',class:'sec-title-in',value:s.title,maxlength:'40'});
        const on=el('input',{type:'checkbox',class:'sec-on',checked:s.enabled});
        const move=d=>{syncSections();const j=i+d;if(j<0||j>=secState.length)return;[secState[i],secState[j]]=[secState[j],secState[i]];renderSections();};
        up.addEventListener('click',()=>move(-1));down.addEventListener('click',()=>move(1));
        box.appendChild(el('div',{class:'sec-row','data-id':s.id},[el('span',{class:'nm',text:s.id}),title,el('label',{class:'lk-flags'},[on,document.createTextNode('on')]),up,down]));
    });
}
function syncSections(){
    secState=[...document.querySelectorAll('#lay-sections .sec-row')].map(r=>({id:r.dataset.id,title:r.querySelector('.sec-title-in').value.trim()||r.dataset.id,enabled:r.querySelector('.sec-on').checked}));
}
function collectLayout(){
    syncSections();
    return {
        sections:secState,
        linkStyle:$('lay-style').value,
        embed:{enabled:$('lay-embed').value==='true',user:$('lay-embed-user').value.trim()}
    };
}
function pairs(raw,max){
    return raw.split('\n').map(l=>l.split('|').map(s=>s.trim())).filter(p=>p[0]&&p[1]).slice(0,max);
}
function collectProfile(){
    return {
        show:$('pf-show').value==='true',
        showBarcode:$('pf-bar').value==='true',
        topLeft:$('pf-tl').value.trim(),
        topRight:$('pf-tr').value.trim(),
        handle:$('pf-handle').value.trim(),
        mark:$('pf-mark').value.trim(),
        rows:pairs($('pf-rows').value,5).map(p=>({label:p[0],value:p[1]}))
    };
}
function collectStats(){
    return {show:$('stat-show').value==='true',items:pairs($('stat-items').value,4).map(p=>({n:p[0],l:p[1]}))};
}
function fillLinksTab(s){
    lkState=(s.links||[]).map(l=>Object.assign({},l));
    renderLinks();
    secState=((s.layout&&s.layout.sections)||[]).map(x=>Object.assign({},x));
    renderSections();
    const lay=s.layout||{};
    $('lay-style').value=lay.linkStyle||'bento';
    $('lay-embed').value=String(!(lay.embed&&lay.embed.enabled===false));
    $('lay-embed-user').value=(lay.embed&&lay.embed.user)||'ZumHub';
    const mq=s.marquee||{};
    $('mq-show').value=String(mq.show!==false);
    $('mq-words').value=(mq.words||[]).join(', ');
    const cw=s.codeWindow||{};
    $('cw-show').value=String(cw.show!==false);
    $('cw-file').value=cw.file||'zumhub.lua';
    const p=s.profile||{};
    $('pf-show').value=String(p.show!==false);
    $('pf-bar').value=String(p.showBarcode!==false);
    $('pf-tl').value=p.topLeft||'';
    $('pf-tr').value=p.topRight||'';
    $('pf-handle').value=p.handle||'';
    $('pf-mark').value=p.mark||'';
    $('pf-rows').value=(p.rows||[]).map(r=>r.label+' | '+r.value).join('\n');
    const st=s.stats||{};
    $('stat-show').value=String(st.show!==false);
    $('stat-items').value=(st.items||[]).map(i=>i.n+' | '+i.l).join('\n');
}
document.addEventListener('click',e=>{
    const b=e.target.closest('[data-preset]');
    if(!b) return;
    const c=PRESETS[b.dataset.preset];
    if(!c) return;
    $('st-accent').value=c[0];$('st-accent-light').value=c[1];$('st-accent-dim').value=c[2];
});
