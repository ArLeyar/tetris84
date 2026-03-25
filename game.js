// === CONSTANTS ===
const COLS = 10, ROWS = 20, BLOCK = 30;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const wrap = document.getElementById('canvas-wrap');

const COLORS = [
  null, '#00ffff', '#ff007a', '#aa44ff', '#ff4da6', '#7700ff', '#ff8844', '#4488ff',
];
const GLOW = [
  null,
  'rgba(0,255,255,0.7)', 'rgba(255,0,122,0.7)', 'rgba(170,68,255,0.7)',
  'rgba(255,77,166,0.7)', 'rgba(119,0,255,0.7)', 'rgba(255,136,68,0.7)', 'rgba(68,136,255,0.7)',
];

const SHAPES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  [[0,0,0],[0,2,0],[2,2,2]],
  [[3,3],[3,3]],
  [[0,0,0],[0,4,4],[4,4,0]],
  [[0,0,0],[5,5,0],[0,5,5]],
  [[0,0,0],[6,0,0],[6,6,6]],
  [[0,0,0],[0,0,7],[7,7,7]],
];

// === STATE ===
let board = createBoard();
let piece = null, nextPiece = null;
let score = 0, level = 1, lines = 0;
let gameOver = false, paused = false;
let dropTimer = 0, animFrame = null, lastTime = 0;
let combo = 0;
let hiScore = parseInt(localStorage.getItem('tetris84_hi') || '0');
let musicOn = false;
let clearingRows = [];
let clearAnim = 0;
const CLEAR_DURATION = 300;

// === STARS ===
(function initStars() {
  const container = document.getElementById('stars');
  for (let i = 0; i < 60; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 60 + '%';
    star.style.setProperty('--dur', (2 + Math.random() * 4) + 's');
    star.style.setProperty('--brightness', (0.3 + Math.random() * 0.7));
    star.style.animationDelay = Math.random() * 4 + 's';
    container.appendChild(star);
  }
})();

// ============================================================
// === AUDIO ENGINE ===
// ============================================================
let audioCtx = null;
let masterGain = null;

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.5;
  masterGain.connect(audioCtx.destination);
}

function ensureAudio() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playNote(freq, duration, time, type = 'sawtooth', vol = 0.06) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1400;
  filter.Q.value = 2;
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start(time);
  osc.stop(time + duration + 0.1);
  osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
}

// ============================================================
// === SYNTHWAVE KOROBEINIKI ENGINE ===
// ============================================================
let musicTimer = null;
let padOscs = [];

// Korobeiniki melody — note frequencies and durations (in 16th-note units)
// Part A (main theme)
const MELODY_A = [
  { f: 659.25, d: 2 }, // E5
  { f: 493.88, d: 1 }, // B4
  { f: 523.25, d: 1 }, // C5
  { f: 587.33, d: 2 }, // D5
  { f: 523.25, d: 1 }, // C5
  { f: 493.88, d: 1 }, // B4
  { f: 440.00, d: 2 }, // A4
  { f: 440.00, d: 1 }, // A4
  { f: 523.25, d: 1 }, // C5
  { f: 659.25, d: 2 }, // E5
  { f: 587.33, d: 1 }, // D5
  { f: 523.25, d: 1 }, // C5
  { f: 493.88, d: 2 }, // B4
  { f: 493.88, d: 1 }, // B4
  { f: 523.25, d: 1 }, // C5
  { f: 587.33, d: 2 }, // D5
  { f: 659.25, d: 2 }, // E5
  { f: 523.25, d: 2 }, // C5
  { f: 440.00, d: 2 }, // A4
  { f: 440.00, d: 2 }, // A4
];

// Part B (second phrase)
const MELODY_B = [
  { f: 587.33, d: 3 }, // D5
  { f: 698.46, d: 1 }, // F5
  { f: 880.00, d: 2 }, // A5
  { f: 783.99, d: 1 }, // G5
  { f: 698.46, d: 1 }, // F5
  { f: 659.25, d: 3 }, // E5
  { f: 523.25, d: 1 }, // C5
  { f: 659.25, d: 2 }, // E5
  { f: 587.33, d: 1 }, // D5
  { f: 523.25, d: 1 }, // C5
  { f: 493.88, d: 2 }, // B4
  { f: 493.88, d: 1 }, // B4
  { f: 523.25, d: 1 }, // C5
  { f: 587.33, d: 2 }, // D5
  { f: 659.25, d: 2 }, // E5
  { f: 523.25, d: 2 }, // C5
  { f: 440.00, d: 2 }, // A4
  { f: 440.00, d: 2 }, // A4
];

// Bass line follows chord roots (Am - E - Am - E | Am - E - Am-E | Dm - Am - E - Am)
const BASS_A = [
  { f: 110, d: 4 }, { f: 110, d: 4 },  // Am
  { f: 164.81, d: 4 }, { f: 164.81, d: 4 },  // E
  { f: 110, d: 4 }, { f: 110, d: 4 },  // Am
  { f: 164.81, d: 4 }, { f: 164.81, d: 4 },  // E
];
const BASS_B = [
  { f: 146.83, d: 4 }, { f: 146.83, d: 4 },  // Dm (D)
  { f: 174.61, d: 4 }, { f: 174.61, d: 4 },  // F
  { f: 130.81, d: 4 }, { f: 130.81, d: 4 },  // C (octave low)
  { f: 164.81, d: 4 }, { f: 164.81, d: 4 },  // E
];

// Chord pads per section
const CHORDS_A = [
  [220, 261.63, 329.63],   // Am
  [164.81, 246.94, 329.63], // E
  [220, 261.63, 329.63],   // Am
  [164.81, 246.94, 329.63], // E
];
const CHORDS_B = [
  [146.83, 220, 293.66],   // Dm
  [174.61, 220, 261.63],   // F
  [130.81, 196, 261.63],   // C
  [164.81, 246.94, 329.63], // E
];

function startMusic() {
  if (musicTimer) stopMusic();
  ensureAudio();
  musicOn = true;
  document.getElementById('music-status').textContent = 'ON';

  let tick = 0; // 16th note counter
  let loopCount = 0;

  // Build full sequence: A A B B (then repeat)
  const fullMelody = [...MELODY_A, ...MELODY_A, ...MELODY_B, ...MELODY_B];
  const fullBass = [...BASS_A, ...BASS_A, ...BASS_B, ...BASS_B];

  // Pre-calculate tick positions for melody and bass
  function buildTickMap(notes) {
    const map = [];
    let t = 0;
    for (const n of notes) {
      map.push({ tick: t, f: n.f, d: n.d });
      t += n.d;
    }
    return { map, totalTicks: t };
  }

  const mel = buildTickMap(fullMelody);
  const bas = buildTickMap(fullBass);
  const totalTicks = mel.totalTicks;

  let currentChordIdx = -1;

  function buildPad(chordNotes) {
    padOscs.forEach(p => { try { p.osc.stop(); p.osc.disconnect(); p.gain.disconnect(); } catch(e) {} });
    padOscs = [];
    padOscs = chordNotes.map(freq => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500 + loopCount * 80;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.02, audioCtx.currentTime + 0.3);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(masterGain);
      osc.start();
      return { osc, gain, filter };
    });
  }

  const BPM = 140;
  const sixteenthMs = (60000 / BPM) / 4; // ~107ms per 16th note
  const sixteenthSec = sixteenthMs / 1000;

  musicTimer = setInterval(() => {
    if (paused || gameOver) return;
    const now = audioCtx.currentTime;
    const pos = tick % totalTicks;
    const intensity = Math.min(3, loopCount);

    // Determine which section we're in (A1, A2, B1, B2)
    const melodyALen = buildTickMap(MELODY_A).totalTicks;
    const melodyBLen = buildTickMap(MELODY_B).totalTicks;
    const sectionBStart = melodyALen * 2;
    const inB = pos >= sectionBStart;
    const chords = inB ? CHORDS_B : CHORDS_A;
    const sectionPos = inB ? pos - sectionBStart : pos;
    const chordIdx = Math.floor(sectionPos / 8) % chords.length;

    if (chordIdx !== currentChordIdx) {
      currentChordIdx = chordIdx;
      buildPad(chords[chordIdx]);
    }

    // Play melody notes at their tick positions
    for (const n of mel.map) {
      if (n.tick === pos) {
        const dur = n.d * sixteenthSec * 0.9;
        // Lead — sawtooth with filter for that synthwave feel
        playNote(n.f, dur, now, 'sawtooth', 0.045 + intensity * 0.005);
        // Octave doubling on later loops
        if (intensity >= 2) {
          playNote(n.f * 2, dur * 0.7, now, 'sine', 0.015);
        }
      }
    }

    // Play bass notes
    for (const n of bas.map) {
      if (n.tick === pos) {
        const dur = n.d * sixteenthSec * 0.8;
        playNote(n.f, dur, now, 'sawtooth', 0.06 + intensity * 0.01);
        if (intensity >= 1) {
          playNote(n.f * 0.5, dur, now, 'triangle', 0.03); // sub
        }
      }
    }

    // Drums — build up over loops
    const beatPos = tick % 16;

    // Kick on 1 and 9
    if (beatPos === 0 || beatPos === 8) {
      playNote(55, 0.15, now, 'sine', 0.08 + intensity * 0.01);
    }

    // Hi-hat pattern — evolves
    if (intensity === 0 && beatPos % 4 === 0) {
      hihat(now, 0.01);
    } else if (intensity === 1 && beatPos % 2 === 0) {
      hihat(now, 0.012);
    } else if (intensity >= 2) {
      hihat(now, 0.014);
      if (beatPos % 2 === 1) hihat(now, 0.006); // ghost
    }

    // Snare on 4 and 12
    if (intensity >= 1 && (beatPos === 4 || beatPos === 12)) {
      snare(now, 0.035 + intensity * 0.008);
    }

    // Snare fill every 32 ticks
    if (intensity >= 2 && tick % 32 >= 28) {
      snare(now, 0.02);
    }

    tick++;
    if (tick % totalTicks === 0) loopCount++;
  }, sixteenthMs);
}

function hihat(time, vol) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 8000;
  osc.type = 'square';
  osc.frequency.value = 6000 + Math.random() * 3000;
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start(time);
  osc.stop(time + 0.05);
  osc.onended = () => { osc.disconnect(); filter.disconnect(); gain.disconnect(); };
}

function snare(time, vol) {
  // Noise burst + tone
  const noise = audioCtx.createOscillator();
  const ng = audioCtx.createGain();
  const nf = audioCtx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = 4000;
  nf.Q.value = 0.5;
  noise.type = 'sawtooth';
  noise.frequency.value = 3000 + Math.random() * 2000;
  ng.gain.setValueAtTime(vol, time);
  ng.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(masterGain);
  noise.start(time);
  noise.stop(time + 0.15);
  noise.onended = () => { noise.disconnect(); nf.disconnect(); ng.disconnect(); };

  // Tone body
  playNote(180, 0.08, time, 'triangle', vol * 0.6);
}

function stopMusic() {
  musicOn = false;
  document.getElementById('music-status').textContent = 'OFF';
  clearInterval(musicTimer);
  musicTimer = null;
  padOscs.forEach(p => { try { p.osc.stop(); p.osc.disconnect(); p.gain.disconnect(); } catch(e) {} });
  padOscs = [];
}

function toggleMusic() {
  if (musicOn) stopMusic(); else startMusic();
}

// SFX
function playSfx(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  if (type === 'clear') {
    playNote(523.25, 0.08, now, 'square', 0.1);
    playNote(659.25, 0.08, now + 0.06, 'square', 0.1);
    playNote(783.99, 0.12, now + 0.12, 'square', 0.12);
  } else if (type === 'tetris') {
    playNote(523.25, 0.1, now, 'square', 0.12);
    playNote(659.25, 0.1, now + 0.08, 'square', 0.12);
    playNote(783.99, 0.1, now + 0.16, 'square', 0.14);
    playNote(1046.5, 0.2, now + 0.24, 'square', 0.15);
  } else if (type === 'drop') {
    playNote(150, 0.06, now, 'triangle', 0.06);
    playNote(80, 0.08, now + 0.04, 'triangle', 0.04);
  } else if (type === 'move') {
    playNote(400, 0.03, now, 'sine', 0.02);
  } else if (type === 'rotate') {
    playNote(600, 0.04, now, 'sine', 0.03);
  } else if (type === 'gameover') {
    stopMusic();
    playNote(196, 0.3, now, 'sawtooth', 0.1);
    playNote(146.83, 0.4, now + 0.25, 'sawtooth', 0.08);
    playNote(110, 0.6, now + 0.5, 'sawtooth', 0.06);
    playNote(82.41, 0.8, now + 0.8, 'sawtooth', 0.04);
  }
}

// === PIECE LOGIC ===
function createPiece(type) {
  const shape = SHAPES[type].map(r => [...r]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomType() { return Math.floor(Math.random() * 7) + 1; }

function rotate(shape) {
  const rows = shape.length, cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      rotated[c][rows - 1 - r] = shape[r][c];
  return rotated;
}

function collides(board, shape, ox, oy) {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c, ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  return false;
}

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function lock(board, p) {
  for (let r = 0; r < p.shape.length; r++)
    for (let c = 0; c < p.shape[r].length; c++)
      if (p.shape[r][c] && p.y + r >= 0)
        board[p.y + r][p.x + c] = p.type;
}

function findFullRows() {
  const full = [];
  for (let r = 0; r < ROWS; r++)
    if (board[r].every(c => c !== 0)) full.push(r);
  return full;
}

function removeRows(rows) {
  rows.sort((a, b) => b - a);
  for (const r of rows) {
    board.splice(r, 1);
    board.unshift(Array(COLS).fill(0));
  }
}

// === VISUAL FX ===
function screenShake() {
  wrap.classList.remove('shake');
  void wrap.offsetWidth;
  wrap.classList.add('shake');
  setTimeout(() => wrap.classList.remove('shake'), 200);
}

function lineFlash() {
  wrap.classList.remove('line-flash');
  void wrap.offsetWidth;
  wrap.classList.add('line-flash');
  setTimeout(() => wrap.classList.remove('line-flash'), 400);
}

function showScorePopup(points, row, isTetris) {
  const popup = document.createElement('div');
  popup.className = 'score-popup' + (isTetris ? ' tetris' : '');
  popup.textContent = isTetris ? 'TETRIS! +' + points : '+' + points;
  popup.style.left = '50%';
  popup.style.top = (row * BLOCK) + 'px';
  popup.style.transform = 'translateX(-50%)';
  document.getElementById('score-popups').appendChild(popup);
  setTimeout(() => popup.remove(), 800);
}

function spawnParticles(row) {
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const color = COLORS[1 + Math.floor(Math.random() * 7)];
    p.style.background = color;
    p.style.boxShadow = `0 0 6px ${color}`;
    p.style.left = Math.random() * 300 + 'px';
    p.style.top = (row * BLOCK + BLOCK / 2) + 'px';
    const angle = Math.random() * Math.PI * 2;
    const dist = 40 + Math.random() * 80;
    p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(angle) * dist - 30 + 'px');
    p.style.setProperty('--dur', (0.4 + Math.random() * 0.4) + 's');
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 800);
  }
}

function flashValue(id) {
  const el = document.getElementById(id);
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 300);
}

// === RENDERING ===
function drawBlock(c, x, y, type, size = BLOCK, ghost = false, alpha = 1) {
  c.save();
  c.globalAlpha = alpha;
  if (ghost) {
    c.globalAlpha = 0.2;
    c.fillStyle = COLORS[type];
    c.strokeStyle = COLORS[type];
    c.lineWidth = 1;
    c.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    c.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
  } else {
    c.shadowColor = GLOW[type];
    c.shadowBlur = 14;
    c.fillStyle = COLORS[type];
    c.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,0.2)';
    c.fillRect(x * size + 2, y * size + 2, size - 4, 3);
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(x * size + 2, y * size + size - 4, size - 4, 2);
  }
  c.restore();
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,0,122,0.05)';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * BLOCK, 0); ctx.lineTo(c * BLOCK, canvas.height); ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * BLOCK); ctx.lineTo(canvas.width, r * BLOCK); ctx.stroke();
  }

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) {
        const isClearingRow = clearingRows.includes(r);
        const alpha = isClearingRow ? 1 - clearAnim : 1;
        drawBlock(ctx, c, r, board[r][c], BLOCK, false, alpha);
        if (isClearingRow) {
          ctx.save();
          ctx.globalAlpha = (1 - clearAnim) * 0.6;
          ctx.fillStyle = '#fff';
          ctx.fillRect(c * BLOCK, r * BLOCK, BLOCK, BLOCK);
          ctx.restore();
        }
      }

  if (!piece) return;

  if (!gameOver) {
    let ghostY = piece.y;
    while (!collides(board, piece.shape, piece.x, ghostY + 1)) ghostY++;
    if (ghostY !== piece.y) {
      for (let r = 0; r < piece.shape.length; r++)
        for (let c = 0; c < piece.shape[r].length; c++)
          if (piece.shape[r][c])
            drawBlock(ctx, piece.x + c, ghostY + r, piece.type, BLOCK, true);
    }
  }

  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++)
      if (piece.shape[r][c] && piece.y + r >= 0)
        drawBlock(ctx, piece.x + c, piece.y + r, piece.type);
}

function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!nextPiece) return;
  const s = nextPiece.shape;
  const size = 25;
  const ox = (nextCanvas.width - s[0].length * size) / 2;
  const oy = (nextCanvas.height - s.length * size) / 2;
  for (let r = 0; r < s.length; r++)
    for (let c = 0; c < s[r].length; c++)
      if (s[r][c]) {
        nextCtx.save();
        nextCtx.shadowColor = GLOW[nextPiece.type];
        nextCtx.shadowBlur = 10;
        nextCtx.fillStyle = COLORS[nextPiece.type];
        nextCtx.fillRect(ox + c * size + 1, oy + r * size + 1, size - 2, size - 2);
        nextCtx.restore();
      }
}

function updateUI() {
  document.getElementById('score').textContent = String(score).padStart(5, '0');
  document.getElementById('level').textContent = String(level).padStart(2, '0');
  document.getElementById('lines').textContent = String(lines).padStart(3, '0');
  document.getElementById('hiscore').textContent = String(hiScore).padStart(5, '0');

  const comboBox = document.getElementById('combo-box');
  if (combo > 1) {
    comboBox.classList.add('active');
    document.getElementById('combo').textContent = combo + 'x';
  } else {
    comboBox.classList.remove('active');
  }
}

// === GAME LOGIC ===
function getSpeed() {
  return Math.max(60, 500 - (level - 1) * 45);
}

function spawnPiece() {
  piece = nextPiece || createPiece(randomType());
  nextPiece = createPiece(randomType());
  piece.x = Math.floor(COLS / 2) - Math.floor(piece.shape[0].length / 2);
  piece.y = 0;
  if (collides(board, piece.shape, piece.x, piece.y)) {
    gameOver = true;
    piece = null;
    playSfx('gameover');
    if (score > hiScore) {
      hiScore = score;
      localStorage.setItem('tetris84_hi', hiScore);
    }
    showOverlay('GAME OVER', 'press enter to restart');
    return;
  }
  drawNext();
}

function handleClear(cleared) {
  const pts = [0, 40, 100, 300, 1200];
  const points = pts[cleared] * level;
  score += points;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  combo++;

  const isTetris = cleared === 4;
  playSfx(isTetris ? 'tetris' : 'clear');
  lineFlash();
  flashValue('score');
  if (cleared >= 2) flashValue('lines');

  const midRow = clearingRows[Math.floor(clearingRows.length / 2)] || 10;
  showScorePopup(points, midRow, isTetris);
  clearingRows.forEach(r => spawnParticles(r));

  if (isTetris) screenShake();
}

function drop() {
  if (!piece || paused || gameOver || clearingRows.length) return false;
  if (!collides(board, piece.shape, piece.x, piece.y + 1)) {
    piece.y++;
    return true;
  } else {
    lock(board, piece);
    const fullRows = findFullRows();
    if (fullRows.length) {
      clearingRows = fullRows;
      clearAnim = 0;
    } else {
      combo = 0;
      spawnPiece();
    }
    return false;
  }
}

function hardDrop() {
  if (!piece || paused || gameOver || clearingRows.length) return;
  let dropped = 0;
  while (!collides(board, piece.shape, piece.x, piece.y + 1)) {
    piece.y++;
    dropped++;
  }
  score += dropped * 2;
  playSfx('drop');
  screenShake();
  lock(board, piece);
  const fullRows = findFullRows();
  if (fullRows.length) {
    clearingRows = fullRows;
    clearAnim = 0;
  } else {
    combo = 0;
    spawnPiece();
  }
}

function move(dir) {
  if (!piece || paused || gameOver) return;
  if (!collides(board, piece.shape, piece.x + dir, piece.y)) {
    piece.x += dir;
    playSfx('move');
  }
}

function rotatePiece() {
  if (!piece || paused || gameOver) return;
  if (piece.type === 3) return; // O-piece — no visible rotation
  const rotated = rotate(piece.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides(board, rotated, piece.x + kick, piece.y)) {
      piece.shape = rotated;
      piece.x += kick;
      playSfx('rotate');
      return;
    }
  }
}

// === OVERLAY ===
function showOverlay(text, sub) {
  const el = document.getElementById('overlay');
  el.querySelector('.overlay-text').textContent = text;
  const subEl = el.querySelector('.overlay-sub');
  if (subEl) subEl.textContent = sub || '';
  el.classList.remove('hidden');
}

function hideOverlay() {
  document.getElementById('overlay').classList.add('hidden');
}

// === GAME LOOP ===
let clearStartTime = 0;

function gameLoop(time) {
  animFrame = requestAnimationFrame(gameLoop);

  if (!lastTime) { lastTime = time; return; } // skip first frame to avoid delta spike

  if (paused || gameOver) { drawBoard(); updateUI(); return; }

  const delta = time - lastTime;
  lastTime = time;

  if (clearingRows.length) {
    if (!clearStartTime) clearStartTime = time;
    clearAnim = Math.min(1, (time - clearStartTime) / CLEAR_DURATION);
    drawBoard();
    if (clearAnim >= 1) {
      handleClear(clearingRows.length);
      removeRows(clearingRows);
      clearingRows = [];
      clearAnim = 0;
      clearStartTime = 0;
      spawnPiece();
    }
    return;
  }

  dropTimer += delta;
  if (dropTimer > getSpeed()) {
    drop();
    dropTimer = 0;
  }
  drawBoard();
  updateUI();
}

function startGame() {
  board = createBoard();
  score = 0; level = 1; lines = 0; combo = 0;
  gameOver = false; paused = false;
  dropTimer = 0; lastTime = 0;
  clearingRows = []; clearAnim = 0; clearStartTime = 0;
  piece = null; nextPiece = null;

  ensureAudio();
  // Always restart music on new game
  startMusic();

  // Reset animation frame
  if (animFrame) cancelAnimationFrame(animFrame);
  animFrame = null;

  spawnPiece();
  hideOverlay();
  updateUI();
  animFrame = requestAnimationFrame(gameLoop);
}

// === INPUT ===
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' ']);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (gameOver || !piece) startGame();
    return;
  }
  if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') {
    if (!gameOver && piece) {
      paused = !paused;
      if (paused) showOverlay('PAUSED', 'press P to continue');
      else { hideOverlay(); lastTime = 0; }
    }
    return;
  }
  if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
    toggleMusic();
    return;
  }
  if (clearingRows.length) return;
  switch (e.key) {
    case 'ArrowLeft':  move(-1); e.preventDefault(); break;
    case 'ArrowRight': move(1); e.preventDefault(); break;
    case 'ArrowDown':  if (drop()) score += 1; e.preventDefault(); break;
    case 'ArrowUp':    rotatePiece(); e.preventDefault(); break;
    case ' ':          hardDrop(); e.preventDefault(); break;
  }
});

// === INIT ===
updateUI();
drawBoard();
