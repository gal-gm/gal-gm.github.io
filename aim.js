/* ============================================================
   Aim Trainer – לוגיקת המשחק (aim.html)
   30 שניות, שלוש מטרות בכל רגע. פגיעה במטרה מקפיצה חדשה במקומה.
   ניקוד: 100 לפגיעה + בונוס מהירות (עד 100) + בונוס רצף (עד 50). פספוס: מינוס 50 ושבירת הרצף.

   שני מצבים:
   • FPS – העכבר ננעל (Pointer Lock), הכוונת במרכז והמבט מסתובב. הרגישות מוגדרת לפי משחק:
     כל משחק מסובב את המבט במספר מעלות קבוע לכל "ספירה" של העכבר (yaw) כפול הרגישות,
     ולכן אותה תנועת יד נותנת כאן אותו סיבוב כמו במשחק, בלי קשר ל-DPI.
   • סמן רגיל – לוחצים על המטרות עם הסמן של המערכת (וגם במסך מגע).

   שם שחקן: נבחר פעם אחת ונשמר בדפדפן יחד עם מזהה אקראי; החלפה פעם בשבוע.
   כשה-Worker ב-Cloudflare תומך בזה, הוא שומר שהשם ייחודי ומנהל את טבלת הטופ.
   ============================================================ */
(function () {
  'use strict';

  var API = 'https://galgm-leaderboards.gal-m1521.workers.dev/aim';
  var DURATION = 30000;     // אורך סיבוב (אלפיות שנייה)
  var TARGETS = 3;          // כמה מטרות בו-זמנית
  var MISS_PENALTY = 50;
  var WEEK = 7 * 24 * 60 * 60 * 1000;
  var NAME_RE = /^[A-Za-z0-9_\-א-ת]{3,16}$/;
  var RAD = Math.PI / 180;

  /* המשחקים שבממיר. yaw = מעלות סיבוב לכל ספירת עכבר, ליחידת רגישות אחת (אומת מול מחשבוני המרה).
     fov = שדה הראייה האופקי המקובל במשחק במסך 16:9. sens = ערך התחלתי (שווה ערך ל-0.4 בולורנט). */
  var GAMES = [
    { id: 'valorant',  name: 'Valorant',           yaw: 0.07,       fov: 103,    sens: 0.4,   digits: 3 },
    { id: 'cs2',       name: 'CS2',                yaw: 0.022,      fov: 106.26, sens: 1.27,  digits: 2 },
    { id: 'fortnite',  name: 'Fortnite',           yaw: 0.005555,   fov: 80,     sens: 5.0,   digits: 1, unit: '%', label: 'רגישות X במשחק (באחוזים)' },
    { id: 'overwatch', name: 'Overwatch 2',        yaw: 0.0066,     fov: 103,    sens: 4.24,  digits: 2 },
    { id: 'apex',      name: 'Apex Legends',       yaw: 0.022,      fov: 106.26, sens: 1.27,  digits: 2 },
    { id: 'r6',        name: 'Rainbow Six Siege',  yaw: 0.00572958, fov: 91.5,   sens: 4.89,  digits: 2, label: 'הרגישות במשחק (מכפיל ברירת מחדל)' },
    { id: 'deadlock',  name: 'Deadlock',           yaw: 0.044,      fov: 106.26, sens: 0.64,  digits: 2 }
  ];

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var arena = $('#arena'), startScreen = $('#startScreen'), endScreen = $('#endScreen'), pauseScreen = $('#pauseScreen'), countdown = $('#countdown');
  var hudTime = $('#hudTime'), hudScore = $('#hudScore'), hudAcc = $('#hudAcc'), hudBest = $('#hudBest');
  var soundBtn = $('#soundBtn'), nameBtn = $('#nameBtn'), restartBtn = $('#restartBtn');
  var nameBox = $('#nameBox'), readyBox = $('#readyBox'), nameInput = $('#nameInput'), nameMsg = $('#nameMsg');
  var topBox = $('#topBox'), topList = $('#topList');
  var scene = $('#scene'), crosshair = $('#crosshair'), gun = $('#gun'), sensBox = $('#sensBox');
  if (!arena) return;

  var canFps = !!(arena.requestPointerLock && window.matchMedia && window.matchMedia('(pointer: fine)').matches);
  var state = 'idle';       // idle | count | play | paused | end
  var mode = 'classic';     // classic | fps
  var targets = [];         // classic: { el, x, y, r, born } · fps: { x, y, z, r, born }
  var t0 = 0, timer = 0, countTimer = 0, pausedAt = 0;
  var score = 0, hits = 0, misses = 0, combo = 0, bestCombo = 0, reactSum = 0;
  var input = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 'touch' : 'mouse';
  var topInput = input, serverOk = false;

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }

  /* ───── שיא אישי (נפרד ל-FPS, לעכבר ולמסך מגע) ───── */
  function kind() { return mode === 'fps' ? 'fps' : input; }
  function getBest() { return parseInt(store('gmAimBest_' + kind()), 10) || 0; }
  function setBest(v) { store('gmAimBest_' + kind(), String(v)); }

  /* ══════════════ צלילים (Web Audio, בלי קבצים) ══════════════ */
  var soundOn = store('gmAimSound') !== '0', ac = null, bus = null, noiseBuf = null;
  var SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];   // סולם פנטטוני עולה
  function audio() {
    if (!ac) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      var comp = ac.createDynamicsCompressor(), out = ac.createGain();
      out.gain.value = 0.85;
      comp.connect(out); out.connect(ac.destination);
      bus = comp;
      noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.06), ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  // צליל אחד: תדר, אורך (שניות), ואפשרויות – סוג גל, עוצמה, השהיה, ותדר סיום (גלישה)
  function tone(freq, dur, o) {
    if (!soundOn) return;
    try {
      var a = audio(); if (!a) return;
      o = o || {};
      var t = a.currentTime + (o.at || 0), osc = a.createOscillator(), g = a.createGain(), vol = o.vol || 0.2;
      osc.type = o.type || 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(bus);
      osc.start(t); osc.stop(t + dur + 0.03);
    } catch (e) {}
  }
  function click(vol, at) {   // "פופ" קצר של רעש
    if (!soundOn) return;
    try {
      var a = audio(); if (!a) return;
      var t = a.currentTime + (at || 0), src = a.createBufferSource(), hp = a.createBiquadFilter(), g = a.createGain();
      src.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 1800; g.gain.value = vol || 0.2;
      src.connect(hp); hp.connect(g); g.connect(bus);
      src.start(t);
    } catch (e) {}
  }
  var sfx = {
    // פגיעה: הצליל עולה בסולם ככל שהרצף מתארך; כל חמש פגיעות ברצף – "נצנוץ" קטן
    hit: function (c) {
      var n = SCALE[Math.min(c - 1, SCALE.length - 1)];
      click(0.22);
      tone(n, 0.16, { vol: 0.26 });
      tone(n * 2, 0.1, { type: 'sine', vol: 0.12 });
      if (c > 0 && c % 5 === 0) { tone(n * 1.5, 0.1, { at: 0.07, type: 'sine', vol: 0.16 }); tone(n * 2, 0.16, { at: 0.14, type: 'sine', vol: 0.16 }); }
    },
    miss: function () { tone(170, 0.22, { type: 'sawtooth', vol: 0.2, to: 70 }); tone(85, 0.2, { type: 'square', vol: 0.1, to: 50 }); },
    shot: function () { click(0.3); tone(210, 0.09, { type: 'square', vol: 0.12, to: 60 }); },   // ירייה (במצב FPS)
    count: function () { tone(440, 0.14, { vol: 0.22 }); },
    go: function () { tone(880, 0.3, { vol: 0.22 }); tone(1318.51, 0.3, { type: 'sine', vol: 0.16 }); click(0.16); },
    end: function () { [783.99, 659.25, 523.25].forEach(function (f, i) { tone(f, 0.2, { at: i * 0.12, vol: 0.22 }); }); },
    best: function () {
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach(function (f, i) { tone(f, i === 4 ? 0.5 : 0.16, { at: i * 0.1, vol: 0.24 }); });
      tone(2093, 0.4, { at: 0.5, type: 'sine', vol: 0.12 });
    },
    ui: function () { tone(660, 0.09, { vol: 0.16 }); tone(990, 0.12, { at: 0.06, type: 'sine', vol: 0.14 }); }
  };
  function paintSound() {
    soundBtn.textContent = soundOn ? 'צליל: פועל' : 'צליל: כבוי';
    soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
  }
  soundBtn.addEventListener('click', function () {
    soundOn = !soundOn;
    store('gmAimSound', soundOn ? '1' : '0');
    paintSound();
    sfx.ui();
  });

  /* ══════════════ ערכת צבע (אותה בחירה ואותה רשימה כמו בדף הבית) ══════════════ */
  var THEME_LIST = [['purple', 'סגול', '#7c3aed'], ['pink', 'ורוד', '#db2777'], ['red', 'אדום', '#e11d48'], ['orange', 'כתום', '#ff8a1f'],
                    ['yellow', 'צהוב', '#ffd23f'], ['lime', 'ירוק', '#c6ff3d'], ['blue', 'כחול', '#2563eb']];
  (function () {
    var themeBtn = $('#themeBtn'), root = document.documentElement;
    if (!themeBtn) return;
    var pop = document.createElement('div');
    pop.className = 'theme-pop'; pop.hidden = true; pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'בחירת צבע');
    function paint() {
      var cur = root.getAttribute('data-theme');
      Array.prototype.forEach.call(pop.children, function (d) { d.classList.toggle('is-on', d.getAttribute('data-theme') === cur); });
    }
    THEME_LIST.forEach(function (t) {
      var dot = document.createElement('button');
      dot.type = 'button'; dot.className = 'theme-dot'; dot.style.background = t[2];
      dot.setAttribute('data-theme', t[0]); dot.setAttribute('role', 'menuitem'); dot.setAttribute('aria-label', 'צבע ' + t[1]); dot.title = t[1];
      dot.addEventListener('click', function () {
        root.setAttribute('data-theme', t[0]);
        store('gmTheme2', t[0]);
        paint(); pop.hidden = true;
        readColors(); draw();   // הסצנה של מצב FPS מצוירת בצבעי הערכה
        sfx.ui();
      });
      pop.appendChild(dot);
    });
    themeBtn.parentNode.appendChild(pop);
    themeBtn.addEventListener('click', function (e) { e.stopPropagation(); pop.hidden = !pop.hidden; paint(); });
    document.addEventListener('click', function (e) { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') pop.hidden = true; });
  })();

  /* ══════════════ שם שחקן ══════════════ */
  var player = { id: '', name: '', changedAt: 0, verified: false };
  (function loadPlayer() {
    try { var p = JSON.parse(store('gmAimPlayer') || 'null'); if (p && p.id) player = p; } catch (e) {}
    if (!player.id) {
      var bytes = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      player.id = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      savePlayer();
    }
  })();
  function savePlayer() { store('gmAimPlayer', JSON.stringify(player)); }

  // בקשה לשרת. התשובה נחשבת רק אם היא מגיעה מגרסת ה-Worker שתומכת במשחק (aim: 1); אחרת – מצב מקומי.
  function api(path, body) {
    var opt = body ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body) } : {};
    return fetch(API + path, opt).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || j.aim !== 1) return null;
      serverOk = true;
      return j;
    }).catch(function () { return null; });
  }

  function daysLeft() {
    if (!player.name || !player.changedAt) return 0;
    return Math.max(0, Math.ceil((player.changedAt + WEEK - Date.now()) / (24 * 60 * 60 * 1000)));
  }
  function paintPlayer() {
    var has = !!player.name;
    nameBtn.hidden = !has;
    nameBtn.textContent = has ? 'שם: ' + player.name : 'שם';
    $('#asName').textContent = player.name;
    if (state === 'idle' || state === 'end') {
      nameBox.hidden = has; readyBox.hidden = !has;
      $('#nameCancel').hidden = true;
      $('#nameTitle').textContent = 'בחרו שם שחקן';
    }
  }
  function openNameForm(changing) {
    endScreen.hidden = true; startScreen.hidden = false;
    nameBox.hidden = false; readyBox.hidden = true;
    $('#nameTitle').textContent = changing ? 'החלפת שם שחקן' : 'בחרו שם שחקן';
    $('#nameCancel').hidden = !changing;
    nameMsg.textContent = ''; nameInput.value = '';
    try { nameInput.focus(); } catch (e) {}
  }
  function closeNameForm() {
    nameBox.hidden = true; readyBox.hidden = false; nameMsg.textContent = '';
  }
  function submitName() {
    var name = (nameInput.value || '').trim();
    if (!NAME_RE.test(name)) { nameMsg.textContent = 'השם צריך להיות 3 עד 16 תווים: אותיות, ספרות, מקף או קו תחתון, בלי רווחים.'; return; }
    if (player.name && name.toLowerCase() === player.name.toLowerCase()) { closeNameForm(); return; }
    if (player.name && daysLeft() > 0) { nameMsg.textContent = 'אפשר להחליף שם שוב בעוד ' + daysLeft() + ' ימים.'; return; }
    nameMsg.textContent = 'בודק…';
    $('#nameSave').disabled = true;
    api('/name', { id: player.id, name: name }).then(function (j) {
      $('#nameSave').disabled = false;
      if (j && !j.ok) {
        nameMsg.textContent = j.error === 'taken' ? 'השם הזה כבר תפוס. נסו שם אחר.' :
          j.error === 'wait' ? 'אפשר להחליף שם שוב בעוד ' + (j.days || 1) + ' ימים.' :
          j.error === 'reserved' ? 'השם הזה שמור. נסו שם אחר.' : 'השם לא התקבל. נסו שם אחר.';
        return;
      }
      player.name = j ? j.name : name;
      player.changedAt = j ? j.changedAt : Date.now();
      player.verified = !!j;
      savePlayer();
      sfx.ui();
      closeNameForm();
      paintPlayer();
      loadTop();
      if (player.verified) syncBests();
    });
  }
  $('#nameSave').addEventListener('click', submitName);
  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitName(); });
  $('#nameCancel').addEventListener('click', function () { closeNameForm(); if (state === 'end') { startScreen.hidden = true; endScreen.hidden = false; } });
  nameBtn.addEventListener('click', function () {
    if (state === 'play' || state === 'count' || state === 'paused') return;
    var left = daysLeft();
    openNameForm(true);
    if (left > 0) nameMsg.textContent = 'החלפתם שם לאחרונה. אפשר להחליף שוב בעוד ' + left + ' ימים.';
  });

  /* ══════════════ טבלת הטופ (רק כשהשרת זמין) ══════════════ */
  function paintTabs() { $$('.aim-tab').forEach(function (t) { t.classList.toggle('is-on', t.getAttribute('data-input') === topInput); }); }
  function renderTop(list) {
    if (!list) return;
    topBox.hidden = false;
    $('#aimNote').textContent = 'השיא האישי נשמר בדפדפן הזה. הטופ משותף לכל השחקנים, בנפרד לכל מצב משחק.';
    topList.innerHTML = '';
    if (!list.length) {
      var empty = document.createElement('li');
      empty.className = 'is-empty'; empty.textContent = 'עוד אין תוצאות. תהיו הראשונים.';
      topList.appendChild(empty);
      return;
    }
    list.forEach(function (row, i) {
      var li = document.createElement('li'), rank = document.createElement('span'), nm = document.createElement('b'), sc = document.createElement('span');
      rank.className = 'top-rank'; rank.textContent = ('0' + (i + 1)).slice(-2);
      nm.textContent = row.name;
      sc.className = 'top-score'; sc.textContent = row.score;
      if (player.name && row.name.toLowerCase() === player.name.toLowerCase()) li.className = 'is-me';
      li.appendChild(rank); li.appendChild(nm); li.appendChild(sc);
      topList.appendChild(li);
    });
  }
  function loadTop() {
    paintTabs();
    api('/top?input=' + topInput).then(function (j) { if (j && j.ok) renderTop(j.top); });
  }
  $$('.aim-tab').forEach(function (tab) {
    tab.addEventListener('click', function () { topInput = tab.getAttribute('data-input'); loadTop(); });
  });
  // שיא ששמור בדפדפן ועוד לא נשלח לטופ (למשל כי השרת עוד לא היה זמין כשהוא נעשה) נשלח כאן.
  // אם לא נשמר מספר הפגיעות של אותו סיבוב, נשלח המספר הקטן ביותר שמתאים לניקוד.
  function syncBests() {
    if (!player.name) return;
    ['fps', 'mouse', 'touch'].forEach(function (k) {
      var best = parseInt(store('gmAimBest_' + k), 10) || 0, sent = parseInt(store('gmAimSent_' + k), 10) || 0;
      if (best <= sent) return;
      var h = parseInt(store('gmAimBestHits_' + k), 10) || Math.ceil(best / 250);
      api('/score', { id: player.id, input: k, score: best, hits: h, misses: 0, combo: 0 }).then(function (j) {
        if (!j || !j.ok) return;
        store('gmAimSent_' + k, String(best));
        if (k === topInput) renderTop(j.top);
      });
    });
  }

  /* ══════════════ מצב FPS: הגדרות רגישות וממיר ══════════════ */
  var cfg = { game: 'valorant', sens: 0.4, fov: 103, dpi: 0 };
  try { var savedCfg = JSON.parse(store('gmAimFps') || 'null'); if (savedCfg && savedCfg.game) cfg = savedCfg; } catch (e) {}
  function game(id) { for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === (id || cfg.game)) return GAMES[i]; return GAMES[0]; }
  function degPerCount() { return Math.max(0.00001, cfg.sens * game().yaw); }
  function fmt(v, digits) { return (Math.round(v * Math.pow(10, digits)) / Math.pow(10, digits)).toFixed(digits); }
  function paintSens() {
    var g = game(), dpc = degPerCount();
    $('#sensLabel').textContent = g.label || 'הרגישות במשחק';
    var note = 'סיבוב של ' + fmt(dpc, 4) + ' מעלות לכל ספירת עכבר, כמו ב-' + g.name + '.';
    if (cfg.dpi > 0) note += ' עם ' + cfg.dpi + ' DPI זה יוצא ' + fmt((360 / dpc) / cfg.dpi * 2.54, 1) + ' ס"מ לסיבוב מלא (cm/360).';
    $('#sensNote').textContent = note;
    var list = $('#sensList'); list.innerHTML = '';
    GAMES.forEach(function (o) {
      var li = document.createElement('li'), nm = document.createElement('span'), val = document.createElement('b');
      nm.textContent = o.name;
      val.textContent = fmt(dpc / o.yaw, o.digits) + (o.unit || '');
      if (o.id === g.id) li.className = 'is-me';
      li.appendChild(nm); li.appendChild(val); list.appendChild(li);
    });
  }
  function saveCfg() { store('gmAimFps', JSON.stringify(cfg)); paintSens(); draw(); }
  (function initSens() {
    var sel = $('#sensGame');
    GAMES.forEach(function (o) { var op = document.createElement('option'); op.value = o.id; op.textContent = o.name; sel.appendChild(op); });
    sel.value = cfg.game; $('#sensValue').value = cfg.sens; $('#sensFov').value = cfg.fov; if (cfg.dpi) $('#sensDpi').value = cfg.dpi;
    sel.addEventListener('change', function () {
      // מחליפים משחק: שומרים על אותה מהירות סיבוב, ומציגים אותה ביחידות של המשחק החדש
      var dpc = degPerCount(), g = game(sel.value);
      cfg.game = g.id; cfg.sens = parseFloat(fmt(dpc / g.yaw, g.digits)) || g.sens; cfg.fov = g.fov;
      $('#sensValue').value = cfg.sens; $('#sensFov').value = cfg.fov;
      saveCfg();
    });
    $('#sensValue').addEventListener('input', function () { var v = parseFloat(this.value); if (v > 0) { cfg.sens = v; saveCfg(); } });
    $('#sensFov').addEventListener('input', function () { var v = parseFloat(this.value); if (v >= 60 && v <= 130) { cfg.fov = v; saveCfg(); } });
    $('#sensDpi').addEventListener('input', function () { var v = parseFloat(this.value); cfg.dpi = v >= 100 ? v : 0; saveCfg(); });
  })();

  /* ══════════════ מצב FPS: מבט, הטלה וציור ══════════════ */
  var WALL_Z = 10, ROOM_X = 7, FLOOR_Y = -2.6, CEIL_Y = 3.4, T_R = 0.6;   // החדר והמטרות (ביחידות עולם)
  var yaw = 0, pitch = 0, locked = false, lastFrame = 0, fx = [];         // fx = טבעות פגיעה
  var ctx = scene.getContext ? scene.getContext('2d') : null, W = 0, H = 0, focal = 1;
  var colors = { acc: '#a877ff', fill: '#7c3aed', acc2: '#e879f9', rgb: '168, 119, 255' };
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.acc = cs.getPropertyValue('--acc').trim() || colors.acc;
    colors.fill = cs.getPropertyValue('--acc-fill').trim() || colors.fill;
    colors.acc2 = cs.getPropertyValue('--acc2').trim() || colors.acc2;
    colors.rgb = cs.getPropertyValue('--acc-rgb').trim() || colors.rgb;
  }
  function resizeScene() {
    var box = arena.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = box.width; H = box.height;
    scene.width = Math.round(W * dpr); scene.height = Math.round(H * dpr);
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // נקודה בעולם → קואורדינטות מצלמה (אחרי סיבוב המבט). z חיובי = לפני המצלמה.
  function toCam(x, y, z) {
    var cy = Math.cos(yaw * RAD), sy = Math.sin(yaw * RAD), cp = Math.cos(pitch * RAD), sp = Math.sin(pitch * RAD);
    var x1 = x * cy - z * sy, z1 = x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  }
  function toScreen(c) { return [W / 2 + focal * c[0] / c[2], H / 2 - focal * c[1] / c[2]]; }
  function line3(a, b) {   // קו בין שתי נקודות בעולם, עם חיתוך של מה שמאחורי המצלמה
    var p = toCam(a[0], a[1], a[2]), q = toCam(b[0], b[1], b[2]), near = 0.15;
    if (p[2] < near && q[2] < near) return;
    if (p[2] < near || q[2] < near) {
      var t = (near - p[2]) / (q[2] - p[2]), m = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, near];
      if (p[2] < near) p = m; else q = m;
    }
    var s1 = toScreen(p), s2 = toScreen(q);
    ctx.moveTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]);
  }
  function draw() {
    if (!ctx || mode !== 'fps') return;
    lastFrame = performance.now();
    focal = (W / 2) / Math.tan((cfg.fov / 2) * RAD);
    ctx.clearRect(0, 0, W, H);
    var bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#15101f'); bg.addColorStop(1, '#07070b');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // רשת החדר: רצפה, תקרה, קירות צד וקיר המטרות
    var i;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(' + colors.rgb + ', 0.13)'; ctx.beginPath();
    for (i = -ROOM_X; i <= ROOM_X; i++) { line3([i, FLOOR_Y, 0.2], [i, FLOOR_Y, WALL_Z]); line3([i, CEIL_Y, 0.2], [i, CEIL_Y, WALL_Z]); }
    for (i = 1; i <= WALL_Z; i++) {
      line3([-ROOM_X, FLOOR_Y, i], [ROOM_X, FLOOR_Y, i]); line3([-ROOM_X, CEIL_Y, i], [ROOM_X, CEIL_Y, i]);
      line3([-ROOM_X, FLOOR_Y, i], [-ROOM_X, CEIL_Y, i]); line3([ROOM_X, FLOOR_Y, i], [ROOM_X, CEIL_Y, i]);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(' + colors.rgb + ', 0.2)'; ctx.beginPath();
    for (i = -ROOM_X; i <= ROOM_X; i++) line3([i, FLOOR_Y, WALL_Z], [i, CEIL_Y, WALL_Z]);
    for (i = 0; i <= 6; i++) line3([-ROOM_X, FLOOR_Y + i, WALL_Z], [ROOM_X, FLOOR_Y + i, WALL_Z]);
    ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + colors.rgb + ', 0.55)'; ctx.beginPath();
    line3([-ROOM_X, FLOOR_Y, WALL_Z], [ROOM_X, FLOOR_Y, WALL_Z]); line3([ROOM_X, FLOOR_Y, WALL_Z], [ROOM_X, CEIL_Y, WALL_Z]);
    line3([ROOM_X, CEIL_Y, WALL_Z], [-ROOM_X, CEIL_Y, WALL_Z]); line3([-ROOM_X, CEIL_Y, WALL_Z], [-ROOM_X, FLOOR_Y, WALL_Z]);
    ctx.stroke();

    // מטרות
    targets.forEach(function (t) {
      var c = toCam(t.x, t.y, t.z);
      if (c[2] < 0.3) return;
      var s = toScreen(c), r = focal * t.r / c[2], age = Math.min(1, (performance.now() - t.born) / 140);
      r *= 0.4 + 0.6 * age;
      ctx.save(); ctx.globalAlpha = age;
      ctx.shadowColor = colors.fill; ctx.shadowBlur = r * 0.9;
      var g = ctx.createRadialGradient(s[0] - r * 0.3, s[1] - r * 0.4, r * 0.1, s[0], s[1], r);
      g.addColorStop(0, colors.acc2); g.addColorStop(0.75, colors.fill);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; ctx.lineWidth = Math.max(1.5, r * 0.09);
      ctx.beginPath(); ctx.arc(s[0], s[1], r * 0.44, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s[0], s[1], r * 0.17, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // טבעות פגיעה
    var now = performance.now();
    fx = fx.filter(function (f) { return now - f.at < 260; });
    fx.forEach(function (f) {
      var c = toCam(f.x, f.y, f.z); if (c[2] < 0.3) return;
      var s = toScreen(c), k = (now - f.at) / 260, r = focal * T_R / c[2] * (1 + k * 0.9);
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (1 - k).toFixed(3) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2); ctx.stroke();
    });
  }
  (function loop() { if (mode === 'fps') draw(); requestAnimationFrame(loop); })();
  window.addEventListener('resize', function () { resizeScene(); draw(); });

  /* ───── נעילת העכבר ───── */
  function lock() {
    try {
      var p = arena.requestPointerLock({ unadjustedMovement: true });   // קריאה גולמית של העכבר, בלי ההאצה של Windows
      if (p && p.catch) p.catch(function () { try { var p2 = arena.requestPointerLock(); if (p2 && p2.catch) p2.catch(function () {}); } catch (e) {} });
    } catch (e) { try { arena.requestPointerLock(); } catch (e2) {} }
  }
  document.addEventListener('pointerlockchange', function () {
    locked = document.pointerLockElement === arena;
    if (mode !== 'fps') return;
    if (locked && state === 'paused') resume();
    else if (!locked && state === 'play') pause();
    else if (!locked && state === 'count') cancelRound();
  });
  document.addEventListener('mousemove', function (e) {
    if (!locked || mode !== 'fps') return;
    var dpc = degPerCount();
    yaw += (e.movementX || 0) * dpc;
    pitch = Math.max(-60, Math.min(60, pitch - (e.movementY || 0) * dpc));
    if (yaw > 180) yaw -= 360; else if (yaw < -180) yaw += 360;
    // האקדח "נגרר" מעט אחרי תנועת העכבר
    gun.style.setProperty('--gx', Math.max(-14, Math.min(14, -(e.movementX || 0) * 0.35)).toFixed(1) + 'px');
    gun.style.setProperty('--gy', Math.max(-10, Math.min(10, -(e.movementY || 0) * 0.3)).toFixed(1) + 'px');
  });
  document.addEventListener('mousedown', function (e) {
    if (!locked || mode !== 'fps' || e.button !== 0 || state !== 'play') return;
    e.preventDefault();
    shoot();
  });
  /* ───── נעילת הדף בזמן סיבוב ב-FPS ─────
     פליק חזק יכול לגעת בגלגלת או בכפתור האמצעי של העכבר, ואז הדף עצמו נגלל מאחורי המשחק.
     בזמן סיבוב הדף ננעל לגלילה, והגלגלת, הכפתור האמצעי ומקשי הגלילה מנוטרלים. */
  function fpsActive() { return mode === 'fps' && (state === 'play' || state === 'count'); }
  function lockPage(on) { document.documentElement.classList.toggle('aim-lock', !!on); }
  window.addEventListener('wheel', function (e) { if (fpsActive()) e.preventDefault(); }, { passive: false });
  document.addEventListener('mousedown', function (e) { if (fpsActive() && e.button !== 0) e.preventDefault(); });
  document.addEventListener('auxclick', function (e) { if (fpsActive()) e.preventDefault(); });
  document.addEventListener('dragstart', function (e) { if (fpsActive()) e.preventDefault(); });
  document.addEventListener('selectstart', function (e) { if (fpsActive()) e.preventDefault(); });
  document.addEventListener('keydown', function (e) {
    if (!fpsActive()) return;
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End' || e.key === 'Tab') e.preventDefault();
  });

  /* ───── הפסקה (בשני המצבים): הזמן נעצר, ובחזרה הוא ממשיך מאותה נקודה ───── */
  function pause() {
    if (state !== 'play') return;
    state = 'paused'; pausedAt = performance.now();
    clearInterval(timer);
    lockPage(false);
    pauseScreen.hidden = false;
    paintActions();
    if (mode === 'fps' && document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  }
  function resume() {
    if (state !== 'paused') return;
    var gap = performance.now() - pausedAt;
    t0 += gap; targets.forEach(function (t) { t.born += gap; });
    pauseScreen.hidden = true;
    if (mode === 'fps') lockPage(true);
    state = 'play';
    paintActions();
    clearInterval(timer); timer = setInterval(tick, 50);
  }
  // במצב FPS חוזרים מהפסקה על ידי נעילה מחדש של העכבר (ואז resume נקרא מהאירוע של הנעילה)
  function togglePause() {
    if (state === 'play') pause();
    else if (state === 'paused') { if (mode === 'fps') lock(); else resume(); }
  }
  $('#resumeBtn').addEventListener('click', togglePause);
  pauseScreen.addEventListener('click', function (e) { if (e.target === pauseScreen) togglePause(); });
  $('#pauseRestart').addEventListener('click', function () { restart(); });
  $('#pauseExit').addEventListener('click', function () { cancelRound(); });

  /* ───── כפתורי הפעולה שמעל המשחק: מסך מלא, השהיה, התחלה מחדש ───── */
  var stage = $('#stage'), fsBtn = $('#fsBtn'), pauseBtn = $('#pauseBtn');
  function paintActions() {
    var inRound = state === 'count' || state === 'play' || state === 'paused';
    restartBtn.classList.toggle('is-off', !inRound);
    pauseBtn.classList.toggle('is-off', !(state === 'play' || state === 'paused'));
    $('#pauseText').textContent = state === 'paused' ? 'המשך' : 'השהה';
  }
  pauseBtn.addEventListener('click', togglePause);
  function isFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function toggleFull() {
    try {
      if (isFull()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
    } catch (e) {}
  }
  function onFullChange() {
    $('#fsText').textContent = isFull() ? 'יציאה ממסך מלא' : 'מסך מלא';
    setTimeout(function () { resizeScene(); draw(); }, 80);
  }
  if (stage.requestFullscreen || stage.webkitRequestFullscreen) {
    fsBtn.addEventListener('click', toggleFull);
    document.addEventListener('fullscreenchange', onFullChange);
    document.addEventListener('webkitfullscreenchange', onFullChange);
  } else fsBtn.hidden = true;

  /* ───── בחירת מצב ───── */
  function setMode(m) {
    // החלפת מצב באמצע סיבוב מבטלת את הסיבוב (בלי תוצאה) ועוברת למצב השני
    if (state === 'play' || state === 'count' || state === 'paused') cancelRound();
    mode = (m === 'fps' && canFps) ? 'fps' : 'classic';
    store('gmAimMode', mode);
    $$('.aim-mode').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-mode') === mode); });
    var f = mode === 'fps';
    scene.hidden = !f; crosshair.hidden = !f; sensBox.hidden = !f; $('#fpsHint').hidden = !f;
    if (f) gun.removeAttribute('hidden'); else gun.setAttribute('hidden', '');   // אלמנט SVG: אין לו המאפיין hidden של HTML
    arena.classList.toggle('is-fps', f);
    clearTargets();
    hudBest.textContent = getBest();
    topInput = kind();
    if (f) { yaw = pitch = 0; readColors(); resizeScene(); paintSens(); draw(); }
    if (serverOk) loadTop();
  }
  $$('.aim-mode').forEach(function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); sfx.ui(); }); });
  if (!canFps) $('#modeBox').hidden = true;

  /* ══════════════ מטרות ══════════════ */
  function radius() {
    var r = arena.getBoundingClientRect();
    return Math.max(22, Math.min(r.width, r.height) * 0.052);
  }
  function spawn() {
    var tries, i, clear, x = 0, y = 0;
    if (mode === 'fps') {
      for (tries = 0; tries < 40; tries++) {
        // אזור המטרות על הקיר
        x = (Math.random() * 2 - 1) * 4.4; y = 0.4 + (Math.random() * 2 - 1) * 2.1;
        clear = true;
        for (i = 0; i < targets.length; i++) if (Math.hypot(targets[i].x - x, targets[i].y - y) < T_R * 2.6) { clear = false; break; }
        if (clear) break;
      }
      targets.push({ x: x, y: y, z: WALL_Z - 0.7, r: T_R, born: performance.now() });
      return;
    }
    var box = arena.getBoundingClientRect(), r = radius(), pad = r + 10;
    for (tries = 0; tries < 40; tries++) {
      x = pad + Math.random() * (box.width - pad * 2);
      y = pad + Math.random() * (box.height - pad * 2);
      clear = true;
      for (i = 0; i < targets.length; i++) {
        var dx = targets[i].x - x, dy = targets[i].y - y;
        if (dx * dx + dy * dy < (r * 2.6) * (r * 2.6)) { clear = false; break; }
      }
      if (clear) break;
    }
    var el = document.createElement('div');
    el.className = 'target';
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.width = el.style.height = (r * 2) + 'px';
    arena.appendChild(el);
    targets.push({ el: el, x: x, y: y, r: r, born: performance.now() });
  }
  function clearTargets() {
    targets.forEach(function (t) { if (t.el && t.el.parentNode) t.el.parentNode.removeChild(t.el); });
    targets = [];
  }
  function pop(x, y, text, miss) {
    var el = document.createElement('div');
    el.className = 'pop' + (miss ? ' is-miss' : '');
    el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    arena.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 650);
  }

  /* ══════════════ ניקוד: פגיעה ופספוס (משותף לשני המצבים) ══════════════ */
  function scoreHit(t, x, y) {
    var react = performance.now() - t.born;
    var speed = Math.round(Math.max(0, Math.min(1, 1 - (react - 250) / 900)) * 100);
    combo++; if (combo > bestCombo) bestCombo = combo;
    var points = 100 + speed + Math.min(combo - 1, 10) * 5;
    score += points; hits++; reactSum += react;
    pop(x, y, '+' + points, false);
    sfx.hit(combo);
    spawn();
  }
  function scoreMiss(x, y) {
    misses++; combo = 0;
    score = Math.max(0, score - MISS_PENALTY);
    pop(x, y, '-' + MISS_PENALTY, true);
    arena.classList.remove('is-miss'); void arena.offsetWidth; arena.classList.add('is-miss');
    sfx.miss();
  }
  // ירייה במצב FPS: בודקים אם קו המבט (מרכז המסך) עובר דרך אחת המטרות
  function shoot() {
    sfx.shot();
    gun.classList.remove('is-fire'); void gun.getBoundingClientRect(); gun.classList.add('is-fire');
    var best = -1, bestZ = Infinity;
    for (var i = 0; i < targets.length; i++) {
      var c = toCam(targets[i].x, targets[i].y, targets[i].z);
      if (c[2] <= 0) continue;
      var dist = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]);
      if (Math.atan2(Math.hypot(c[0], c[1]), c[2]) <= Math.asin(Math.min(1, targets[i].r / dist)) && c[2] < bestZ) { best = i; bestZ = c[2]; }
    }
    if (best < 0) scoreMiss(W / 2, H / 2 - 26);
    else {
      var t = targets.splice(best, 1)[0];
      fx.push({ x: t.x, y: t.y, z: t.z, at: performance.now() });
      scoreHit(t, W / 2, H / 2 - 26);
    }
    paintHud(DURATION - (performance.now() - t0));
    draw();
  }

  /* ══════════════ לוח הנתונים ══════════════ */
  function accuracy() { var n = hits + misses; return n ? Math.round((hits / n) * 100) : 100; }
  function paintHud(left) {
    hudTime.textContent = (Math.max(0, left) / 1000).toFixed(1);
    hudScore.textContent = score;
    hudAcc.textContent = accuracy() + '%';
  }

  /* ══════════════ מהלך המשחק ══════════════ */
  function begin() {
    if (state === 'count' || state === 'play' || state === 'paused') return;
    if (!player.name) { openNameForm(false); return; }
    state = 'count';
    startScreen.hidden = true; endScreen.hidden = true; pauseScreen.hidden = true;
    clearTargets();
    score = hits = misses = combo = bestCombo = reactSum = 0;
    hudBest.textContent = getBest();
    paintHud(DURATION);
    if (mode === 'fps') {
      try { arena.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      lockPage(true);
      yaw = pitch = 0; resizeScene(); if (!locked) lock(); draw();
    }
    var n = 3;
    countdown.hidden = false; countdown.textContent = n;
    paintActions();
    sfx.count();
    clearInterval(countTimer);
    countTimer = setInterval(function () {
      n--;
      if (n > 0) { countdown.textContent = n; sfx.count(); return; }
      clearInterval(countTimer);
      countdown.hidden = true;
      play();
    }, 700);
  }
  // ביטול סיבוב בלי תוצאה (למשל כשהעכבר השתחרר בזמן הספירה לאחור)
  function cancelRound() {
    clearInterval(countTimer); clearInterval(timer);
    arena.classList.remove('is-play');
    clearTargets();
    countdown.hidden = true; pauseScreen.hidden = true;
    lockPage(false);
    state = 'idle';
    paintActions();
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    startScreen.hidden = false;
    paintPlayer();
    draw();
  }
  // התחלה מחדש באמצע ספירה או סיבוב: הסיבוב הנוכחי מתבטל (לא נספר ולא נשלח לטופ) ומתחיל חדש
  function restart() {
    if (state !== 'count' && state !== 'play' && state !== 'paused') return;
    clearInterval(countTimer); clearInterval(timer);
    arena.classList.remove('is-play');
    clearTargets();
    countdown.hidden = true; pauseScreen.hidden = true;
    state = 'idle';
    begin();
  }
  function play() {
    state = 'play';
    paintActions();
    arena.classList.add('is-play');
    for (var i = 0; i < TARGETS; i++) spawn();
    t0 = performance.now();
    sfx.go();
    clearInterval(timer);
    timer = setInterval(tick, 50);
  }
  function tick() {
    var left = DURATION - (performance.now() - t0);
    paintHud(left);
    if (mode === 'fps' && performance.now() - lastFrame > 120) draw();   // גיבוי אם הדפדפן לא מצייר פריימים
    if (left <= 0) finish();
  }
  function finish() {
    if (state !== 'play' && state !== 'paused') return;
    state = 'end';
    clearInterval(timer);
    lockPage(false);
    paintActions();
    arena.classList.remove('is-play');
    pauseScreen.hidden = true;
    clearTargets();
    if (mode === 'fps') { draw(); if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }
    paintHud(0);
    var best = getBest(), isNew = score > best && score > 0;
    if (isNew) { setBest(score); store('gmAimBestHits_' + kind(), String(hits)); }
    hudBest.textContent = Math.max(best, score);
    $('#endScore').textContent = score;
    $('#endHits').textContent = hits;
    $('#endAcc').textContent = accuracy() + '%';
    $('#endReact').textContent = hits ? (Math.round(reactSum / hits) + ' ms') : '–';
    $('#endCombo').textContent = bestCombo;
    $('#newBest').hidden = !isNew;
    endScreen.hidden = false;
    if (isNew) sfx.best(); else sfx.end();
    // שליחת התוצאה לטופ המשותף (אם השרת תומך בזה)
    if (player.name && score > 0) {
      var sent = kind(), sentScore = score;
      api('/score', { id: player.id, input: sent, score: score, hits: hits, misses: misses, combo: bestCombo }).then(function (j) {
        if (j && j.ok) {
          store('gmAimSent_' + sent, String(Math.max(sentScore, parseInt(store('gmAimSent_' + sent), 10) || 0)));
          topInput = sent; paintTabs(); renderTop(j.top);
        } else syncBests();   // השרת לא קיבל (או לא זמין): ננסה שוב בכניסה הבאה
      });
    }
  }

  /* ══════════════ לחיצות במצב הסמן הרגיל ══════════════ */
  arena.addEventListener('pointerdown', function (e) {
    if (state !== 'play' || mode !== 'classic') return;
    e.preventDefault();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') { if (input !== 'touch') { input = 'touch'; hudBest.textContent = getBest(); } }
    else if (input !== 'mouse' && e.pointerType === 'mouse') { input = 'mouse'; hudBest.textContent = getBest(); }
    var box = arena.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top;
    var slack = input === 'touch' ? 8 : 2, hitIndex = -1;
    for (var i = targets.length - 1; i >= 0; i--) {
      var dx = targets[i].x - x, dy = targets[i].y - y, rr = targets[i].r + slack;
      if (dx * dx + dy * dy <= rr * rr) { hitIndex = i; break; }
    }
    if (hitIndex < 0) scoreMiss(x, y);
    else {
      var t = targets.splice(hitIndex, 1)[0];
      t.el.classList.add('is-hit');
      (function (el) { setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220); })(t.el);
      scoreHit(t, t.x, t.y);
    }
    paintHud(DURATION - (performance.now() - t0));
  });
  arena.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  $('#startBtn').addEventListener('click', begin);
  $('#againBtn').addEventListener('click', begin);
  restartBtn.addEventListener('click', restart);
  // קיצורי מקלדת (לא בזמן הקלדה בשדות): R מתחיל מחדש, P משהה / ממשיך, F מסך מלא.
  // לפי מיקום המקש ולא לפי האות, כדי שיעבוד גם כשהמקלדת בעברית.
  document.addEventListener('keydown', function (e) {
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.code === 'KeyR') restart();
    else if (e.code === 'KeyP') togglePause();
    else if (e.code === 'KeyF' && !fsBtn.hidden) toggleFull();
  });
  // אם הלשונית עוברת לרקע באמצע סיבוב – המשחק נכנס להפסקה
  document.addEventListener('visibilitychange', function () { if (document.hidden && state === 'play') pause(); });

  /* ══════════════ אתחול ══════════════ */
  paintSound();
  paintPlayer();
  setMode(canFps ? (store('gmAimMode') || 'fps') : 'classic');
  hudBest.textContent = getBest();
  // שם שנשמר רק מקומית (לפני שהשרת היה זמין): מנסים לרשום אותו עכשיו; אם הוא תפוס – מבקשים שם אחר
  if (player.name && !player.verified) {
    api('/name', { id: player.id, name: player.name }).then(function (j) {
      if (!j) return;
      if (j.ok) { player.name = j.name; player.changedAt = j.changedAt; player.verified = true; savePlayer(); paintPlayer(); syncBests(); }
      else if (j.error === 'taken' || j.error === 'reserved') {
        player.name = ''; player.changedAt = 0; savePlayer(); paintPlayer();
        if (state === 'idle') { openNameForm(false); nameMsg.textContent = 'השם שבחרתם כבר תפוס אצל שחקן אחר. בחרו שם חדש.'; }
      }
    });
  }
  else if (player.name) syncBests();
  loadTop();
  // רענון אוטומטי של הטופ פעם בדקה (לא באמצע סיבוב, ורק כשהלשונית פתוחה והשרת זמין)
  setInterval(function () { if (!document.hidden && serverOk && state !== 'play' && state !== 'count') loadTop(); }, 60000);
})();
