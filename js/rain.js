/* WSK Replenishment — matrix rain on the login screen (from WSK login.html) */
(function () {
  'use strict';
  var GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789WSKD';
  var FS = 16;
  var cv, ctx, cols = 0, drops = [], W = 0, H = 0, raf = 0, last = 0, running = false;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function g() { return GLYPHS[(Math.random() * GLYPHS.length) | 0]; }

  function size() {
    if (!cv) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(W / FS);
    drops = Array.from({ length: cols }, function () { return Math.random() * -H / FS; });
    ctx.fillStyle = '#020602';
    ctx.fillRect(0, 0, W, H);
    if (reduce) still();
  }

  function still() {
    ctx.font = FS + 'px "JetBrains Mono", monospace';
    for (var c = 0; c < cols; c++) {
      if (Math.random() < 0.5) continue;
      var len = (4 + Math.random() * 14) | 0, y0 = (Math.random() * H / FS) | 0;
      for (var k = 0; k < len; k++) {
        ctx.fillStyle = 'rgba(0,255,65,' + ((k + 1) / len * 0.7) + ')';
        ctx.fillText(g(), c * FS, (y0 + k) * FS);
      }
    }
  }

  function frame(t) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (t - last < 50) return;
    last = t;
    ctx.fillStyle = 'rgba(2,6,2,.09)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = FS + 'px "JetBrains Mono", monospace';
    for (var c = 0; c < cols; c++) {
      var y = drops[c] * FS;
      if (y > 0) {
        ctx.fillStyle = '#c8ffd4'; ctx.fillText(g(), c * FS, y);
        ctx.fillStyle = '#00ff41'; ctx.fillText(g(), c * FS, y - FS);
      }
      drops[c] += 1;
      if (y > H && Math.random() > 0.975) drops[c] = Math.random() * -20;
    }
  }

  window.G4Rain = {
    start: function (canvas) {
      if (cv === canvas && !cv.hidden && (running || reduce)) return; // already on
      cv = canvas;
      ctx = cv.getContext('2d');
      cv.hidden = false;
      size();
      window.addEventListener('resize', size);
      if (!reduce && !running) { running = true; raf = requestAnimationFrame(frame); }
    },
    stop: function () {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      if (cv) cv.hidden = true;
    }
  };
})();
