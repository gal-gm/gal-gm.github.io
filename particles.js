// חלקיקים זוהרים ברקע – משותף לכל דפי האתר
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'bgParticles';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  // בעיקר לבן, וחלק סגול וטורקיז בהתאם לצבעי האתר
  const COLORS = ['255, 255, 255', '255, 255, 255', '255, 255, 255', '196, 181, 253', '0, 210, 255'];

  // "ספרייט" זוהר מוכן מראש לכל צבע – תאורה רכה בלי לפגוע בביצועים
  const glowSprites = {};
  COLORS.forEach(c => {
    if (glowSprites[c]) return;
    const size = 64;
    const off = document.createElement('canvas');
    off.width = off.height = size;
    const o = off.getContext('2d');
    const grd = o.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, `rgba(${c}, 0.9)`);
    grd.addColorStop(0.15, `rgba(${c}, 0.45)`);
    grd.addColorStop(0.45, `rgba(${c}, 0.12)`);
    grd.addColorStop(1, `rgba(${c}, 0)`);
    o.fillStyle = grd;
    o.fillRect(0, 0, size, size);
    glowSprites[c] = off;
  });

  let w = 0, h = 0, particles = [];

  function makeParticle(randomY) {
    const glow = Math.random() < 0.35;
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : h + 10,
      r: glow ? Math.random() * 1.2 + 1.1 : Math.random() * 1.1 + 0.4,
      glow,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -(Math.random() * 0.45 + 0.12),
      a: glow ? Math.random() * 0.35 + 0.45 : Math.random() * 0.4 + 0.2,
      tw: Math.random() * Math.PI * 2,
      tws: Math.random() * 0.025 + 0.01,
      sway: Math.random() * Math.PI * 2,
      c: COLORS[Math.floor(Math.random() * COLORS.length)]
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(140, Math.max(50, (w * h) / 9000)));
    particles = Array.from({ length: count }, () => makeParticle(true));
  }

  function isStill() {
    return reduceMotion.matches || document.body.classList.contains('access-no-animation');
  }

  function frame() {
    ctx.clearRect(0, 0, w, h);
    const still = isStill();
    for (const p of particles) {
      if (!still) {
        p.sway += 0.01;
        p.x += p.vx + Math.sin(p.sway) * 0.15;
        p.y += p.vy;
        p.tw += p.tws;
        if (p.y < -10) Object.assign(p, makeParticle(false));
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
      }
      const alpha = p.a * (0.55 + 0.45 * Math.sin(p.tw));
      if (p.glow) {
        const s = p.r * 9;
        ctx.globalAlpha = alpha * 0.6;
        ctx.drawImage(glowSprites[p.c], p.x - s / 2, p.y - s / 2, s, s);
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.c}, ${alpha.toFixed(3)})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  resize();
  requestAnimationFrame(frame);
})();
