const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT) || 8787;
const PUBLIC_DIR = __dirname;
const clients = new Map();
let nextId = 1;
let teamMode = "versus";
let bomb = null;
const BOMB_SECONDS = 25;
const BOMB_RADIUS = 18;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

const spawns = [
  { x: 0, z: 43, level: "surface", team: "attack" },
  { x: 0, z: -43, level: "surface", team: "defense" },
  { x: -46, z: -44, level: "surface" },
  { x: 46, z: 44, level: "surface" },
  { x: -32, z: -34, level: "underground" },
  { x: 32, z: 34, level: "underground" },
];

process.on("uncaughtException", (error) => console.error("Uncaught exception:", error));
process.on("unhandledRejection", (error) => console.error("Unhandled rejection:", error));

const server = http.createServer((request, response) => {
  serveStaticFile(request, response);
});

function serveStaticFile(request, response) {
  const rawPath = new URL(request.url, "http://localhost").pathname;
  const requestPath = rawPath === "/" ? "/index.html" : rawPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(requestPath)));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden\n");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found\n");
      return;
    }

    response.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "access-control-allow-origin": "*",
    });
    response.end(data);
  });
}

server.on("upgrade", (request, socket) => {
  const key = request.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  attachClient(socket);
});

function attachClient(socket) {
  const id = `p${nextId++}`;
  const team = assignTeam();
  const spawn = randomSpawn(team);
  const client = {
    id,
    socket,
    buffer: Buffer.alloc(0),
    name: id,
    hp: 150,
    armor: "heavy",
    alive: true,
    team,
    state: {
      x: spawn.x,
      z: spawn.z,
      level: spawn.level,
      yaw: 0,
      pitch: 0,
      weapon: "weapon",
      scoped: false,
      hp: 150,
      armor: "heavy",
      alive: true,
      team,
    },
  };
  clients.set(id, client);

  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    processFrames(client);
  });

  socket.on("close", () => removeClient(id));
  socket.on("end", () => removeClient(id));
  socket.on("error", (error) => {
    console.error(`Socket error for ${id}:`, error.message);
    removeClient(id);
  });
}

function processFrames(client) {
  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < offset + 2) return;
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) return;
      const high = client.buffer.readUInt32BE(offset);
      const low = client.buffer.readUInt32BE(offset + 4);
      if (high !== 0) {
        client.socket.destroy();
        return;
      }
      length = low;
      offset += 8;
    }

    const maskOffset = masked ? 4 : 0;
    if (client.buffer.length < offset + maskOffset + length) return;

    let payload = client.buffer.subarray(offset + maskOffset, offset + maskOffset + length);
    if (masked) {
      const mask = client.buffer.subarray(offset, offset + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }
    client.buffer = client.buffer.subarray(offset + maskOffset + length);

    if (opcode === 0x8) {
      client.socket.end();
      removeClient(client.id);
      return;
    }
    if (opcode === 0x9) {
      client.socket.write(makeFrame(payload, 0x0a));
      continue;
    }
    if (opcode !== 0x1) continue;

    let message;
    try {
      message = JSON.parse(payload.toString("utf8"));
    } catch {
      continue;
    }
    handleMessage(client, message);
  }
}

function handleMessage(client, message) {
  if (message.type === "join") {
    teamMode = message.teamMode === "same" ? "same" : "versus";
    if (teamMode === "same") forceSameTeam();
    client.team = teamMode === "same" ? "attack" : client.team;
    const spawn = randomSpawn(client.team);
    client.name = String(message.name || client.id).slice(0, 24);
    client.armor = String(message.armor || "heavy").slice(0, 16);
    client.state = {
      ...client.state,
      ...sanitizeState(message.state),
      x: spawn.x,
      z: spawn.z,
      level: spawn.level,
      hp: client.hp,
      alive: client.alive,
      team: client.team,
    };
    send(client, { type: "welcome", id: client.id, team: client.team, teamMode, players: snapshot() });
    broadcast(
      {
        type: "player-joined",
        id: client.id,
        name: client.name,
        hp: client.hp,
        armor: client.armor,
        alive: client.alive,
        team: client.team,
        state: client.state,
      },
      client.id
    );
    return;
  }

  if (message.type === "state") {
    client.state = {
      ...client.state,
      ...sanitizeState(message.state),
      hp: client.hp,
      alive: client.alive,
      team: client.team,
    };
    broadcast({ type: "state", id: client.id, name: client.name, state: client.state }, client.id);
    return;
  }

  if (message.type === "shot") {
    broadcast(
      {
        type: "shot",
        id: client.id,
        name: client.name,
        origin: sanitizeVector(message.origin),
        direction: sanitizeVector(message.direction),
        weapon: String(message.weapon || "weapon").slice(0, 20),
      },
      client.id
    );
    return;
  }

  if (message.type === "bomb-plant") {
    plantBomb(client, message);
    return;
  }

  if (message.type === "bomb-exploded") {
    explodeBomb();
    return;
  }

  if (message.type === "hit") applyHit(client, message);

  if (message.type === "chat") {
    const text = String(message.text ?? "").slice(0, 80);
    const scope = message.scope === "team" ? "team" : "all";
    if (scope === "all") {
      broadcast({ type: "chat", sender: client.name, text, scope: "all" });
    } else {
      // 팀 채팅: 같은 팀에게만
      clients.forEach((c) => {
        if (c.team === client.team) send(c, { type: "chat", sender: client.name, text, scope: "team" });
      });
    }
  }
}

function send(client, payload) {
  if (!client.socket.destroyed) client.socket.write(makeFrame(JSON.stringify(payload)));
}

function broadcast(payload, exceptId = null) {
  clients.forEach((client, id) => {
    if (id !== exceptId) send(client, payload);
  });
}

function makeFrame(data, opcode = 0x1) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
  const length = payload.length;
  if (length < 126) return Buffer.concat([Buffer.from([0x80 | opcode, length]), payload]);
  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x80 | opcode;
  header[1] = 127;
  header.writeUInt32BE(0, 2);
  header.writeUInt32BE(length, 6);
  return Buffer.concat([header, payload]);
}

function snapshot() {
  return [...clients.values()].map((client) => ({
    id: client.id,
    name: client.name,
    hp: client.hp,
    armor: client.armor,
    alive: client.alive,
    team: client.team,
    state: client.state,
  }));
}

function removeClient(id) {
  if (!clients.has(id)) return;
  clients.delete(id);
  broadcast({ type: "left", id });
}

function assignTeam() {
  if (teamMode === "same") return "attack";
  const counts = { attack: 0, defense: 0 };
  clients.forEach((client) => {
    counts[client.team] += 1;
  });
  return counts.attack <= counts.defense ? "attack" : "defense";
}

function forceSameTeam() {
  clients.forEach((client) => {
    client.team = "attack";
    client.state.team = "attack";
    broadcast({ type: "team-updated", id: client.id, team: "attack" });
  });
}

function randomSpawn(team = "attack") {
  const fixed = spawns.find((spawn) => spawn.team === team);
  return fixed || spawns[Math.floor(Math.random() * spawns.length)];
}

function sanitizeState(state = {}) {
  const level = state.level === "underground" ? "underground" : "surface";
  return {
    x: clamp(Number(state.x) || 0, -90, 90),
    z: clamp(Number(state.z) || 0, -100, 100),
    level,
    yaw: clamp(Number(state.yaw) || 0, -Math.PI * 4, Math.PI * 4),
    pitch: clamp(Number(state.pitch) || 0, -1.5, 1.5),
    weapon: String(state.weapon || "weapon").slice(0, 20),
    scoped: Boolean(state.scoped),
    armor: String(state.armor || "heavy").slice(0, 16),
    team: state.team === "defense" ? "defense" : "attack",
  };
}

function sanitizeVector(vector = {}) {
  return {
    x: clamp(Number(vector.x) || 0, -300, 300),
    y: clamp(Number(vector.y) || 0, -80, 120),
    z: clamp(Number(vector.z) || 0, -300, 300),
  };
}

function applyHit(source, message) {
  const target = clients.get(message.targetId);
  if (!target || !target.alive || source.id === target.id) return;
  if (source.team === target.team) return;
  const damage = clamp(Number(message.damage) || 0, 0, 320);
  target.hp = Math.max(0, target.hp - damage);
  target.alive = target.hp > 0;
  target.state.hp = target.hp;
  target.state.alive = target.alive;

  broadcast({
    type: "hit",
    sourceId: source.id,
    sourceName: source.name,
    targetId: target.id,
    targetName: target.name,
    damage,
    targetHp: target.hp,
    zone: String(message.zone || "nose").slice(0, 16),
    weapon: String(message.weapon || "weapon").slice(0, 20),
    dead: !target.alive,
  });

  if (!target.alive) setTimeout(() => respawn(target), 3000);
}

function respawn(client) {
  if (!clients.has(client.id)) return;
  const spawn = randomSpawn(client.team);
  client.hp = 150;
  client.alive = true;
  client.state = {
    ...client.state,
    x: spawn.x,
    z: spawn.z,
    level: spawn.level,
    hp: 150,
    alive: true,
    team: client.team,
  };
  broadcast({ type: "respawn", id: client.id, name: client.name, state: client.state });
}

function plantBomb(source, message) {
  if (source.team !== "attack" || bomb) return;
  const position = sanitizeVector(message.position);
  bomb = {
    site: String(message.site || "A").slice(0, 1),
    position,
    endAt: Date.now() + BOMB_SECONDS * 1000,
  };
  broadcast({
    type: "bomb-planted",
    site: bomb.site,
    position: bomb.position,
    timeLeft: BOMB_SECONDS,
    sourceId: source.id,
  });
  setTimeout(explodeBomb, BOMB_SECONDS * 1000);
}

function explodeBomb() {
  if (!bomb) return;
  clients.forEach((client) => {
    if (!client.alive || client.team !== "defense" || client.state.level !== "surface") return;
    const distance = Math.hypot(client.state.x - bomb.position.x, client.state.z - bomb.position.z);
    if (distance > BOMB_RADIUS) return;
    client.hp = 0;
    client.alive = false;
    client.state.hp = 0;
    client.state.alive = false;
    broadcast({
      type: "hit",
      sourceId: "bomb",
      sourceName: "Bomb",
      targetId: client.id,
      targetName: client.name,
      damage: 999,
      targetHp: 0,
      zone: "bomb",
      weapon: "폭탄",
      dead: true,
    });
  });
  broadcast({ type: "bomb-exploded", winningTeam: "attack" });
  bomb = null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Kotgun multiplayer server listening on ${PORT}`);
});
