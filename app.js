// app.js — screen flow, lobby, multiplayer socket wiring

const App = (() => {
  const ROLES_POOL = ['pacman', 'pacman', 'pacman', 'ghost', 'ghost'];
  const MAX_PLAYERS = 5;

  let socket = null;
  let roomCode = null;
  let isMulti = false;
  let myPlayerId = 0;
  let isReady = false;
  let hudInterval = null;

  // ── DOM refs ──
  const screens = {
    home: document.getElementById('screen-home'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
  };
  const canvas = document.getElementById('canvas');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMsg = document.getElementById('overlay-msg');
  const hudRole = document.getElementById('hud-role');
  const hudDots = document.getElementById('hud-dots');
  const hudAlive = document.getElementById('hud-alive');
  const powerFill = document.getElementById('power-fill');
  const msgBar = document.getElementById('msg-bar');
  const lobbyCode = document.getElementById('lobby-code');
  const lobbyPlayers = document.getElementById('lobby-players');

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => {
      el.classList.toggle('active', k === name);
    });
  }

  // ── HOME ──
  function chooseSingle() {
    isMulti = false;
    launchSinglePlayer();
  }

  function chooseMulti() {
    isMulti = true;
    connectSocket();
    showScreen('lobby');
  }

  function backHome() {
    if (socket) { socket.disconnect(); socket = null; }
    Game.stopLoop();
    clearInterval(hudInterval);
    overlay.classList.add('hidden');
    showScreen('home');
    isReady = false;
    roomCode = null;
  }

  // ── SINGLE PLAYER ──
  function launchSinglePlayer() {
    showScreen('game');
    setTimeout(() => {
      Game.resizeCanvas();
      Game.init(canvas, {
        onEnd: handleGameEnd,
        setMsg: m => { msgBar.textContent = m; },
        myId: 0,
      });
      const roles = shuffle([...ROLES_POOL]);
      Game.startLocal(roles);
      startHudLoop();
      overlay.classList.add('hidden');
      setupJoystick();
    }, 50);
  }

  // ── MULTIPLAYER ──
  function connectSocket() {
    socket = io('https://pacwolf.onrender.com', { transports: ['websocket'] });

    socket.on('connect', () => {
      socket.emit('join-lobby');
    });

    socket.on('lobby-joined', ({ code, players }) => {
      roomCode = code;
      lobbyCode.textContent = code;
      renderLobbyPlayers(players);
    });

    socket.on('lobby-update', ({ players }) => {
      renderLobbyPlayers(players);
    });

    socket.on('game-start', ({ players: serverPlayers, myId }) => {
      myPlayerId = myId;
      showScreen('game');
      setTimeout(() => {
        Game.resizeCanvas();
        Game.init(canvas, {
          onEnd: handleGameEnd,
          setMsg: m => { msgBar.textContent = m; },
          myId: myPlayerId,
        });
        // Build player objects from server data
        const roles = serverPlayers.map(p => p.role);
        Game.startLocal(roles);
        startHudLoop();
        overlay.classList.add('hidden');
        setupJoystick();

        // Send our inputs to server
        setupMultiInput();
      }, 50);
    });

    socket.on('player-input', ({ id, wantDc, wantDr }) => {
      // Server relays other players' inputs — handled server-side, we just re-sync
    });

    socket.on('game-state', (state) => {
      // Full state sync from server (for multiplayer authoritative mode)
      // For simplicity: each client runs its own sim but syncs periodically
    });
  }

  function setupMultiInput() {
    // Emit our input to server every ~50ms
    setInterval(() => {
      if (!socket || !socket.connected) return;
      const me = Game.getMyInput();
      if (me) socket.emit('input', me);
    }, 50);
  }

  function setReady() {
    if (!socket) return;
    isReady = !isReady;
    const btn = document.getElementById('btn-ready');
    btn.textContent = isReady ? 'Unready' : 'Ready';
    btn.classList.toggle('is-ready', isReady);
    socket.emit('set-ready', { ready: isReady });
  }

  function copyCode() {
    if (roomCode) navigator.clipboard.writeText(roomCode).catch(() => {});
  }

  function renderLobbyPlayers(players) {
    lobbyPlayers.innerHTML = '';
    players.forEach(p => {
      const div = document.createElement('div');
      div.className = 'lobby-player' + (p.ready ? ' ready' : '');
      div.innerHTML = `<span class="dot"></span><span>${p.name}</span>`;
      lobbyPlayers.appendChild(div);
    });
  }

  // ── GAME ──
  function setupJoystick() {
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    Game.setupJoystick(base, knob);
  }

  function startHudLoop() {
    clearInterval(hudInterval);
    hudInterval = setInterval(updateHud, 100);
  }

  function updateHud() {
    const role = Game.getMyRole();
    hudRole.textContent = role === 'ghost' ? 'GHOST' : 'PAC-MAN';
    hudRole.className = role === 'ghost' ? 'ghost' : '';
    hudDots.textContent = `Dots: ${Game.getDotsEaten()}`;
    const counts = Game.getAliveCounts();
    hudAlive.textContent = `Alive: ${counts.total}`;

    if (role === 'pacman') {
      const t = Game.getMyPowerTimer();
      powerFill.style.width = Math.max(0, (t / 8) * 100) + '%';
      powerFill.style.background = t > 0 ? '#4fc3f7' : '#555';
    } else {
      const t = Game.getThreatTimer();
      powerFill.style.width = Math.max(0, (t / 8) * 100) + '%';
      powerFill.style.background = t > 0 ? '#ff5252' : '#555';
    }
  }

  function handleGameEnd(winner, dotsEaten) {
    clearInterval(hudInterval);
    const myRole = Game.getMyRole();
    const playerWon = (winner === 'pacmen' && myRole === 'pacman') || (winner === 'ghosts' && myRole === 'ghost');
    overlayTitle.textContent = winner === 'pacmen' ? 'Pac-Men Win! 🟡' : 'Ghosts Win! 👻';
    overlayMsg.textContent = (playerWon ? 'You won! 🎉 ' : 'You lost. ') + `Dots eaten: ${dotsEaten}`;
    overlay.classList.remove('hidden');
  }

  function overlayAction() {
    overlay.classList.add('hidden');
    if (isMulti) {
      backHome();
    } else {
      launchSinglePlayer();
    }
  }

  // ── UTILS ──
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  window.addEventListener('resize', () => {
    if (screens.game.classList.contains('active')) Game.resizeCanvas();
  });

  return { chooseSingle, chooseMulti, backHome, setReady, copyCode, overlayAction };
})();
