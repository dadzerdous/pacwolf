[README.md](https://github.com/user-attachments/files/26698798/README.md)
# Pac-Man Among Us 👻🟡

A multiplayer social deduction Pac-Man game. Some players are secretly ghosts — blend in, hunt Pac-Men. Pac-Men eat dots and can fight back with power pellets!

---

## File Structure

```
pacman-among-us/
├── package.json
├── server/
│   └── server.js        ← Node.js + Socket.io backend
└── public/
    ├── index.html        ← Single-page app
    ├── style.css         ← All styling
    ├── game.js           ← Game engine + rendering (Canvas API)
    └── app.js            ← Screen flow, lobby, HUD, joystick wiring
```

---

## Running Locally

```bash
# Install dependencies
npm install

# Start server
npm start
# or for auto-reload during dev:
npm run dev
```

Open http://localhost:3000 in your browser (or multiple tabs for multiplayer testing).

---

## Deploying to Render

1. Push this folder to a **GitHub repo**

2. Go to https://render.com and click **New → Web Service**

3. Connect your GitHub repo

4. Set these options:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free (or Starter for better performance)

5. Click **Deploy** — Render gives you a URL like `https://pacman-among-us.onrender.com`

6. Share that URL with friends — they open it on their phone or desktop!

> **Note:** Free Render instances spin down after 15 mins of inactivity. Upgrade to Starter ($7/mo) for always-on hosting.

---

## How Multiplayer Works

- Players who visit the site choose **Multiplayer** and are placed in a lobby
- A 4-character room code is shown — share it with friends (or they'll auto-join any open lobby)
- Once everyone hits **Ready**, the game starts instantly
- **AI bots fill any empty slots** (up to 5 players total) so you always have a full game
- The server runs the authoritative game simulation and syncs state to all clients at ~20Hz

---

## Gameplay

| Role | Goal |
|------|------|
| 🟡 Pac-Man | Eat all dots. Grab power pellets to hunt ghosts! |
| 👻 Ghost | Eliminate all Pac-Men by running into them |

- **Power pellet**: Pac-Man turns blue and can eat ghosts. Ghosts turn blue and flee!
- **Analog joystick**: drag anywhere on the joystick base — 8-directional input
- **Keyboard**: Arrow keys or WASD also work

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS, Canvas 2D API
- **Backend**: Node.js, Express, Socket.io
- **No build step** — just plain files, works anywhere
