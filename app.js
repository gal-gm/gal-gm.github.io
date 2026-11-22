/* ============================================================
   GalGM – LINK HUB · app.js
   הלוגיקה של דף הבית: פתיחה, אנימציות, אינטראקציות,
   סטטוס השידור מ-Kick, טבלאות התורמים ותפריט הנגישות.
   ============================================================ */
(function () {
  'use strict';

  var html = document.documentElement, body = document.body;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var FX = window.GMFX || null;
  var fine = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : false;

  // "שקט": עצירת אנימציות מתפריט הנגישות, או הפחתת תנועה של המערכת (לא ב-Windows – ראו בראש index.html)
  function still() { return html.classList.contains('reduce-motion') || body.classList.contains('access-no-animation'); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function on(el, ev, fn, opts) { if (el) el.addEventListener(ev, fn, opts); }

  /* ══════════════ 1. פתיחה ══════════════ */
  var intro = $('#intro');
  var introMode = html.getAttribute('data-intro') || 'none';
  var entered = false;

  function enter() {
    if (entered) return;
    entered = true;
    html.classList.remove('pre');
    html.classList.add('entered');
    try { sessionStorage.setItem('gmIntroSeen', '1'); } catch (e) {}
    if (FX && FX.pulse && !still()) setTimeout(FX.pulse, 380);
    setTimeout(startNameFx, 4300);
  }
  /* הפתיחה: הלוגו נמשך בקו אחד, "ננעל", ואז הופך לשער –
     חלון בצורת הלוגו שגדל עד שהוא ממלא את המסך וחושף את האתר */
  var introArt = $('#introArt');
  var introHoles = intro ? $$('#gmHolePath, #gmHoleGlow, #gmHoleEdge', intro) : [];
  var portalOn = false;

  function removeIntro() {
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
    html.setAttribute('data-intro', 'done');
  }
  function openIntro(ms) {
    if (portalOn) return;
    portalOn = true;
    var r = intro && introArt ? introArt.getBoundingClientRect() : null;
    var k = r ? r.width / 126 : 0;
    if (!introHoles.length || !(k > 0)) { removeIntro(); enter(); return; }
    var PX = 66.5, PY = 40;   // ציר ההגדלה: אמצע הרגל השמאלית של ה-M (חלק מלא של הלוגו)
    var px = r.left + PX * k, py = r.top + PY * k;
    var vw = window.innerWidth, vh = window.innerHeight;
    // בסוף, הרגל (חצי רוחב 6.5 יחידות) צריכה לכסות את כל המסך
    var sEnd = 1.25 * Math.max(Math.max(px, vw - px) / (6.5 * k), Math.max(py, vh - py) / (24 * k));
    var lnEnd = Math.log(Math.max(sEnd, 2)), t0 = 0, done = false;
    var setScale = function (s) {
      var tr = 'translate(' + px.toFixed(2) + ' ' + py.toFixed(2) + ') scale(' + (k * s).toFixed(4) + ') translate(-' + PX + ' -' + PY + ')';
      for (var i = 0; i < introHoles.length; i++) introHoles[i].setAttribute('transform', tr);
      introArt.style.transform = 'scale(' + s.toFixed(4) + ')';
    };
    var finish = function () {
      if (done) return;
      done = true;
      enter();
      removeIntro();
    };
    setScale(1);
    intro.classList.add('portal');
    var step = function (now) {
      if (done) return;
      if (!t0) t0 = now;
      var p = clamp((now - t0) / ms, 0, 1);
      setScale(Math.exp(lnEnd * Math.pow(p, 2.3)));
      if (p >= 0.42) enter();
      if (p < 1) requestAnimationFrame(step); else finish();
    };
    requestAnimationFrame(step);
    setTimeout(finish, ms + 1500);   // רשת ביטחון: אם הלשונית ברקע ו-rAF מושהה
  }

  if (introMode === 'full' && intro) {
    var countEl = $('#introCount'), lineEl = $('.intro-line', intro), stateEl = $('#introState');
    var INTRO_MS = 1400, introT0 = performance.now(), introDone = false;
    var finishIntro = function (fast) {
      if (introDone) { if (fast) openIntro(620); return; }
      introDone = true;
      if (countEl) countEl.textContent = '100';
      if (lineEl) lineEl.style.setProperty('--p', '1');
      if (stateEl) stateEl.textContent = 'READY';
      if (fast) intro.classList.add('fast');
      intro.classList.add('lock');
      setTimeout(function () { openIntro(fast ? 620 : 900); }, fast ? 50 : 540);
    };
    var introTick = function (now) {
      if (introDone) return;
      var p = clamp((now - introT0) / INTRO_MS, 0, 1);
      // מונה שמרגיש "אמיתי": מהיר בהתחלה, מאט סביב 70% ואז רץ לסוף
      var e = p < 0.6 ? 0.72 * (1 - Math.pow(1 - p / 0.6, 3)) : 0.72 + 0.28 * Math.pow((p - 0.6) / 0.4, 2.2);
      if (countEl) countEl.textContent = String(Math.round(e * 100));
      if (lineEl) lineEl.style.setProperty('--p', e.toFixed(3));
      if (p < 1) requestAnimationFrame(introTick); else finishIntro(false);
    };
    requestAnimationFrame(introTick);
    setTimeout(function () { finishIntro(false); }, INTRO_MS + 1200);   // רשת ביטחון ללשונית ברקע
    intro.addEventListener('pointerdown', function () { finishIntro(true); });
    var introKey = function () { window.removeEventListener('keydown', introKey); finishIntro(true); };
    window.addEventListener('keydown', introKey);
  } else if (introMode === 'quick' && intro) {
    requestAnimationFrame(function () { requestAnimationFrame(function () { openIntro(650); }); });
    setTimeout(function () { openIntro(650); }, 500);
  } else {
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
    enter();
  }

  /* ══════════════ 2. כותרות מפוצלות + חשיפה בגלילה ══════════════ */
  $$('.split').forEach(function (el) {
    var wi = 0;
    var wrapWords = function (text, cls) {
      var frag = document.createDocumentFragment();
      text.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span');
        w.className = 'w';
        var inner = document.createElement('span');
        if (cls) inner.className = cls;
        inner.style.setProperty('--wi', String(wi++));
        inner.textContent = part;
        w.appendChild(inner);
        frag.appendChild(w);
      });
      return frag;
    };
    var out = document.createDocumentFragment();
    Array.prototype.slice.call(el.childNodes).forEach(function (node) {
      if (node.nodeType === 3) out.appendChild(wrapWords(node.textContent, ''));
      else if (node.nodeType === 1) out.appendChild(wrapWords(node.textContent, node.className));
    });
    el.textContent = '';
    el.appendChild(out);
  });

  html.classList.add('reveal-on');
  function reveal(el) {
    el.classList.add('in');
    if (el.getAttribute('data-reveal') === 'board') countUp(el);
  }
  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { io.unobserve(en.target); reveal(en.target); }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -7% 0px' });
  }
  $$('[data-reveal]').forEach(function (el) { if (io) io.observe(el); else reveal(el); });

  /* ══════════════ 3. הלוגוטייפ: התאמת גודל, פרוסות האותיות וגל הצבע ══════════════ */
  var wm = $('#wordmark'), letters = wm ? $$('.wm-l', wm) : [], hero = $('.hero');

  // פני האותיות: שלוש "פרוסות" לכל אות + עותק צבעוני לאפקט הגלגול (נצבעים ונחתכים ב-style.css)
  var wmParts = [];   // לכל אות: { l: האות, s: [שלוש הפרוסות], c: העותק הצבעוני }
  letters.forEach(function (l) {
    var ch = l.getAttribute('data-l') || l.textContent;
    var part = { l: l, s: [], c: null };
    ['wm-s wm-s1', 'wm-s wm-s2', 'wm-s wm-s3', 'wm-c'].forEach(function (cls) {
      var layer = document.createElement('i');
      layer.className = 'wm-fx ' + cls;
      layer.textContent = ch;
      l.appendChild(layer);
      if (cls === 'wm-c') part.c = layer; else part.s.push(layer);
    });
    wmParts.push(part);
  });
  if (wm && letters.length) wm.classList.add('wm-on');

  /* אפקטי השם: במצב רגיל השם לבן נקי. כל כמה שניות (וגם בלחיצה על השם) רץ אפקט אחד, בסבב:
     פריסה – שלוש הפרוסות של כל אות נשלפות לצדדים, האמצעית נצבעת, והן ננעלות בחזרה;
     גלגול – כל אות מתגלגלת למעלה כמו מונה, עוברת דרך עותק צבעוני וחוזרת ללבן;
     מילוי – הצבע עולה וממלא כל אות מלמטה, ואז מתרוקן. */
  var canAnimate = !!(wm && wm.animate), fxBusy = false, fxIndex = 0;
  var EASE_IO = 'cubic-bezier(.65, 0, .2, 1)', EASE_BACK = 'cubic-bezier(.3, 1.5, .4, 1)';

  function fxSlice(out) {
    var dx = [-0.12, 0.15, -0.07];
    wmParts.forEach(function (p, i) {
      var t = { duration: 1050, delay: Math.abs(i - (wmParts.length - 1) / 2) * 55, fill: 'backwards' };
      p.s.forEach(function (s, k) {
        out.push(s.animate([
          { transform: 'translateX(0)', easing: 'cubic-bezier(.2, .9, .2, 1)' },
          { transform: 'translateX(' + dx[k] + 'em)', offset: 0.2 },
          { transform: 'translateX(' + dx[k] + 'em)', offset: 0.58, easing: EASE_BACK },
          { transform: 'translateX(0)' }
        ], t));
      });
      // הפרוסה האמצעית נצבעת בבת אחת כשהיא נשלפת, וחוזרת ללבן בדרך חזרה
      out.push(p.s[1].animate([
        { backgroundPosition: '0% 0%', easing: 'steps(1, end)' },
        { backgroundPosition: '0% 100%', offset: 0.06, easing: 'steps(1, end)' },
        { backgroundPosition: '0% 0%', offset: 0.8 },
        { backgroundPosition: '0% 0%' }
      ], t));
    });
  }

  function fxRoll(out) {
    wmParts.forEach(function (p, i) {
      var t = { duration: 1350, delay: i * 90, fill: 'backwards' };
      p.l.classList.add('is-rolling');
      p.s.forEach(function (s) {
        out.push(s.animate([
          { transform: 'translateY(0)', easing: EASE_IO },
          { transform: 'translateY(-1em)', offset: 0.36 },
          { transform: 'translateY(1em)', offset: 0.36 },
          { transform: 'translateY(1em)', offset: 0.56, easing: EASE_IO },
          { transform: 'translateY(0)' }
        ], t));
      });
      out.push(p.c.animate([
        { transform: 'translateY(1em)', easing: EASE_IO },
        { transform: 'translateY(0)', offset: 0.36 },
        { transform: 'translateY(0)', offset: 0.56, easing: EASE_IO },
        { transform: 'translateY(-1em)' }
      ], t));
    });
  }

  function fxFill(out) {
    wmParts.forEach(function (p, i) {
      var t = { duration: 1300, delay: i * 95, fill: 'backwards' };
      p.s.forEach(function (s) {
        out.push(s.animate([
          { backgroundPosition: '0% 0%', easing: EASE_IO },
          { backgroundPosition: '0% 100%', offset: 0.34 },
          { backgroundPosition: '0% 100%', offset: 0.6, easing: EASE_IO },
          { backgroundPosition: '0% 0%' }
        ], t));
      });
      out.push(p.l.animate([
        { transform: 'translateY(0)', easing: EASE_IO },
        { transform: 'translateY(-0.05em)', offset: 0.34 },
        { transform: 'translateY(-0.05em)', offset: 0.6, easing: EASE_BACK },
        { transform: 'translateY(0)' }
      ], t));
    });
  }

  var FX_LIST = [fxSlice, fxRoll, fxFill];
  function playNameFx() {
    if (!canAnimate || fxBusy || !wmParts.length || still() || document.hidden || !html.classList.contains('entered')) return;
    fxBusy = true;
    var anims = [];
    try { FX_LIST[fxIndex++ % FX_LIST.length](anims); } catch (e) {}
    var left = anims.length;
    var done = function () {
      wm.classList.remove('is-fx');
      letters.forEach(function (l) { l.classList.remove('is-rolling'); });
      fxBusy = false;
    };
    if (!left) { done(); return; }
    wm.classList.add('is-fx');
    var one = function () { if (--left === 0) done(); };
    anims.forEach(function (a) { a.onfinish = one; a.oncancel = one; });
  }
  function startNameFx() {
    playNameFx();
    setInterval(playNameFx, 6500);
  }
  on(wm, 'click', playNameFx);

  function fitWordmark() {
    if (!wm || !letters.length) return;
    wm.classList.add('measuring');
    wm.style.fontSize = '';
    var cs = getComputedStyle(wm);
    var base = parseFloat(cs.fontSize) || 100;
    var mobile = window.innerWidth <= 760;
    // offsetWidth = רוחב הפריסה, בלי השפעה של אנימציות הכניסה (scale / rotate)
    var content = 0;
    letters.forEach(function (l) { content += l.offsetWidth; });
    var avail = Math.min(wm.clientWidth, 1560);
    if (content > 0 && avail > 0) {
      var size = base * (avail / content) * 0.98;
      size = Math.min(size, window.innerHeight * (mobile ? 0.3 : 0.36));
      wm.style.fontSize = size.toFixed(1) + 'px';
    }
    wm.classList.remove('measuring');
  }

  if (fine && wm && hero) {
    var wmx = 0, wmRaf = 0;
    var wmUpdate = function () {
      wmRaf = 0;
      var rw = wm.getBoundingClientRect();
      wm.style.setProperty('--px', clamp(((wmx - rw.left) / rw.width) * 2 - 1, -1.4, 1.4).toFixed(3));
    };
    hero.addEventListener('pointermove', function (e) {
      if ((e.pointerType && e.pointerType !== 'mouse') || still()) return;
      wmx = e.clientX;
      if (!wmRaf) wmRaf = requestAnimationFrame(wmUpdate);
    }, { passive: true });
    hero.addEventListener('pointerleave', function () { wm.style.setProperty('--px', '0'); });
  }

  /* ══════════════ 4. טוסט + העתקת קוד היוצר ══════════════ */
  var toastEl = $('#toast'), toastTimer = 0;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 1900);
  }
  on($('#codeChip'), 'click', function () {
    var ok = function () { toast('הקוד IGM הועתק ✓'); };
    var fail = function () { toast('קוד היוצר: IGM'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText('IGM').then(ok, fail);
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = 'IGM';
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      body.appendChild(ta);
      ta.select();
      var copied = document.execCommand('copy');
      body.removeChild(ta);
      if (copied) ok(); else fail();
    } catch (e) { fail(); }
  });

  /* ערכת הצבע: כפתור הצבע ב-dock מחליף בין סגול לירוק, והבחירה נשמרת */
  on($('#themeToggle'), 'click', function () {
    var next = html.getAttribute('data-theme') === 'purple' ? 'lime' : 'purple';
    html.setAttribute('data-theme', next);
    try { localStorage.setItem('gmTheme2', next); } catch (e) {}
    toast(next === 'purple' ? 'סגול 💜' : 'ירוק 💚');
    if (FX && FX.pulse && !still()) FX.pulse();
  });

  /* ══════════════ 5. כרטיסי הקישורים: "שפיכת" צבע מנקודת הכניסה + הטיה ══════════════ */
  $$('.tile').forEach(function (tile) {
    var setOrigin = function (e) {
      var r = tile.getBoundingClientRect();
      tile.style.setProperty('--fx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
      tile.style.setProperty('--fy', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
    };
    tile.addEventListener('pointerenter', setOrigin);
    tile.addEventListener('pointerleave', function (e) {
      setOrigin(e);
      tile.style.setProperty('--rx', '0deg');
      tile.style.setProperty('--ry', '0deg');
    });
    tile.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      setOrigin(e);
      tile.classList.add('is-press');
      setTimeout(function () { tile.classList.remove('is-press'); }, 950);
    });
    if (fine) {
      tile.addEventListener('pointermove', function (e) {
        var r = tile.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        tile.style.setProperty('--ry', (px * 8).toFixed(2) + 'deg');
        tile.style.setProperty('--rx', (-py * 8).toFixed(2) + 'deg');
      });
    }
  });

  /* כפתורים "מגנטיים" */
  if (fine) {
    $$('[data-magnet]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mgx', ((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1) + 'px');
        el.style.setProperty('--mgy', ((e.clientY - (r.top + r.height / 2)) * 0.3).toFixed(1) + 'px');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--mgx', '0px');
        el.style.setProperty('--mgy', '0px');
      });
    });
  }

  /* ══════════════ 6. ה-Dock: סימון המקטע הנוכחי + הגדלה כמו ב-macOS ══════════════ */
  var dock = $('#dock');
  var dockLinks = dock ? $$('.dock-i[data-target]', dock) : [];
  var sections = dockLinks.map(function (a) {
    var id = a.getAttribute('data-target');
    return { link: a, el: id === 'top' ? hero : document.getElementById(id) };
  }).filter(function (s) { return s.el; });

  function spy() {
    if (!sections.length) return;
    var mid = window.innerHeight * 0.42, current = sections[0];
    sections.forEach(function (s) { if (s.el.getBoundingClientRect().top <= mid) current = s; });
    dockLinks.forEach(function (a) {
      var active = a === current.link;
      if (a.classList.contains('is-active') !== active) {
        a.classList.toggle('is-active', active);
        if (active) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      }
    });
  }
  if (fine && dock) {
    var dockAll = $$('.dock-i', dock);
    dock.addEventListener('pointermove', function (e) {
      dockAll.forEach(function (it) {
        var r = it.getBoundingClientRect();
        var f = clamp(1 - Math.abs(e.clientX - (r.left + r.width / 2)) / 130, 0, 1);
        it.style.setProperty('--s', (1 + 0.42 * f * f).toFixed(3));
      });
    });
    dock.addEventListener('pointerleave', function () {
      dockAll.forEach(function (it) { it.style.setProperty('--s', '1'); });
    });
  }

  /* ══════════════ 7. גלילה: פס התקדמות, סימון מקטע והאצת הסרט הנע ══════════════ */
  var progressEl = $('.progress');
  var scrollTicking = false, cursorSync = null;
  function onScrollFrame() {
    scrollTicking = false;
    var y = window.pageYOffset || 0;
    var max = Math.max(1, html.scrollHeight - window.innerHeight);
    if (progressEl) progressEl.style.setProperty('--p', clamp(y / max, 0, 1).toFixed(4));
    if (hero) hero.style.setProperty('--sy', still() ? '0' : clamp(y / Math.max(1, hero.offsetHeight * 0.85), 0, 1).toFixed(3));
    spy();
    if (cursorSync) cursorSync();
  }
  window.addEventListener('scroll', function () {
    if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(onScrollFrame); }
  }, { passive: true });

  var tapeTracks = $$('.tape-track'), tapeAnims = null, tapeRate = 1;
  var velY = window.pageYOffset || 0, velT = performance.now(), vel = 0;
  function tapeLoop(now) {
    var y = window.pageYOffset || 0, dt = Math.max(1, now - velT);
    vel += (Math.abs(y - velY) / dt - vel) * 0.12;
    velY = y; velT = now;
    if (!tapeAnims) {
      tapeAnims = [];
      tapeTracks.forEach(function (t) {
        if (t.getAnimations) t.getAnimations().forEach(function (a) { tapeAnims.push(a); });
      });
      if (!tapeAnims.length) tapeAnims = null;
    }
    if (tapeAnims) {
      var rate = still() ? 1 : 1 + Math.min(7, vel * 5);
      if (Math.abs(rate - tapeRate) > 0.06) {
        tapeRate = rate;
        tapeAnims.forEach(function (a) {
          if (a.updatePlaybackRate) a.updatePlaybackRate(rate); else a.playbackRate = rate;
        });
      }
    }
    requestAnimationFrame(tapeLoop);
  }
  if (tapeTracks.length) requestAnimationFrame(tapeLoop);

  /* ══════════════ 8. סמן מותאם (מחשב בלבד) ══════════════ */
  if (fine) {
    var cur = $('#cursor'), curDot = cur ? cur.firstElementChild : null;
    if (cur && curDot) {
      html.classList.add('has-cursor');
      cur.classList.add('is-hidden');
      var cx = -100, cy = -100, tx = -100, ty = -100, curShown = false;
      var curTarget = function (t) {
        var lab = t && t.closest ? t.closest('[data-cursor]') : null;
        var link = t && t.closest ? t.closest('a, button, .avatar, .emote, .path-nodes li') : null;
        cur.classList.toggle('is-label', !!lab);
        cur.classList.toggle('is-link', !lab && !!link);
        var text = lab ? lab.getAttribute('data-cursor') : '';
        if (curDot.textContent !== text) curDot.textContent = text;
      };
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        tx = e.clientX; ty = e.clientY;
        if (!curShown) { curShown = true; cx = tx; cy = ty; cur.classList.remove('is-hidden'); }
        curTarget(e.target);
      }, { passive: true });
      // בגלילה האלמנט שמתחת לסמן מתחלף גם בלי שהעכבר זז
      cursorSync = function () { if (curShown) curTarget(document.elementFromPoint(tx, ty)); };
      html.addEventListener('mouseleave', function () { cur.classList.add('is-hidden'); curShown = false; });
      window.addEventListener('pointerdown', function () { cur.classList.add('is-down'); }, { passive: true });
      window.addEventListener('pointerup', function () { cur.classList.remove('is-down'); }, { passive: true });
      var curLoop = function () {
        cx += (tx - cx) * 0.24;
        cy += (ty - cy) * 0.24;
        cur.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
        requestAnimationFrame(curLoop);
      };
      requestAnimationFrame(curLoop);
    }
  }

  /* ══════════════ 9. שורות האימוג'ים הנעות ══════════════ */
  function setupMarquee() {
    $$('.emote-track').forEach(function (track) {
      $$('[data-clone]', track).forEach(function (n) { track.removeChild(n); });
      var originals = Array.prototype.slice.call(track.children);
      if (!originals.length) return;
      var tcs = getComputedStyle(track);
      var gap = parseFloat(tcs.columnGap) || parseFloat(tcs.gap) || 14;
      var setW = 0;
      originals.forEach(function (n) { setW += n.offsetWidth + gap; });
      if (!setW) return;
      var copies = Math.max(2, Math.ceil((track.parentNode.clientWidth * 1.15) / setW) + 1);
      for (var k = 1; k < copies; k++) {
        originals.forEach(function (n) {
          var c = n.cloneNode(true);
          c.setAttribute('data-clone', '');
          c.setAttribute('aria-hidden', 'true');
          track.appendChild(c);
        });
      }
      track.style.setProperty('--loop', '-' + setW.toFixed(1) + 'px');
      track.style.setProperty('--dur', (setW / 40).toFixed(1) + 's');
    });
  }

  /* ══════════════ 10. ביצת פסחא: 5 לחיצות על התמונה = גשם אימוג'ים ══════════════ */
  var avatar = $('#avatar'), avatarClicks = [], raining = false;
  function emoteRain() {
    if (raining || still()) return;
    raining = true;
    var box = document.createElement('div');
    box.className = 'emote-rain';
    box.setAttribute('aria-hidden', 'true');
    var count = window.innerWidth < 700 ? 28 : 48;
    for (var i = 0; i < count; i++) {
      var id = 1 + ((Math.random() * 13) | 0);
      var img = new Image();
      img.alt = '';
      img.src = 'Subscriber%20emotes/' + id + (id === 8 ? '.gif' : '.png');
      img.style.cssText = 'left:' + (Math.random() * 100).toFixed(1) + 'vw;width:' + (30 + Math.random() * 38).toFixed(0) + 'px;' +
        'animation-duration:' + (2.4 + Math.random() * 2.6).toFixed(2) + 's;animation-delay:' + (Math.random() * 1.7).toFixed(2) + 's;' +
        '--rot:' + ((Math.random() * 720 - 360) | 0) + 'deg;--dx:' + ((Math.random() * 160 - 80) | 0) + 'px';
      box.appendChild(img);
    }
    body.appendChild(box);
    toast('GG! 🎉');
    setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
      raining = false;
    }, 7400);
  }
  on(avatar, 'click', function () {
    var now = Date.now();
    avatarClicks = avatarClicks.filter(function (t) { return now - t < 2400; });
    avatarClicks.push(now);
    if (avatarClicks.length >= 5) { avatarClicks = []; emoteRain(); }
  });

  /* ══════════════ 11. סטטוס השידור ב-Kick ══════════════ */
  function setLive(isLive) {
    html.classList.toggle('is-live', isLive);
    $$('[data-live-badge]').forEach(function (b) {
      b.classList.toggle('live', isLive);
      b.classList.toggle('offline', !isLive);
      b.title = isLive ? 'GalGM is LIVE on Kick! Click to watch' : 'GalGM is OFFLINE';
    });
    $$('[data-live-text]').forEach(function (t) { t.textContent = isLive ? 'LIVE' : 'OFFLINE'; });
  }
  async function checkKickLiveStatus() {
    try {
      var response = await fetch('https://kick.com/api/v2/channels/galgm', {
        headers: { 'Accept': 'application/json' }, cache: 'no-store'
      });
      if (response.ok) {
        var data = await response.json();
        setLive(Boolean(data && data.livestream));
      }
    } catch (err) {
      console.debug('Kick status check info:', err);
    }
  }

  /* ══════════════ 12. טבלאות התורמים (Gifts & Kicks) ══════════════ */
  // נתוני גיבוי אמיתיים מ-Kick (עודכנו 21/11/2026) – מוצגים אם הטעינה החיה נכשלת
  var defaultGiftsSeed = [
    { username: 'omer_lev',        quantity: 341 },
    { username: 'Koren_va',        quantity: 310 },
    { username: 'Danielthekiller', quantity: 84 },
    { username: 'YardenRGS',       quantity: 71 },
    { username: 'Krav0n',          quantity: 66 },
    { username: 'xEXITx',          quantity: 63 },
    { username: 'orileo29',        quantity: 53 },
    { username: 'K1tt_3h',         quantity: 42 },
    { username: 'edan_c',          quantity: 35 },
    { username: 'THE_TIGRIS',      quantity: 16 }
  ];
  var lifetimeKicksTop10 = [
    { username: 'omer_lev',        quantity: 204540 },
    { username: 'Danielthekiller', quantity: 57500 },
    { username: 'shaked_b',        quantity: 38343 },
    { username: 'Koren_va',        quantity: 31500 },
    { username: 'Krav0n',          quantity: 24400 },
    { username: 'K1tt_3h',         quantity: 20000 },
    { username: 'THE_TIGRIS',      quantity: 14500 },
    { username: 'orileo29',        quantity: 14000 },
    { username: 'TheKatan',        quantity: 10500 },
    { username: 'xEXITx',          quantity: 9500 }
  ];
  var defaultKicksSeed = lifetimeKicksTop10;

  var KICK_CHANNEL_ID = 7843283;   // מזהה הערוץ של galgm ב-Kick
  // כתובת ה-Cloudflare Worker שמביא את הנתונים מ-Kick.
  // אם ריק – האתר משתמש בפרוקסים הציבוריים ובנתוני הגיבוי.
  var LEADERBOARD_WORKER_URL = 'https://galgm-leaderboards.gal-m1521.workers.dev';
  var MEDALS = ['🥇', '🥈', '🥉'];

  var boards = {};
  $$('[data-board]').forEach(function (el) {
    boards[el.getAttribute('data-board')] = { el: el, podium: $('.podium', el), list: $('.rank-list', el), sig: null };
  });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function amountOf(it) { return Number(it.quantity || it.amount || 0) || 0; }
  function nameOf(it) { return it.username || (it.user && it.user.username) || 'Anonymous'; }
  function fmt(n) { return Number(n).toLocaleString('en-US'); }

  function countUp(scope) {
    if (still()) return;
    $$('[data-val]', scope).forEach(function (el, i) {
      var end = Number(el.getAttribute('data-val')) || 0;
      var start = performance.now() + 260 + i * 60, dur = 1150;
      el.textContent = '0';
      var step = function (now) {
        if (!el.isConnected) return;
        var p = clamp((now - start) / dur, 0, 1);
        el.textContent = fmt(Math.round(end * (1 - Math.pow(1 - p, 4))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function renderBoard(kind, dataList) {
    var b = boards[kind];
    if (!b || !b.podium || !b.list) return;
    if (!dataList || dataList.length === 0) {
      if (b.sig !== '') {
        b.sig = '';
        b.podium.innerHTML = '<div class="board-empty" style="grid-column:1/-1">אין נתונים זמינים כרגע</div>';
        b.list.innerHTML = '';
      }
      return;
    }
    var top10 = dataList.slice().sort(function (a, c) { return amountOf(c) - amountOf(a); }).slice(0, 10);
    var sig = top10.map(function (it) { return nameOf(it) + ':' + amountOf(it); }).join('|');
    if (sig === b.sig) return;   // אותם נתונים – לא בונים מחדש
    b.sig = sig;

    b.podium.innerHTML = top10.slice(0, 3).map(function (it, i) {
      var name = escapeHtml(nameOf(it)), num = amountOf(it);
      return '<div class="pod pod-' + (i + 1) + '" style="--pi:' + i + '">' +
        '<div class="pod-medal" aria-hidden="true">' + MEDALS[i] + '</div>' +
        '<div class="pod-name" title="' + name + '">' + name + '</div>' +
        '<div class="pod-amt" data-val="' + num + '">' + fmt(num) + '</div>' +
        '<div class="pod-pillar"><span class="pod-rank">' + (i + 1) + '</span></div>' +
        '</div>';
    }).join('');

    var rest = top10.slice(3);
    var base = rest.length ? Math.max(1, amountOf(rest[0])) : 1;
    b.list.innerHTML = rest.map(function (it, i) {
      var name = escapeHtml(nameOf(it)), num = amountOf(it), rank = i + 4;
      var bw = clamp(Math.round((num / base) * 100), 5, 100);
      return '<li class="rank" style="--bw:' + bw + '%;--ri:' + i + '">' +
        '<span class="rank-n">' + (rank < 10 ? '0' : '') + rank + '</span>' +
        '<span class="rank-u" title="' + name + '">' + name + '</span>' +
        '<span class="rank-a" data-val="' + num + '">' + fmt(num) + '</span>' +
        '</li>';
    }).join('');

    if (b.el.classList.contains('in')) countUp(b.el);
  }

  // מנסה להביא JSON ישירות ודרך כמה פרוקסים במקביל; הראשון שמחזיר נתון תקין מנצח.
  // לכל ניסיון יש הגבלת זמן, כך שפרוקסי תקוע לא משאיר את הטבלה ב"טוען..." לנצח.
  async function fetchJsonWithFallbacks(targetUrl, isValid, timeoutMs) {
    timeoutMs = timeoutMs || 9000;
    var enc = encodeURIComponent(targetUrl);
    var attempts = [
      { url: targetUrl },
      { url: 'https://api.allorigins.win/get?url=' + enc, wrapped: true },
      { url: 'https://api.allorigins.win/raw?url=' + enc },
      { url: 'https://api.codetabs.com/v1/proxy?quest=' + enc }
    ];
    var tryOne = async function (a) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs);
      try {
        var resp = await fetch(a.url, { cache: 'no-store', signal: ctrl.signal });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var data = await resp.json();
        if (a.wrapped) data = JSON.parse(data.contents);
        if (typeof data === 'string') data = JSON.parse(data);
        if (!isValid(data)) throw new Error('invalid data');
        return data;
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      return await Promise.any(attempts.map(tryOne));
    } catch (e) {
      return null;   // כל הניסיונות נכשלו
    }
  }

  async function fetchJsonFromWorker(timeoutMs) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000);
    try {
      var resp = await fetch(LEADERBOARD_WORKER_URL.replace(/\/+$/, ''), { cache: 'no-store', signal: ctrl.signal });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  var isLeaderboardsLoading = false, leaderboardsRenderedOnce = false;
  async function fetchKickLeaderboards() {
    if (isLeaderboardsLoading) return;
    isLeaderboardsLoading = true;
    var refreshIcon = $('#donatorsRefreshIcon'), statusText = $('#donatorsUpdateStatus');
    if (refreshIcon) refreshIcon.classList.add('fa-spin');

    // מציגים מיד את נתוני הגיבוי כדי שהטבלה לעולם לא תיתקע על "טוען..."
    if (!leaderboardsRenderedOnce) {
      renderBoard('gifts', defaultGiftsSeed);
      renderBoard('kicks', defaultKicksSeed);
      leaderboardsRenderedOnce = true;
    }

    try {
      // 1) קודם כל ה-Worker שלנו – מהיר ואמין
      var giftsData = null, kicksData = null;
      if (LEADERBOARD_WORKER_URL) {
        var w = await fetchJsonFromWorker();
        if (w) {
          if (Array.isArray(w.gifts)) giftsData = { gifts: w.gifts };
          if (Array.isArray(w.kicks)) kicksData = { data: { kicks_gifts_lifetime: w.kicks } };
        }
      }

      // 2) גיבוי: ישירות / דרך פרוקסים ציבוריים, רק למה שה-Worker לא החזיר
      var fallbacks = await Promise.all([
        giftsData ? null : fetchJsonWithFallbacks(
          'https://kick.com/api/v2/channels/galgm/leaderboards',
          function (d) { return d && Array.isArray(d.gifts); }
        ),
        kicksData ? null : fetchJsonWithFallbacks(
          'https://web.kick.com/api/v1/kicks/' + KICK_CHANNEL_ID + '/leaderboard',
          function (d) { return d && d.data && Array.isArray(d.data.kicks_gifts_lifetime); }
        )
      ]);
      giftsData = giftsData || fallbacks[0];
      kicksData = kicksData || fallbacks[1];

      if (giftsData && giftsData.gifts.length > 0) renderBoard('gifts', giftsData.gifts);
      if (kicksData && kicksData.data.kicks_gifts_lifetime.length > 0) renderBoard('kicks', kicksData.data.kicks_gifts_lifetime);

      var timeStr = new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
      if (statusText) {
        statusText.textContent = (giftsData || kicksData)
          ? 'עודכן לאחרונה: ' + timeStr + ' • מתעדכן אוטומטית'
          : 'לא ניתן להתחבר ל-Kick כרגע • מוצגים נתונים שמורים';
      }
    } finally {
      if (refreshIcon) refreshIcon.classList.remove('fa-spin');
      isLeaderboardsLoading = false;
    }
  }
  on($('#donatorsRefresh'), 'click', function () { fetchKickLeaderboards(); });

  /* ══════════════ 13. חלון Bit ══════════════ */
  var bitModal = $('#bitModalOverlay');
  function openBitModal() { if (bitModal) bitModal.classList.add('open'); }
  function closeBitModal() { if (bitModal) bitModal.classList.remove('open'); }
  on($('#bitOpen'), 'click', openBitModal);
  on($('#bitClose'), 'click', closeBitModal);
  on(bitModal, 'click', function (e) { if (e.target === bitModal) closeBitModal(); });
  window.openBitModal = openBitModal;
  window.closeBitModal = closeBitModal;

  /* ══════════════ 14. תפריט הנגישות (הלוגיקה המקורית) ══════════════ */
  var openButton   = $('#accessibilityOpen');
  var closeButton  = $('#accessibilityClose');
  var panel        = $('#accessibilityPanel');
  var speechStatus = $('#speechStatus');
  var readingGuide = $('#reading-guide');
  var readingMask  = $('#reading-mask');
  var items        = $$('.accessibility-item');
  var synth        = window.speechSynthesis || null;

  on(openButton, 'click', function () { if (panel) panel.classList.add('open'); });
  on(closeButton, 'click', function () { if (panel) panel.classList.remove('open'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (panel) panel.classList.remove('open');
      if (synth) synth.cancel();
      closeBitModal();
    }
  });
  items.forEach(function (item) {
    item.addEventListener('click', function () { handleAccessibilityAction(item.dataset.action, item); });
  });

  function handleAccessibilityAction(action, item) {
    switch (action) {
      case 'text-to-speech': toggleTextToSpeech(item); break;
      case 'large-text':     body.classList.toggle('access-large-text');     item.classList.toggle('active'); setTimeout(onResize, 60); break;
      case 'line-spacing':   body.classList.toggle('access-line-spacing');   item.classList.toggle('active'); break;
      case 'readable-font':  body.classList.toggle('access-readable-font');  item.classList.toggle('active'); setTimeout(onResize, 60); break;
      case 'letter-spacing': body.classList.toggle('access-letter-spacing'); item.classList.toggle('active'); setTimeout(onResize, 60); break;
      case 'headings':       body.classList.toggle('access-headings');       item.classList.toggle('active'); break;
      case 'links':          body.classList.toggle('access-links');          item.classList.toggle('active'); break;
      case 'contrast':       body.classList.toggle('access-high-contrast');  item.classList.toggle('active'); break;
      case 'invert':         body.classList.toggle('access-invert');         item.classList.toggle('active'); break;
      case 'grayscale':      body.classList.toggle('access-grayscale');      item.classList.toggle('active'); break;
      case 'saturation':     body.classList.toggle('access-saturation');     item.classList.toggle('active'); break;
      case 'hide-images':    body.classList.toggle('access-hide-images');    item.classList.toggle('active'); break;
      case 'big-cursor':     body.classList.toggle('access-big-cursor');     item.classList.toggle('active'); break;
      case 'no-animation':   body.classList.toggle('access-no-animation');   item.classList.toggle('active'); break;
      case 'focus':          body.classList.toggle('access-focus');          item.classList.toggle('active'); break;
      case 'reading-guide':  toggleReadingGuide(item); break;
      case 'reading-mask':   toggleReadingMask(item);  break;
      case 'align':          toggleTextAlignment(item); break;
    }
  }

  var textToSpeechEnabled = false;
  function toggleTextToSpeech(item) {
    textToSpeechEnabled = !textToSpeechEnabled;
    item.classList.toggle('active', textToSpeechEnabled);
    if (speechStatus) speechStatus.style.display = textToSpeechEnabled ? 'block' : 'none';
    if (!textToSpeechEnabled && synth) synth.cancel();
  }
  function speakText(text) {
    if (!synth || !text || !text.trim()) return;
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text.trim());
    u.lang = 'he-IL'; u.rate = 0.9; u.pitch = 1; u.volume = 1;
    synth.speak(u);
  }
  document.addEventListener('click', function (e) {
    if (!textToSpeechEnabled) return;
    if (e.target.closest('.accessibility-panel') || e.target.closest('#accessibilityOpen')) return;
    var text = (e.target.innerText || e.target.textContent || '').trim();
    if (text.length > 0) speakText(text);
  }, true);
  document.addEventListener('mouseup', function () {
    if (!textToSpeechEnabled) return;
    var sel = window.getSelection();
    if (sel) { var t = sel.toString().trim(); if (t.length > 0) speakText(t); }
  });

  var guideEnabled = false;
  function toggleReadingGuide(item) {
    guideEnabled = !guideEnabled;
    if (readingGuide) readingGuide.style.display = guideEnabled ? 'block' : 'none';
    item.classList.toggle('active', guideEnabled);
  }
  var maskEnabled = false;
  function toggleReadingMask(item) {
    maskEnabled = !maskEnabled;
    if (readingMask) readingMask.style.display = maskEnabled ? 'block' : 'none';
    item.classList.toggle('active', maskEnabled);
  }
  document.addEventListener('mousemove', function (e) {
    if (guideEnabled && readingGuide) readingGuide.style.top = (e.clientY - 2)  + 'px';
    if (maskEnabled && readingMask)   readingMask.style.top  = (e.clientY - 40) + 'px';
  });

  var currentAlignment = 0;
  function toggleTextAlignment(item) {
    currentAlignment = (currentAlignment + 1) % 4;
    body.style.textAlign = ['', 'right', 'center', 'left'][currentAlignment];
    item.classList.toggle('active', currentAlignment !== 0);
  }

  on($('#accessibilityReset'), 'click', function () {
    ['access-large-text', 'access-line-spacing', 'access-readable-font', 'access-letter-spacing',
     'access-headings', 'access-links', 'access-high-contrast', 'access-invert', 'access-grayscale',
     'access-saturation', 'access-hide-images', 'access-big-cursor', 'access-no-animation', 'access-focus'
    ].forEach(function (c) { body.classList.remove(c); });
    currentAlignment = 0; body.style.textAlign = '';
    guideEnabled = false; if (readingGuide) readingGuide.style.display = 'none';
    maskEnabled  = false; if (readingMask) readingMask.style.display  = 'none';
    textToSpeechEnabled = false; if (speechStatus) speechStatus.style.display = 'none';
    if (synth) synth.cancel();
    items.forEach(function (i) { i.classList.remove('active'); });
    setTimeout(onResize, 60);
  });

  /* ══════════════ 15. אתחול ══════════════ */
  function onResize() {
    fitWordmark();
    setupMarquee();
    onScrollFrame();
  }
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(onResize, 140);
  });
  onResize();
  // הגופנים נטענים אחרי הציור הראשון – מתאימים מחדש את הלוגוטייפ כשהם מגיעים
  if (document.fonts) {
    if (document.fonts.load) {
      document.fonts.load('900 100px Unbounded').then(onResize, function () {});
      document.fonts.load('700 16px Heebo').then(onResize, function () {});
    }
    if (document.fonts.ready) document.fonts.ready.then(onResize);
    if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', onResize);
  }
  window.addEventListener('load', onResize);

  checkKickLiveStatus();
  setInterval(checkKickLiveStatus, 60000);
  fetchKickLeaderboards();
  setInterval(fetchKickLeaderboards, 60000);
})();
