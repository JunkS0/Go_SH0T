# Kotgun Tactical Game

## Web Play

Run the server with:

```text
npm start
```

Then open:

```text
http://localhost:8787
```

On Render, open the Render web service URL directly. The same URL now serves the game page and handles multiplayer WebSocket connections.

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
