/* =====================================================================
   Three Good Things — app logic
   No framework, no build step, no server required.
   All data lives in localStorage on this device.
   ===================================================================== */
(function () {
  'use strict';

  var VERSION = '1.0.0';
  var KEY_ENTRIES = 'tgt.entries';
  var KEY_SETTINGS = 'tgt.settings';
  var KEY_PIN = 'tgt.pin';
  var KEY_CELEBRATED = 'tgt.celebrated';
  var LOCK_AFTER_MS = 2 * 60 * 1000;

  var PROMPTS = [
    'Someone who made today a little easier',
    'Something small that made you smile',
    'A moment you’d happily live again',
    'Something your body did for you today',
    'A comfort you usually take for granted',
    'Something you learned or noticed',
    'A place that felt good to be in',
    'Something that went better than expected',
    'A sound, taste, or smell you enjoyed',
    'Someone you’re glad exists',
    'A problem you don’t have',
    'Something you’re looking forward to'
  ];

  var BADGES = [
    { days: 1,   icon: '🌱', label: 'First entry' },
    { days: 3,   icon: '🔥', label: '3-day streak' },
    { days: 7,   icon: '🌻', label: 'One week' },
    { days: 14,  icon: '🌿', label: 'Two weeks' },
    { days: 30,  icon: '🌕', label: 'One month' },
    { days: 60,  icon: '🌳', label: '60 days' },
    { days: 100, icon: '💎', label: '100 days' },
    { days: 365, icon: '🏆', label: 'One year' }
  ];

  var STOPWORDS = ('a an and the i my me we our us you your it its is am are was were be been being to of in on at for ' +
    'with from by as that this these those there here so but or if then than too very just not no yes had has have having ' +
    'do did does doing got get getting go going went really about after before again all also because being both can could ' +
    'day today tonight morning evening more most much some such up down out over into onto off she he him her his they them ' +
    'their what which who whom when where why how would should will made make making thing things good great nice lot bit ' +
    'grateful gratitude thankful thanks feel feeling felt like love able one two three time times still while during').split(' ');

  /* ---------------- helpers ---------------- */
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return dateKey(new Date()); }
  function addDays(k, n) { var d = fromKey(k); d.setDate(d.getDate() + n); return dateKey(d); }
  function fmtLong(k) {
    return fromKey(k).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function fmtShort(k) {
    return fromKey(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function fmtMonth(k) {
    return fromKey(k).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  function relDay(k) {
    var t = todayKey();
    if (k === t) return 'Today';
    if (k === addDays(t, -1)) return 'Yesterday';
    return fmtLong(k);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { toast('Could not save — storage is full or blocked.'); }
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); var a = arguments; t = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  /* ---------------- state ---------------- */
  var entries = load(KEY_ENTRIES, {});
  var settings = Object.assign({
    name: '', goal: 3, morning: '07:30', evening: '21:00', server: '', token: '', pushOn: false
  }, load(KEY_SETTINGS, {}));
  var editingDate = todayKey();
  var currentView = 'today';
  var lockedAt = 0;

  /* ---------------- entries model ---------------- */
  function cleanItems(items) { return (items || []).map(function (s) { return String(s).trim(); }).filter(Boolean); }
  function getItems(k) { return entries[k] ? cleanItems(entries[k].items) : []; }
  function setItems(k, items) {
    var clean = cleanItems(items);
    if (clean.length) entries[k] = { items: clean, updatedAt: Date.now() };
    else delete entries[k];
    save(KEY_ENTRIES, entries);
  }
  function doneDays() { return Object.keys(entries).filter(function (k) { return getItems(k).length > 0; }).sort(); }
  function isDone(k) { return getItems(k).length >= 1; }

  function currentStreak() {
    var t = todayKey();
    var k = isDone(t) ? t : addDays(t, -1);
    var n = 0;
    while (isDone(k)) { n++; k = addDays(k, -1); }
    return n;
  }
  function longestStreak() {
    var days = doneDays(), best = 0, run = 0, prev = null;
    days.forEach(function (k) {
      run = (prev && addDays(prev, 1) === k) ? run + 1 : 1;
      if (run > best) best = run;
      prev = k;
    });
    return best;
  }
  function totalItems() { return doneDays().reduce(function (s, k) { return s + getItems(k).length; }, 0); }

  /* ---------------- routing ---------------- */
  function show(view) {
    currentView = view;
    document.querySelectorAll('.view').forEach(function (el) { el.hidden = el.dataset.view !== view; });
    document.querySelectorAll('.tab').forEach(function (el) { el.classList.toggle('is-active', el.dataset.go === view); });
    if (view === 'today') renderToday();
    if (view === 'journal') renderJournal();
    if (view === 'insights') renderInsights();
    if (view === 'settings') renderSettings();
    $('mic').hidden = !(view === 'today' && !$('write').hidden && speechSupported());
    if (view !== 'today') stopMic();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { editingDate = todayKey(); forceWrite = false; show(b.dataset.go); });
  });

  /* ---------------- TODAY ---------------- */
  var forceWrite = false;
  var forceMorning = false;

  function isMorningHour() {
    var h = new Date().getHours();
    var cutoff = parseInt((settings.evening || '21:00').split(':')[0], 10);
    // Morning mode: from midnight until noon (or until the evening reminder hour, whichever is earlier).
    return h < Math.min(12, cutoff);
  }
  function lastDoneBefore(k) {
    var days = doneDays().filter(function (d) { return d < k; });
    return days.length ? days[days.length - 1] : null;
  }
  function shouldShowMorning() {
    if (forceWrite) return false;
    if (editingDate !== todayKey()) return false;
    if (forceMorning) return !!lastDoneBefore(todayKey());
    return isMorningHour() && !isDone(todayKey()) && !!lastDoneBefore(todayKey());
  }

  function renderToday() {
    var morning = shouldShowMorning();
    $('morning').hidden = !morning;
    $('write').hidden = morning;
    $('mic').hidden = morning || !speechSupported();
    if (morning) renderMorning(); else renderWrite();
    renderStreakPill();
  }

  function greeting() {
    var h = new Date().getHours();
    var g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return settings.name ? g + ', ' + settings.name : g;
  }

  function renderMorning() {
    var last = lastDoneBefore(todayKey());
    $('morning-eyebrow').textContent = greeting();
    var isYesterday = last === addDays(todayKey(), -1);
    $('morning-sub').textContent = isYesterday ? 'Last night you were grateful for…' : 'On ' + fmtLong(last) + ' you were grateful for…';
    $('morning-list').innerHTML = getItems(last).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');

    // From the archive: a random entry at least a week old, if we have one.
    var old = doneDays().filter(function (k) { return k < addDays(todayKey(), -7); });
    var wrap = $('morning-archive');
    if (old.length) {
      var seed = fromKey(todayKey()).getTime() / 86400000; // stable pick per day
      var pick = old[Math.floor(seed) % old.length];
      $('archive-date').textContent = fmtLong(pick) + ', ' + fromKey(pick).getFullYear();
      $('archive-list').innerHTML = getItems(pick).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
      wrap.hidden = false;
    } else { wrap.hidden = true; }
  }

  function renderWrite() {
    var k = editingDate;
    var isToday = k === todayKey();
    $('write-date').textContent = isToday ? greeting() + ' · ' + fmtLong(k) : fmtLong(k);
    $('write-title').textContent = isToday ? 'What are you grateful for today?' : 'What were you grateful for?';
    $('write-sub').textContent = settings.goal === 1 ? 'One is enough. Whatever comes to mind.' :
      settings.goal === 5 ? 'Five things, big or small.' : 'Three small things are plenty.';
    $('write-back').hidden = isToday;
    buildLines(getItems(k));
    updateProgress(false);
  }

  function buildLines(items) {
    var ol = $('entries');
    ol.innerHTML = '';
    var count = Math.max(settings.goal, items.length);
    for (var i = 0; i < count; i++) addLine(items[i] || '', i);
  }
  function addLine(text, i) {
    var ol = $('entries');
    var idx = typeof i === 'number' ? i : ol.children.length;
    if (idx >= 10) return null;
    var li = document.createElement('li');
    li.className = 'entry' + (text ? ' is-filled' : '');
    var dayOfYear = Math.floor((fromKey(editingDate) - new Date(fromKey(editingDate).getFullYear(), 0, 0)) / 86400000);
    var prompt = PROMPTS[(idx + dayOfYear) % PROMPTS.length];
    li.innerHTML = '<span class="entry__num">' + (idx + 1) + '.</span>' +
      '<textarea rows="1" placeholder="' + esc(prompt) + '" enterkeyhint="next" autocapitalize="sentences"></textarea>';
    var ta = li.querySelector('textarea');
    ta.value = text;
    ol.appendChild(li);
    autosize(ta);
    ta.addEventListener('input', function () { autosize(ta); li.classList.toggle('is-filled', !!ta.value.trim()); onInput(); });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var next = li.nextElementSibling;
        if (!next && ta.value.trim()) next = addLine('');
        if (next) next.querySelector('textarea').focus();
        else ta.blur();
      }
      if (e.key === 'Backspace' && !ta.value && ol.children.length > settings.goal && li === ol.lastElementChild) {
        e.preventDefault();
        var prev = li.previousElementSibling;
        li.remove();
        if (prev) { var pta = prev.querySelector('textarea'); pta.focus(); pta.setSelectionRange(pta.value.length, pta.value.length); }
      }
    });
    return li;
  }
  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
  function readLines() {
    return Array.prototype.map.call($('entries').querySelectorAll('textarea'), function (t) { return t.value; });
  }

  var saveNow = function () {
    var before = isDone(editingDate);
    setItems(editingDate, readLines());
    $('saved').textContent = 'Saved';
    setTimeout(function () { $('saved').textContent = ''; }, 1500);
    updateProgress(!before && isDone(editingDate));
    renderStreakPill();
  };
  var onInput = debounce(saveNow, 400);

  function updateProgress(justCompletedFirst) {
    var filled = cleanItems(readLines()).length;
    var goal = settings.goal;
    var dots = $('progress');
    dots.innerHTML = '';
    for (var i = 0; i < goal; i++) {
      var s = document.createElement('span');
      s.className = 'progress__dot' + (i < filled ? ' is-on' : '');
      dots.appendChild(s);
    }
    var complete = filled >= goal;
    var box = $('complete');
    var wasHidden = box.hidden;
    box.hidden = !complete;
    if (complete && editingDate === todayKey()) {
      var streak = currentStreak();
      $('complete-title').textContent = streak >= 2 ? streak + ' days in a row 🔥' : 'Day complete ✨';
      $('complete-sub').textContent = streak >= 7 ? 'You’re building something real.' :
        streak >= 3 ? 'Keep the thread going tomorrow.' : 'See you in the morning.';
      var celebrated = load(KEY_CELEBRATED, '');
      if (wasHidden && celebrated !== todayKey()) {
        save(KEY_CELEBRATED, todayKey());
        confetti();
        $('streak-pill').classList.add('bump');
        setTimeout(function () { $('streak-pill').classList.remove('bump'); }, 600);
      }
    }
  }

  function renderStreakPill() {
    var s = currentStreak();
    $('streak-pill-count').textContent = s;
    $('streak-pill').classList.toggle('is-hot', s > 0 && isDone(todayKey()));
    $('streak-pill').title = s ? s + '-day streak' : 'Start a streak tonight';
  }

  $('add-line').addEventListener('click', function () {
    var li = addLine('');
    if (li) li.querySelector('textarea').focus();
  });
  $('morning-write').addEventListener('click', function () { forceWrite = true; forceMorning = false; renderToday(); });
  $('back-to-today').addEventListener('click', function (e) { e.preventDefault(); editingDate = todayKey(); renderToday(); });
  $('streak-pill').addEventListener('click', function () { show('insights'); });

  function confetti() {
    var wrap = document.createElement('div');
    wrap.className = 'confetti';
    var colors = ['#d0713f', '#f0b26a', '#8aa58a', '#e9a04b', '#f4c56a'];
    for (var i = 0; i < 60; i++) {
      var p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.6 + 's';
      p.style.animationDuration = 1.4 + Math.random() * 1.2 + 's';
      p.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 3200);
  }

  /* ---------------- VOICE ---------------- */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var rec = null, micWanted = false, micTarget = null, micBase = '';
  function speechSupported() { return !!SR; }

  function pickTarget() {
    var active = document.activeElement;
    if (active && active.tagName === 'TEXTAREA' && $('entries').contains(active)) return active;
    var tas = $('entries').querySelectorAll('textarea');
    for (var i = 0; i < tas.length; i++) if (!tas[i].value.trim()) return tas[i];
    var li = addLine('');
    return li ? li.querySelector('textarea') : tas[tas.length - 1];
  }
  function startMic() {
    if (!SR) return;
    micTarget = pickTarget();
    micBase = micTarget.value;
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = function (e) {
      var finalText = '', interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      if (finalText) {
        micBase = (micBase + ' ' + finalText).replace(/\s+/g, ' ').trim();
        micBase = micBase.charAt(0).toUpperCase() + micBase.slice(1);
      }
      micTarget.value = (micBase + ' ' + interim).replace(/\s+/g, ' ').trim();
      autosize(micTarget);
      micTarget.closest('.entry').classList.toggle('is-filled', !!micTarget.value.trim());
      if (finalText) saveNow();
    };
    rec.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast('Microphone blocked. You can still use the keyboard’s dictation key.');
        stopMic();
      }
    };
    rec.onend = function () {
      if (micWanted) { try { rec.start(); } catch (err) { stopMic(); } }
    };
    try { rec.start(); } catch (e) { toast('Voice input is not available here.'); return; }
    micWanted = true;
    $('mic').classList.add('is-live');
    $('mic-hint').hidden = false;
  }
  function stopMic() {
    micWanted = false;
    if (rec) { try { rec.onend = null; rec.stop(); } catch (e) { /* ignore */ } rec = null; }
    $('mic').classList.remove('is-live');
    $('mic-hint').hidden = true;
  }
  $('mic').addEventListener('click', function () { if (micWanted) stopMic(); else startMic(); });

  /* ---------------- JOURNAL ---------------- */
  function renderJournal() {
    var q = ($('search').value || '').trim().toLowerCase();
    var days = doneDays().reverse();
    var out = '', month = '';
    var re = q ? new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig') : null;
    days.forEach(function (k) {
      var items = getItems(k);
      if (q && !items.some(function (s) { return s.toLowerCase().indexOf(q) !== -1; })) return;
      var m = fmtMonth(k);
      if (m !== month) { month = m; out += '<div class="month">' + esc(m) + '</div>'; }
      out += '<div class="day"><div class="day__head"><span class="day__date">' + esc(relDay(k)) + '</span>' +
        '<button type="button" class="day__edit" data-edit="' + k + '">Edit</button></div><ol>' +
        items.map(function (s) {
          var h = esc(s);
          if (re) h = h.replace(re, '<mark>$1</mark>');
          return '<li>' + h + '</li>';
        }).join('') + '</ol></div>';
    });
    if (!out) out = '<div class="empty">' + (q ? 'Nothing matches “' + esc(q) + '” yet.' :
      'Your journal is empty. Tonight is a good night to start.') + '</div>';
    $('journal').innerHTML = out;
  }
  $('search').addEventListener('input', debounce(renderJournal, 120));
  $('journal').addEventListener('click', function (e) {
    var b = e.target.closest('[data-edit]');
    if (!b) return;
    editingDate = b.dataset.edit;
    forceWrite = true;
    show('today');
  });

  /* ---------------- INSIGHTS ---------------- */
  function renderInsights() {
    $('stat-streak').textContent = currentStreak();
    $('stat-longest').textContent = longestStreak();
    $('stat-days').textContent = doneDays().length;
    $('stat-items').textContent = totalItems();
    renderHeatmap();
    renderBars();
    renderBadges();
    renderWords();
  }

  function renderHeatmap() {
    var t = todayKey();
    var end = fromKey(t);
    // Start 52 weeks back, aligned to the previous Sunday so columns are whole weeks.
    var start = new Date(end); start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - start.getDay());
    var html = '', d = new Date(start);
    while (d <= end) {
      var k = dateKey(d), n = getItems(k).length;
      var lvl = n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4;
      html += '<i class="l' + lvl + (k === t ? ' today' : '') + '" title="' + esc(fmtShort(k)) + ': ' +
        (n ? n + (n === 1 ? ' gratitude' : ' gratitudes') : 'no entry') + '"></i>';
      d.setDate(d.getDate() + 1);
    }
    var hm = $('heatmap');
    hm.innerHTML = html;
    // Scroll so the current week is visible.
    hm.parentNode.scrollLeft = hm.scrollWidth;
  }

  function renderBars() {
    var t = todayKey();
    var weeks = [], max = 1;
    for (var w = 7; w >= 0; w--) {
      var n = 0;
      for (var i = 0; i < 7; i++) if (isDone(addDays(t, -(w * 7 + i)))) n++;
      weeks.push(n); if (n > max) max = n;
    }
    $('bars').innerHTML = weeks.map(function (n, i) {
      var label = i === 7 ? 'now' : (7 - i) + 'w';
      return '<div class="bar' + (i === 7 ? ' is-now' : '') + '" title="' + n + ' of 7 days">' +
        '<i style="height:' + Math.round(n / 7 * 80) + '%"></i><span>' + label + '</span></div>';
    }).join('');
  }

  function renderBadges() {
    var best = Math.max(longestStreak(), currentStreak());
    var total = doneDays().length;
    $('badges').innerHTML = BADGES.map(function (b) {
      var earned = b.days === 1 ? total >= 1 : best >= b.days;
      return '<div class="badge' + (earned ? '' : ' is-locked') + '" title="' + (earned ? 'Earned' : 'Locked') + '">' +
        '<div class="badge__icon">' + b.icon + '</div><div class="badge__label">' + esc(b.label) + '</div></div>';
    }).join('');
  }

  function renderWords() {
    var freq = {};
    doneDays().forEach(function (k) {
      getItems(k).join(' ').toLowerCase().replace(/[^a-zÀ-ɏ'\s]/g, ' ').split(/\s+/).forEach(function (w) {
        w = w.replace(/^'+|'+$/g, '');
        if (w.length < 3 || STOPWORDS.indexOf(w) !== -1) return;
        freq[w] = (freq[w] || 0) + 1;
      });
    });
    var top = Object.keys(freq).filter(function (w) { return freq[w] >= 2; })
      .sort(function (a, b) { return freq[b] - freq[a] || a.localeCompare(b); }).slice(0, 14);
    if (top.length) {
      $('words').innerHTML = top.map(function (w) { return '<span class="chip">' + esc(w) + '<b>' + freq[w] + '</b></span>'; }).join('');
    }
  }

  /* ---------------- SETTINGS ---------------- */
  function renderSettings() {
    $('set-name').value = settings.name;
    $('set-goal').value = String(settings.goal);
    $('set-morning').value = settings.morning;
    $('set-evening').value = settings.evening;
    $('set-server').value = settings.server;
    $('set-token').value = settings.token;
    $('pin-set').textContent = load(KEY_PIN, null) ? 'Change passcode' : 'Set a passcode';
    $('pin-clear').hidden = !load(KEY_PIN, null);
    $('version').textContent = 'Three Good Things · v' + VERSION;
    renderPushStatus();
  }
  function saveSettings() { save(KEY_SETTINGS, settings); }

  $('set-name').addEventListener('input', function () { settings.name = this.value.trim(); saveSettings(); });
  $('set-goal').addEventListener('change', function () { settings.goal = parseInt(this.value, 10) || 3; saveSettings(); });
  $('set-morning').addEventListener('change', function () { settings.morning = this.value || '07:30'; saveSettings(); resyncPush(); });
  $('set-evening').addEventListener('change', function () { settings.evening = this.value || '21:00'; saveSettings(); resyncPush(); });
  $('set-server').addEventListener('change', function () { settings.server = this.value.trim().replace(/\/+$/, ''); saveSettings(); });
  $('set-token').addEventListener('change', function () { settings.token = this.value.trim(); saveSettings(); });

  /* ---- Push notifications (optional reminder server) ---- */
  function pushSupported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  function renderPushStatus() {
    var el = $('push-status');
    if (!pushSupported()) {
      el.textContent = /iPhone|iPad/.test(navigator.userAgent) && !isStandalone()
        ? 'On iPhone, push works once the app is on your Home Screen: tap Share → Add to Home Screen, then come back here.'
        : 'Push notifications aren’t supported in this browser.';
      $('push-enable').disabled = true;
      return;
    }
    $('push-enable').disabled = false;
    if (settings.pushOn) {
      el.textContent = 'Reminders are on: ' + settings.morning + ' (morning) and ' + settings.evening + ' (evening).';
      $('push-enable').textContent = 'Update reminders';
      $('push-disable').hidden = false;
    } else {
      el.textContent = 'Push reminders need the optional reminder server (see README). Enter its URL and token, then enable.';
      $('push-enable').textContent = 'Enable reminders';
      $('push-disable').hidden = true;
    }
  }
  function urlB64ToUint8(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.token }, opts.headers || {});
    return fetch(settings.server + path, opts).then(function (r) {
      if (!r.ok) throw new Error('Server said ' + r.status);
      return r.status === 204 ? null : r.json();
    });
  }
  function enablePush() {
    if (!settings.server) { toast('Enter your reminder server URL first.'); return; }
    var btn = $('push-enable'); btn.disabled = true;
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') throw new Error('Notifications were not allowed.');
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return api('/api/vapid').then(function (j) {
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(j.publicKey) });
      });
    }).then(function (sub) {
      return api('/api/subscribe', { method: 'POST', body: JSON.stringify({
        subscription: sub.toJSON(), morning: settings.morning, evening: settings.evening,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone
      }) });
    }).then(function () {
      settings.pushOn = true; saveSettings(); renderPushStatus();
      toast('Reminders on. A test notification is on its way.');
    }).catch(function (e) { toast(e.message || 'Could not enable reminders.'); })
      .finally(function () { btn.disabled = false; });
  }
  function disablePush() {
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) {
      if (!sub) return;
      var endpoint = sub.endpoint;
      return sub.unsubscribe().then(function () {
        return api('/api/subscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: endpoint }) }).catch(function () {});
      });
    }).then(function () { settings.pushOn = false; saveSettings(); renderPushStatus(); toast('Reminders off.'); });
  }
  function resyncPush() { if (settings.pushOn && pushSupported()) enablePush(); }
  $('push-enable').addEventListener('click', enablePush);
  $('push-disable').addEventListener('click', disablePush);

  /* ---- Backup ---- */
  $('export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ app: 'three-good-things', version: VERSION, exportedAt: new Date().toISOString(),
      settings: { name: settings.name, goal: settings.goal, morning: settings.morning, evening: settings.evening }, entries: entries }, null, 2)],
      { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gratitude-backup-' + todayKey() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });
  $('import-file').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var incoming = data.entries || data;
        var n = 0;
        Object.keys(incoming).forEach(function (k) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
          var items = cleanItems(incoming[k].items || incoming[k]);
          if (!items.length) return;
          var merged = getItems(k).slice();
          items.forEach(function (s) { if (merged.indexOf(s) === -1) merged.push(s); });
          entries[k] = { items: merged, updatedAt: Date.now() }; n++;
        });
        save(KEY_ENTRIES, entries);
        toast('Imported ' + n + ' day' + (n === 1 ? '' : 's') + '.');
        renderStreakPill();
      } catch (e) { toast('That file doesn’t look like a backup.'); }
      $('import-file').value = '';
    };
    reader.readAsText(f);
  });
  $('wipe').addEventListener('click', function () {
    modal('Delete everything?', 'This removes every entry on this device. Export a backup first if you want to keep them.', null, function () {
      entries = {}; save(KEY_ENTRIES, entries); localStorage.removeItem(KEY_CELEBRATED);
      toast('All entries deleted.'); renderStreakPill();
    }, 'Delete');
  });

  /* ---------------- PASSCODE ---------------- */
  function sha(str) {
    if (window.crypto && crypto.subtle && window.isSecureContext) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode('tgt:' + str)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
    }
    // Fallback (non-secure contexts only): simple string hash. Better than plaintext, not cryptographic.
    var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return Promise.resolve('djb2:' + (h >>> 0).toString(16));
  }
  $('pin-set').addEventListener('click', function () {
    modal('Set a passcode', 'Four to six digits. You’ll need it each time you open the journal.', '', function (val) {
      if (!/^\d{4,6}$/.test(val)) { toast('Use 4 to 6 digits.'); return; }
      sha(val).then(function (h) { save(KEY_PIN, { hash: h, len: val.length }); renderSettings(); toast('Passcode set.'); });
    }, 'Save');
  });
  $('pin-clear').addEventListener('click', function () {
    modal('Remove passcode?', 'Anyone with this phone unlocked will be able to open the journal.', null, function () {
      localStorage.removeItem(KEY_PIN); renderSettings(); toast('Passcode removed.');
    }, 'Remove');
  });

  var pinBuf = '';
  function showLock() {
    var pin = load(KEY_PIN, null);
    if (!pin) return;
    pinBuf = '';
    $('lock-hint').textContent = 'Enter your passcode';
    var dots = $('lock-dots'); dots.innerHTML = '';
    for (var i = 0; i < pin.len; i++) dots.appendChild(document.createElement('span'));
    $('lock').hidden = false;
    $('app').setAttribute('aria-hidden', 'true');
  }
  function hideLock() { $('lock').hidden = true; $('app').removeAttribute('aria-hidden'); lockedAt = 0; }
  $('keypad').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var pin = load(KEY_PIN, null); if (!pin) { hideLock(); return; }
    if (b.dataset.key === 'del') pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < pin.len) pinBuf += b.dataset.key;
    var spans = $('lock-dots').children;
    for (var i = 0; i < spans.length; i++) spans[i].classList.toggle('on', i < pinBuf.length);
    if (pinBuf.length === pin.len) {
      sha(pinBuf).then(function (h) {
        if (h === pin.hash) { hideLock(); }
        else {
          $('lock-dots').classList.add('shake');
          $('lock-hint').textContent = 'Try again';
          setTimeout(function () {
            $('lock-dots').classList.remove('shake'); pinBuf = '';
            for (var i = 0; i < spans.length; i++) spans[i].classList.remove('on');
          }, 450);
        }
      });
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (!load(KEY_PIN, null)) return;
    if (document.hidden) { lockedAt = Date.now(); stopMic(); }
    else if (lockedAt && Date.now() - lockedAt > LOCK_AFTER_MS) showLock();
    else if (!document.hidden) { if (currentView === 'today') renderToday(); }
  });

  /* ---------------- MODAL + TOAST ---------------- */
  var modalOk = null;
  function modal(title, body, inputValue, onOk, okLabel) {
    $('modal-title').textContent = title;
    $('modal-body').textContent = body;
    var inp = $('modal-input');
    inp.hidden = inputValue === null;
    inp.value = inputValue || '';
    $('modal-ok').textContent = okLabel || 'OK';
    $('modal-ok').classList.toggle('btn--primary', okLabel !== 'Delete' && okLabel !== 'Remove');
    $('modal-ok').classList.toggle('btn--danger', okLabel === 'Delete' || okLabel === 'Remove');
    modalOk = onOk;
    $('modal').hidden = false;
    if (!inp.hidden) setTimeout(function () { inp.focus(); }, 50);
  }
  function closeModal() { $('modal').hidden = true; modalOk = null; }
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-ok').addEventListener('click', function () {
    var fn = modalOk, val = $('modal-input').value.trim();
    closeModal();
    if (fn) fn(val);
  });
  $('modal-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('modal-ok').click(); });

  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------------- SERVICE WORKER ---------------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline install is optional */ });
    });
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.view) route(e.data.view);
    });
  }

  /* ---------------- BOOT ---------------- */
  function route(v) {
    editingDate = todayKey();
    forceWrite = v === 'write' || v === 'evening';
    forceMorning = v === 'morning';
    show(v === 'journal' || v === 'insights' || v === 'settings' ? v : 'today');
  }
  var params = new URLSearchParams(location.search);
  showLock();
  route(params.get('view') || '');
  if (params.has('view')) history.replaceState(null, '', location.pathname);

  // Keep "today" honest if the app stays open past midnight.
  setInterval(function () {
    if (currentView === 'today' && editingDate !== todayKey() && !forceWrite) { editingDate = todayKey(); renderToday(); }
  }, 60 * 1000);
})();
