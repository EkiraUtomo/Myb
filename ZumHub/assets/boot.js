(function () {
    var d = document.documentElement;
    d.classList.add('js');
    var calm = false, seen = false;
    try {
        calm = localStorage.getItem('zh_fx') === 'calm';
        seen = sessionStorage.getItem('zh_intro') === '1';
        sessionStorage.setItem('zh_intro', '1');
    } catch (e) {}
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm || seen || reduced) d.classList.add('no-intro');
})();
