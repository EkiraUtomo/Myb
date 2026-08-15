(function() {
    var _0x1a2b = false;
    var _devOpen = false;

    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });

    document.addEventListener('selectstart', function(e) {
        e.preventDefault();
        return false;
    });

    document.addEventListener('dragstart', function(e) {
        e.preventDefault();
        return false;
    });

    document.addEventListener('keydown', function(e) {
        if (e.keyCode === 123) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.keyCode === 85) { e.preventDefault(); return false; }
        if (e.ctrlKey && e.keyCode === 83) { e.preventDefault(); return false; }
    });

    var _threshold = 160;
    var _check = function() {
        var _w = window.outerWidth - window.innerWidth;
        var _h = window.outerHeight - window.innerHeight;
        if (_w > _threshold || _h > _threshold) {
            if (!_devOpen) {
                _devOpen = true;
                document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0f;color:#9d4edd;font-family:monospace;font-size:1.2rem;flex-direction:column;gap:1rem;"><span style="font-size:3rem;">⛔</span><span>nice try</span></div>';
            }
        } else {
            _devOpen = false;
        }
    };

    setInterval(_check, 1000);

    var _consoleLoop = setInterval(function() {
        console.clear();
        console.log('%cZumHub', 'color:#9d4edd;font-size:2rem;font-weight:bold;');
        console.log('%cstop snooping around lol', 'color:#c77dff;font-size:0.9rem;');
    }, 2000);

    Object.defineProperty(document, 'oncontextmenu', { value: function() { return false; }, writable: false });
})();
