'use strict';

const PDFJS_VERSION  = '3.11.174';
const STORE_KEY      = 'rsvp-reader-sessions-v1';
const AUTOSAVE_EVERY = 100;

const Store = {
  all() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); }
    catch { return []; }
  },
  _write(sessions) { localStorage.setItem(STORE_KEY, JSON.stringify(sessions)); },
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

function splitORP(word) {
  if (!word) return { before: '', pivot: '', after: '' };
  const i = Math.max(0, Math.min(Math.ceil(word.length * 0.35) - 1, word.length - 1));
  return { before: word.slice(0, i), pivot: word[i], after: word.slice(i + 1) };
}

async function extractWords(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const parts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    parts.push(content.items.map(it => it.str).join(' '));
  }
  return parts.join(' ').split(/\s+/).filter(w => w.length > 0);
}

const Player = {
  words: [], index: 0, wpm: 250, playing: false, title: '', _tid: null,
  get interval()    { return 60000 / Math.max(this.wpm, 1); },
  get currentWord() { return this.words[this.index] ?? ''; },
  get progress()    { return this.words.length > 1 ? this.index / (this.words.length - 1) : 0; },
  load(title, words, saved) {
    this.stop(); this.title = title; this.words = words;
    this.index = saved ? Math.min(saved.wordIndex, Math.max(0, words.length - 1)) : 0;
    this.wpm = saved?.wpm ?? 250;
    this._save();
  },
  play() {
    if (this.playing || !this.words.length || this.index >= this.words.length - 1) return;
    this.playing = true; this._tick(); UI.syncPlayBtn();
  },
  pause() {
    this.playing = false; clearTimeout(this._tid); this._tid = null;
    UI.syncPlayBtn(); this._save();
  },
  stop() { this.pause(); },
  toggle() { this.playing ? this.pause() : this.play(); },
  step(delta) {
    this.index = Math.max(0, Math.min(this.index + delta, this.words.length - 1));
    UI.renderWord(); UI.renderProgress(); this._save();
  },
  seek(fraction) {
    this.index = Math.round(fraction * (this.words.length - 1));
    UI.renderWord(); UI.renderProgress(); this._save();
  },
  setWPM(v) {
    this.wpm = Math.max(60, Math.min(800, v));
    if (this.playing) { clearTimeout(this._tid); this._tick(); }
    UI.syncWPM(); this._save();
  },
  restart() {
    this.stop(); this.index = 0;
    UI.showWordDisplay(); UI.renderWord(); UI.renderProgress();
  },
  _tick() {
    if (!this.playing) return;
    if (this.index >= this.words.length - 1) { this.pause(); UI.showFinished(); return; }
    this.index++;
    UI.renderWord(); UI.renderProgress();
    if (this.index % AUTOSAVE_EVERY === 0) this._save();
    this._tid = setTimeout(() => this._tick(), this.interval);
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
  backBtn: $('back-btn'), rdrTitle: $('reader-title'),
  progressTrack: $('progress-track'), progressFill: $('progress-fill'), progressText: $('progress-text'),
  loadingState: $('loading-state'), wordDisplay: $('word-display'),
  finishedState: $('finished-state'), errorState: $('error-state'),
  wBefore: $('word-before'), wPivot: $('word-pivot'), wAfter: $('word-after'),
  wpmValue: $('wpm-value'), wpmDown: $('wpm-down'), wpmUp: $('wpm-up'),
  playPause: $('play-pause'), skipBack: $('skip-back'), skipFwd: $('skip-fwd'),
  restartBtn: $('restart-btn'), backFromError: $('back-from-error'),

  showLibrary() { this.libView.classList.remove('hidden'); this.rdrView.classList.add('hidden'); this.renderSessionList(); },
  showReader(title) {
    this.libView.classList.add('hidden'); this.rdrView.classList.remove('hidden');
    this.rdrTitle.textContent = title; this._setState('loading'); this.playPause.disabled = true;
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
    const { before, pivot, after } = splitORP(Player.currentWord);
    this.wBefore.textContent = before; this.wPivot.textContent = pivot; this.wAfter.textContent = after;
  },
  renderProgress() {
    const pct = (Player.progress * 100).toFixed(1);
    this.progressFill.style.width = pct + '%';
    this.progressText.textContent = `${Player.index + 1}\u202f/\u202f${Player.words.length}\u2002·\u2002${pct}%`;
  },
  syncWPM() {
    this.wpmValue.textContent = Player.wpm;
    this.wpmDown.disabled = Player.wpm <= 60; this.wpmUp.disabled = Player.wpm >= 800;
  },
  syncPlayBtn() { this.playPause.textContent = Player.playing ? '⏸' : '▶'; },
  renderSessionList() {
    const sessions = Store.all();
    if (sessions.length === 0) {
      this.dropZone.classList.remove('hidden'); this.sessionList.classList.add('hidden'); return;
    }
    this.dropZone.classList.add('hidden'); this.sessionList.classList.remove('hidden');
    this.sessionList.innerHTML = '';
    sessions.forEach(s => {
      const pct = s.totalWords > 1 ? Math.round(s.wordIndex / (s.totalWords - 1) * 100) : 0;
      const item = document.createElement('div');
      item.className = 'session-item';
      item.innerHTML = `
        <div class="session-title">${esc(s.title)}</div>
        <div class="session-bar-track"><div class="session-bar-fill${pct >= 100 ? ' complete' : ''}" style="width:${pct}%"></div></div>
        <div class="session-meta">
          <span>${s.wordIndex + 1}\u202f/\u202f${s.totalWords} words\u2002·\u2002${pct}%</span>
          <span>${s.wpm}\u202fWPM\u2002·\u2002${relTime(s.lastOpened)}</span>
        </div>
        <button class="session-del" title="Remove">&times;</button>`;
      item.querySelector('.session-del').addEventListener('click', e => {
        e.stopPropagation(); Store.remove(s.title); this.renderSessionList();
      });
      item.addEventListener('click', () => UI.fileInput.click());
      this.sessionList.appendChild(item);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-primary add-more-btn';
    addBtn.textContent = '+ Load Another PDF';
    addBtn.addEventListener('click', () => UI.fileInput.click());
    this.sessionList.appendChild(addBtn);
  }
};

async function handleFile(file) {
  if (!file || file.type !== 'application/pdf') { alert('Please choose a PDF file.'); return; }
  const title = file.name.replace(/\.pdf$/i, '');
  UI.showReader(title);
  try {
    const words = await extractWords(file);
    if (!words.length) throw new Error('No extractable text found in this PDF.');
    Player.load(title, words, Store.get(title));
    UI.showWordDisplay(); UI.renderWord(); UI.renderProgress(); UI.syncWPM(); UI.syncPlayBtn();
  } catch (err) { UI.showError(err.message); }
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function relTime(ts) {
  const d = Date.now() - ts, m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function wireEvents() {
  UI.fileInput.addEventListener('change', e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; });
  UI.loadBtn.addEventListener('click', () => UI.fileInput.click());
  UI.dropZone.addEventListener('click', () => UI.fileInput.click());
  document.addEventListener('dragover', e => { e.preventDefault(); UI.dropZone.classList.add('dragover'); });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) UI.dropZone.classList.remove('dragover'); });
  document.addEventListener('drop', e => { e.preventDefault(); UI.dropZone.classList.remove('dragover'); const f = e.dataTransfer?.files[0]; if (f) handleFile(f); });
  UI.backBtn.addEventListener('click', () => { Player.pause(); UI.showLibrary(); });
  UI.backFromError.addEventListener('click', () => { Player.stop(); UI.showLibrary(); });
  UI.playPause.addEventListener('click', () => Player.toggle());
  UI.skipBack.addEventListener('click', () => Player.step(-10));
  UI.skipFwd.addEventListener('click',  () => Player.step(10));
  UI.restartBtn.addEventListener('click', () => Player.restart());
  UI.wpmDown.addEventListener('click', () => Player.setWPM(Player.wpm - 25));
  UI.wpmUp.addEventListener('click',   () => Player.setWPM(Player.wpm + 25));
  UI.progressTrack.addEventListener('click', e => {
    if (!Player.words.length) return;
    const rect = UI.progressTrack.getBoundingClientRect();
    Player.seek((e.clientX - rect.left) / rect.width);
  });
  document.addEventListener('keydown', e => {
    if (UI.rdrView.classList.contains('hidden') || e.target.tagName === 'BUTTON') return;
    switch (e.key) {
      case ' ':          e.preventDefault(); Player.toggle(); break;
      case 'ArrowLeft':  e.preventDefault(); Player.step(-10); break;
      case 'ArrowRight': e.preventDefault(); Player.step(10); break;
      case 'ArrowUp':    e.preventDefault(); Player.setWPM(Player.wpm + 25); break;
      case 'ArrowDown':  e.preventDefault(); Player.setWPM(Player.wpm - 25); break;
    }
  });
}

function init() {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  wireEvents(); UI.syncWPM(); UI.showLibrary();
}

init();
