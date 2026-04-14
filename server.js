// server.js — Node.js + Socket.io multiplayer server

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, '../public')));

// ── Constants (mirror game.js) ──
const COLS = 28;
const ROWS = 22;
const CELL = 36;
const SPEED = 4.0;
const EAT_DIST = CELL * 0.72;
const POWER_DURATION = 8;
const MAX_PLAYERS = 5;
const AI_FILL = true;
const TICK_MS = 50; // server sim tick

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
  {c:13,r:13},{c:1,r:1},{c:26,r:1},{c:1,r:19},{c:26,r:19}
];
const GHOST_COLORS = ['#FF6EC7','#00CFCF','#FF9800','#B388FF','#69F0AE'];
const ROLES_POOL = ['pacman','pacman','pacman','ghost','ghost'];

// ── Room store ──
const rooms = new Map(); // code -> Room

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(c) ? genCode() : c;
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function canMove(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
  return MAZE_TEMPLATE[r][c] !== 1;
}

function cellCenter(c, r) {
  return { x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 };
}

function manDist(a, b) {
  return Math.abs(a.gc - b.gc) + Math.abs(a.gr - b.gr);
}

function pdist(a, b) {
  const dx = a.px - b.px, dy = a.py - b.py;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Room class ──
class Room {
  constructor(code) {
    this.code = code;
    this.humans = []; // { socketId, name, ready }
    this.state = 'lobby'; // lobby | game
    this.players = [];
    this.dots = new Map();
    this.dotsEaten = 0;
    this.interval = null;
  }

  addHuman(socketId, name) {
    this.humans.push({ socketId, name, ready: false });
  }

  removeHuman(socketId) {
    this.humans = this.humans.filter(h => h.socketId !== socketId);
  }

  setReady(socketId, ready) {
    const h = this.humans.find(h => h.socketId === socketId);
    if (h) h.ready = ready;
    this.broadcastLobby();
    // Auto-start if all ready and at least 1 human
    if (this.humans.length > 0 && this.humans.every(h => h.ready)) {
      this.startGame();
    }
  }

  broadcastLobby() {
    io.to(this.code).emit('lobby-update', {
      players: this.humans.map(h => ({ name: h.name, ready: h.ready }))
    });
  }

  initDots() {
    this.dots.clear();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = MAZE_TEMPLATE[r][c];
        if (v === 0) this.dots.set(r * COLS + c, 'dot');
        else if (v === 2) this.dots.set(r * COLS + c, 'power');
      }
    }
  }

  startGame() {
    this.state = 'game';
    this.initDots();
    this.dotsEaten = 0;

    const roles = shuffle([...ROLES_POOL]);
    const totalSlots = MAX_PLAYERS;
    const humanCount = Math.min(this.humans.length, totalSlots);
    const aiCount = totalSlots - humanCount;

    this.players = [];

    // Human players first
    this.humans.slice(0, humanCount).forEach((h, i) => {
      const sp = SPAWNS[i];
      const ctr = cellCenter(sp.c, sp.r);
      this.players.push({
        id: i,
        socketId: h.socketId,
        role: roles[i],
        name: h.name,
        isAI: false,
        alive: true,
        px: ctr.x, py: ctr.y,
        gc: sp.c, gr: sp.r,
        tx: ctr.x, ty: ctr.y,
        dc: 0, dr: 0,
        wantDc: 0, wantDr: 0,
        mouth: 0.05, mouthSpd: 0.065,
        facing: 0,
        color: roles[i] === 'ghost' ? GHOST_COLORS[i] : '#FFD700',
        killCooldown: 0,
        powerTimer: 0,
        aiTimer: 0,
      });
    });

    // AI fill remaining slots
    for (let i = humanCount; i < totalSlots; i++) {
      const sp = SPAWNS[i];
      const ctr = cellCenter(sp.c, sp.r);
      this.players.push({
        id: i,
        socketId: null,
        role: roles[i],
        name: `Bot-${i}`,
        isAI: true,
        alive: true,
        px: ctr.x, py: ctr.y,
        gc: sp.c, gr: sp.r,
        tx: ctr.x, ty: ctr.y,
        dc: 0, dr: 0,
        wantDc: 0, wantDr: 0,
        mouth: 0.05, mouthSpd: 0.065,
        facing: 0,
        color: roles[i] === 'ghost' ? GHOST_COLORS[i] : '#FFD700',
        killCooldown: 0,
        powerTimer: 0,
        aiTimer: 0,
      });
    }

    // Tell each human their player id
    this.humans.forEach((h, i) => {
      io.to(h.socketId).emit('game-start', {
        myId: i,
        players: this.players.map(p => ({
          id: p.id, role: p.role, name: p.name, color: p.color, isAI: p.isAI
        }))
      });
    });

    // Start server sim loop
    let last = Date.now();
    this.interval = setInterval(() => {
      const now = Date.now();
      const dt = (now - last) / 16.67;
      last = now;
      this.tick(dt);
    }, TICK_MS);
  }

  tick(dt) {
    if (this.state !== 'game') return;

    this.players.forEach(p => {
      if (!p.alive) return;
      if (p.isAI) this.aiThink(p, dt);
      this.movePlayer(p, dt);
      if (p.killCooldown > 0) p.killCooldown -= dt / 60;
      if (p.powerTimer > 0) p.powerTimer -= dt / 60;
    });

    // Dot collection
    this.players.filter(p => p.alive && p.role === 'pacman').forEach(p => this.checkDot(p));

    // Powered pac eat ghosts
    this.players.filter(p => p.alive && p.role === 'pacman' && p.powerTimer > 0).forEach(pac => {
      if (pac.killCooldown > 0) return;
      this.players.filter(g => g.alive && g.role === 'ghost').forEach(ghost => {
        if (pdist(pac, ghost) < EAT_DIST) {
          ghost.alive = false;
          pac.killCooldown = 0.8;
          this.broadcast('player-died', { id: ghost.id, killedBy: pac.id });
        }
      });
    });

    // Ghosts eat unpowered pac
    this.players.filter(g => g.alive && g.role === 'ghost').forEach(ghost => {
      if (ghost.killCooldown > 0) return;
      this.players.filter(p => p.alive && p.role === 'pacman' && p.powerTimer <= 0).forEach(pac => {
        if (pdist(ghost, pac) < EAT_DIST) {
          pac.alive = false;
          ghost.killCooldown = 1.2;
          this.broadcast('player-died', { id: pac.id, killedBy: ghost.id });
        }
      });
    });

    // Win checks
    const alivePac = this.players.filter(p => p.alive && p.role === 'pacman').length;
    const aliveGhost = this.players.filter(p => p.alive && p.role === 'ghost').length;
    if (aliveGhost === 0 || this.dots.size === 0) { this.endGame('pacmen'); return; }
    if (alivePac === 0) { this.endGame('ghosts'); return; }

    // Broadcast state
    this.broadcast('game-state', {
      players: this.players.map(p => ({
        id: p.id, px: p.px, py: p.py, gc: p.gc, gr: p.gr,
        alive: p.alive, facing: p.facing, mouth: p.mouth,
        powerTimer: p.powerTimer, role: p.role,
      })),
      dots: [...this.dots.entries()],
      dotsEaten: this.dotsEaten,
    });
  }

  movePlayer(p, dt) {
    const dx = p.tx - p.px, dy = p.ty - p.py;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = SPEED * dt;
    if (d <= step) {
      p.px = p.tx; p.py = p.ty;
      p.gc = Math.round((p.tx - CELL / 2) / CELL);
      p.gr = Math.round((p.ty - CELL / 2) / CELL);
      if (!this.tryDir(p, p.wantDc, p.wantDr)) this.tryDir(p, p.dc, p.dr);
    } else {
      p.px += (dx / d) * step;
      p.py += (dy / d) * step;
    }
    p.mouth += p.mouthSpd * dt;
    if (p.mouth > 0.38) { p.mouth = 0.38; p.mouthSpd = -Math.abs(p.mouthSpd); }
    if (p.mouth < 0.02) { p.mouth = 0.02; p.mouthSpd = Math.abs(p.mouthSpd); }
  }

  tryDir(p, dc, dr) {
    if (dc === 0 && dr === 0) return false;
    const nc = p.gc + dc, nr = p.gr + dr;
    if (!canMove(nc, nr)) return false;
    p.dc = dc; p.dr = dr; p.gc = nc; p.gr = nr;
    const c = cellCenter(nc, nr);
    p.tx = c.x; p.ty = c.y;
    p.facing = Math.atan2(dr, dc);
    return true;
  }

  aiThink(p, dt) {
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
        const powered = this.players.filter(t => t.alive && t.role === 'pacman' && t.powerTimer > 0);
        const prey = this.players.filter(t => t.alive && t.role === 'pacman' && t.powerTimer <= 0);
        if (powered.length) {
          const near = powered.reduce((a, b) => manDist({gc:nc,gr:nr},b) < manDist({gc:nc,gr:nr},a) ? b : a);
          score += manDist({gc:nc,gr:nr}, near);
        } else if (prey.length) {
          const near = prey.reduce((a, b) => manDist({gc:nc,gr:nr},b) < manDist({gc:nc,gr:nr},a) ? b : a);
          score += 20 - manDist({gc:nc,gr:nr}, near);
        }
      } else {
        if (this.dots.has(nr * COLS + nc)) score += 10;
      }
      if (score > bestScore) { bestScore = score; best = d; }
    });
    p.wantDc = best.dc; p.wantDr = best.dr;
  }

  checkDot(p) {
    const key = p.gr * COLS + p.gc;
    if (!this.dots.has(key)) return;
    const type = this.dots.get(key);
    this.dots.delete(key);
    this.dotsEaten++;
    if (type === 'power') {
      p.powerTimer = POWER_DURATION;
      this.broadcast('msg', 'Power pellet! Pac-Man can eat ghosts!');
    }
  }

  endGame(winner) {
    this.state = 'ended';
    clearInterval(this.interval);
    this.broadcast('game-over', { winner, dotsEaten: this.dotsEaten });
    // Clean up room after a delay
    setTimeout(() => { rooms.delete(this.code); }, 30000);
  }

  broadcast(event, data) {
    io.to(this.code).emit(event, data);
  }

  applyInput(socketId, wantDc, wantDr) {
    const p = this.players.find(p => p.socketId === socketId);
    if (p && p.alive) { p.wantDc = wantDc; p.wantDr = wantDr; }
  }
}

// ── Socket.io ──
io.on('connection', (socket) => {
  let myRoom = null;

  socket.on('join-lobby', ({ name } = {}) => {
    // Find an open lobby or create one
    let room = null;
    for (const [, r] of rooms) {
      if (r.state === 'lobby' && r.humans.length < MAX_PLAYERS) { room = r; break; }
    }
    if (!room) {
      const code = genCode();
      room = new Room(code);
      rooms.set(code, room);
    }

    const playerName = name || `Player ${room.humans.length + 1}`;
    room.addHuman(socket.id, playerName);
    myRoom = room;
    socket.join(room.code);

    socket.emit('lobby-joined', {
      code: room.code,
      players: room.humans.map(h => ({ name: h.name, ready: h.ready })),
    });

    room.broadcastLobby();
  });

  socket.on('set-ready', ({ ready }) => {
    if (myRoom) myRoom.setReady(socket.id, ready);
  });

  socket.on('input', ({ wantDc, wantDr }) => {
    if (myRoom && myRoom.state === 'game') {
      myRoom.applyInput(socket.id, wantDc, wantDr);
    }
  });

  socket.on('disconnect', () => {
    if (myRoom) {
      myRoom.removeHuman(socket.id);
      if (myRoom.state === 'lobby') myRoom.broadcastLobby();
      if (myRoom.humans.length === 0 && myRoom.state === 'lobby') {
        rooms.delete(myRoom.code);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Pac-Man Among Us running on http://localhost:${PORT}`));
