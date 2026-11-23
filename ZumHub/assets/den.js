(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var den = $('den');
    if (!den) return;

    var body = document.body;
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var calm = function () { return reduced || body.classList.contains('calm'); };

    var cfg = null;
    var isOpen = false;
    var lastFocus = null;
    var canvas = $('den-fx');
    var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    var W = 0, H = 0, stars = [], flies = [], rafId = 0, printTimer = 0, printSide = 0, printX = -30;
    var boops = 0, trailOn = false, trailBound = false;

    try { boops = Number(localStorage.getItem('zh_boops')) || 0; trailOn = localStorage.getItem('zh_trail') === '1'; } catch (e) {}

    function text(el, value) { if (el) el.textContent = value; }
    function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

    function render(c) {
        if (!c) return;
        cfg = c;
        text($('den-title'), c.title || 'The Den');
        text($('den-tagline'), c.tagline || '');
        text($('den-name'), c.name || '');
        text($('den-species'), c.species || '');
        $('den-name').hidden = !c.name;
        $('den-species').hidden = !c.species;

        var tr = $('den-traits');
        clear(tr);
        (c.traits || []).forEach(function (t) {
            var row = document.createElement('div');
            var dt = document.createElement('dt'); dt.textContent = t.label;
            var dd = document.createElement('dd'); dd.textContent = t.value;
            row.appendChild(dt); row.appendChild(dd); tr.appendChild(row);
        });
        tr.hidden = !tr.firstChild;

        var ul = $('den-lines');
        clear(ul);
        (c.lines || []).forEach(function (l, i) {
            var li = document.createElement('li');
            li.textContent = l;
            li.style.animationDelay = (0.5 + i * 0.18) + 's';
            ul.appendChild(li);
        });

        var link = $('den-link');
        var ok = c.linkUrl && c.linkLabel && /^(https?:\/\/|mailto:)/i.test(c.linkUrl);
        link.hidden = !ok;
        if (ok) { link.href = c.linkUrl; link.textContent = c.linkLabel; }

        if (window.__zhDenWantsOpen) { window.__zhDenWantsOpen = false; openDen(); }
    }
    window.zhDenRender = render;
    if (window.__zhDenCfg) render(window.__zhDenCfg);

    /* ---- canvas: stars + fireflies ---- */
    function sizeCanvas() {
        if (!canvas) return;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = innerWidth; H = innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var n = W < 760 ? 40 : 80;
        stars = [];
        for (var i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.75, r: Math.random() * 1.2 + 0.3, p: Math.random() * 6.28, s: Math.random() * 1.2 + 0.4 });
        var f = W < 760 ? 12 : 22;
        flies = [];
        for (var j = 0; j < f; j++) flies.push({ x: Math.random() * W, y: H * 0.35 + Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.25, p: Math.random() * 6.28, r: Math.random() * 1.6 + 1.1 });
    }

    function draw(t) {
        if (!isOpen) { rafId = 0; return; }
        rafId = requestAnimationFrame(draw);
        if (document.hidden) return;
        ctx.clearRect(0, 0, W, H);
        var animate = !calm();
        for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            var a = animate ? 0.35 + 0.45 * Math.sin(t / 700 * s.s + s.p) : 0.5;
            ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0.05, a) + ')';
            ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
        }
        for (var k = 0; k < flies.length; k++) {
            var f = flies[k];
            if (animate) {
                f.x += f.vx + Math.sin(t / 900 + f.p) * 0.25;
                f.y += f.vy + Math.cos(t / 1100 + f.p) * 0.2;
                if (f.x < -20) f.x = W + 20; if (f.x > W + 20) f.x = -20;
                if (f.y < H * 0.3) f.vy = Math.abs(f.vy); if (f.y > H * 0.95) f.vy = -Math.abs(f.vy);
            }
            var glow = 0.45 + 0.4 * Math.sin(t / 500 + f.p);
            var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 9);
            g.addColorStop(0, 'rgba(255,230,150,' + (0.55 * glow + 0.1) + ')');
            g.addColorStop(1, 'rgba(255,230,150,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 9, 0, 6.2832); ctx.fill();
            ctx.fillStyle = 'rgba(255,248,210,' + (0.6 + 0.4 * glow) + ')';
            ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.2832); ctx.fill();
        }
    }

    /* ---- paw prints walking along the ground ---- */
    function printStep() {
        if (!isOpen || calm()) return;
        var box = $('den-prints');
        if (!box) return;
        var p = document.createElement('i');
        p.className = 'den-print';
        printX += 46;
        if (printX > innerWidth + 30) printX = -30;
        printSide = printSide ? 0 : 1;
        p.style.left = printX + 'px';
        p.style.top = (printSide ? 8 : 30) + 'px';
        box.appendChild(p);
        p.addEventListener('animationend', function () { p.remove(); });
        if (box.children.length > 16) box.removeChild(box.firstChild);
    }

    /* ---- open / close ---- */
    function openDen() {
        if (isOpen) return;
        if (!cfg) { window.__zhDenWantsOpen = true; return; }
        if (cfg.enabled === false) return;
        isOpen = true;
        lastFocus = document.activeElement;
        den.hidden = false;
        body.classList.add('den-open');
        sizeCanvas();
        void den.offsetWidth;
        den.classList.add('open');
        if (ctx) { if (!rafId) rafId = requestAnimationFrame(draw); }
        clearInterval(printTimer);
        printTimer = setInterval(printStep, 520);
        updateUi();
        $('den-close').focus({ preventScroll: true });
        if (location.hash !== '#den') { try { history.replaceState(null, '', '#den'); } catch (e) {} }
        console.log('%cawoo.', 'color:#ff9ccb;font-weight:bold');
    }

    function closeDen() {
        if (!isOpen) return;
        isOpen = false;
        den.classList.remove('open');
        body.classList.remove('den-open');
        clearInterval(printTimer);
        setTimeout(function () { if (!isOpen) den.hidden = true; }, 560);
        if (location.hash === '#den') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    window.openDen = openDen;
    window.closeDen = closeDen;

    $('den-close').addEventListener('click', closeDen);
    den.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { closeDen(); return; }
        if (e.key !== 'Tab') return;
        var items = [].filter.call(den.querySelectorAll('button, a[href]'), function (x) { return !x.hidden && x.offsetParent !== null; });
        if (!items.length) return;
        var first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closeDen(); });
    addEventListener('resize', function () { if (isOpen) sizeCanvas(); });

    /* ---- boop + pet ---- */
    var mascotWrap = $('den-mascot-wrap');
    var tongue = $('den-tongue');
    var squeak = $('snd-squeak');
    var hint = $('den-hint');
    var hintTimer = 0;

    function say(msg) {
        text(hint, msg);
        clearTimeout(hintTimer);
        hintTimer = setTimeout(function () { text(hint, 'boop the nose. pet the face.'); }, 3200);
    }

    function updateUi() {
        text($('den-boops'), 'boops: ' + boops);
        text($('den-trail'), 'paw trail: ' + (trailOn ? 'on' : 'off'));
    }

    function burst(x, y, count) {
        if (calm()) return;
        for (var i = 0; i < count; i++) {
            var p = document.createElement('i');
            p.className = 'pawfx';
            var ang = Math.random() * 6.2832, dist = 50 + Math.random() * 70;
            p.style.left = x + 'px';
            p.style.top = y + 'px';
            p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
            p.style.setProperty('--dy', Math.sin(ang) * dist - 30 + 'px');
            p.style.setProperty('--rot', (Math.random() * 120 - 60) + 'deg');
            body.appendChild(p);
            p.addEventListener('animationend', function (ev) { ev.target.remove(); });
        }
    }

    function boop(e) {
        e.preventDefault();
        e.stopPropagation();
        boops++;
        try { localStorage.setItem('zh_boops', String(boops)); } catch (er) {}
        updateUi();
        mascotWrap.classList.remove('boop');
        void mascotWrap.offsetWidth;
        mascotWrap.classList.add('boop');
        tongue.classList.add('on');
        setTimeout(function () { tongue.classList.remove('on'); }, 650);
        var r = $('den-nose').getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, 8);
        if (squeak) { try { squeak.currentTime = 0; var pr = squeak.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (er2) {} }
        if (boops === 10) say('ok that is enough. ...no, do not stop.');
        else if (boops === 25) say('you have been banned from the den. (joking.)');
        else if (boops === 50) say('50 boops. the nose files a complaint.');
        else if (boops % 7 === 0) say(['boop acknowledged.', 'the nose is thriving.', 'awoo.', 'again.'][boops % 4]);
    }
    $('den-nose').addEventListener('pointerdown', boop);

    var petTimer = 0;
    function startPet(e) {
        if (e.target && e.target.id === 'den-nose') return;
        mascotWrap.classList.add('petting');
        clearInterval(petTimer);
        petTimer = setInterval(function () {
            if (calm()) return;
            var r = mascotWrap.getBoundingClientRect();
            var h = document.createElement('i');
            h.className = 'pet-heart';
            h.textContent = '\u2665';
            h.style.left = (r.left + r.width * (0.25 + Math.random() * 0.5)) + 'px';
            h.style.top = (r.top + r.height * 0.25) + 'px';
            h.style.setProperty('--dx', (Math.random() * 40 - 20) + 'px');
            body.appendChild(h);
            h.addEventListener('animationend', function (ev) { ev.target.remove(); });
        }, 240);
    }
    function stopPet() {
        mascotWrap.classList.remove('petting');
        clearInterval(petTimer);
    }
    mascotWrap.addEventListener('pointerdown', startPet);
    addEventListener('pointerup', stopPet);
    addEventListener('pointercancel', stopPet);
    mascotWrap.addEventListener('pointerleave', stopPet);

    /* ---- paw trail (stays on after the den closes) ---- */
    var lastX = 0, lastY = 0, side = 1;
    function dropPaw(x, y, ang) {
        if (calm() || !trailOn) return;
        var p = document.createElement('i');
        p.className = 'pawtrail';
        side = -side;
        p.style.left = (x - 10 + Math.cos(ang + 1.57) * 9 * side) + 'px';
        p.style.top = (y - 10 + Math.sin(ang + 1.57) * 9 * side) + 'px';
        p.style.setProperty('--r', (ang * 57.3 + 90) + 'deg');
        body.appendChild(p);
        p.addEventListener('animationend', function () { p.remove(); });
    }
    function bindTrail() {
        if (trailBound) return;
        trailBound = true;
        addEventListener('pointermove', function (e) {
            if (!trailOn) return;
            var dx = e.clientX - lastX, dy = e.clientY - lastY;
            if (dx * dx + dy * dy < 2200) return;
            dropPaw(e.clientX, e.clientY, Math.atan2(dy, dx));
            lastX = e.clientX; lastY = e.clientY;
        }, { passive: true });
        addEventListener('pointerdown', function (e) { if (trailOn && e.pointerType === 'touch') dropPaw(e.clientX, e.clientY, -1.57); }, { passive: true });
    }
    $('den-trail').addEventListener('click', function () {
        trailOn = !trailOn;
        try { localStorage.setItem('zh_trail', trailOn ? '1' : '0'); } catch (e) {}
        if (trailOn) bindTrail();
        updateUi();
        say(trailOn ? 'little paw prints will follow you around.' : 'paw trail off.');
    });
    if (trailOn) bindTrail();

    /* ---- secret ways in ---- */
    var buf = '';
    document.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var t = (e.target && e.target.tagName || '').toLowerCase();
        if (t === 'input' || t === 'textarea' || isOpen) return;
        if (e.key.length !== 1) return;
        buf = (buf + e.key.toLowerCase()).slice(-8);
        if (/(awoo|uwu|furry)$/.test(buf)) { buf = ''; openDen(); }
    });

    var taps = 0, tapTimer = 0;
    var mark = $('foot-mark');
    if (mark) {
        mark.addEventListener('pointerup', function () {
            taps++;
            clearTimeout(tapTimer);
            tapTimer = setTimeout(function () { taps = 0; }, 650);
            if (taps >= 3) { taps = 0; openDen(); }
        });
    }

    function fromHash() { if (location.hash === '#den') openDen(); }
    addEventListener('hashchange', function () { if (location.hash === '#den') openDen(); else if (isOpen) closeDen(); });
    fromHash();
})();
