# Kotgun Tactical Game

## Default Multiplayer Server

The client now uses this server by default:

```text
wss://go-sh0t.onrender.com
```

If someone types `hss://go-sh0t.onrender.com`, the game automatically converts it to `wss://go-sh0t.onrender.com`.

## Render Settings

Use these settings for the multiplayer server:

```text
Build Command: echo "No build step"
Start Command: node server.js
Environment Variable: NODE_VERSION = 20
```

The server does not require `npm install` or `yarn install`.

## GitHub Pages

Upload the client files to GitHub Pages. The page can connect to the default Render multiplayer server automatically.
