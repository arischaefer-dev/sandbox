'use strict';

const PDFJS_VERSION  = '3.11.174';
const STORE_KEY      = 'rsvp-reader-sessions-v1';
const AUTOSAVE_EVERY = 100;

const Store = {
  all() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch { return []; }
  },
  _write(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); },
  upsert(session) {
    const list = this.all();
    const i = list.findIndex(s => s.title === session.title);
    if (i >= 0) list[i] = session; else list.unshift(session);
    list.sort((a, b) => b.lastOpened - a.lastOpened);
    this._write(list);
  },
  get(title) { return this.all().find(s => s.title === title) ?? null; },
  remove(title) { this._write(this.all().filter(s => s.title !== title)); }
};

function wordMultiplier(word) {
  if (!word) return 1;
  if (/[.?!]['”»]?$/.test(word)) return 2.2;
  if (/[,;:]$/.test(word)) return 1.5;
  if (word.length >= 10) return 1.3;
  if (word.length <= 2)  return 0.85;
  return 1;
}

function splitORP(word) {
  if (!word) return { before: '', pivot: '', after: '' };
  const i = Math.max(0, Math.min(Math.ceil(word.length * 0.35) - 1, word.length - 1));
  return { before: word.slice(0, i), pivot: word[i], after: word.slice(i + 1) };
}

async function extractContent(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const words = [], pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    pages.push({ label: `Page ${p}`, wordIndex: words.length });
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    words.push(...content.items.map(it => it.str).join(' ').split(/\s+/).filter(w => w.length > 0));
  }
  return { words, pages };
}

const Player = {
  words: [], index: 0, wpm: 250, chunkSize: 1,
  smartPace: true, playing: false, title: '', pages: [], _tid: null,

  get baseInterval() { return 60000 / Math.max(this.wpm, 1); },
  get progress()     { return this.words.length > 1 ? this.index / (this.words.length - 1) : 0; },
  currentChunk()     { return this.words.slice(this.index, this.index + this.chunkSize).join(' '); },

  load(title, words, pages, saved) {
    this.stop();
    this.title = title; this.words = words; this.pages = pages;
    this.index = saved ? Math.min(saved.wordIndex, Math.max(0, words.length - 1)) : 0;
    this.wpm   = saved?.wpm ?? 250;
    this._save();
  },

  play() {
    if (this.playing || !this.words.length || this.index >= this.words.length - 1) return;
    this.playing = true;
    UI.syncPlayBtn();
    this._advance();
  },

  pause() {
    this.playing = false;
    clearTimeout(this._tid); this._tid = null;
    UI.syncPlayBtn(); this._save();
  },

  stop()   { this.pause(); },
  toggle() { this.playing ? this.pause() : this.play(); },

  step(delta) {
    this.index = Math.max(0, Math.min(this.index + delta, this.words.length - 1));
    UI.renderWord(); UI.renderContext(); UI.renderProgress();
    if (this.playing) this._scheduleNext();
    this._save();
  },

  seek(fraction) {
    this.index = Math.round(fraction * (this.words.length - 1));
    UI.renderWord(); UI.renderContext(); UI.renderProgress();
    if (this.playing) this._scheduleNext();
    this._save();
  },

  seekTo(wordIndex) {
    this.index = Math.max(0, Math.min(wordIndex, this.words.length - 1));
    UI.renderWord(); UI.renderContext(); UI.renderProgress();
    if (this.playing) this._scheduleNext();
    this._save();
  },

  setWPM(v) {
    this.wpm = Math.max(60, Math.min(800, v));
    if (this.playing) this._scheduleNext();
    UI.syncWPM(); this._save();
  },

  setChunkSize(n) { this.chunkSize = n; UI.renderWord(); },

  restart() {
    this.stop(); this.index = 0;
    UI.showWordDisplay(); UI.renderWord(); UI.renderContext(); UI.renderProgress();
  },

  _advance() {
    if (!this.playing) return;
    UI.renderWord(); UI.renderContext(); UI.renderProgress();
    if (this.index >= this.words.length - 1) { this.pause(); UI.showFinished(); return; }
    if (this.index % AUTOSAVE_EVERY === 0) this._save();
    this._scheduleNext();
  },

  _scheduleNext() {
    clearTimeout(this._tid);
    const mult = this.smartPace ? wordMultiplier(this.words[this.index]) : 1;
    this._tid = setTimeout(() => {
      if (!this.playing) return;
      this.index = Math.min(this.index + this.chunkSize, this.words.length - 1);
      this._advance();
    }, this.baseInterval * mult);
  },

  _save() {
    if (!this.title || !this.words.length) return;
    Store.upsert({ title: this.title, wordIndex: this.index, wpm: this.wpm,
                   totalWords: this.words.length, lastOpened: Date.now() });
  }
};

const $ = id => document.getElementById(id);

const UI = {
  libView: $('library-view'), rdrView: $('reader-view'),
  dropZone: $('drop-zone'), sessionList: $('session-list'),
  fileInput: $('file-input'), loadBtn: $('load-btn'),
  statsBar: $('stats-bar'), statsText: $('stats-text'),
  backBtn: $('back-btn'), rdrTitle: $('reader-title'), chaptersBtn: $('chapters-btn'),
  progressTrack: $('progress-track'), progressFill: $('progress-fill'),
  progressText: $('progress-text'), timeRemaining: $('time-remaining'),
  loadingState: $('loading-state'), wordDisplay: $('word-display'),
  finishedState: $('finished-state'), errorState: $('error-state'),
  wBefore: $('word-before'), wPivot: $('word-pivot'), wAfter: $('word-after'),
  contextLine: $('context-line'),
  wpmValue: $('wpm-value'), wpmDown: $('wpm-down'), wpmUp: $('wpm-up'),
  playPause: $('play-pause'), skipBack: $('skip-back'), skipFwd: $('skip-fwd'),
  restartBtn: $('restart-btn'), backFromError: $('back-from-error'),
  chaptersModal: $('chapters-modal'), chaptersList: $('chapters-list'),
  closeChapters: $('close-chapters'), modalBackdrop: $('modal-backdrop'),
  smartPaceChk: $('smart-pace'),

  showLibrary() {
    this.libView.classList.remove('hidden');
    this.rdrView.classList.add('hidden');
    this.renderSessionList();
    this.renderStats();
  },

  showReader(title) {
    this.libView.classList.add('hidden');
    this.rdrView.classList.remove('hidden');
    this.rdrTitle.textContent = title;
    this._setState('loading');
    this.playPause.disabled = true;
  },

  showWordDisplay() { this._setState('word'); this.playPause.disabled = false; },
  showFinished()    { this._setState('finished'); this.playPause.disabled = true; },
  showError(msg)    { $('error-msg').textContent = msg; this._setState('error'); this.playPause.disabled = true; },

  _setState(s) {
    this.loadingState.classList.toggle('hidden', s !== 'loading');
    this.wordDisplay.classList.toggle('hidden',  s !== 'word');
    this.finishedState.classList.toggle('hidden', s !== 'finished');
    this.errorState.classList.toggle('hidden',   s !== 'error');
  },

  renderWord() {
    if (Player.chunkSize > 1) {
      this.wordDisplay.classList.add('chunk-mode');
      this.wBefore.textContent = '';
      this.wAfter.textContent  = '';
      this.wPivot.textContent  = Player.currentChunk();
    } else {
      this.wordDisplay.classList.remove('chunk-mode');
      const { before, pivot, after } = splitORP(Player.words[Player.index] ?? '');
      this.wBefore.textContent = before;
      this.wPivot.textContent  = pivot;
      this.wAfter.textContent  = after;
    }
  },

  renderContext() {
    const { words, index } = Player;
    if (!words.length) { this.contextLine.innerHTML = ''; return; }
    const start = Math.max(0, index - 7);
    const end   = Math.min(words.length, index + 5);
    const pivot = index - start;
    this.contextLine.innerHTML = words.slice(start, end)
      .map((w, i) => i === pivot ? `<strong>${esc(w)}</strong>` : esc(w))
      .join(' ');
  },

  renderProgress() {
    const pct = (Player.progress * 100).toFixed(1);
    this.progressFill.style.width = pct + '%';
    this.progressText.textContent =
      `${Player.index + 1}\u202f/\u202f${Player.words.length}\u2002\u00b7\u2002${pct}%`;
    const mins = (Player.words.length - Player.index) / Player.wpm;
    this.timeRemaining.textContent = mins < 0.5 ? '< 1 min left' : `~${Math.ceil(mins)} min left`;
  },

  syncWPM() {
    this.wpmValue.textContent = Player.wpm;
    this.wpmDown.disabled = Player.wpm <= 60;
    this.wpmUp.disabled   = Player.wpm >= 800;
  },

  syncPlayBtn() { this.playPause.textContent = Player.playing ? '\u23f8' : '\u25b6'; },

  renderStats() {
    const sessions = Store.all();
    if (!sessions.length) { this.statsBar.classList.add('hidden'); return; }
    const total = sessions.reduce((s, sess) => s + (sess.wordIndex || 0), 0);
    this.statsText.textContent =
      `\ud83d\udcda ${sessions.length} book${sessions.length !== 1 ? 's' : ''} \u00b7 ${total.toLocaleString()} words read`;
    this.statsBar.classList.remove('hidden');
  },

  renderSessionList() {
    const sessions = Store.all();
    if (!sessions.length) {
      this.dropZone.classList.remove('hidden');
      this.sessionList.classList.add('hidden');
      return;
    }
    this.dropZone.classList.add('hidden');
    this.sessionList.classList.remove('hidden');
    this.sessionList.innerHTML = '';
    sessions.forEach(s => {
      const pct = s.totalWords > 1 ? Math.round(s.wordIndex / (s.totalWords - 1) * 100) : 0;
      const item = document.createElement('div');
      item.className = 'session-item';
      item.innerHTML = `
        <div class="session-title">${esc(s.title)}</div>
        <div class="session-bar-track">
          <div class="session-bar-fill${pct >= 100 ? ' complete' : ''}" style="width:${pct}%"></div>
        </div>
        <div class="session-meta">
          <span>${(s.wordIndex+1).toLocaleString()}\u202f/\u202f${s.totalWords.toLocaleString()} words\u2002\u00b7\u2002${pct}%</span>
          <span>${s.wpm}\u202fWPM\u2002\u00b7\u2002${relTime(s.lastOpened)}</span>
        </div>
        <button class="session-del" title="Remove">&times;</button>`;
      item.querySelector('.session-del').addEventListener('click', e => {
        e.stopPropagation(); Store.remove(s.title);
        this.renderSessionList(); this.renderStats();
      });
      item.addEventListener('click', () => this.fileInput.click());
      this.sessionList.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-primary add-more-btn';
    addBtn.textContent = '+ Load Another PDF';
    addBtn.addEventListener('click', () => this.fileInput.click());
    this.sessionList.appendChild(addBtn);
  },

  showChaptersModal() {
    if (!Player.pages.length) return;
    this.chaptersList.innerHTML = '';
    let curIdx = 0;
    Player.pages.forEach((pg, i) => { if (pg.wordIndex <= Player.index) curIdx = i; });
    Player.pages.forEach((pg, i) => {
      const pct = Player.words.length ? Math.round(pg.wordIndex / Player.words.length * 100) : 0;
      const btn = document.createElement('button');
      btn.className = 'chapter-item' + (i === curIdx ? ' current' : '');
      btn.innerHTML = `<span class="chapter-label">${esc(pg.label)}</span><span class="chapter-pct">${pct}%</span>`;
      btn.addEventListener('click', () => { Player.seekTo(pg.wordIndex); this.hideChaptersModal(); });
      this.chaptersList.appendChild(btn);
    });
    const cur = this.chaptersList.querySelector('.current');
    if (cur) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 50);
    this.chaptersModal.classList.remove('hidden');
  },

  hideChaptersModal() { this.chaptersModal.classList.add('hidden'); }
};

async function handleFile(file) {
  if (!file || file.type !== 'application/pdf') { alert('Please choose a PDF file.'); return; }
  const title = file.name.replace(/\.pdf$/i, '');
  UI.showReader(title);
  try {
    const { words, pages } = await extractContent(file);
    if (!words.length) throw new Error('No extractable text found in this PDF.');
    Player.load(title, words, pages, Store.get(title));
    UI.showWordDisplay(); UI.renderWord(); UI.renderContext();
    UI.renderProgress(); UI.syncWPM(); UI.syncPlayBtn();
  } catch (err) { UI.showError(err.message); }
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function relTime(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function wireSwipe() {
  const stage = $('word-stage');
  let sx = 0, sy = 0, st = 0;
  stage.addEventListener('touchstart', e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  stage.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx;
    const dy = e.changedTouches[0].clientY - sy;
    const dt = Date.now() - st;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      dx < 0 ? Player.step(10) : Player.step(-10);
    } else if (Math.abs(dx) < 20 && Math.abs(dy) < 20 && dt < 250) {
      if (!UI.playPause.disabled) Player.toggle();
    }
  }, { passive: true });
}

function wireEvents() {
  UI.fileInput.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) handleFile(f); e.target.value = '';
  });
  UI.loadBtn.addEventListener('click', () => UI.fileInput.click());
  UI.dropZone.addEventListener('click', () => UI.fileInput.click());
  document.addEventListener('dragover', e => { e.preventDefault(); UI.dropZone.classList.add('dragover'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) UI.dropZone.classList.remove('dragover'); });
  document.addEventListener('drop', e => {
    e.preventDefault(); UI.dropZone.classList.remove('dragover');
    const f = e.dataTransfer?.files[0]; if (f) handleFile(f);
  });
  UI.backBtn.addEventListener('click', () => { Player.pause(); UI.showLibrary(); });
  UI.backFromError.addEventListener('click', () => { Player.stop(); UI.showLibrary(); });
  UI.playPause.addEventListener('click', () => Player.toggle());
  UI.skipBack.addEventListener('click', () => Player.step(-10));
  UI.skipFwd.addEventListener('click',  () => Player.step(10));
  UI.restartBtn.addEventListener('click', () => Player.restart());
  UI.wpmDown.addEventListener('click', () => Player.setWPM(Player.wpm - 25));
  UI.wpmUp.addEventListener('click',   () => Player.setWPM(Player.wpm + 25));
  UI.smartPaceChk.addEventListener('change', e => { Player.smartPace = e.target.checked; });
  document.querySelectorAll('.btn-chunk').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-chunk').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Player.setChunkSize(+btn.dataset.chunk);
    });
  });
  UI.progressTrack.addEventListener('click', e => {
    if (!Player.words.length) return;
    const r = UI.progressTrack.getBoundingClientRect();
    Player.seek((e.clientX - r.left) / r.width);
  });
  UI.chaptersBtn.addEventListener('click', () => UI.showChaptersModal());
  UI.closeChapters.addEventListener('click', () => UI.hideChaptersModal());
  UI.modalBackdrop.addEventListener('click', () => UI.hideChaptersModal());
  document.addEventListener('keydown', e => {
    if (UI.rdrView.classList.contains('hidden') || ['BUTTON','INPUT'].includes(e.target.tagName)) return;
    switch (e.key) {
      case ' ':          e.preventDefault(); Player.toggle(); break;
      case 'ArrowLeft':  e.preventDefault(); Player.step(-10); break;
      case 'ArrowRight': e.preventDefault(); Player.step(10); break;
      case 'ArrowUp':    e.preventDefault(); Player.setWPM(Player.wpm + 25); break;
      case 'ArrowDown':  e.preventDefault(); Player.setWPM(Player.wpm - 25); break;
    }
  });
  wireSwipe();
}

function init() {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  wireEvents();
  UI.syncWPM();
  UI.showLibrary();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}

init();
