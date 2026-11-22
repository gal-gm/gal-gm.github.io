/* ============================================================
   GMFX – הרקע החי של האתר (משותף לכל הדפים)
   "שדה גלים": אלפי נקודות בתלת־ממד שנעות כמו ים, מתרוממות
   מתחת לעכבר, ושולחות אדווה מכל לחיצה. הגלילה משנה את זווית המצלמה.
   שכבה קדמית: ניצוצות וטבעות בלחיצה.
   הכול נעצר כשבוחרים "עצירת אנימציות" בתפריט הנגישות,
   או כשהמכשיר מוגדר להפחתת תנועה.
   ============================================================ */
(function () {
  'use strict';
  if (window.GMFX || !document.body) return;

  var doc = document, root = doc.documentElement;
  // ב-Windows מתעלמים מ"הפחתת תנועה" של המערכת (שם מכבים אותה בעיקר בשביל מהירות);
  // במערכות אחרות (iOS, macOS, Android) מכבדים אותה.
  // בכל מקרה, "עצירת אנימציות" בתפריט הנגישות עוצרת הכול.
  var osReduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) &&
    !/Windows/i.test(navigator.userAgent || '');
  if (osReduce) root.classList.add('reduce-motion');
  var calm = root.getAttribute('data-fx') === 'calm';   // דפי המשנה: רקע שקט יותר
  var TAU = Math.PI * 2;
  var WHITE = '245, 245, 240';

  /* ערכות הצבע של השדה: עמקים → אמצע → פסגות, וצבע הניצוצות.
     הערכה נקבעת לפי data-theme על ה-html (סגול / ליים) ומתחלפת בזמן אמת. */
  var THEMES = {
    purple: { lo: [98, 56, 228],  mid: [240, 234, 255], hi: [214, 136, 255], spark: '190, 132, 255' },
    pink:   { lo: [150, 60, 220], mid: [255, 238, 248], hi: [255, 120, 200], spark: '255, 122, 200' },
    red:    { lo: [190, 40, 70],  mid: [252, 236, 236], hi: [255, 120, 110], spark: '255, 107, 107' },
    orange: { lo: [210, 80, 20],  mid: [255, 244, 232], hi: [255, 170, 70],  spark: '255, 154, 60' },
    yellow: { lo: [200, 120, 20], mid: [252, 248, 230], hi: [255, 214, 70],  spark: '255, 210, 63' },
    blue:   { lo: [40, 80, 220],  mid: [234, 242, 255], hi: [80, 190, 255],  spark: '90, 169, 255' },
    lime:   { lo: [112, 84, 238], mid: [236, 236, 246], hi: [198, 255, 61],  spark: '198, 255, 61' }
  };
  var DEFAULT_THEME = 'purple';
  var ACC = THEMES[DEFAULT_THEME].spark;
  if (!root.getAttribute('data-theme')) {
    var storedTheme = null;
    try { storedTheme = localStorage.getItem('gmTheme2'); } catch (e) {}
    root.setAttribute('data-theme', THEMES[storedTheme] ? storedTheme : DEFAULT_THEME);
  }

  /* ───────────── שכבות וסגנונות ───────────── */
  var noiseSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180">' +
    '<filter id="n" x="0" y="0" width="100%" height="100%">' +
    '<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>' +
    '<feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  .6 0 0 0 0"/>' +
    '</filter><rect width="100%" height="100%" filter="url(#n)"/></svg>';
  var css = [
    '.gmfx{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;background:#060607}',
    '.gmfx>*{position:absolute;inset:0}',
    '.gmfx-glow{background:' +
      'radial-gradient(ellipse 75% 24% at 50% var(--gmfx-hy,56%),rgba(var(--acc-rgb,169,112,255),.13),transparent 70%),' +
      'radial-gradient(ellipse 52% 42% at 10% 6%,rgba(var(--glow-rgb,150,90,255),.22),transparent 70%),' +
      'radial-gradient(ellipse 46% 40% at 94% 98%,rgba(var(--acc2-rgb,34,211,238),.1),transparent 70%)}',
    '.gmfx canvas{width:100%;height:100%;opacity:var(--gmfx-o,1)}',
    '.gmfx-grain{opacity:.08;background-image:url("data:image/svg+xml,' + encodeURIComponent(noiseSvg) + '")}',
    '.gmfx-vig{background:radial-gradient(ellipse 95% 85% at 50% 42%,transparent 48%,rgba(0,0,0,.5) 100%)}',
    '.gmfx-fg{position:fixed;inset:0;width:100%;height:100%;z-index:9980;pointer-events:none}'
  ].join('\n');
  var styleEl = doc.createElement('style');
  styleEl.id = 'gmfx-style';
  styleEl.textContent = css;
  doc.head.appendChild(styleEl);

  var bg = doc.createElement('div');
  bg.className = 'gmfx';
  bg.setAttribute('aria-hidden', 'true');
  bg.innerHTML = '<div class="gmfx-glow"></div><canvas></canvas><div class="gmfx-grain"></div><div class="gmfx-vig"></div>';
  doc.body.insertBefore(bg, doc.body.firstChild);
  var canvas = bg.querySelector('canvas');
  var ctx = canvas.getContext('2d');

  var fg = doc.createElement('canvas');
  fg.className = 'gmfx-fg';
  fg.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(fg);
  var fctx = fg.getContext('2d');

  /* ───────────── מצלמה ושדה ───────────── */
  var Z0 = 4.4, CAMY = 3.5, SP = 0.6;       // מרחק השורה הקרובה, גובה המצלמה, מרווח בין נקודות
  var A1 = 0.46, A2 = 0.28, AMP = 0.78;     // גובה הגלים
  var NC = 8, NA = 8;                       // מדרגות צבע ושקיפות
  var w = 0, h = 0, ROWS = 46, HALF = 70;
  var hyFrac = calm ? 0.74 : 0.56, hy = 0, F = 600, cxNow = 0;
  var t = 0, boost = 0, fade = -1, hyShown = -1;
  var mouse = { x: -9999, y: -9999, on: false };
  var par = { x: 0, y: 0, tx: 0, ty: 0 };
  var ripples = [], sparks = [], rings = [];
  var fgOn = false, fgLast = 0, dirty = true, lastScroll = 0;

  // טבלת סגנונות מוכנה מראש לפי ערכת הצבע: עמקים → אמצע → פסגות
  var styles = [], buckets = [];
  for (var bk = 0; bk < NC * NA; bk++) buckets.push([]);
  function applyTheme(name) {
    var th = THEMES[name] || THEMES[DEFAULT_THEME];
    var lo = th.lo, mid = th.mid, hi = th.hi;
    ACC = th.spark;
    styles.length = 0;
    for (var c = 0; c < NC; c++) {
      var n = c / (NC - 1), a, b, k;
      if (n < 0.5) { a = lo; b = mid; k = n * 2; } else { a = mid; b = hi; k = (n - 0.5) * 2; }
      var rgb = Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k);
      for (var al = 0; al < NA; al++) {
        styles.push('rgba(' + rgb + ',' + (((al + 1) / NA) * 0.96).toFixed(3) + ')');
      }
    }
    dirty = true;
  }
  applyTheme(root.getAttribute('data-theme'));
  if (window.MutationObserver) {
    new MutationObserver(function () { applyTheme(root.getAttribute('data-theme')); })
      .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function isStill() {
    return root.classList.contains('reduce-motion') || doc.body.classList.contains('access-no-animation');
  }

  /* "עצירת אנימציות" מתפריט הנגישות נשמרת בין דפים וביקורים */
  var NO_ANIM_KEY = 'gmNoAnim';
  try {
    if (localStorage.getItem(NO_ANIM_KEY) === '1') {
      doc.body.classList.add('access-no-animation');
      var naItem = doc.querySelector('.accessibility-item[data-action="no-animation"]');
      if (naItem) naItem.classList.add('active');
    }
  } catch (e) {}
  if (window.MutationObserver) {
    var lastNoAnim = doc.body.classList.contains('access-no-animation');
    new MutationObserver(function () {
      var nowNoAnim = doc.body.classList.contains('access-no-animation');
      if (nowNoAnim === lastNoAnim) return;
      lastNoAnim = nowNoAnim;
      dirty = true;
      try { localStorage.setItem(NO_ANIM_KEY, nowNoAnim ? '1' : '0'); } catch (e) {}
    }).observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    var mobile = w < 760;
    var dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    fg.width = Math.round(w * dpr); fg.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ROWS = mobile ? 32 : 46;
    dirty = true;
  }

  function onScroll() {
    var y = window.pageYOffset || 0;
    boost = Math.min(3, boost + Math.abs(y - lastScroll) * 0.004);
    lastScroll = y;
    dirty = true;
  }

  /* המרת נקודה על המסך לנקודה על "הרצפה" של השדה */
  function toWorld(sx, sy) {
    var dy = Math.max(12, sy - hy);
    var z = CAMY * F / dy;
    var zFar = Z0 + (ROWS - 1) * SP;
    if (z > zFar) z = zFar;
    if (z < Z0) z = Z0;
    return { x: (sx - cxNow) * z / F, z: z };
  }

  /* אדווה שמתפשטת בשדה מנקודה על המסך */
  function ripple(sx, sy, amp) {
    var p = toWorld(sx, sy);
    ripples.push({ x: p.x, z: p.z, c: 0, amp: amp || 0.75, sp: 7.5 });
    if (ripples.length > 5) ripples.shift();
    dirty = true;
  }
  /* גל גדול מהמרכז (סוף הפתיחה) */
  function pulse() {
    ripples.push({ x: 0, z: Z0 + 5, c: 0, amp: 1.5, sp: 13 });
    if (ripples.length > 5) ripples.shift();
  }

  function drawField(dtSec, still) {
    var scroll = lastScroll;
    var prog = Math.min(1, scroll / Math.max(1, h * 1.2));
    var frac = calm ? hyFrac : hyFrac - 0.15 * prog;
    hy = h * frac + par.y * 10;
    F = (h - h * frac + 80) * Z0 / CAMY;
    cxNow = w / 2 - par.x * 46;

    // עמעום השדה אחרי אזור הפתיחה, כדי שהתוכן יישאר קריא
    var f = calm ? 0.5 : Math.max(0.34, 1 - (scroll / Math.max(1, h * 0.95)) * 0.66);
    if (Math.abs(f - fade) > 0.01) { fade = f; bg.style.setProperty('--gmfx-o', f.toFixed(2)); }
    if (Math.abs(frac - hyShown) > 0.004) { hyShown = frac; bg.style.setProperty('--gmfx-hy', (frac * 100).toFixed(1) + '%'); }

    var i, j, b;
    for (b = 0; b < buckets.length; b++) buckets[b].length = 0;

    var mOn = mouse.on && mouse.y > hy + 8 && !still, mw = null;
    if (mOn) mw = toWorld(mouse.x, mouse.y);

    for (i = ripples.length - 1; i >= 0; i--) {
      var rp = ripples[i];
      if (!still) { rp.c += rp.sp * dtSec; rp.amp *= Math.pow(0.42, dtSec); }
      if (rp.amp < 0.03 || rp.c > 60 || still) ripples.splice(i, 1);
    }
    var nr = ripples.length;

    var zFar = Z0 + (ROWS - 1) * SP;
    for (j = 0; j < ROWS; j++) {
      var z = Z0 + j * SP;
      var scale = F / z;
      var spacing = scale * SP;
      var step = spacing < 3.6 ? 4 : spacing < 7.2 ? 2 : 1;
      var depth = (z - Z0) / (zFar - Z0);
      var fog = Math.pow(1 - depth, 0.95) * Math.min(1, 0.4 + j * 0.3);
      var size = Math.max(1.1, scale * 0.036);
      var zt = z * 0.31 - t * 0.6, zt2 = z * 0.17;
      var iMax = Math.min(HALF, Math.ceil((w * 0.5 + 50) / spacing));
      iMax = Math.floor(iMax / step) * step;
      for (i = -iMax; i <= iMax; i += step) {
        var x = i * SP;
        var y = A1 * Math.sin(x * 0.42 + t * 0.9) * Math.cos(zt) + A2 * Math.sin(x * 0.2 + zt2 + t * 0.45);
        if (mOn) {
          var mdx = x - mw.x, mdz = z - mw.z, md = mdx * mdx + mdz * mdz;
          if (md < 18) y += 0.85 * Math.exp(-md / 3.4);
        }
        for (b = 0; b < nr; b++) {
          var r2 = ripples[b];
          var rdx = x - r2.x, rdz = z - r2.z;
          var q = Math.sqrt(rdx * rdx + rdz * rdz) - r2.c;
          if (q > -3.4 && q < 3.4) y += r2.amp * Math.cos(q * 1.7) * Math.exp(-q * q / 2.1);
        }
        var sy = hy + (CAMY - y) * scale;
        if (sy > h + 8 || sy < -8) continue;
        var n = (y + AMP) / (2 * AMP);
        if (n < 0) n = 0; else if (n > 1) n = 1;
        var a = fog * (0.42 + 0.58 * n);
        var ai = (a * NA) | 0;
        if (ai <= 0) continue;
        if (ai > NA) ai = NA;
        var arr = buckets[((n * (NC - 1) + 0.5) | 0) * NA + ai - 1];
        arr.push(cxNow + x * scale, sy, size * (0.75 + n * 0.6));
      }
    }

    ctx.clearRect(0, 0, w, h);
    for (b = 0; b < buckets.length; b++) {
      var list = buckets[b];
      if (!list.length) continue;
      ctx.fillStyle = styles[b];
      for (i = 0; i < list.length; i += 3) {
        var s = list[i + 2];
        ctx.fillRect(list[i] - s * 0.5, list[i + 1] - s * 0.5, s, s);
      }
    }
  }

  /* ───────────── שכבה קדמית: ניצוצות וטבעות ───────────── */
  var sprites = {};
  function sprite(c) {
    if (sprites[c]) return sprites[c];
    var off = doc.createElement('canvas');
    off.width = off.height = 64;
    var o = off.getContext('2d');
    var g = o.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(' + c + ',0.9)');
    g.addColorStop(0.15, 'rgba(' + c + ',0.45)');
    g.addColorStop(0.45, 'rgba(' + c + ',0.12)');
    g.addColorStop(1, 'rgba(' + c + ',0)');
    o.fillStyle = g;
    o.fillRect(0, 0, 64, 64);
    sprites[c] = off;
    return off;
  }
  function kickFg() {
    if (fgOn) return;
    fgOn = true;
    fgLast = performance.now();
    requestAnimationFrame(fgFrame);
  }
  function burst(x, y, col, n) {
    if (isStill()) return;
    col = col || ACC;
    n = n || 16;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * TAU, v = 1.6 + Math.random() * 5;
      sparks.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.7,
        life: 0, max: 380 + Math.random() * 420,
        r: 1 + Math.random() * 1.7,
        c: Math.random() < 0.3 ? WHITE : col, g: 0.08
      });
    }
    rings.push({ x: x, y: y, r: 4, max: 54, sp: 2.8, lw: 1.5, c: col, a: 0.8 });
    kickFg();
  }
  function fgFrame(now) {
    var dt = Math.min(50, now - fgLast);
    fgLast = now;
    var k = dt / 16.667, i;
    fctx.clearRect(0, 0, w, h);
    if (isStill()) { sparks.length = 0; rings.length = 0; }
    fctx.globalCompositeOperation = 'lighter';
    var drag = Math.pow(0.955, k);
    for (i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.life += dt;
      if (s.life >= s.max) { sparks.splice(i, 1); continue; }
      s.vx *= drag;
      s.vy = s.vy * drag + s.g * k;
      s.x += s.vx * k;
      s.y += s.vy * k;
      var al = 1 - s.life / s.max, size = s.r * 9;
      fctx.globalAlpha = al * 0.75;
      fctx.drawImage(sprite(s.c), s.x - size / 2, s.y - size / 2, size, size);
      fctx.globalAlpha = al;
      fctx.fillStyle = 'rgb(' + s.c + ')';
      fctx.beginPath();
      fctx.arc(s.x, s.y, s.r * 0.7, 0, TAU);
      fctx.fill();
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i];
      r.r += r.sp * k;
      var tt = r.r / r.max;
      if (tt >= 1) { rings.splice(i, 1); continue; }
      fctx.globalAlpha = r.a * Math.pow(1 - tt, 1.6);
      fctx.strokeStyle = 'rgb(' + r.c + ')';
      fctx.lineWidth = r.lw;
      fctx.beginPath();
      fctx.arc(r.x, r.y, r.r, 0, TAU);
      fctx.stroke();
    }
    fctx.globalAlpha = 1;
    fctx.globalCompositeOperation = 'source-over';
    if (sparks.length || rings.length) {
      requestAnimationFrame(fgFrame);
    } else {
      fgOn = false;
      fctx.clearRect(0, 0, w, h);
    }
  }

  /* ───────────── לולאה ראשית ───────────── */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(50, now - last);
    last = now;
    var still = isStill();
    if (!still) {
      t += dt * 0.001 * (calm ? 0.7 : 1) * (1 + boost);
      boost *= Math.pow(0.9, dt / 16.667);
      par.x += (par.tx - par.x) * Math.min(1, dt * 0.004);
      par.y += (par.ty - par.y) * Math.min(1, dt * 0.004);
      drawField(dt * 0.001, false);
    } else if (dirty) {
      drawField(0, true);
    }
    dirty = false;
    requestAnimationFrame(frame);
  }

  /* ───────────── קלט ───────────── */
  function hexToRgb(hex) {
    hex = (hex || '').trim().replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    var n = parseInt(hex, 16);
    return ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255);
  }
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true;
    par.tx = (e.clientX / w) * 2 - 1;
    par.ty = (e.clientY / h) * 2 - 1;
  }, { passive: true });
  doc.documentElement.addEventListener('mouseleave', function () { mouse.on = false; par.tx = 0; par.ty = 0; });
  window.addEventListener('blur', function () { mouse.on = false; par.tx = 0; par.ty = 0; });

  window.addEventListener('pointerdown', function (e) {
    var el = e.target;
    if (el && el.closest && el.closest('.accessibility-panel, .bit-modal-overlay, .intro')) return;
    if (isStill()) return;
    ripple(e.clientX, e.clientY, 0.8);
    var hot = el && el.closest ? el.closest('a, button, [data-burst]') : null;
    if (hot) {
      var col = hexToRgb(getComputedStyle(hot).getPropertyValue('--c'));
      burst(e.clientX, e.clientY, col || ACC, col ? 22 : 14);
    }
  }, { passive: true });

  window.addEventListener('scroll', onScroll, { passive: true });
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  resize();
  lastScroll = window.pageYOffset || 0;
  requestAnimationFrame(frame);

  /* ───────────── API לדפים ───────────── */
  window.GMFX = {
    ripple: ripple,
    pulse: pulse,
    burst: burst,
    isStill: isStill,
    themes: Object.keys(THEMES)
  };
})();
