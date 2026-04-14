// game.js — pure game logic + rendering, no networking

const CELL = 36;
const COLS = 28;
const ROWS = 22;
const SPEED = 4.0;
const EAT_DIST = CELL * 0.72;
const POWER_DURATION = 8;

const GHOST_COLORS = ['#FF6EC7', '#00CFCF', '#FF9800', '#B388FF', '#69F0AE'];

// 28x22 maze. 1=wall, 0=dot, 2=power pellet, 3=empty(no dot)
const MAZE_TEMPLATE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,1,1,1,0,1,1,0,1,1,1,1,1,1,0,1,1,1,0,1],
  [1,2,1,1,1,0,1,1,1,1,1,1,0,1,1,0,1,1,1,1,1,1,0,1,1,1,2,1],
  [1,0,1,1,1,0,1,1,1,1,1,1,0,1,1,0,1,1,1,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,0,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1,1,0,0,0,0,0,1],
  [1,1,1,1,1,0,1,1,1,1,1,3,3,3,3,3,3,1,1,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,0,1,1,1,1,1,3,3,3,3,3,3,1,1,1,1,0,1,1,1,1,1,1],
  [1,1,1,1,1,0,1,1,3,3,3,3,3,3,3,3,3,3,3,3,1,1,0,1,1,1,1,1],
  [1,1,1,1,1,0,1,1,3,1,1,1,1,3,3,1,1,1,1,3,1,1,0,1,1,1,1,1],
  [3,3,3,3,3,0,3,3,3,1,3,3,3,3,3,3,3,3,1,3,3,3,0,3,3,3,3,3],
  [1,1,1,1,1,0,1,1,3,1,1,1,1,1,1,1,1,1,1,3,1,1,0,1,1,1,1,1],
  [1,1,1,1,1,0,1,1,3,3,3,3,3,3,3,3,3,3,3,3,1,1,0,1,1,1,1,1],
  [1,1,1,1,1,0,1,1,3,3,3,3,3,3,3,3,3,3,3,3,1,1,0,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,1,1,1,0,1,1,0,1,1,1,1,1,1,0,1,1,1,0,1],
  [1,2,0,0,1,0,0,0,0,0,0,0,0,3,3,0,0,0,0,0,0,0,0,1,0,0,2,1],
  [1,0,0,1,1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,0,1,1,0,1,1,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const SPAWNS = [
  {c:13,r:13}, // center
  {c:1,r:1},
  {c:26,r:1},
  {c:1,r:19},
  {c:26,r:19},
];

const Game = (() => {
  let canvas, ctx;
  let players = [];
  let dots = new Map();
  let dotsEaten = 0;
  let gameRunning = false;
  let animFrame;
  let lastTime = 0;
  let onGameEnd = null;
  let setMsgFn = null;
  let myId = 0;

  // Joystick state
  const joy = { dx: 0, dy: 0, active: false };

  function init(canvasEl, options = {}) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    onGameEnd = options.onEnd || null;
    setMsgFn = options.setMsg || null;
    myId = options.myId ?? 0;
    resizeCanvas();
  }

  function resizeCanvas() {
    const wrap = canvas.parentElement;
    const maxW = wrap.clientWidth;
    const maxH = wrap.clientHeight;
    const mazeW = COLS * CELL;
    const mazeH = ROWS * CELL;
    const scale = Math.min(maxW / mazeW, maxH / mazeH, 1);
    canvas.width = Math.floor(mazeW * scale);
    canvas.height = Math.floor(mazeH * scale);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
  }

  function initDots() {
    dots.clear();
    dotsEaten = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = MAZE_TEMPLATE[r][c];
        if (v === 0) dots.set(r * COLS + c, 'dot');
        else if (v === 2) dots.set(r * COLS + c, 'power');
      }
    }
  }

  function makePlayer(id, role, isAI, colorIndex) {
    const sp = SPAWNS[id % SPAWNS.length];
    const ctr = cellCenter(sp.c, sp.r);
    return {
      id, role, alive: true, isAI,
      px: ctr.x, py: ctr.y,
      gc: sp.c, gr: sp.r,
      tx: ctr.x, ty: ctr.y,
      dc: 0, dr: 0,
      wantDc: 0, wantDr: 0,
      mouth: 0.05, mouthSpd: 0.065,
      facing: 0,
      color: role === 'ghost' ? GHOST_COLORS[colorIndex % GHOST_COLORS.length] : '#FFD700',
      aiTimer: 0,
      killCooldown: 0,
      powerTimer: 0,
      name: isAI ? `AI-${id}` : `P${id + 1}`,
    };
  }

  function startLocal(roleList) {
    // roleList: array like ['pacman','ghost','pacman',...] index 0 = local player
    initDots();
    players = roleList.map((role, i) => makePlayer(i, role, i > 0, i));
    myId = 0;
    startLoop();
  }

  // Multiplayer: server sends full state
  function syncState(serverPlayers, serverDots) {
    players = serverPlayers;
    if (serverDots) {
      dots.clear();
      serverDots.forEach(([k, v]) => dots.set(k, v));
    }
  }

  function startLoop() {
    gameRunning = true;
    if (animFrame) cancelAnimationFrame(animFrame);
    lastTime = performance.now();
    animFrame = requestAnimationFrame(loop);
  }

  function stopLoop() {
    gameRunning = false;
    if (animFrame) cancelAnimationFrame(animFrame);
  }

  function loop(now) {
    if (!gameRunning) return;
    animFrame = requestAnimationFrame(loop);
    const dt = Math.min((now - lastTime) / 16.67, 3);
    lastTime = now;
    update(dt);
    draw();
  }

  function update(dt) {
    // Apply joystick to local player
    const me = players.find(p => p.id === myId);
    if (me && me.alive && joy.active) {
      const ax = Math.abs(joy.dx), ay = Math.abs(joy.dy);
      if (ax > 0.25 || ay > 0.25) {
        if (ax > ay) { me.wantDc = joy.dx > 0 ? 1 : -1; me.wantDr = 0; }
        else { me.wantDc = 0; me.wantDr = joy.dy > 0 ? 1 : -1; }
      }
    }

    players.forEach(p => {
      if (!p.alive) return;
      if (p.isAI) aiThink(p, dt);
      movePlayer(p, dt);
      animateMouth(p, dt);
      if (p.killCooldown > 0) p.killCooldown -= dt / 60;
      if (p.powerTimer > 0) p.powerTimer -= dt / 60;
    });

    // Pac-Men collect dots
    players.filter(p => p.alive && p.role === 'pacman').forEach(checkDot);

    // Powered pac-men eat ghosts
    players.filter(p => p.alive && p.role === 'pacman' && p.powerTimer > 0).forEach(pac => {
      if (pac.killCooldown > 0) return;
      players.filter(g => g.alive && g.role === 'ghost').forEach(ghost => {
        if (pdist(pac, ghost) < EAT_DIST) {
          ghost.alive = false;
          pac.killCooldown = 0.8;
          setMsg('Pac-Man ate a ghost! 👻');
        }
      });
    });

    // Ghosts eat unpowered pac-men
    players.filter(g => g.alive && g.role === 'ghost').forEach(ghost => {
      if (ghost.killCooldown > 0) return;
      players.filter(p => p.alive && p.role === 'pacman' && p.powerTimer <= 0).forEach(pac => {
        if (pdist(ghost, pac) < EAT_DIST) {
          pac.alive = false;
          ghost.killCooldown = 1.2;
          if (pac.id === myId) {
            endGame('ghosts');
            return;
          }
          setMsg(`Ghost eliminated ${pac.name}!`);
        }
      });
    });

    if (!gameRunning) return;

    const alivePac = players.filter(p => p.alive && p.role === 'pacman').length;
    const aliveGhost = players.filter(p => p.alive && p.role === 'ghost').length;
    if (aliveGhost === 0 || dots.size === 0) { endGame('pacmen'); return; }
    if (alivePac === 0) { endGame('ghosts'); return; }

    // Check if local player is ghost and got eaten
    const meNow = players.find(p => p.id === myId);
    if (meNow && !meNow.alive && meNow.role === 'ghost') {
      // ghost was eaten — just spectate (don't end game for them)
    }
  }

  function movePlayer(p, dt) {
    const dx = p.tx - p.px, dy = p.ty - p.py;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = SPEED * dt;
    if (d <= step) {
      p.px = p.tx; p.py = p.ty;
      p.gc = Math.round((p.tx - CELL / 2) / CELL);
      p.gr = Math.round((p.ty - CELL / 2) / CELL);
      if (!tryDir(p, p.wantDc, p.wantDr)) tryDir(p, p.dc, p.dr);
    } else {
      p.px += (dx / d) * step;
      p.py += (dy / d) * step;
    }
  }

  function tryDir(p, dc, dr) {
    if (dc === 0 && dr === 0) return false;
    const nc = p.gc + dc, nr = p.gr + dr;
    if (!canMove(nc, nr)) return false;
    p.dc = dc; p.dr = dr; p.gc = nc; p.gr = nr;
    const c = cellCenter(nc, nr);
    p.tx = c.x; p.ty = c.y;
    p.facing = Math.atan2(dr, dc);
    return true;
  }

  function aiThink(p, dt) {
    p.aiTimer -= dt;
    if (p.aiTimer > 0) return;
    p.aiTimer = 5 + Math.random() * 7;
    const dirs = [{dc:1,dr:0},{dc:-1,dr:0},{dc:0,dr:1},{dc:0,dr:-1}];
    const valid = dirs.filter(d => !(d.dc === -p.dc && d.dr === -p.dr) && canMove(p.gc + d.dc, p.gr + d.dr));
    const all = dirs.filter(d => canMove(p.gc + d.dc, p.gr + d.dr));
    const cands = valid.length ? valid : all;
    if (!cands.length) return;
    let best = cands[0], bestScore = -Infinity;
    cands.forEach(d => {
      let score = Math.random() * 1.5;
      const nc = p.gc + d.dc, nr = p.gr + d.dr;
      if (p.role === 'ghost') {
        const poweredPacs = players.filter(t => t.alive && t.role === 'pacman' && t.powerTimer > 0);
        const prey = players.filter(t => t.alive && t.role === 'pacman' && t.powerTimer <= 0);
        if (poweredPacs.length) {
          const near = poweredPacs.reduce((a, b) => manDist({gc:nc,gr:nr}, b) < manDist({gc:nc,gr:nr}, a) ? b : a);
          score += manDist({gc:nc,gr:nr}, near); // flee
        } else if (prey.length) {
          const near = prey.reduce((a, b) => manDist({gc:nc,gr:nr}, b) < manDist({gc:nc,gr:nr}, a) ? b : a);
          score += 20 - manDist({gc:nc,gr:nr}, near);
        }
      } else {
        if (dots.has(nr * COLS + nc)) score += 10;
      }
      if (score > bestScore) { bestScore = score; best = d; }
    });
    p.wantDc = best.dc; p.wantDr = best.dr;
  }

  function checkDot(p) {
    const key = p.gr * COLS + p.gc;
    if (!dots.has(key)) return;
    const type = dots.get(key);
    dots.delete(key);
    dotsEaten++;
    if (type === 'power') {
      p.powerTimer = POWER_DURATION;
      setMsg('Power pellet! Eat ghosts for ' + POWER_DURATION + 's!');
    }
  }

  function animateMouth(p, dt) {
    p.mouth += p.mouthSpd * dt;
    if (p.mouth > 0.38) { p.mouth = 0.38; p.mouthSpd = -Math.abs(p.mouthSpd); }
    if (p.mouth < 0.02) { p.mouth = 0.02; p.mouthSpd = Math.abs(p.mouthSpd); }
  }

  function endGame(winner) {
    gameRunning = false;
    if (onGameEnd) onGameEnd(winner, dotsEaten);
  }

  // ── DRAWING ──
  function draw() {
    const scaleX = canvas.width / (COLS * CELL);
    const scaleY = canvas.height / (ROWS * CELL);
    ctx.save();
    ctx.scale(scaleX, scaleY);

    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, COLS * CELL, ROWS * CELL);

    drawMaze();
    drawDots();
    players.filter(p => !p.alive).forEach(drawDead);
    players.filter(p => p.alive).forEach(drawPlayer);

    ctx.restore();
  }

  function drawMaze() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (MAZE_TEMPLATE[r][c] === 1) {
          ctx.fillStyle = '#1a2a6c';
          ctx.fillRect(c * CELL, r * CELL, CELL, CELL);
          ctx.strokeStyle = '#3a5cdd';
          ctx.lineWidth = 2;
          ctx.beginPath();
          if (!isWall(c, r-1)) { ctx.moveTo(c*CELL, r*CELL); ctx.lineTo(c*CELL+CELL, r*CELL); }
          if (!isWall(c, r+1)) { ctx.moveTo(c*CELL, r*CELL+CELL); ctx.lineTo(c*CELL+CELL, r*CELL+CELL); }
          if (!isWall(c-1, r)) { ctx.moveTo(c*CELL, r*CELL); ctx.lineTo(c*CELL, r*CELL+CELL); }
          if (!isWall(c+1, r)) { ctx.moveTo(c*CELL+CELL, r*CELL); ctx.lineTo(c*CELL+CELL, r*CELL+CELL); }
          ctx.stroke();
        }
      }
    }
  }

  function drawDots() {
    const t = Date.now();
    dots.forEach((type, key) => {
      const r = Math.floor(key / COLS), c = key % COLS;
      const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
      if (type === 'power') {
        const pulse = 7 + Math.sin(t / 180) * 2;
        ctx.fillStyle = '#fff3b0';
        ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(cx, cy, pulse, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#ffe066';
        ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  function drawDead(p) {
    ctx.save(); ctx.globalAlpha = 0.3; ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 3;
    const s = 9;
    ctx.beginPath(); ctx.moveTo(p.px-s, p.py-s); ctx.lineTo(p.px+s, p.py+s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.px+s, p.py-s); ctx.lineTo(p.px-s, p.py+s); ctx.stroke();
    ctx.restore();
  }

  function drawPlayer(p) {
    const cx = p.px, cy = p.py, R = CELL / 2 - 2;
    const isMe = p.id === myId;
    ctx.save();
    if (p.role === 'ghost') {
      const threatened = players.some(t => t.alive && t.role === 'pacman' && t.powerTimer > 0);
      const flicker = threatened && (Date.now() % 400 < 200);
      const col = threatened ? (flicker ? '#aad4ff' : '#4488ff') : p.color;
      drawGhost(cx, cy, R, col, isMe, threatened);
    } else {
      const powered = p.powerTimer > 0;
      const nearEnd = powered && p.powerTimer < 2;
      const flicker = nearEnd && (Date.now() % 300 < 150);
      const col = powered ? (flicker ? '#FFD700' : '#4fc3f7') : '#FFD700';
      const glow = powered ? '#4fc3f7' : '#ffe066';
      drawPacman(cx, cy, R, p.mouth, p.facing, isMe, col, glow, powered);
    }
    // Name label
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `bold ${CELL * 0.38}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(p.name, cx, cy - R - 3);
    ctx.restore();
  }

  function drawPacman(cx, cy, R, mouth, facing, isMe, col, glowCol, powered) {
    if (isMe) { ctx.shadowColor = glowCol; ctx.shadowBlur = powered ? 18 : 10; }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, facing + mouth, facing + Math.PI * 2 - mouth);
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    if (isMe) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    const ex = cx + Math.cos(facing - Math.PI / 3) * R * 0.5;
    const ey = cy + Math.sin(facing - Math.PI / 3) * R * 0.5;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawGhost(cx, cy, R, color, isMe, scared) {
    if (isMe) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, R, Math.PI, 0);
    const bot = cy + R, waves = 4, sw = (R * 2) / waves;
    ctx.lineTo(cx + R, bot);
    for (let i = waves - 1; i >= 0; i--) {
      const bx = cx - R + i * sw + sw;
      const wm = cy + R * (i % 2 === 0 ? 0.55 : 0.88);
      ctx.quadraticCurveTo(bx, bot, cx - R + i * sw + sw / 2, wm);
    }
    ctx.lineTo(cx - R, cy - 2);
    ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(cx - R * 0.3, cy - R * 0.2, R * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + R * 0.3, cy - R * 0.2, R * 0.26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = scared ? '#ff4444' : '#222';
    ctx.beginPath(); ctx.arc(cx - R * 0.2, cy - R * 0.15, R * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + R * 0.38, cy - R * 0.15, R * 0.12, 0, Math.PI * 2); ctx.fill();
    if (scared) {
      ctx.strokeStyle = '#ff6666'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(cx - R * 0.35, cy + R * 0.3);
      ctx.quadraticCurveTo(cx - R * 0.1, cy + R * 0.15, cx, cy + R * 0.3);
      ctx.quadraticCurveTo(cx + R * 0.1, cy + R * 0.45, cx + R * 0.35, cy + R * 0.3);
      ctx.stroke();
    }
    if (isMe) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy - 2, R, Math.PI, 0); ctx.stroke(); }
  }

  // ── HELPERS ──
  function cellCenter(c, r) { return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 }; }
  function canMove(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    return MAZE_TEMPLATE[r][c] !== 1;
  }
  function isWall(c, r) { return c < 0 || c >= COLS || r < 0 || r >= ROWS || MAZE_TEMPLATE[r][c] === 1; }
  function pdist(a, b) { const dx = a.px - b.px, dy = a.py - b.py; return Math.sqrt(dx*dx + dy*dy); }
  function manDist(a, b) { return Math.abs(a.gc - b.gc) + Math.abs(a.gr - b.gr); }
  function setMsg(m) { if (setMsgFn) setMsgFn(m); }

  // ── JOYSTICK ──
  function setupJoystick(baseEl, knobEl) {
    const R = baseEl.offsetWidth / 2;
    let startX, startY, pointerId;

    baseEl.addEventListener('pointerdown', e => {
      e.preventDefault();
      baseEl.setPointerCapture(e.pointerId);
      pointerId = e.pointerId;
      const rect = baseEl.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
      joy.active = true;
      baseEl.classList.add('active');
      updateJoy(e.clientX, e.clientY, startX, startY, R, knobEl);
    });

    baseEl.addEventListener('pointermove', e => {
      if (!joy.active || e.pointerId !== pointerId) return;
      e.preventDefault();
      updateJoy(e.clientX, e.clientY, startX, startY, R, knobEl);
    });

    const endJoy = e => {
      if (e.pointerId !== pointerId) return;
      joy.dx = 0; joy.dy = 0; joy.active = false;
      baseEl.classList.remove('active');
      knobEl.style.transform = 'translate(-50%, -50%)';
    };
    baseEl.addEventListener('pointerup', endJoy);
    baseEl.addEventListener('pointercancel', endJoy);
  }

  function updateJoy(cx, cy, startX, startY, R, knobEl) {
    let dx = cx - startX, dy = cy - startY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const clamp = Math.min(dist, R * 0.8);
    if (dist > 0) { dx = (dx / dist) * clamp; dy = (dy / dist) * clamp; }
    joy.dx = dx / (R * 0.8);
    joy.dy = dy / (R * 0.8);
    knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  // ── KEYBOARD fallback ──
  const keys = {};
  document.addEventListener('keydown', e => {
    keys[e.key] = true;
    const me = players.find(p => p.id === myId);
    if (!me || !me.alive) return;
    if (e.key === 'ArrowLeft'  || e.key === 'a') { me.wantDc = -1; me.wantDr = 0; e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'd') { me.wantDc =  1; me.wantDr = 0; e.preventDefault(); }
    if (e.key === 'ArrowUp'    || e.key === 'w') { me.wantDc = 0; me.wantDr = -1; e.preventDefault(); }
    if (e.key === 'ArrowDown'  || e.key === 's') { me.wantDc = 0; me.wantDr =  1; e.preventDefault(); }
  });

  function getDotsEaten() { return dotsEaten; }
  function getMyRole() { const me = players.find(p => p.id === myId); return me ? me.role : 'pacman'; }
  function getAliveCounts() {
    return {
      pac: players.filter(p => p.alive && p.role === 'pacman').length,
      ghost: players.filter(p => p.alive && p.role === 'ghost').length,
      total: players.filter(p => p.alive).length,
    };
  }
  function getMyPowerTimer() { const me = players.find(p => p.id === myId); return me ? me.powerTimer : 0; }
  function getThreatTimer() {
    return Math.max(0, ...players.filter(p => p.alive && p.role === 'pacman' && p.powerTimer > 0).map(p => p.powerTimer));
  }

  return {
    init, startLocal, syncState, startLoop, stopLoop,
    setupJoystick, getDotsEaten, getMyRole, getAliveCounts,
    getMyPowerTimer, getThreatTimer, resizeCanvas,
    MAZE_TEMPLATE, COLS, ROWS, CELL,
  };
})();
