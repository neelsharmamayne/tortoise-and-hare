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
  var KEY_VAULT = 'tgt.vault';
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
  var entries = {};   // filled by boot() (plaintext) or unlock() (decrypted)
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
    persistEntries();
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
  function show(view, focus) {
    currentView = view;
    document.querySelectorAll('.view').forEach(function (el) { el.hidden = el.dataset.view !== view; });
    document.querySelectorAll('.tab').forEach(function (el) { el.classList.toggle('is-active', el.dataset.go === view); });
    if (view === 'today') renderToday(focus);
    if (view === 'journal') renderJournal();
    if (view === 'insights') renderInsights();
    if (view === 'settings') renderSettings();
    $('mic').hidden = !(view === 'today' && speechSupported());
    if (view !== 'today') stopMic();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () { editingDate = todayKey(); showYesterday = false; show(b.dataset.go, false); });
  });

  /* ---------------- TODAY: one note ---------------- */
  var showYesterday = false;

  function isMorningHour() {
    var h = new Date().getHours();
    var cutoff = parseInt((settings.evening || '21:00').split(':')[0], 10);
    return h < Math.min(12, cutoff);
  }
  function lastDoneBefore(k) {
    var days = doneDays().filter(function (d) { return d < k; });
    return days.length ? days[days.length - 1] : null;
  }
  function greeting() {
    var h = new Date().getHours();
    var g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return settings.name ? g + ', ' + settings.name : g;
  }
  function parseNote(text) {
    return String(text || '').split('\n').map(function (l) {
      return l.replace(/^\s*(?:[-*•–—]|\d+[.)])\s*/, '').trim();
    }).filter(Boolean);
  }

  function renderToday(focus) {
    var k = editingDate, isToday = k === todayKey();
    var last = lastDoneBefore(todayKey());
    var morning = isToday && !!last && (showYesterday || isMorningHour());
    $('yesterday').hidden = !morning;
    if (morning) renderYesterday(last);

    $('write-date').textContent = isToday
      ? (isMorningHour() ? 'Today' : 'Tonight') + ' · ' + fmtLong(k)
      : fmtLong(k);
    $('back-to-today').hidden = isToday;

    var ta = $('note');
    var text = getItems(k).join('\n');
    if (ta.value !== text) ta.value = text;
    autosize(ta);
    updateProgress(false);
    renderStreakPill();
    $('mic').hidden = !speechSupported();
    if (focus !== false && $('lock').hidden) setTimeout(function () { try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); } }, 60);
  }

  function renderYesterday(last) {
    var isYesterday = last === addDays(todayKey(), -1);
    $('yesterday-eyebrow').textContent = greeting() + ' · ' + (isYesterday ? 'last night you noticed' : 'on ' + fmtShort(last) + ' you noticed');
    $('yesterday-list').innerHTML = getItems(last).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    // One line from the archive (at least a week old), stable for the day.
    var old = doneDays().filter(function (k) { return k < addDays(todayKey(), -7); });
    var line = $('archive-line');
    if (old.length) {
      var pick = old[Math.floor(fromKey(todayKey()).getTime() / 86400000) % old.length];
      var items = getItems(pick);
      var item = items[Math.floor(fromKey(todayKey()).getTime() / 86400000) % items.length];
      var ago = Math.round((fromKey(todayKey()) - fromKey(pick)) / 86400000);
      line.innerHTML = '<span>' + (ago >= 365 ? Math.floor(ago / 365) + ' year' + (ago >= 730 ? 's' : '') : ago >= 30 ? Math.floor(ago / 30) + ' month' + (ago >= 60 ? 's' : '') : ago + ' days') +
        ' ago</span> ' + esc(item);
      line.hidden = false;
    } else { line.hidden = true; }
  }

  function autosize(ta) { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 120) + 'px'; }

  var saveNow = function () {
    if (isLocked()) return;
    var before = isDone(editingDate);
    setItems(editingDate, parseNote($('note').value));
    updateProgress(!before && isDone(editingDate));
    renderStreakPill();
    flash('Saved');
  };
  var onInput = debounce(saveNow, 350);
  var statusTimer;
  function flash(msg) {
    var el = $('status'); el.textContent = msg;
    clearTimeout(statusTimer); statusTimer = setTimeout(function () { el.textContent = streakLine(); }, 1400);
  }
  function streakLine() {
    var s = currentStreak();
    if (!isDone(todayKey())) return s ? s + '-day streak · keep it going' : '';
    return s >= 2 ? s + ' days in a row' : 'Day one';
  }

  $('note').addEventListener('input', function () { autosize(this); onInput(); });
  $('note').addEventListener('blur', function () { saveNow(); });
  document.querySelector('.note').addEventListener('click', function (e) {
    if (e.target.closest('textarea, a, button')) return;
    var ta = $('note'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  $('views').addEventListener('click', function (e) {
    if (currentView !== 'today') return;
    if (e.target === this || e.target === $('view-today')) {
      var ta = $('note'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  });

  function updateProgress(justCompleted) {
    var filled = parseNote($('note').value).length;
    var goal = settings.goal;
    var dots = $('progress');
    dots.innerHTML = '';
    for (var i = 0; i < goal; i++) {
      var s = document.createElement('span');
      s.className = 'progress__dot' + (i < filled ? ' is-on' : '');
      dots.appendChild(s);
    }
    $('status').textContent = streakLine();
    if (filled >= goal && editingDate === todayKey() && load(KEY_CELEBRATED, '') !== todayKey()) {
      save(KEY_CELEBRATED, todayKey());
      confetti();
      $('streak-pill').classList.add('bump');
      setTimeout(function () { $('streak-pill').classList.remove('bump'); }, 600);
    }
  }

  function renderStreakPill() {
    var s = currentStreak();
    $('streak-pill-count').textContent = s;
    $('streak-pill').classList.toggle('is-hot', s > 0 && isDone(todayKey()));
    $('streak-pill').title = s ? s + '-day streak' : 'Start a streak tonight';
  }

  // Quick capture: ?add=text appends a gratitude to today without touching the keyboard
  // (for an Action Button / Siri shortcut: Dictate Text -> Open URL).
  function quickAdd(text) {
    text = String(text || '').trim();
    if (!text) return;
    if (isLocked()) { pendingAdd = text; $('lock-hint').textContent = 'Unlock to add what you just said'; return; }
    var items = getItems(todayKey());
    text = text.charAt(0).toUpperCase() + text.slice(1);
    if (items.indexOf(text) === -1) items.push(text);
    setItems(todayKey(), items);
    editingDate = todayKey();
    show('today', false);
    updateProgress(true);
    toast('Added ✓');
  }

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

  /* ---------------- VOICE ----------------
     Tries the browser's SpeechRecognition. If it is missing, blocked, or
     silently does nothing (common inside iOS Home Screen apps), it falls
     back to the keyboard's own dictation key, which always works. */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var rec = null, micWanted = false, micBase = '', micHeard = false, micWatchdog = null;
  function speechSupported() { return true; } // the button always does something useful

  function newLineForDictation() {
    var ta = $('note');
    var v = ta.value.replace(/\s+$/, '');
    ta.value = v ? v + '\n' : '';
    autosize(ta);
    return ta;
  }
  function keyboardDictation(reason) {
    stopMic(true);
    var ta = newLineForDictation();
    try { ta.focus({ preventScroll: true }); } catch (e) { ta.focus(); }
    ta.setSelectionRange(ta.value.length, ta.value.length);
    hint(reason || (IOS ? 'Tap the 🎤 key on your keyboard to dictate' : 'Use your keyboard’s dictation to speak'), 4200);
  }
  function startMic() {
    if (!SR || !window.isSecureContext) { keyboardDictation(); return; }
    var ta = newLineForDictation();
    micBase = ta.value;
    micHeard = false;
    rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true;
    rec.continuous = !IOS;          // iOS is far more reliable in short sessions
    rec.maxAlternatives = 1;
    rec.onaudiostart = function () { micHeard = true; clearTimeout(micWatchdog); hint('Listening… tap the mic again when you’re done', 0); };
    rec.onresult = function (e) {
      micHeard = true; clearTimeout(micWatchdog);
      var finalText = '', interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      if (finalText) {
        var line = finalText.replace(/\s+/g, ' ').trim();
        var lineStart = micBase.slice(micBase.lastIndexOf('\n') + 1);
        if (!lineStart) line = line.charAt(0).toUpperCase() + line.slice(1);
        micBase = micBase + (lineStart ? ' ' : '') + line;
      }
      ta.value = micBase + (interim ? (micBase.slice(-1) === '\n' || !micBase ? '' : ' ') + interim.trim() : '');
      autosize(ta);
      if (finalText) saveNow();
    };
    rec.onerror = function (e) {
      var fatal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'language-not-supported', 'bad-grammar'];
      if (fatal.indexOf(e.error) !== -1) {
        keyboardDictation(e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Mic blocked for this app. Tap the 🎤 key on your keyboard instead'
          : null);
      }
      // 'no-speech' and 'aborted' just fall through to onend, which restarts while wanted.
    };
    rec.onend = function () {
      if (!micWanted) return;
      if (!micHeard) { keyboardDictation(); return; }   // started, heard nothing at all: hand over
      try { rec.start(); } catch (err) { stopMic(); }
    };
    try { rec.start(); } catch (e) { keyboardDictation(); return; }
    micWanted = true;
    $('mic').classList.add('is-live');
    hint('Listening…', 0);
    // If nothing happens within 3s (no audio, no error), this platform is not going to cooperate.
    micWatchdog = setTimeout(function () { if (micWanted && !micHeard) keyboardDictation(); }, 3000);
  }
  function stopMic(quiet) {
    micWanted = false;
    clearTimeout(micWatchdog);
    if (rec) { try { rec.onend = null; rec.abort(); } catch (e) { /* ignore */ } rec = null; }
    $('mic').classList.remove('is-live');
    if (!quiet) hint('', 0);
  }
  var hintTimer;
  function hint(msg, ms) {
    var el = $('mic-hint');
    clearTimeout(hintTimer);
    el.textContent = msg; el.hidden = !msg;
    if (msg && ms) hintTimer = setTimeout(function () { el.hidden = true; }, ms);
  }
  $('mic').addEventListener('click', function () { if (micWanted) { stopMic(); saveNow(); } else startMic(); });

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
      out += '<div class="day" data-edit="' + k + '"><div class="day__head"><span class="day__date">' + esc(relDay(k)) + '</span>' +
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
    if (window.getSelection && String(window.getSelection())) return; // let people copy text
    editingDate = b.dataset.edit;
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
    renderPrivacy();
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
        persistEntries();
        toast('Imported ' + n + ' day' + (n === 1 ? '' : 's') + '.');
        renderStreakPill();
      } catch (e) { toast('That file doesn’t look like a backup.'); }
      $('import-file').value = '';
    };
    reader.readAsText(f);
  });
  $('wipe').addEventListener('click', function () {
    modal('Delete everything?', 'This removes every entry on this device. Export a backup first if you want to keep them.', null, function () {
      entries = {}; persistEntries(); localStorage.removeItem(KEY_CELEBRATED);
      toast('All entries deleted.'); renderStreakPill();
    }, 'Delete');
  });

  /* ---------------- VAULT: encryption at rest + Face ID ----------------
     With a passcode set, entries are stored AES-GCM encrypted. A random data
     key (DEK) is wrapped by a key derived from the passcode (PBKDF2), and
     optionally by a secret the phone's Face ID / Touch ID produces (WebAuthn
     PRF). While locked, nothing is in memory. */
  var CRYPTO_OK = !!(window.crypto && crypto.subtle && window.isSecureContext);
  var BIO_NAME = IOS ? 'Face ID' : 'fingerprint or face unlock';
  var dekRaw = null, dekKey = null, pendingAdd = null, bootPending = null;
  var PBKDF2_ITER = 150000;

  function vault() { return load(KEY_VAULT, null); }
  function isLocked() { return !!vault() && !dekKey; }
  function rnd(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function b64(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(str) { return Uint8Array.from(atob(str), function (c) { return c.charCodeAt(0); }); }
  var enc = function (str) { return new TextEncoder().encode(str); };
  var dec = function (u8) { return new TextDecoder().decode(u8); };
  function pinKey(pin, salt, iter) {
    return crypto.subtle.importKey('raw', enc('tgt:' + pin), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, k,
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function rawKey(bytes) { return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']); }
  function encrypt(key, bytes) {
    var iv = rnd(12);
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, bytes).then(function (ct) { return { iv: b64(iv), ct: b64(new Uint8Array(ct)) }; });
  }
  function decrypt(key, box) {
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct)).then(function (b) { return new Uint8Array(b); });
  }

  var persistChain = Promise.resolve();
  function persistEntries() {
    var v = vault();
    if (!v) { save(KEY_ENTRIES, entries); return persistChain; }
    if (!dekKey) return persistChain;   // locked: nothing to write
    var snapshot = JSON.stringify(entries);
    persistChain = persistChain.then(function () {
      return encrypt(dekKey, enc(snapshot)).then(function (box) {
        var cur = vault(); if (!cur) return;
        cur.data = box; save(KEY_VAULT, cur);
      });
    }).catch(function () { toast('Could not save. Storage may be full.'); });
    return persistChain;
  }

  function createVault(pin) {
    dekRaw = rnd(32);
    var salt = rnd(16);
    return Promise.all([pinKey(pin, salt, PBKDF2_ITER), rawKey(dekRaw)]).then(function (keys) {
      dekKey = keys[1];
      return Promise.all([encrypt(keys[0], dekRaw), encrypt(dekKey, enc(JSON.stringify(entries)))]);
    }).then(function (boxes) {
      save(KEY_VAULT, { v: 1, len: pin.length, salt: b64(salt), iter: PBKDF2_ITER, wrapPin: boxes[0], wrapBio: null, data: boxes[1] });
      localStorage.removeItem(KEY_ENTRIES);
    });
  }
  function openWithDek(raw) {
    var v = vault();
    return rawKey(raw).then(function (key) {
      return decrypt(key, v.data).then(function (plain) {
        dekRaw = raw; dekKey = key;
        entries = JSON.parse(dec(plain)) || {};
      });
    });
  }
  function unlockPin(pin) {
    var v = vault();
    return pinKey(pin, unb64(v.salt), v.iter).then(function (kek) { return decrypt(kek, v.wrapPin); }).then(openWithDek);
  }
  function changePin(pin) {
    var v = vault(), salt = rnd(16);
    return pinKey(pin, salt, PBKDF2_ITER).then(function (kek) { return encrypt(kek, dekRaw); }).then(function (box) {
      v.salt = b64(salt); v.iter = PBKDF2_ITER; v.len = pin.length; v.wrapPin = box; save(KEY_VAULT, v);
    });
  }
  function removeVault() {
    save(KEY_ENTRIES, entries);
    localStorage.removeItem(KEY_VAULT);
    dekRaw = null; dekKey = null;
  }
  function lock() {
    if (!vault()) return;
    dekRaw = null; dekKey = null; entries = {};
    stopMic();
    $('note').value = '';
    showLock();
  }

  /* ---- Face ID / Touch ID via WebAuthn PRF ---- */
  function bioAvailable() {
    if (!CRYPTO_OK || !window.PublicKeyCredential || !PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return Promise.resolve(false);
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(function () { return false; });
  }
  function bioSecret(credId, salt) {
    return navigator.credentials.get({ publicKey: {
      challenge: rnd(32), rpId: location.hostname, timeout: 60000, userVerification: 'required',
      allowCredentials: [{ id: unb64(credId), type: 'public-key', transports: ['internal'] }],
      extensions: { prf: { eval: { first: unb64(salt) } } }
    } }).then(function (cred) {
      var ext = cred.getClientExtensionResults();
      if (!ext.prf || !ext.prf.results || !ext.prf.results.first) throw new Error('This device can’t unlock with ' + BIO_NAME + ' yet.');
      return new Uint8Array(ext.prf.results.first);
    });
  }
  function enrollBio() {
    var v = vault(); if (!v || !dekRaw) return Promise.reject(new Error('Set a passcode first.'));
    var prfSalt = rnd(32);
    return navigator.credentials.create({ publicKey: {
      challenge: rnd(32), rp: { name: 'Three Good Things', id: location.hostname },
      user: { id: rnd(16), name: 'me', displayName: 'Me' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, extensions: { prf: {} }
    } }).then(function (cred) {
      var ext = cred.getClientExtensionResults();
      if (!ext.prf || !ext.prf.enabled) throw new Error(BIO_NAME + ' unlock isn’t supported on this device yet (needs iOS 18 or newer).');
      var credId = b64(new Uint8Array(cred.rawId));
      return bioSecret(credId, b64(prfSalt)).then(function (secret) {
        return rawKey(secret).then(function (kek) { return encrypt(kek, dekRaw); }).then(function (box) {
          var cur = vault(); cur.wrapBio = { credId: credId, salt: b64(prfSalt), box: box }; save(KEY_VAULT, cur);
        });
      });
    });
  }
  function unlockBio() {
    var v = vault(); if (!v || !v.wrapBio) return Promise.reject(new Error('no bio'));
    return bioSecret(v.wrapBio.credId, v.wrapBio.salt).then(rawKey).then(function (kek) { return decrypt(kek, v.wrapBio.box); }).then(openWithDek);
  }

  /* ---- Settings: privacy card ---- */
  function renderPrivacy() {
    var v = vault();
    var status = $('privacy-status');
    if (!CRYPTO_OK) {
      status.textContent = 'Encryption needs HTTPS. Open the journal from its https:// address to set a passcode.';
      $('pin-set').hidden = true; $('pin-clear').hidden = true; $('bio-enable').hidden = true; $('bio-disable').hidden = true; return;
    }
    $('pin-set').hidden = false;
    $('pin-set').textContent = v ? 'Change passcode' : 'Set a passcode';
    $('pin-clear').hidden = !v;
    $('bio-disable').hidden = !(v && v.wrapBio);
    $('bio-enable').hidden = true;
    if (v) {
      status.textContent = 'Your entries are encrypted on this device. Unlock with your passcode' + (v.wrapBio ? ' or ' + BIO_NAME + '.' : '.');
      if (!v.wrapBio) bioAvailable().then(function (ok) { $('bio-enable').hidden = !ok; $('bio-enable').textContent = 'Add ' + BIO_NAME; });
    } else {
      status.textContent = 'Entries stay on this device and are never uploaded. Add a passcode to encrypt them, so a borrowed phone or a backup can’t reveal them.';
    }
  }
  $('pin-set').addEventListener('click', function () {
    var existing = !!vault();
    modal(existing ? 'New passcode' : 'Set a passcode',
      'Four to eight digits. Your entries will be encrypted with it. If you forget it there is no reset, so keep a backup (Settings → Export).',
      '', function (val) {
        if (!/^\d{4,8}$/.test(val)) { toast('Use 4 to 8 digits.'); return; }
        var p = existing ? changePin(val) : createVault(val);
        p.then(function () { renderPrivacy(); toast(existing ? 'Passcode changed.' : 'Passcode set. Entries are now encrypted.'); })
         .then(function () { if (!existing) return bioAvailable().then(function (ok) { if (ok) offerBio(); }); })
         .catch(function (e) { toast(e.message || 'Could not set passcode.'); });
      }, 'Save');
  });
  function offerBio() {
    modal('Unlock with ' + BIO_NAME + '?', 'Faster than typing the passcode. Your passcode still works as a backup.', null, function () {
      enrollBio().then(function () { renderPrivacy(); toast(BIO_NAME + ' is on.'); }).catch(function (e) { toast(e.message || 'Could not enable ' + BIO_NAME + '.'); });
    }, 'Turn on');
  }
  $('bio-enable').addEventListener('click', offerBio);
  $('bio-disable').addEventListener('click', function () {
    var v = vault(); if (!v) return; v.wrapBio = null; save(KEY_VAULT, v); renderPrivacy(); toast(BIO_NAME + ' unlock removed.');
  });
  $('pin-clear').addEventListener('click', function () {
    modal('Turn off passcode?', 'Entries will be stored unencrypted again, and anyone with this phone unlocked can read them.', null, function () {
      removeVault(); renderPrivacy(); toast('Passcode off.');
    }, 'Remove');
  });

  /* ---- Lock screen ---- */
  var pinBuf = '', unlocking = false;
  function showLock() {
    var v = vault(); if (!v) return;
    pinBuf = '';
    document.documentElement.classList.add('locked');
    $('lock-hint').textContent = pendingAdd ? 'Unlock to add what you just said' : 'Enter your passcode';
    var dots = $('lock-dots'); dots.innerHTML = '';
    for (var i = 0; i < v.len; i++) dots.appendChild(document.createElement('span'));
    $('lock-bio').hidden = !v.wrapBio;
    if (v.wrapBio) $('lock-bio').textContent = 'Unlock with ' + BIO_NAME;
    $('lock').hidden = false;
    $('app').setAttribute('aria-hidden', 'true');
    if (v.wrapBio) tryBio(true);
  }
  function tryBio(auto) {
    if (unlocking) return; unlocking = true;
    unlockBio().then(onUnlocked).catch(function (e) {
      if (!auto) $('lock-hint').textContent = (e && e.name === 'NotAllowedError') ? BIO_NAME + ' cancelled. Use your passcode.' : 'Use your passcode';
    }).then(function () { unlocking = false; });
  }
  $('lock-bio').addEventListener('click', function () { tryBio(false); });
  function onUnlocked() {
    $('lock').hidden = true;
    document.documentElement.classList.remove('locked');
    $('app').removeAttribute('aria-hidden');
    lockedAt = 0;
    if (bootPending) { var b = bootPending; bootPending = null; b(); }
    else if (currentView === 'today') renderToday(); else show(currentView, false);
    renderStreakPill();
    if (pendingAdd) { var t = pendingAdd; pendingAdd = null; quickAdd(t); }
  }
  $('keypad').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var v = vault(); if (!v) { onUnlocked(); return; }
    if (unlocking) return;
    if (b.dataset.key === 'del') pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < v.len) pinBuf += b.dataset.key;
    var spans = $('lock-dots').children;
    for (var i = 0; i < spans.length; i++) spans[i].classList.toggle('on', i < pinBuf.length);
    if (pinBuf.length === v.len) {
      unlocking = true;
      var attempt = pinBuf;
      unlockPin(attempt).then(function () { unlocking = false; onUnlocked(); }).catch(function () {
        unlocking = false;
        $('lock-dots').classList.add('shake');
        $('lock-hint').textContent = 'Try again';
        setTimeout(function () {
          $('lock-dots').classList.remove('shake'); pinBuf = '';
          for (var i = 0; i < spans.length; i++) spans[i].classList.remove('on');
        }, 450);
      });
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { lockedAt = Date.now(); stopMic(); saveNow(); return; }
    if (vault() && lockedAt && Date.now() - lockedAt > LOCK_AFTER_MS) { lock(); return; }
    if (currentView === 'today') renderToday(false);
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

  /* ---------------- KEYBOARD + INSTALL HINT ---------------- */
  if (window.visualViewport) {
    var baseH = window.visualViewport.height;
    window.visualViewport.addEventListener('resize', function () {
      var h = window.visualViewport.height;
      if (h > baseH) baseH = h;
      document.body.classList.toggle('kb-open', baseH - h > 150);
    });
  }
  (function installHint() {
    var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (!IOS || standalone || load('tgt.installHintDismissed', false)) return;
    var el = $('install');
    el.hidden = false;
    $('install-close').addEventListener('click', function () { el.hidden = true; save('tgt.installHintDismissed', true); });
  })();

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
    showYesterday = v === 'morning';
    show(v === 'journal' || v === 'insights' || v === 'settings' ? v : 'today', v !== 'morning');
  }
  var params = new URLSearchParams(location.search);
  function startApp() {
    if (params.has('add')) quickAdd(params.get('add'));
    else route(params.get('view') || '');
  }
  if (vault()) {
    if (params.has('add')) pendingAdd = String(params.get('add') || '').trim() || null;
    bootPending = function () { route(params.get('view') || ''); };
    showLock();
  } else {
    if (localStorage.getItem('tgt.pin')) localStorage.removeItem('tgt.pin'); // pre-vault passcode format
    entries = load(KEY_ENTRIES, {});
    startApp();
  }
  if (params.has('view') || params.has('add')) history.replaceState(null, '', location.pathname);
  document.addEventListener('touchstart', function () {}, { passive: true }); // enables :active on iOS

  // Keep "today" honest if the app stays open past midnight.
  setInterval(function () {
    if (currentView === 'today' && editingDate !== todayKey() && $('back-to-today').hidden) { editingDate = todayKey(); renderToday(false); }
  }, 60 * 1000);
})();
