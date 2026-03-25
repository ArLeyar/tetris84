// === CONSTANTS ===
const COLS = 10, ROWS = 20, BLOCK = 30;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

// Synthwave palette
const COLORS = [
  null,
  '#00ffff', // I - cyan
  '#ff007a', // T - hot pink
  '#aa44ff', // O - purple
  '#ff4da6', // S - pink
  '#7700ff', // Z - deep purple
  '#ff8844', // L - orange
  '#4488ff', // J - blue
];
const GLOW = [
  null,
  'rgba(0,255,255,0.6)',
  'rgba(255,0,122,0.6)',
  'rgba(170,68,255,0.6)',
  'rgba(255,77,166,0.6)',
  'rgba(119,0,255,0.6)',
  'rgba(255,136,68,0.6)',
  'rgba(68,136,255,0.6)',
];

// Tetrominos (each rotation state)
const SHAPES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[0,0,0],[0,2,0],[2,2,2]],                   // T
  [[3,3],[3,3]],                                 // O
  [[0,0,0],[0,4,4],[4,4,0]],                   // S
  [[0,0,0],[5,5,0],[0,5,5]],                   // Z
  [[0,0,0],[6,0,0],[6,6,6]],                   // L
  [[0,0,0],[0,0,7],[7,7,7]],                   // J
];

// === STATE ===
let board, piece, nextPiece, score, level, lines, gameOver, paused, dropInterval, dropTimer, animFrame;
let hiScore = parseInt(localStorage.getItem('tetris84_hi') || '0');
let musicOn = false;

// === AUDIO (Web Audio API synthwave bass) ===
let audioCtx, musicInterval;

function initAudio() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playNote(freq, duration, time, type = 'sawtooth', vol = 0.06) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200;
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + duration);
}

// Synthwave arpeggio loop
const BASS_NOTES = [55, 65.41, 73.42, 82.41]; // A1, C2, D2, E2
const ARP_NOTES = [220, 261.63, 329.63, 392, 329.63, 261.63]; // Am arpeggio

function startMusic() {
  if (!audioCtx) initAudio();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  musicOn = true;
  let beat = 0;
  musicInterval = setInterval(() => {
    if (paused || gameOver) return;
    const now = audioCtx.currentTime;
    // Bass
    playNote(BASS_NOTES[beat % BASS_NOTES.length], 0.3, now, 'sawtooth', 0.07);
    // Arp
    playNote(ARP_NOTES[beat % ARP_NOTES.length], 0.15, now, 'triangle', 0.04);
    playNote(ARP_NOTES[(beat + 2) % ARP_NOTES.length], 0.15, now + 0.15, 'triangle', 0.03);
    beat++;
  }, 280);
}

function stopMusic() {
  musicOn = false;
  clearInterval(musicInterval);
}

function playSfx(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  if (type === 'clear') {
    playNote(523.25, 0.1, now, 'square', 0.08);
    playNote(659.25, 0.1, now + 0.08, 'square', 0.08);
    playNote(783.99, 0.15, now + 0.16, 'square', 0.1);
  } else if (type === 'drop') {
    playNote(110, 0.08, now, 'triangle', 0.05);
  } else if (type === 'gameover') {
    playNote(196, 0.3, now, 'sawtooth', 0.08);
    playNote(146.83, 0.4, now + 0.3, 'sawtooth', 0.06);
    playNote(110, 0.6, now + 0.6, 'sawtooth', 0.05);
  }
}

// === PIECE ===
function createPiece(type) {
  const shape = SHAPES[type].map(r => [...r]);
  return {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0
  };
}

function randomType() {
  return Math.floor(Math.random() * 7) + 1;
}

function rotate(shape) {
  const rows = shape.length, cols = shape[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      rotated[c][rows - 1 - r] = shape[r][c];
  return rotated;
}

// === COLLISION ===
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

// === BOARD ===
function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function lock(board, p) {
  for (let r = 0; r < p.shape.length; r++)
    for (let c = 0; c < p.shape[r].length; c++)
      if (p.shape[r][c] && p.y + r >= 0)
        board[p.y + r][p.x + c] = p.type;
}

function clearLines(board) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(c => c !== 0)) {
      board.splice(r, 1);
      board.unshift(Array(COLS).fill(0));
      cleared++;
      r++; // recheck row
    }
  }
  return cleared;
}

// === RENDERING ===
function drawBlock(ctx, x, y, type, size = BLOCK, ghost = false) {
  const color = COLORS[type];
  const glow = GLOW[type];
  ctx.save();
  if (ghost) {
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    ctx.strokeRect(x * size + 1, y * size + 1, size - 2, size - 2);
  } else {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = color;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    // Inner highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x * size + 2, y * size + 2, size - 4, 3);
  }
  ctx.restore();
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,0,122,0.06)';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, canvas.height);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(canvas.width, r * BLOCK);
    ctx.stroke();
  }

  // Locked blocks
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) drawBlock(ctx, c, r, board[r][c]);

  // Ghost piece
  if (piece && !gameOver) {
    let ghostY = piece.y;
    while (!collides(board, piece.shape, piece.x, ghostY + 1)) ghostY++;
    if (ghostY !== piece.y) {
      for (let r = 0; r < piece.shape.length; r++)
        for (let c = 0; c < piece.shape[r].length; c++)
          if (piece.shape[r][c])
            drawBlock(ctx, piece.x + c, ghostY + r, piece.type, BLOCK, true);
    }
  }

  // Current piece
  if (piece) {
    for (let r = 0; r < piece.shape.length; r++)
      for (let c = 0; c < piece.shape[r].length; c++)
        if (piece.shape[r][c] && piece.y + r >= 0)
          drawBlock(ctx, piece.x + c, piece.y + r, piece.type);
  }
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
        const bx = ox / size + c;
        const by = oy / size + r;
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
}

// === GAME LOGIC ===
function getSpeed() {
  return Math.max(80, 500 - (level - 1) * 40);
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
    showOverlay('GAME OVER');
  }
  drawNext();
}

function drop() {
  if (!piece || paused || gameOver) return;
  if (!collides(board, piece.shape, piece.x, piece.y + 1)) {
    piece.y++;
  } else {
    lock(board, piece);
    const cleared = clearLines(board);
    if (cleared) {
      const pts = [0, 40, 100, 300, 1200];
      score += pts[cleared] * level;
      lines += cleared;
      level = Math.floor(lines / 10) + 1;
      playSfx('clear');
    }
    spawnPiece();
  }
}

function hardDrop() {
  if (!piece || paused || gameOver) return;
  while (!collides(board, piece.shape, piece.x, piece.y + 1)) {
    piece.y++;
    score += 2;
  }
  playSfx('drop');
  lock(board, piece);
  const cleared = clearLines(board);
  if (cleared) {
    const pts = [0, 40, 100, 300, 1200];
    score += pts[cleared] * level;
    lines += cleared;
    level = Math.floor(lines / 10) + 1;
    playSfx('clear');
  }
  spawnPiece();
}

function move(dir) {
  if (!piece || paused || gameOver) return;
  if (!collides(board, piece.shape, piece.x + dir, piece.y))
    piece.x += dir;
}

function rotatePiece() {
  if (!piece || paused || gameOver) return;
  const rotated = rotate(piece.shape);
  // Try normal, then wall kicks
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides(board, rotated, piece.x + kick, piece.y)) {
      piece.shape = rotated;
      piece.x += kick;
      return;
    }
  }
}

// === OVERLAY ===
function showOverlay(text) {
  const el = document.getElementById('overlay');
  el.querySelector('.overlay-text').textContent = text;
  el.classList.remove('hidden');
}

function hideOverlay() {
  document.getElementById('overlay').classList.add('hidden');
}

// === GAME LOOP ===
let lastTime = 0;

function gameLoop(time) {
  animFrame = requestAnimationFrame(gameLoop);
  if (paused || gameOver) { drawBoard(); return; }
  const delta = time - lastTime;
  dropTimer += delta;
  lastTime = time;
  if (dropTimer > getSpeed()) {
    drop();
    dropTimer = 0;
  }
  drawBoard();
  updateUI();
}

function startGame() {
  board = createBoard();
  score = 0; level = 1; lines = 0;
  gameOver = false; paused = false;
  dropTimer = 0; lastTime = performance.now();
  piece = null;
  nextPiece = null;
  spawnPiece();
  hideOverlay();
  updateUI();
  if (!animFrame) animFrame = requestAnimationFrame(gameLoop);
}

// === INPUT ===
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (gameOver || !piece) {
      if (!audioCtx) initAudio();
      startGame();
    }
    return;
  }
  if (e.key === 'p' || e.key === 'P' || e.key === 'з' || e.key === 'З') {
    if (!gameOver && piece) {
      paused = !paused;
      if (paused) showOverlay('PAUSED');
      else { hideOverlay(); lastTime = performance.now(); }
    }
    return;
  }
  if (e.key === 'm' || e.key === 'M' || e.key === 'ь' || e.key === 'Ь') {
    if (musicOn) stopMusic(); else startMusic();
    return;
  }
  switch (e.key) {
    case 'ArrowLeft':  move(-1); break;
    case 'ArrowRight': move(1); break;
    case 'ArrowDown':  drop(); score += 1; break;
    case 'ArrowUp':    rotatePiece(); break;
    case ' ':          hardDrop(); break;
  }
  e.preventDefault();
});

// === INIT ===
updateUI();
drawBoard();
