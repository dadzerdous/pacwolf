// app.js — screen flow, lobby, multiplayer socket wiring

const App = (() => {
  const ROLES_POOL = ['pacman', 'pacman', 'pacman', 'ghost', 'ghost'];

  let socket = null;
  let roomCode = null;
  let isMulti = false;
  let myPlayerId = 0;
  let isReady = false;
  let hudInterval = null;
  let inputInterval = null;

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
    clearInterval(inputInterval);
    Game.stopLoop();
    clearInterval(hudInterval);
    overlay.classList.add('hidden');
    showScreen('home');
    isReady = false;
    roomCode = null;
  }

  function launchSinglePlayer() {
    showScreen('game');
    setTimeout(() => {
      Game.init(canvas, {
        onEnd: handleGameEnd,
        setMsg: m => { msgBar.textContent = m; },
        myId: 0,
      });
      Game.resizeCanvas();
      const roles = shuffle([...ROLES_POOL]);
      Game.startLocal(roles);
      startHudLoop();
      overlay.classList.add('hidden');
      setupJoystick();
    }, 50);
  }

  function connectSocket() {
    socket = io('https://pacwolf.onrender.com', { transports: ['websocket'] });

    socket.on('connect', () => {
      socket.emit('join-lobby');
    });

    socket.on('connect_error', (err) => {
      msgBar.textContent = 'Connection error: ' + err.message;
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
        Game.init(canvas, {
          onEnd: handleGameEnd,
          setMsg: m => { msgBar.textContent = m; },
          myId: myPlayerId,
        });
        Game.resizeCanvas();
        const roles = serverPlayers.map(p => p.role);
        Game.startLocal(roles, myPlayerId);
        startHudLoop();
        overlay.classList.add('hidden');
        setupJoystick();

        clearInterval(inputInterval);
        inputInterval = setInterval(() => {
          if (!socket || !socket.connected) return;
          socket.emit('input', Game.getLastInput());
        }, 50);
      }, 50);
    });

    socket.on('game-state', (state) => {
      Game.syncFromServer(state);
    });

    socket.on('player-died', ({ id }) => {
      Game.killPlayer(id);
    });

    socket.on('game-over', ({ winner, dotsEaten }) => {
      handleGameEnd(winner, dotsEaten);
    });

    socket.on('msg', (m) => {
      msgBar.textContent = m;
    });
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
      div.innerHTML = '<span class="dot"></span><span>' + p.name + '</span>';
      lobbyPlayers.appendChild(div);
    });
  }

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
    hudDots.textContent = 'Dots: ' + Game.getDotsEaten();
    const counts = Game.getAliveCounts();
    hudAlive.textContent = 'Alive: ' + counts.total;
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
    clearInterval(inputInterval);
    Game.stopLoop();
    const myRole = Game.getMyRole();
    const playerWon = (winner === 'pacmen' && myRole === 'pacman') || (winner === 'ghosts' && myRole === 'ghost');
    overlayTitle.textContent = winner === 'pacmen' ? 'Pac-Men Win! 🟡' : 'Ghosts Win! 👻';
    overlayMsg.textContent = (playerWon ? 'You won! 🎉 ' : 'You lost. ') + 'Dots eaten: ' + dotsEaten;
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
