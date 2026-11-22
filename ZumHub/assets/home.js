(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var root = document.documentElement;
    var body = document.body;
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    var store = {
        get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
        sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
        sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
    };

    function safeHref(u) {
        u = String(u || '').trim();
        if (!u) return '';
        if (u.charAt(0) === '#' || (u.charAt(0) === '/' && u.charAt(1) !== '/')) return u;
        try {
            var p = new URL(u).protocol;
            return p === 'https:' || p === 'http:' || p === 'mailto:' ? u : '';
        } catch (e) { return ''; }
    }

    function isExternal(u) { return /^https?:/i.test(u); }

    var toastTimer;
    function toast(msg) {
        var t = $('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2200);
    }

    var calm = reduced || store.get('zh_fx') === 'calm';
    function applyCalm() {
        body.classList.toggle('calm', calm);
        var l = $('cmdk-calm-label');
        if (l) l.textContent = calm ? 'Turn effects on' : 'Turn effects off';
    }
    applyCalm();
    if (navigator.getBattery && store.get('zh_fx') === null && !reduced) {
        navigator.getBattery().then(function (b) {
            if (!b.charging && b.level < 0.2) { calm = true; applyCalm(); toast('battery low, effects off'); }
        }).catch(function () {});
    }

    var heroName = 'DoggoJr';
    function renderName(el, name) {
        el.textContent = '';
        if (name.length > 2) {
            el.appendChild(document.createTextNode(name.slice(0, -2)));
            var em = document.createElement('em');
            em.textContent = name.slice(-2);
            el.appendChild(em);
        } else {
            el.textContent = name;
        }
    }

    function hexToRgb(h) {
        var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || '');
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [124, 92, 191];
    }

    var cfg = { particles: { enabled: true, density: 65, speed: 0.22, connectionDistance: 85 }, accent: [124, 92, 191], lines: null };

    /* particles */
    var bg = (function () {
        var cv = $('bgc');
        if (!cv || !cv.getContext) return { start: function () {} };
        var ctx = cv.getContext('2d');
        var W = 0, H = 0, pts = [], mx = -999, my = -999, running = false;

        function make() {
            var s = cfg.particles.speed;
            return { x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * s, vy: (Math.random() - 0.5) * s, r: Math.random() * 1.1 + 0.3, a: Math.random() * 0.28 + 0.05 };
        }
        function init() {
            W = cv.width = innerWidth;
            H = cv.height = innerHeight;
            var n = Math.min(cfg.particles.density, Math.floor(W * H / 18000));
            pts = [];
            for (var i = 0; i < n; i++) pts.push(make());
        }
        function frame() {
            if (!running) return;
            requestAnimationFrame(frame);
            if (document.hidden || calm) return;
            ctx.clearRect(0, 0, W, H);
            var c = root.classList.contains('fem') ? [196, 88, 144] : cfg.accent;
            var col = c[0] + ',' + c[1] + ',' + c[2];
            var D = cfg.particles.connectionDistance;
            for (var i = 0; i < pts.length; i++) {
                var p = pts[i];
                var dx = p.x - mx, dy = p.y - my, d = Math.sqrt(dx * dx + dy * dy);
                if (d < 100 && d > 0) { var f = (100 - d) / 100; p.vx += dx / d * f * 0.032; p.vy += dy / d * f * 0.032; }
                p.vx *= 0.97; p.vy *= 0.97;
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x = W; if (p.x > W) p.x = 0; if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832);
                ctx.fillStyle = 'rgba(' + col + ',' + p.a + ')'; ctx.fill();
                for (var j = i + 1; j < pts.length; j++) {
                    var q = pts[j], ex = p.x - q.x, ey = p.y - q.y, e = Math.sqrt(ex * ex + ey * ey);
                    if (e < D) {
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
                        ctx.strokeStyle = 'rgba(' + col + ',' + (0.06 * (1 - e / D)) + ')';
                        ctx.lineWidth = 0.5; ctx.stroke();
                    }
                }
            }
        }
        addEventListener('resize', function () { if (running) init(); });
        addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; });
        addEventListener('touchmove', function (e) { if (e.touches[0]) { mx = e.touches[0].clientX; my = e.touches[0].clientY; } }, { passive: true });
        return {
            start: function () {
                if (!cfg.particles.enabled || reduced) { cv.hidden = true; return; }
                cv.hidden = false;
                init();
                if (!running) { running = true; frame(); }
            }
        };
    })();

    /* typewriter */
    (function () {
        var el = $('tw-t');
        if (!el) return;
        var defaults = ['-- 3-4 years Luau', '-- ZumHub founder', '-- scripter not a coder', '-- DoggoJr / DoggoJ'];
        var l = 0, c = 0, del = false, hold = 0;
        if (reduced) { el.textContent = defaults[0]; window._twStatic = el; return; }
        function lines() { return cfg.lines && cfg.lines.length ? cfg.lines : defaults; }
        function tick() {
            if (hold > 0) { hold--; return setTimeout(tick, 50); }
            var L = lines(); if (l >= L.length) l = 0;
            var cur = L[l];
            if (!del) {
                el.textContent = cur.slice(0, ++c);
                if (c >= cur.length) { hold = 55; del = true; }
                setTimeout(tick, 58 + Math.random() * 22);
            } else {
                el.textContent = cur.slice(0, --c);
                if (c <= 0) { del = false; l = (l + 1) % L.length; hold = 18; }
                setTimeout(tick, 28);
            }
        }
        setTimeout(tick, 900);
    })();

    /* name scramble */
    (function () {
        var el = $('hero-name');
        if (!el || reduced) return;
        var chars = 'abcdefghijklmnopqrstuvwxyz0123456789_-', running = false;
        function go() {
            if (running || calm) return;
            running = true;
            var steps = 0, max = 10, target = heroName;
            var iv = setInterval(function () {
                var out = '';
                for (var i = 0; i < target.length; i++) out += steps / max > i / target.length ? target.charAt(i) : chars.charAt(Math.floor(Math.random() * chars.length));
                renderName(el, out);
                if (++steps > max) { clearInterval(iv); renderName(el, target); running = false; }
            }, 40);
        }
        el.addEventListener('mouseenter', go);
    })();

    /* small things */
    (function () {
        var bar = $('scroll-progress');
        var hint = $('scroll-hint');
        function onScroll() {
            var h = root, max = h.scrollHeight - h.clientHeight;
            if (bar) bar.style.width = (max > 0 ? h.scrollTop / max * 100 : 0) + '%';
            if (hint) hint.classList.toggle('gone', scrollY > 80);
            spy();
        }
        var secs = ['links', 'projects'];
        function spy() {
            secs.forEach(function (id) {
                var s = $(id), a = $('navlink-' + id);
                if (!s || !a || s.hidden) return;
                var r = s.getBoundingClientRect();
                a.classList.toggle('active', r.top < innerHeight * 0.4 && r.bottom > innerHeight * 0.2);
            });
        }
        addEventListener('scroll', onScroll, { passive: true });
        addEventListener('resize', onScroll);
        onScroll();

        var clock = $('footer-clock');
        if (clock) {
            var tick = function () { var d = new Date(); clock.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
            tick(); setInterval(tick, 15000);
        }

        var st = $('nav-status');
        if (st && !reduced) {
            var states = ['scripting', 'debugging', 'probably afk', 'shipping bugs', 'fixing yesterdays bugs'], i = 0;
            setInterval(function () {
                if (calm) return;
                i = (i + 1) % states.length;
                st.style.opacity = 0;
                setTimeout(function () { st.textContent = states[i]; st.style.opacity = 1; }, 250);
            }, 5000);
        }

    })();

    var revealIO = ('IntersectionObserver' in window) ? new IntersectionObserver(function (es) {
        es.forEach(function (e) {
            if (!e.isIntersecting) return;
            var el = e.target;
            var idx = [].indexOf.call(el.parentNode.children, el);
            setTimeout(function () { el.classList.add('in'); }, Math.min(idx, 8) * 60);
            revealIO.unobserve(el);
        });
    }, { threshold: 0.08 }) : null;
    function watch(el) {
        if (revealIO) revealIO.observe(el); else el.classList.add('in');
    }
    [].forEach.call(document.querySelectorAll('.reveal'), watch);

    /* card glow follows pointer */
    document.addEventListener('mousemove', function (e) {
        var c = e.target.closest && e.target.closest('.card, .proj');
        if (!c) return;
        var r = c.getBoundingClientRect();
        c.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        c.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    });

    /* data-driven pieces */
    var FALLBACK = {
        v: 4,
        links: [
            { id: 'discord', title: 'Discord', sub: 'ZumHub Community', url: 'https://discord.gg/rUMe7x6BDp', icon: 'discord', color: '#7b8cff', size: 'lg', enabled: true, hero: true, nav: true },
            { id: 'youtube', title: 'YouTube', sub: '@zmh.j', url: 'https://youtube.com/@zmh.j', icon: 'youtube', color: '#ff4d5e', size: 'md', enabled: true, hero: true, nav: true },
            { id: 'scriptblox', title: 'ScriptBlox', sub: 'u/Jardin', url: 'https://scriptblox.com/u/Jardin', icon: 'code', color: '#34d399', size: 'md', enabled: true, hero: true, nav: false },
            { id: 'rscripts', title: 'Rscripts', sub: 'ZumHub', url: 'https://rscripts.net/user/ZumHub', icon: 'doc', color: '#fbbf24', size: 'md', enabled: true, hero: true, nav: false },
            { id: 'github', title: 'GitHub', sub: 'EkiraUtomo', url: 'https://github.com/EkiraUtomo', icon: 'github', color: '#c9b0ff', size: 'md', enabled: true, hero: false, nav: false }
        ],
        profile: { show: true, topLeft: 'ZumHub', topRight: 'Founder', handle: 'aka DoggoJ', rows: [{ label: 'role', value: 'Roblox scripter' }, { label: 'runs', value: 'ZumHub' }, { label: 'style', value: 'scripter, not a coder' }], showBarcode: true, mark: 'DJ // ZH' },
        stats: { show: true, items: [{ n: '3+', l: 'years' }, { n: 'Luau', l: 'language' }, { n: 'active', l: 'status' }] },
        codeWindow: { show: true, file: 'zumhub.lua' },
        marquee: { show: true, words: ['LUAU', 'ZUMHUB', 'SCRIPTS', 'TOOLS', 'COMMUNITY', 'BUILT BY HAND'] },
        layout: { sections: [{ id: 'projects', title: 'Projects', enabled: true }, { id: 'links', title: 'Find me', enabled: true }], linkStyle: 'bento', embed: { enabled: true, user: 'ZumHub' } },
        hero: {}, extraCards: [], projects: [], nav: { extraLinks: [] }, social: {}, footer: {}, particles: {}, music: {}, theme: {}, seo: {}, banner: {}
    };

    var ICONS = {
        link: '<path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"/>',
        star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
        code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
        gamepad: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4m-2-2v4"/><circle cx="16" cy="12" r="1"/><circle cx="18" cy="10" r="1"/>',
        heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
        discord: '<circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><path d="M6 7c2-1 4-1.5 6-1.5S16 6 18 7c1.5 3 2 6 1.5 9-1.2.9-2.5 1.5-4 2l-1-1.6M6 7c-1.5 3-2 6-1.5 9 1.2.9 2.5 1.5 4 2l1-1.6"/>',
        youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="3.5"/><polygon points="10 9 15.5 12 10 15"/>',
        doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
        github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
        globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>',
        music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
        bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
    };
    var SVG = 'http://www.w3.org/2000/svg';
    function svg(inner, cls) {
        var s = document.createElementNS(SVG, 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        if (cls) s.setAttribute('class', cls);
        s.innerHTML = inner;
        return s;
    }
    function div(cls, text) {
        var d = document.createElement('div');
        d.className = cls;
        if (text !== undefined) d.textContent = text;
        return d;
    }
    function link(href, cls) {
        var a = document.createElement('a');
        a.className = cls;
        a.href = href;
        if (isExternal(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        return a;
    }
    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
    var ARROW = '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>';
    var ARROW_UP = '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>';
    var DISCORD_FILL = null;

    function cardFor(c) {
        var href = safeHref(c.url);
        if (!href) return null;
        var a = link(href, 'card reveal' + (c.size === 'lg' ? ' card-lg' : ''));
        if (c.color) a.style.setProperty('--c', c.color);
        var ico = div('card-ico'); ico.appendChild(svg(ICONS[c.icon] || ICONS.link));
        var b = div('card-body'); b.appendChild(div('card-title', c.title)); b.appendChild(div('card-sub', c.sub || ''));
        var ar = div('card-arr'); ar.appendChild(svg(ARROW));
        a.appendChild(ico); a.appendChild(b); a.appendChild(ar);
        return a;
    }

    function renderLinks(s) {
        var box = $('cards');
        clear(box);
        box.className = 'cards style-' + ((s.layout && s.layout.linkStyle) || 'bento');
        var items = (s.links || []).filter(function (l) { return l.enabled !== false; }).map(function (l) { return l; });
        (s.extraCards || []).forEach(function (c) { items.push({ title: c.title, sub: c.sub, url: c.url, icon: c.icon, size: 'md' }); });
        var so = s.social || {};
        [['twitter', 'Twitter / X'], ['tiktok', 'TikTok'], ['twitch', 'Twitch']].forEach(function (p) {
            if (so[p[0]]) items.push({ title: p[1], sub: String(so[p[0]]).replace(/^https?:\/\/(www\.)?/, ''), url: so[p[0]], icon: 'globe', size: 'md' });
        });
        (so.custom || []).forEach(function (c) { items.push({ title: c.label, sub: String(c.url).replace(/^https?:\/\/(www\.)?/, ''), url: c.url, icon: 'link', size: 'md' }); });
        items.forEach(function (c) { var el = cardFor(c); if (el) { box.appendChild(el); watch(el); } });
    }

    function renderHeroButtons(s) {
        var box = $('hero-btns');
        clear(box);
        var first = true;
        (s.links || []).forEach(function (l) {
            var href = safeHref(l.url);
            if (l.enabled === false || !l.hero || !href) return;
            var a = link(href, 'btn ' + (first ? 'btn-p' : 'btn-o'));
            a.appendChild(svg(ICONS[l.icon] || ICONS.link));
            a.appendChild(document.createTextNode(l.title));
            box.appendChild(a);
            first = false;
        });
        ((s.hero && s.hero.extraButtons) || []).forEach(function (b) {
            var href = safeHref(b.url);
            if (!href) return;
            var a = link(href, 'btn ' + (b.style === 'primary' ? 'btn-p' : 'btn-o'));
            a.textContent = b.label;
            box.appendChild(a);
        });
        box.hidden = !box.firstChild;
    }

    function renderNav(s) {
        var box = $('nav-dyn');
        clear(box);
        (s.links || []).forEach(function (l) {
            var href = safeHref(l.url);
            if (l.enabled === false || !l.nav || !href) return;
            var a = link(href, 'nav-link hide-s');
            a.textContent = l.title.toLowerCase();
            box.appendChild(a);
        });
        ((s.nav && s.nav.extraLinks) || []).forEach(function (l) {
            var href = safeHref(l.url);
            if (!href) return;
            var a = link(href, 'nav-link');
            if (l.external === false) { a.removeAttribute('target'); a.removeAttribute('rel'); }
            a.textContent = l.label;
            box.appendChild(a);
        });
    }

    function renderCmdLinks(s) {
        var box = $('cmdk-ext');
        clear(box);
        (s.links || []).forEach(function (l) {
            var href = safeHref(l.url);
            if (l.enabled === false || !href) return;
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'cmdk-item';
            b.dataset.url = href;
            b.appendChild(svg(ICONS[l.icon] || ICONS.link));
            var t = document.createElement('span'); t.textContent = 'Open ' + l.title; b.appendChild(t);
            var m = document.createElement('span'); m.className = 'cmdk-meta'; m.textContent = '\u2197'; b.appendChild(m);
            box.appendChild(b);
        });
    }

    function renderStats(s) {
        var box = $('hero-stats');
        clear(box);
        var st = s.stats || {};
        box.hidden = st.show === false || !(st.items && st.items.length);
        (st.items || []).forEach(function (i) {
            var d = div('st');
            d.appendChild(div('st-n', i.n)); d.appendChild(div('st-l', i.l));
            box.appendChild(d);
        });
        countUp(box);
    }

    function countUp(box) {
        if (reduced || !('IntersectionObserver' in window)) return;
        var io = new IntersectionObserver(function (es) {
            if (!es[0].isIntersecting) return;
            io.disconnect();
            [].forEach.call(box.querySelectorAll('.st-n'), function (n) {
                var m = /^(\d+)(.*)$/.exec(n.textContent.trim());
                if (!m) return;
                var end = +m[1], t0 = null;
                (function f(ts) {
                    if (!t0) t0 = ts;
                    var p = Math.min((ts - t0) / 900, 1);
                    n.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + m[2];
                    if (p < 1) requestAnimationFrame(f);
                })(performance.now());
            });
        }, { threshold: 0.5 });
        io.observe(box);
    }

    function renderProfile(s) {
        var p = s.profile || {}, h = s.hero || {};
        var card = $('hero-right');
        var showCard = p.show !== false && h.showAvatar !== false;
        card.hidden = !showCard;
        $('hero-grid').classList.toggle('no-ava', !showCard);
        $('idc-tl').textContent = p.topLeft || '';
        $('idc-tr').textContent = p.topRight || '';
        $('idc-handle').textContent = p.handle || '';
        $('idc-mark').textContent = p.mark || '';
        $('idc-bar').hidden = p.showBarcode === false;
        var rows = $('idc-rows');
        clear(rows);
        rows.hidden = !(p.rows && p.rows.length);
        (p.rows || []).forEach(function (r) {
            var d = document.createElement('div');
            var dt = document.createElement('dt'); dt.textContent = r.label;
            var dd = document.createElement('dd'); dd.textContent = r.value;
            d.appendChild(dt); d.appendChild(dd); rows.appendChild(d);
        });
        $('ava-glow').hidden = h.avatarGlow === false;
        if (h.avatarRingSpeed) $('ava-ring').firstElementChild.style.animationDuration = h.avatarRingSpeed + 's';
    }

    function renderMarquee(s) {
        var m = s.marquee || {}, box = $('marquee'), track = $('mq-track');
        clear(track);
        var words = m.words || [];
        box.hidden = m.show === false || !words.length;
        var track2 = $('mq-track2');
        if (!track2) { track2 = document.createElement('div'); track2.id = 'mq-track2'; track2.className = 'mq-track rev'; box.appendChild(track2); }
        clear(track2);
        [track, track2].forEach(function (t, k) {
            var list = k ? words.slice().reverse() : words;
            for (var r = 0; r < 4; r++) {
                list.forEach(function (w) {
                    var sp = document.createElement('span'); sp.textContent = w; t.appendChild(sp);
                    var em = document.createElement('em'); em.textContent = '\u2726'; t.appendChild(em);
                });
            }
        });
    }

    function renderProjects(s) {
        var grid = $('projects-grid');
        clear(grid);
        (s.projects || []).forEach(function (p) {
            var href = safeHref(p.url);
            var el = href ? link(href, 'proj reveal') : document.createElement('div');
            if (!href) el.className = 'proj reveal';
            var top = div('proj-top');
            top.appendChild(div('proj-title', p.title));
            if (href) { var ar = div('proj-arr'); ar.appendChild(svg(ARROW_UP)); top.appendChild(ar); }
            el.appendChild(top);
            if (p.desc) el.appendChild(div('proj-desc', p.desc));
            if (p.tags && p.tags.length) {
                var tg = div('proj-tags');
                p.tags.forEach(function (t) { tg.appendChild(div('proj-tag', t)); });
                el.appendChild(tg);
            }
            grid.appendChild(el);
            watch(el);
        });
    }

    function renderLayout(s) {
        var lay = s.layout || FALLBACK.layout, main = $('main');
        var hasProjects = !!(s.projects && s.projects.length);
        var hasLinks = $('cards').children.length > 0;
        (lay.sections || FALLBACK.layout.sections).forEach(function (sec) {
            var el = $(sec.id);
            if (!el) return;
            main.appendChild(el);
            var on = sec.enabled !== false && (sec.id === 'projects' ? hasProjects : hasLinks || (lay.embed && lay.embed.enabled !== false));
            el.hidden = !on;
            var t = $('sec-title-' + sec.id);
            if (t) t.textContent = sec.title;
            var nl = $('navlink-' + sec.id);
            if (nl) { nl.hidden = !on; nl.textContent = String(sec.title).toLowerCase(); }
            var cm = $('cmdk-' + sec.id);
            if (cm) cm.hidden = !on;
        });
        var em = lay.embed || {};
        var box = $('embed-box');
        box.hidden = em.enabled === false;
        if (em.enabled !== false && em.user) {
            $('embed-link').href = 'https://rscripts.net/user/' + encodeURIComponent(em.user);
            var img = $('embed-img'), src = 'https://rscripts.net/api/embed/user/' + encodeURIComponent(em.user) + '?theme=dark';
            if (img.getAttribute('src') !== src) img.src = src;
        }
    }

    function applyBanner(b) {
        var el = $('site-banner');
        b = b || {};
        if (!b.enabled || !b.message || store.sget('zh_banner_dismissed') === b.message) { el.classList.remove('on'); return; }
        $('banner-msg').textContent = b.message;
        el.className = 'on color-' + (b.color || 'purple');
        el.style.background = (b.color === 'custom' && b.customColor) ? b.customColor : '';
        var href = safeHref(b.link), a = $('banner-link');
        a.hidden = !href;
        if (href) { a.href = href; a.textContent = b.linkText || 'learn more'; }
        var x = $('banner-close');
        x.hidden = b.dismissible === false;
        x.onclick = function () { el.classList.remove('on'); store.sset('zh_banner_dismissed', b.message); };
    }

    function applyTheme(t) {
        t = t || {};
        var map = { accentColor: '--p', accentLight: '--p2', accentDim: '--pdim', bgBase: '--bg', bgSurface: '--bg2' };
        Object.keys(map).forEach(function (k) {
            if (t[k]) root.style.setProperty(map[k], t[k]); else root.style.removeProperty(map[k]);
        });
        cfg.accent = hexToRgb(t.accentColor);
        var f = t.fontDisplay;
        if (f && f !== 'Syne') {
            if (!$('zh-font')) {
                var l = document.createElement('link');
                l.id = 'zh-font'; l.rel = 'stylesheet';
                l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@600;700;800&display=swap';
                document.head.appendChild(l);
            }
            root.style.setProperty('--display', "'" + f + "',system-ui,sans-serif");
        } else {
            root.style.removeProperty('--display');
        }
    }

    /* music */
    var yt = null, ytVol = 60, musicStarted = false;
    function musicUI(playing) {
        var mp = $('music-player'), icon = $('mp-play-icon'), st = $('mp-status');
        mp.classList.toggle('paused', !playing);
        icon.innerHTML = playing ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<polygon points="5 3 19 12 5 21 5 3"/>';
        st.textContent = playing ? 'now playing' : 'paused';
    }
    function initMusic(m) {
        if (musicStarted || !m || !m.enabled || !m.playlistUrl) return;
        var match = /[?&]list=([A-Za-z0-9_-]+)/.exec(m.playlistUrl);
        if (!match) return;
        musicStarted = true;
        ytVol = m.volume == null ? 60 : m.volume;
        $('mp-label').textContent = m.label || 'ZumHub Radio';
        if (m.showPlayer !== false) $('music-player').classList.add('on');
        var s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
        var tries = 0;
        (function make() {
            if (!window.YT || !window.YT.Player) { if (tries++ < 40) setTimeout(make, 300); return; }
            yt = new YT.Player('yt-container', {
                height: '1', width: '1',
                playerVars: { listType: 'playlist', list: match[1], autoplay: 0, controls: 0, iv_load_policy: 3, modestbranding: 1 },
                events: {
                    onReady: function (e) {
                        e.target.setVolume(ytVol);
                        if (m.shuffle !== false) e.target.setShuffle(true);
                        if (m.autoplay !== false) {
                            var go = function () {
                                document.removeEventListener('click', go);
                                document.removeEventListener('keydown', go);
                                if (yt) yt.playVideo();
                            };
                            document.addEventListener('click', go);
                            document.addEventListener('keydown', go);
                        }
                    },
                    onStateChange: function (e) { musicUI(e.data === 1); }
                }
            });
        })();
    }
    $('mp-playpause').addEventListener('click', function () { if (yt) { yt.getPlayerState() === 1 ? yt.pauseVideo() : yt.playVideo(); } });
    $('mp-next').addEventListener('click', function () { if (yt) yt.nextVideo(); });
    $('mp-prev').addEventListener('click', function () { if (yt) yt.previousVideo(); });
    $('music-player').querySelector('.mp-eq').addEventListener('click', function () { $('music-player').classList.toggle('open'); });

    function renderAll(s) {
        applyTheme(s.theme);
        applyBanner(s.banner);

        if (s.seo) {
            if (s.seo.title) document.title = s.seo.title;
            var meta = document.querySelector('meta[name="description"]');
            if (meta && s.seo.description) meta.setAttribute('content', s.seo.description);
            var fav = safeHref(s.seo.favicon);
            if (fav) document.querySelector('link[rel="icon"]').href = fav;
        }

        var h = s.hero || {};
        heroName = h.name || 'DoggoJr';
        renderName($('hero-name'), heroName);
        renderName($('nav-name'), heroName);
        $('idc-name').textContent = heroName;
        if ($('intro-name')) $('intro-name').textContent = heroName;
        if ($('foot-mark')) $('foot-mark').textContent = heroName.toUpperCase();
        $('win-name').textContent = '"' + heroName + '"';
        $('hero-tag').textContent = h.tag || 'Roblox Scripter';
        if (h.bio) $('hero-bio').textContent = h.bio;
        cfg.lines = h.typewriterLines && h.typewriterLines.length ? h.typewriterLines : null;
        if (window._twStatic && cfg.lines) window._twStatic.textContent = cfg.lines[0];

        var cw = s.codeWindow || {};
        $('win').hidden = cw.show === false;
        $('win-file').textContent = cw.file || 'zumhub.lua';

        renderProfile(s);
        renderStats(s);
        renderHeroButtons(s);
        renderNav(s);
        renderLinks(s);
        renderCmdLinks(s);
        renderProjects(s);
        renderMarquee(s);
        renderLayout(s);

        var f = s.footer || {};
        $('footer-left').textContent = f.left || 'DoggoJr \u2014 ZumHub';
        $('footer-secret').textContent = f.right || 'built by hand';
        $('footer-clock').hidden = f.showClock === false;
        $('footer-secret').hidden = f.showEasterEggHint === false;

        var p = s.particles || {};
        cfg.particles = {
            enabled: p.enabled !== false,
            density: p.density == null ? 65 : p.density,
            speed: p.speed == null ? 0.22 : p.speed,
            connectionDistance: p.connectionDistance || 85
        };
        var n = p.orbCount == null ? 3 : p.orbCount;
        [].forEach.call(document.querySelectorAll('.orb'), function (o, i) { o.hidden = i >= n; });
        if (p.orbOpacity != null) document.body.style.setProperty('--orb-o', p.orbOpacity);
        bg.start();

        initMusic(s.music);
    }

    var CACHE_KEY = 'zh_settings_v4', lastJson = '';
    function paint(s) {
        var j = JSON.stringify(s);
        if (j === lastJson) return;
        lastJson = j;
        renderAll(s);
    }
    var cached = null;
    try { cached = JSON.parse(store.get(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
    paint(cached && cached.v === 4 ? cached : FALLBACK);
    fetch('/api/settings', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
            if (d && d.settings) { store.set(CACHE_KEY, JSON.stringify(d.settings)); paint(d.settings); }
        })
        .catch(function () {});

    /* command palette */
    (function () {
        var backdrop = $('cmdk-backdrop'), box = $('cmdk'), input = $('cmdk-input'), list = $('cmdk-list'), empty = $('cmdk-empty');
        function all() { return [].slice.call(list.querySelectorAll('.cmdk-item')); }
        var sel = 0, lastFocus = null;
        function vis() { return all().filter(function (x) { return !x.hidden && x.dataset.match !== '0'; }); }
        function paint() { var v = vis(); all().forEach(function (x) { x.classList.remove('sel'); }); if (v[sel]) v[sel].classList.add('sel'); }
        function open() {
            lastFocus = document.activeElement;
            backdrop.classList.add('open'); box.classList.add('open');
            input.value = ''; all().forEach(function (x) { delete x.dataset.match; x.style.display = ''; });
            empty.hidden = true; sel = 0; paint();
            setTimeout(function () { input.focus(); }, 30);
        }
        function close() {
            backdrop.classList.remove('open'); box.classList.remove('open');
            if (lastFocus && lastFocus.focus) lastFocus.focus();
        }
        function go(id) {
            var s = $(id);
            if (s) s.scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
            history.replaceState(null, '', '#' + id);
        }
        function run(a) {
            close();
            if (a === 'home' || a === 'links' || a === 'projects') return go(a);
            if (a === 'locker') { location.href = '/l'; return; }
            if (a === 'copy') {
                var u = location.origin + '/home';
                (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('link copied'); }, function () { toast(u); });
                return;
            }
            if (a === 'calm') {
                calm = !calm; store.set('zh_fx', calm ? 'calm' : 'full'); applyCalm();
                toast(calm ? 'effects off' : 'effects on');
            }
        }
        list.addEventListener('click', function (e) {
            var it = e.target.closest('.cmdk-item');
            if (!it) return;
            if (it.dataset.url) { close(); window.open(it.dataset.url, '_blank', 'noopener,noreferrer'); return; }
            run(it.dataset.action);
        });
        input.addEventListener('input', function () {
            var q = input.value.trim().toLowerCase();
            all().forEach(function (x) {
                var hit = !q || x.textContent.toLowerCase().indexOf(q) !== -1;
                x.dataset.match = hit ? '1' : '0';
                x.style.display = hit ? '' : 'none';
            });
            sel = 0; paint(); empty.hidden = vis().length > 0;
        });
        input.addEventListener('keydown', function (e) {
            var v = vis(), n = Math.max(1, v.length);
            if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % n; paint(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + n) % n; paint(); }
            else if (e.key === 'Enter') { e.preventDefault(); if (v[sel]) v[sel].click(); }
        });
        backdrop.addEventListener('click', close);
        $('cmdk-open').addEventListener('click', open);

        var gPending = 0;
        document.addEventListener('keydown', function (e) {
            var open_ = box.classList.contains('open');
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open_ ? close() : open(); return; }
            if (e.key === 'Escape' && open_) { close(); return; }
            var tag = (e.target.tagName || '').toLowerCase();
            if (open_ || tag === 'input' || tag === 'textarea' || e.ctrlKey || e.metaKey || e.altKey) return;
            var k = e.key.toLowerCase();
            if (gPending && Date.now() - gPending < 900) {
                gPending = 0;
                if (k === 'h') go('home'); else if (k === 'l') go('links'); else if (k === 'p' && !$('projects').hidden) go('projects');
            } else if (k === 'g') { gPending = Date.now(); }
        });
    })();
})();


(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var body = document.body, root = document.documentElement;
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    var live = function () { return !reduced && !body.classList.contains('calm'); };

    /* cursor spotlight + orb parallax (desktop pointers only) */
    if (fine && !reduced) {
        var spot = document.createElement('div');
        spot.id = 'spot';
        spot.setAttribute('aria-hidden', 'true');
        body.insertBefore(spot, body.firstChild);
        var px = 0, py = 0, tx = 0, ty = 0, raf = 0;
        var field = document.querySelector('.orb-field');
        addEventListener('pointermove', function (e) {
            tx = e.clientX; ty = e.clientY;
            if (!raf) raf = requestAnimationFrame(function () {
                raf = 0;
                if (!live()) return;
                spot.style.setProperty('--sx', tx + 'px');
                spot.style.setProperty('--sy', ty + 'px');
                if (field) {
                    field.style.setProperty('--px', ((tx / innerWidth) - 0.5).toFixed(3));
                    field.style.setProperty('--py', ((ty / innerHeight) - 0.5).toFixed(3));
                }
            });
        }, { passive: true });
    }

    /* scroll: parallax, marquee skew, nav hide, to-top ring */
    var nav = document.querySelector('nav.top');
    var mq = $('marquee');
    var heroLeft = document.querySelector('#hero-grid > div:first-child');
    var heroRight = $('hero-right');
    var ring = $('to-top-ring'), toTop = $('to-top');
    var CIRC = 2 * Math.PI * 19;
    if (ring) { ring.style.strokeDasharray = CIRC; ring.style.strokeDashoffset = CIRC; }
    var lastY = scrollY, skew = 0, ticking = false, navLast = scrollY;

    function frame() {
        ticking = false;
        var y = scrollY, dy = y - lastY;
        lastY = y;

        if (live()) {
            var p = Math.min(y / (innerHeight * 0.9), 1);
            if (heroLeft && getComputedStyle(heroLeft).display !== 'contents') { heroLeft.style.translate = '0 ' + (p * 26).toFixed(1) + 'px'; heroLeft.style.opacity = String(1 - p * 0.55); }
            if (heroRight) heroRight.style.translate = '0 ' + (p * 54).toFixed(1) + 'px';
            skew += ((Math.max(-7, Math.min(7, dy * 0.22))) - skew) * 0.25;
            if (mq) mq.style.setProperty('--sk', skew.toFixed(2) + 'deg');
        } else if (mq) {
            mq.style.setProperty('--sk', '0deg');
        }

        if (nav && !nav.contains(document.activeElement)) {
            if (y > 140 && y - navLast > 8) { nav.classList.add('hide'); navLast = y; }
            else if (navLast - y > 8 || y < 140) { nav.classList.remove('hide'); navLast = y; }
        }

        if (ring && toTop) {
            var max = root.scrollHeight - innerHeight;
            ring.style.strokeDashoffset = String(CIRC * (1 - (max > 0 ? Math.min(y / max, 1) : 0)));
            toTop.classList.toggle('on', y > 700);
        }
        if (Math.abs(skew) > 0.05 || Math.abs(dy) > 0.5) { ticking = true; requestAnimationFrame(frame); }
    }
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }, { passive: true });
    frame();

    /* section heads draw in */
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
            es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
        }, { threshold: 0.4 });
        [].forEach.call(document.querySelectorAll('.sec-head'), function (h) { io.observe(h); });
        var fm = $('foot-mark');
        if (fm) io.observe(fm);
    } else {
        [].forEach.call(document.querySelectorAll('.sec-head,.foot-mark'), function (h) { h.classList.add('in'); });
    }

    /* buttons: press feedback */
    document.addEventListener('pointerdown', function (e) {
        var b = e.target.closest && e.target.closest('.btn, .card, .proj, .nav-link');
        if (!b || !live()) return;
        b.classList.add('press');
        setTimeout(function () { b.classList.remove('press'); }, 160);
    });
})();

// ─── PURO PET ───
(function(){
    var DW = 112, DH = 112; // display size

    var cv = document.getElementById('puro-canvas');
    var ctx = cv.getContext('2d');
    cv.width = DW; cv.height = DH;
    cv.style.width = DW+'px'; cv.style.height = DH+'px';

    var faceCv = document.getElementById('puro-face');
    var faceCtx = faceCv.getContext('2d');

    var bubble = document.getElementById('puro-bubble');
    var sndSqueak = document.getElementById('snd-squeak');

    // preload walk frames (6 frames from video 1)
    var walkImgs = [], idleImgs = [], faceImgs = [];
    for (var i=0;i<6;i++){var im=new Image();im.src='/assets/pw_'+i+'.png';walkImgs.push(im);}
    for (var i=0;i<4;i++){var im=new Image();im.src='/assets/pi_'+i+'.png';idleImgs.push(im);}
    for (var i=0;i<12;i++){var im=new Image();im.src='/assets/face_'+i+'.png';faceImgs.push(im);}

    // physics
    var px=80, py=0, vx=1.2, vy=0;
    var GRAVITY=0.55, BOUNCE=0.28;
    var onGround=false, visible=false;

    // drag
    var dragging=false,dragLX=0,dragLY=0,dragVX=0,dragVY=0;
    var dragStartX=0,dragStartY=0,dragMoved=false;

    // animation
    var frame=0,frameT=0;
    var facingLeft=false;

    // state
    var STATE='walk',stateTimer=0;
    var behaviorT=0,behaviorInt=280;

    // talking
    var talking=false,talkTimer=0;

    // face
    var showFace=false,faceIdx=0,faceTimer=0;

    // dialogues - cycling conversations
    var dialogues=[
        ["hewwo!!","*wags tail*","can i follow you around?"],
        ["nyaa~","...","*stares*"],
        ["ZumHub!","DoggoJr made this","pretty cool huh"],
        ["solid solid solid","...solid","solid."],
        ["you found me!","*nuzzles*","teehee"],
        ["puro approves","this site is good","10/10"],
        ["wanna be friends?","puro says yes","always"],
        ["*reads book*","...","oh hi there"],
        ["meow?","meow.","MEOW!"],
        ["i live here now","rent free","deal with it"],
    ];
    var dIdx=0, dLine=0;

    cv.style.display='none';
    cv.style.position='fixed';
    cv.style.zIndex='9998';
    cv.style.cursor='grab';
    cv.style.touchAction='none';
    cv.style.filter='drop-shadow(0 6px 16px rgba(0,0,0,0.65))';

    function playSound(snd){try{snd.currentTime=0;snd.play().catch(function(){});}catch(e){}}

    function getBubblePos(){
        var r=cv.getBoundingClientRect();
        return {x:r.left+r.width/2, top:r.top-10};
    }

    function showBubble(msg){
        bubble.textContent=msg;
        bubble.classList.add('on');
        var pos=getBubblePos();
        bubble.style.left=pos.x+'px';
        bubble.style.transform='translateX(-50%)';
        bubble.style.top=(pos.top-bubble.offsetHeight-8)+'px';
        bubble.style.bottom='auto';
        talking=true;
        talkTimer=Math.max(80, msg.length*9+50);
    }

    function hideBubble(){bubble.classList.remove('on');talking=false;}

    function updateBubble(){
        if(!talking)return;
        var pos=getBubblePos();
        bubble.style.left=pos.x+'px';
        bubble.style.top=(pos.top-bubble.offsetHeight-8)+'px';
        talkTimer--;
        if(talkTimer<=0)hideBubble();
    }

    function nextDialogue(){
        var d=dialogues[dIdx%dialogues.length];
        showBubble(d[dLine%d.length]);
        playSound(sndSqueak);
        dLine++;
        if(dLine>=d.length){dLine=0;dIdx++;}
        // show matching face
        faceIdx=Math.floor(Math.random()*12);
        showFacePopup();
    }

    function showFacePopup(){
        showFace=true;faceTimer=100;
        var r=cv.getBoundingClientRect();
        var fw=100,fh=100;
        faceCv.width=fw;faceCv.height=fh;
        faceCv.style.width=fw+'px';faceCv.style.height=fh+'px';
        faceCv.style.display='block';
        faceCv.style.left=(r.left+r.width/2-fw/2)+'px';
        faceCv.style.top=(r.top-fh-60)+'px';
        faceCv.style.bottom='auto';
        faceCv.style.animation='none';
        faceCv.offsetHeight;
        faceCv.style.animation='faceIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards';
        drawFace();
    }

    function hideFace(){showFace=false;faceCv.style.display='none';}

    function drawFace(){
        var fi=faceImgs[faceIdx];
        if(!fi||!fi.complete||fi.naturalWidth===0)return;
        faceCtx.clearRect(0,0,faceCv.width,faceCv.height);
        faceCtx.drawImage(fi,0,0,faceCv.width,faceCv.height);
    }

    // drag
    function startDrag(cx,cy){
        dragging=true;dragStartX=cx;dragStartY=cy;dragMoved=false;
        dragLX=cx;dragLY=cy;dragVX=0;dragVY=0;
        cv.style.cursor='grabbing';vx=0;vy=0;
    }
    cv.addEventListener('mousedown',function(e){startDrag(e.clientX,e.clientY);e.preventDefault();});
    cv.addEventListener('touchstart',function(e){var t=e.touches[0];startDrag(t.clientX,t.clientY);e.preventDefault();},{passive:false});

    document.addEventListener('mousemove',function(e){
        if(!dragging)return;
        var dx=e.clientX-dragLX,dy=e.clientY-dragLY;
        dragVX=dragVX*0.5+dx*0.5;dragVY=dragVY*0.5+dy*0.5;
        dragLX=e.clientX;dragLY=e.clientY;
        if(Math.abs(e.clientX-dragStartX)>5||Math.abs(e.clientY-dragStartY)>5)dragMoved=true;
        px=e.clientX-DW/2;py=innerHeight-e.clientY-DH/2;
        applyPos();
    });
    document.addEventListener('touchmove',function(e){
        if(!dragging)return;
        var t=e.touches[0];
        var dx=t.clientX-dragLX,dy=t.clientY-dragLY;
        dragVX=dragVX*0.5+dx*0.5;dragVY=dragVY*0.5+dy*0.5;
        dragLX=t.clientX;dragLY=t.clientY;
        if(Math.abs(t.clientX-dragStartX)>5||Math.abs(t.clientY-dragStartY)>5)dragMoved=true;
        px=t.clientX-DW/2;py=innerHeight-t.clientY-DH/2;
        applyPos();e.preventDefault();
    },{passive:false});

    function endDrag(){
        if(!dragging)return;
        dragging=false;cv.style.cursor='grab';
        if(!dragMoved){
            nextDialogue();
        } else {
            vx=dragVX*0.72;vy=-dragVY*0.72;
            if(Math.abs(dragVX)>1||Math.abs(dragVY)>1)playSound(sndSqueak);
            onGround=py<=2;
            if(!onGround)STATE='fall';
        }
    }
    document.addEventListener('mouseup',endDrag);
    document.addEventListener('touchend',endDrag);

    function setState(s,d){STATE=s;stateTimer=d||0;frame=0;frameT=0;}

    function applyPos(){
        px=Math.max(0,Math.min(innerWidth-DW,px));
        py=Math.max(0,py);
        cv.style.left=px+'px';cv.style.bottom=py+'px';
    }

    function pickBehavior(){
        if(!onGround||dragging)return;
        var r=Math.random();
        if(r<0.25)setState('idle',90+Math.random()*110);
        else if(r<0.4){vy=7+Math.random()*4;onGround=false;setState('fall');}
        else if(r<0.52){vx=-vx;facingLeft=vx<0;}
        else if(r<0.62){var d=dialogues[Math.floor(Math.random()*dialogues.length)];showBubble(d[0]);}
    }

    function loop(){
        if(!visible){requestAnimationFrame(loop);return;}

        if(!dragging){
            if(!onGround){
                vy-=GRAVITY;py+=vy;
                px+=vx;vx*=0.996;
                if(px<=0){px=0;vx=Math.abs(vx)*0.6;}
                if(px>=innerWidth-DW){px=innerWidth-DW;vx=-Math.abs(vx)*0.6;}
                if(py<=0){
                    py=0;vy=-vy*BOUNCE;
                    if(Math.abs(vy)<1.5){vy=0;onGround=true;setState('land',18);}
                    else playSound(sndSqueak);
                }
            } else {
                vy=0;
                if(STATE==='walk'||STATE==='land'){
                    px+=vx;
                    if(px<=0||px>=innerWidth-DW){vx=-vx;facingLeft=vx<0;px=Math.max(0,Math.min(innerWidth-DW,px));}
                    if(STATE==='land'&&stateTimer<=0)setState('walk');
                }
                facingLeft=vx<0;
            }
            applyPos();
        }

        if(stateTimer>0){stateTimer--;if(stateTimer<=0&&(STATE==='idle'||STATE==='face'))setState('walk');}

        behaviorT++;
        if(behaviorT>behaviorInt){behaviorT=0;behaviorInt=200+Math.random()*350;pickBehavior();}

        updateBubble();

        if(showFace){faceTimer--;drawFace();if(faceTimer<=0)hideFace();}

        // animation - walk=6 frames, idle=4 frames
        frameT++;
        var fd=STATE==='walk'?8:STATE==='fall'?5:14;
        if(frameT>=fd){
            frameT=0;
            var maxF=(STATE==='idle'||STATE==='land')?4:6;
            frame=(frame+1)%maxF;
        }

        // draw
        ctx.clearRect(0,0,DW,DH);
        var imgs=(STATE==='idle'||STATE==='land')&&onGround?idleImgs:walkImgs;
        var maxF2=(STATE==='idle'||STATE==='land')&&onGround?4:6;
        var f=imgs[frame%maxF2];
        if(f&&f.complete&&f.naturalWidth>0){
            ctx.save();

            // walking right: add a little bob up/down and slight lean
            var bobY=0, leanX=0, scaleX=1, scaleY=1;
            if(STATE==='walk'&&onGround&&!dragging){
                var t=Date.now()/1000;
                bobY=Math.sin(t*8)*3;  // vertical bounce
                // squish stretch based on walk cycle
                scaleX = 1 + Math.sin(t*8)*0.04;
                scaleY = 1 - Math.sin(t*8)*0.04;
            }
            // squish on land
            if(STATE==='land'){
                var landPct=stateTimer/18;
                scaleX=1+0.15*landPct;
                scaleY=1-0.12*landPct;
            }
            // squish in air going down
            if(!onGround&&vy<-3){
                scaleX=0.92;scaleY=1.08;
            }

            ctx.translate(DW/2, DH/2+bobY);
            if(facingLeft)ctx.scale(-scaleX, scaleY);
            else ctx.scale(scaleX, scaleY);
            ctx.drawImage(f,-DW/2,-DH/2,DW,DH);
            ctx.restore();
        }

        requestAnimationFrame(loop);
    }

    loop();

    window.showPuro=function(){
        visible=true;
        px=Math.random()*(innerWidth-DW);
        py=innerHeight;
        vy=-15;vx=(Math.random()-.5)*4;
        onGround=false;STATE='fall';
        cv.style.display='block';
        applyPos();
        setTimeout(function(){showBubble('nyaa~ i am free!');playSound(sndSqueak);},500);
    };
    window.hidePuro=function(){
        visible=false;cv.style.display='none';hideBubble();hideFace();
        dIdx=0;dLine=0;
    };
})();

// ─── EASTER EGG ───
(function(){
    var konami = [38,38,40,40,37,39,37,39,66,65];
    var seq = [], avaClicks = 0, active = false;
    var sndSolid = document.getElementById('snd-solid');

    function spawnHeart() {
        var el = document.createElement('span');
        el.className = 'heart-p';
        el.textContent = ['♡','♥','✦','✧','⋆','˚','*','·','♪','~'][Math.floor(Math.random()*10)];
        el.style.left = Math.random()*100 + 'vw';
        el.style.bottom = '0';
        el.style.color = 'rgba(240,139,184,'+(0.5+Math.random()*0.5)+')';
        el.style.fontSize = (0.7+Math.random()*1.8)+'rem';
        el.style.animationDuration = (2+Math.random()*3.5)+'s';
        document.getElementById('egg-overlay').appendChild(el);
        setTimeout(function(){el.remove();},6000);
    }

    function trigger() {
        active = !active;
        var html = document.documentElement;
        var banner = document.getElementById('egg-banner');
        var flash = document.getElementById('egg-flash');

        if (active) {
            html.classList.add('fem');
            flash.classList.add('on');
            setTimeout(function(){flash.classList.remove('on');},180);
            try{sndSolid.currentTime=0;sndSolid.play().catch(function(){});}catch(e){}

            var count = 0;
            var iv = setInterval(function(){
                for(var i=0;i<4;i++) spawnHeart();
                count++;
                if(count>20) clearInterval(iv);
            },90);

            banner.classList.add('on');
            setTimeout(function(){banner.classList.remove('on');},4000);
            if(window.showPuro) window.showPuro();
        } else {
            html.classList.remove('fem');
            banner.classList.remove('on');
            if(window.hidePuro) window.hidePuro();
        }
    }

    // SECRET 2: click footer "built by hand" 3 times
    var footerClicks = 0;
    document.getElementById('footer-secret').addEventListener('click',function(){
        footerClicks++;
        if(footerClicks>=3){footerClicks=0;trigger();}
    });

    // SECRET 3: type "puro" anywhere
    var typed = '';
    document.addEventListener('keypress',function(e){
        typed += e.key.toLowerCase();
        if(typed.length>4) typed = typed.slice(-4);
        if(typed === 'puro') { typed=''; trigger(); }
    });

    // konami
    document.addEventListener('keydown',function(e){
        seq.push(e.keyCode);
        if(seq.length>konami.length) seq.shift();
        if(seq.join(',')===konami.join(',')) trigger();
    });

    // 5x avatar click
    var ava = document.getElementById('ava');
    if(ava){
        ava.addEventListener('click',function(e){
            e.preventDefault(); avaClicks++;
            if(avaClicks>=5){avaClicks=0;trigger();}
        });
    }
})();

