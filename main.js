import * as THREE from "./vendor/three.module.js";

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a1918);
scene.fog = new THREE.Fog(0x2a1918, 70, 220);

const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 260);
camera.rotation.order = "YXZ";

const textureLoader = new THREE.TextureLoader();
const characterTexture = textureLoader.load("./assets/character.png");
characterTexture.colorSpace = THREE.SRGBColorSpace;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const keys = new Set();
const solidTargets = [];
const damageTargets = [];
const bots = [];
const remotePlayers = new Map();

const LEVEL_Y = { surface: 0, underground: -16 };
const CAMERA_HEIGHT = 2;
const PLAYER_RADIUS = 0.78;
const PLAYER_BODY_HEIGHT = 2.55;
const levelNames = { surface: "지상", underground: "지하" };
const bounds = {
  surface: { x: 45, z: 52, y: LEVEL_Y.surface + CAMERA_HEIGHT },
  underground: { x: 36, z: 40, y: LEVEL_Y.underground + CAMERA_HEIGHT },
};
const spawns = {
  attack: new THREE.Vector3(0, bounds.surface.y, 43),
  defense: new THREE.Vector3(0, bounds.surface.y, -43),
};
const prepZone = { minX: -13, maxX: 13, minZ: 35, maxZ: 50 };
const DEFAULT_SERVER_URL = "wss://go-sh0t.onrender.com";

const PREP_SECONDS = 20;
const COMBAT_SECONDS = 100;
const BOMB_SECONDS = 35;
const BASE_CAMERA_FOV = 74;
const RIFLE_SCOPE_FOV = BASE_CAMERA_FOV / 1.7;
const SNIPER_SCOPE_FOV = 16;
const GRAVITY = 18;
const JUMP_SPEED = 6.8;
const WIN_MONEY = 3000;
const FIRST_LOSS_MONEY = 1900;
const KILL_MONEY = 200;
const MONEY_CAP = 12000;

const ui = {
  start: document.querySelector("#startButton"),
  weaponName: document.querySelector("#weaponName"),
  weaponStats: document.querySelector("#weaponStats"),
  ammoLine: document.querySelector("#ammoLine"),
  weaponRow: document.querySelector("#weaponRow"),
  hp: document.querySelector("#hp"),
  armor: document.querySelector("#armor"),
  speed: document.querySelector("#speed"),
  level: document.querySelector("#levelBadge"),
  site: document.querySelector("#siteBadge"),
  intel: document.querySelector("#intelBadge"),
  net: document.querySelector("#netBadge"),
  log: document.querySelector("#log"),
  serverUrl: document.querySelector("#serverUrl"),
  connect: document.querySelector("#connectButton"),
  round: document.querySelector("#roundBadge"),
  score: document.querySelector("#scoreBadge"),
  money: document.querySelector("#moneyBadge"),
  timer: document.querySelector("#timerBadge"),
  shopHint: document.querySelector("#shopHint"),
  buyLightArmor: document.querySelector("#buyLightArmor"),
  buyHeavyArmor: document.querySelector("#buyHeavyArmor"),
  scopeOverlay: document.querySelector("#scopeOverlay"),
  joystickBase: document.querySelector("#joystickBase"),
  joystickKnob: document.querySelector("#joystickKnob"),
  mobileFire: document.querySelector("#mobileFire"),
  mobileAim: document.querySelector("#mobileAim"),
  mobileJump: document.querySelector("#mobileJump"),
  mobilePlant: document.querySelector("#mobilePlant"),
};

const weapons = [
  {
    key: "1",
    name: "칼",
    role: "근접",
    price: 0,
    rate: 2,
    heavyRate: 0.7,
    range: 2,
    move: 1.22,
    sound: "knife",
    damage: {
      backLight: 100,
      backHeavy: 200,
      eyeLight: 60,
      eyeHeavy: 120,
      noseLight: 40,
      noseHeavy: 80,
      lowerLight: 25,
      lowerHeavy: 50,
    },
  },
  {
    key: "2",
    name: "고총",
    role: "권총",
    price: 500,
    rate: 2.5,
    spread: 0.035,
    move: 1,
    sound: "deagle",
    falloff: 20,
    damage: { eye: [150, 140], nose: [50, 45], lower: [30, 20] },
  },
  {
    key: "3",
    name: "산탄총",
    role: "근거리",
    price: 700,
    rate: 0.8,
    spread: 0.145,
    pellets: 8,
    move: 0.92,
    sound: "shotgun",
    falloff: 10,
    damage: { eye: [20, 10], nose: [15, 5], lower: [10, 3] },
  },
  {
    key: "4",
    name: "소총",
    role: "자동소총",
    price: 2900,
    rate: 10,
    spread: 0.018,
    recoil: 0.022,
    move: 0.94,
    sound: "rifle",
    falloff: 30,
    damage: { eye: [75, 60], nose: [35, 28], lower: [25, 20] },
  },
  {
    key: "5",
    name: "저격",
    role: "저격총",
    price: 4000,
    rate: 0.5,
    spread: 0.72,
    scopedSpread: 0,
    move: 0.78,
    sound: "sniper",
    falloff: 50,
    damage: { eye: [300, 300], nose: [150, 140], lower: [85, 75] },
  },
  {
    key: "6",
    name: "기관총",
    role: "경기관총",
    price: 3200,
    rate: 15,
    spread: 0.06,
    recoil: 0.03,
    move: 0.64,
    sound: "machine",
    falloff: 20,
    damage: { eye: [50, 40], nose: [24, 18], lower: [15, 10] },
  },
];

const player = {
  id: null,
  name: `Player-${Math.floor(Math.random() * 900 + 100)}`,
  hp: 150,
  armor: "큰갑옷",
  armorLimit: 150,
  alive: true,
  level: "surface",
  position: spawns.attack.clone(),
  yaw: 0,
  pitch: 0,
  scoped: false,
  velocityY: 0,
  jumpOffset: 0,
  grounded: true,
  lastShot: 0,
  money: 800,
  owned: new Set(["칼"]),
  team: "attack",
};

const match = {
  round: 1,
  playerScore: 0,
  enemyScore: 0,
  phase: "prep",
  phaseEnd: performance.now() / 1000 + PREP_SECONDS,
  losingStreak: 0,
  ended: false,
  bombPlanted: false,
  bombSite: null,
  bombEnd: 0,
  aiLosingStreak: 0,
};

let weaponIndex = 0;
let fireHeld = false;
let firingSince = 0;
let burstShots = 0;
let audioContext;
let socket;
let networkStatus = "solo";
let lastNetSend = 0;
const heldWeaponRoot = new THREE.Group();
const heldWeaponModels = new Map();
const prepBarrierGroup = new THREE.Group();
const mobileInput = {
  x: 0,
  y: 0,
  activeId: null,
  centerX: 0,
  centerY: 0,
};
const mobileLook = {
  activeId: null,
  lastX: 0,
  lastY: 0,
};

function makeMaterial(color, roughness = 0.86, metalness = 0.03) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const mats = {
  plaza: makeMaterial(0xc9b29b),
  plazaLine: makeMaterial(0x9e7d67),
  concrete: makeMaterial(0x8f9288, 0.62, 0.04),
  asphalt: makeMaterial(0x3d3b3a, 0.92, 0.02),
  brick: makeMaterial(0xa64d43, 0.78, 0.03),
  paintedSteel: makeMaterial(0x4d6f84, 0.48, 0.18),
  darkGlass: new THREE.MeshStandardMaterial({ color: 0x151a20, roughness: 0.2, metalness: 0.05 }),
  copper: makeMaterial(0xb9784d, 0.48, 0.18),
  redPlaster: makeMaterial(0xb9574f),
  deepRed: makeMaterial(0x813a3a),
  peach: makeMaterial(0xd98d72),
  whiteWall: makeMaterial(0xd9d2bd),
  terracotta: makeMaterial(0x9d3d2f),
  darkRoof: makeMaterial(0x572b2f),
  stone: makeMaterial(0x928b7e),
  metal: makeMaterial(0x363941, 0.55, 0.12),
  blackMetal: makeMaterial(0x17181d, 0.52, 0.2),
  gunMetal: makeMaterial(0x262a31, 0.5, 0.25),
  hand: makeMaterial(0xd49372, 0.9, 0.02),
  blade: makeMaterial(0xd8dde4, 0.32, 0.35),
  yellow: makeMaterial(0xffbe70),
  blue: makeMaterial(0x4f8ec7),
  green: makeMaterial(0x5e8a5d),
  wood: makeMaterial(0x6f563e),
  crate: makeMaterial(0x9b805c),
  tarp: new THREE.MeshStandardMaterial({ color: 0x456f79, side: THREE.DoubleSide, roughness: 0.95 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x8ed3ff, transparent: true, opacity: 0.2, roughness: 0.12 }),
  invisible: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
};

function addHeldBox(group, x, y, z, sx, sy, sz, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function addHeldBarrel(group, x, y, z, radius, length, mat) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 16), mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function createHeldWeaponModel(weapon) {
  const group = new THREE.Group();
  addHeldBox(group, 0.12, -0.18, 0.24, 0.22, 0.2, 0.45, mats.hand);

  if (weapon.name === "칼") {
    addHeldBox(group, 0.08, -0.05, -0.02, 0.09, 0.1, 0.38, mats.blackMetal);
    const blade = addHeldBox(group, 0.08, 0.02, -0.42, 0.05, 0.06, 0.62, mats.blade);
    blade.rotation.y = 0.1;
    return group;
  }

  const lengthByWeapon = {
    "고총": 0.52,
    "산탄총": 0.9,
    "소총": 0.88,
    "저격": 1.08,
    "기관총": 0.98,
  };
  const bulkByWeapon = {
    "고총": [0.2, 0.18],
    "산탄총": [0.24, 0.2],
    "소총": [0.22, 0.18],
    "저격": [0.2, 0.17],
    "기관총": [0.3, 0.22],
  };
  const [bodyW, bodyH] = bulkByWeapon[weapon.name] ?? [0.22, 0.18];
  const length = lengthByWeapon[weapon.name] ?? 0.72;
  addHeldBox(group, 0.05, 0.02, -0.18, bodyW, bodyH, 0.38, mats.gunMetal);
  addHeldBox(group, 0.02, -0.18, -0.05, 0.11, 0.34, 0.16, mats.blackMetal);
  addHeldBarrel(group, 0.05, 0.04, -0.42 - length / 2, 0.035, length, mats.blackMetal);
  addHeldBox(group, 0.05, 0.17, -0.16, bodyW * 0.82, 0.05, 0.22, mats.blackMetal);
  addHeldBox(group, 0.12, -0.08, -0.21, 0.05, 0.12, 0.06, mats.blackMetal);
  addHeldBox(group, 0.05, 0.03, -0.84 - length / 2, 0.11, 0.08, 0.08, mats.blackMetal);
  if (length > 0.75) {
    addHeldBox(group, 0.05, -0.02, 0.14, bodyW * 0.85, bodyH * 0.75, 0.28, mats.wood);
    addHeldBox(group, 0.05, -0.1, -0.52, 0.1, 0.18, 0.28, mats.blackMetal);
  }

  if (weapon.name === "저격") {
    addHeldBarrel(group, 0.05, 0.2, -0.2, 0.055, 0.35, mats.blackMetal);
    addHeldBox(group, 0.05, 0.2, -0.2, 0.3, 0.08, 0.08, mats.blackMetal);
  }
  if (weapon.name === "기관총") addHeldBox(group, 0.05, -0.12, -0.35, 0.28, 0.16, 0.22, mats.blackMetal);
  if (weapon.name === "산탄총") addHeldBox(group, 0.05, -0.06, -0.52, 0.16, 0.1, 0.42, mats.wood);
  return group;
}

function initHeldWeaponView() {
  scene.add(camera);
  heldWeaponRoot.position.set(0.58, -0.42, -0.88);
  heldWeaponRoot.rotation.set(-0.08, -0.18, 0.04);
  camera.add(heldWeaponRoot);
  weapons.forEach((weapon) => {
    const model = createHeldWeaponModel(weapon);
    model.visible = false;
    heldWeaponModels.set(weapon.name, model);
    heldWeaponRoot.add(model);
  });
}

function updateHeldWeaponModel(weaponName) {
  heldWeaponModels.forEach((model, name) => {
    model.visible = name === weaponName;
  });
}

function updateHeldWeaponMotion(time) {
  const bob = Math.sin(time * 8) * (keys.size > 0 ? 0.014 : 0.004);
  heldWeaponRoot.position.y = -0.42 + bob;
  heldWeaponRoot.rotation.z = 0.04 + Math.sin(time * 5) * 0.01;
}

function canScopeWeapon(weapon) {
  return weapon.name !== "칼" && weapon.name !== "고총" && weapon.name !== "산탄총";
}

function getTargetFov() {
  const weapon = weapons[weaponIndex];
  if (!player.scoped || !canScopeWeapon(weapon)) return BASE_CAMERA_FOV;
  return weapon.name === "저격" ? SNIPER_SCOPE_FOV : RIFLE_SCOPE_FOV;
}

function updateScopeView() {
  const targetFov = getTargetFov();
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.22);
    camera.updateProjectionMatrix();
  }
  ui.scopeOverlay.classList.toggle("active", player.scoped && weapons[weaponIndex].name === "저격");
}

function jump() {
  if (!player.alive || !player.grounded) return;
  player.velocityY = JUMP_SPEED;
  player.grounded = false;
}

function addBox(x, y, z, sx, sy, sz, mat, name = "cover", solid = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y + sy / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.name = name;
  scene.add(mesh);
  if (solid) {
    mesh.userData.collider = {
      minX: x - sx / 2,
      maxX: x + sx / 2,
      minY: y,
      maxY: y + sy,
      minZ: z - sz / 2,
      maxZ: z + sz / 2,
    };
    solidTargets.push(mesh);
  }
  return mesh;
}

function addPlane(x, y, z, w, h, mat, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addFloor(level, color, size) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(size[0], 0.42, size[1]), makeMaterial(color));
  floor.position.set(0, LEVEL_Y[level] - 0.21, 0);
  floor.receiveShadow = true;
  scene.add(floor);
}

function addRoof(x, y, z, sx, sz, mat = mats.terracotta) {
  const left = addBox(x - sx * 0.18, y, z, sx * 0.56, 0.45, sz, mat, "roof", false);
  const right = addBox(x + sx * 0.18, y, z, sx * 0.56, 0.45, sz, mat, "roof", false);
  left.rotation.z = 0.36;
  right.rotation.z = -0.36;
}

function addArch(x, y, z, w, h, d, mat) {
  addBox(x - w / 2, y, z, 1.2, h, d, mat, "arch");
  addBox(x + w / 2, y, z, 1.2, h, d, mat, "arch");
  addBox(x, y + h - 1, z, w + 1.2, 1.2, d, mat, "arch");
}

function addSite(level, x, z, label, color) {
  const site = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 12, 0.08, 48),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.44 })
  );
  site.position.set(x, LEVEL_Y[level] + 0.05, z);
  site.userData.site = `${levelNames[level]} ${label}`;
  scene.add(site);
}

function addSpawnPad(x, z, color, name) {
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.1, 8),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.5 })
  );
  pad.position.set(x, LEVEL_Y.surface + 0.08, z);
  pad.userData.name = name;
  scene.add(pad);
}

function addBombSite(level, x, z, label, color, centerGateSide) {
  addSite(level, x, z, label, color);
  const y = LEVEL_Y[level];
  const half = 11;
  const wall = 2.2;
  const gap = 7;
  const sideLength = half * 2;
  const sideRun = (sideLength - gap) / 2;
  const wallMat = label === "A" ? mats.redPlaster : mats.peach;

  addBox(x - half + sideRun / 2, y, z - half, sideRun, 4.2, wall, wallMat, `${label} defense gate wall`);
  addBox(x + half - sideRun / 2, y, z - half, sideRun, 4.2, wall, wallMat, `${label} defense gate wall`);
  addBox(x - half + sideRun / 2, y, z + half, sideRun, 4.2, wall, wallMat, `${label} attack gate wall`);
  addBox(x + half - sideRun / 2, y, z + half, sideRun, 4.2, wall, wallMat, `${label} attack gate wall`);

  if (centerGateSide === "east") {
    addBox(x - half, y, z, wall, 4.2, sideLength, wallMat, `${label} closed side wall`);
    addBox(x + half, y, z - half + sideRun / 2, wall, 4.2, sideRun, wallMat, `${label} center gate wall`);
    addBox(x + half, y, z + half - sideRun / 2, wall, 4.2, sideRun, wallMat, `${label} center gate wall`);
  } else {
    addBox(x + half, y, z, wall, 4.2, sideLength, wallMat, `${label} closed side wall`);
    addBox(x - half, y, z - half + sideRun / 2, wall, 4.2, sideRun, wallMat, `${label} center gate wall`);
    addBox(x - half, y, z + half - sideRun / 2, wall, 4.2, sideRun, wallMat, `${label} center gate wall`);
  }

  addBox(x, y + 0.04, z, 7, 0.12, 7, mats.yellow, `${label} bomb plant mark`, false);
}

function addDetailBuilding(x, z, sx, sy, sz, mat, accent = mats.whiteWall) {
  addBox(x, 0, z, sx, sy, sz, mat, "dense building");
  addRoof(x, sy + 0.15, z, sx + 1.6, sz + 1.6, mats.darkRoof);
  addBox(x, sy * 0.58, z - sz / 2 - 0.04, sx * 0.72, 0.18, 0.1, accent, "front trim", false);
  addBox(x, sy * 0.34, z - sz / 2 - 0.05, sx * 0.18, 1.7, 0.1, mats.darkGlass, "window", false);
  addBox(x - sx * 0.27, sy * 0.36, z - sz / 2 - 0.05, sx * 0.14, 1.25, 0.1, mats.darkGlass, "window", false);
  addBox(x + sx * 0.27, sy * 0.36, z - sz / 2 - 0.05, sx * 0.14, 1.25, 0.1, mats.darkGlass, "window", false);
}

function addLamp(x, z) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.2, 14), mats.blackMetal);
  pole.position.set(x, 2.6, z);
  pole.castShadow = true;
  scene.add(pole);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.28, 0.75), mats.copper);
  head.position.set(x, 5.3, z);
  head.castShadow = true;
  scene.add(head);
  const light = new THREE.PointLight(0xffc278, 0.8, 18);
  light.position.set(x, 5.1, z);
  scene.add(light);
}

function addDenseCover(x, z, sx, sz, mat = mats.crate) {
  addBox(x, 0, z, sx, 1.45, sz, mat, "dense cover");
  addBox(x, 1.45, z, sx * 0.78, 1.05, sz * 0.78, mat, "dense cover");
}

function buildPrepBarrier() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffbe70,
    emissive: 0x3b2106,
    transparent: true,
    opacity: 0.42,
    roughness: 0.35,
    metalness: 0.12,
  });
  [
    [0, 2.2, prepZone.minZ, prepZone.maxX * 2, 4.4, 0.32],
    [prepZone.minX, 2.2, (prepZone.minZ + prepZone.maxZ) / 2, 0.32, 4.4, prepZone.maxZ - prepZone.minZ],
    [prepZone.maxX, 2.2, (prepZone.minZ + prepZone.maxZ) / 2, 0.32, 4.4, prepZone.maxZ - prepZone.minZ],
  ].forEach(([x, y, z, sx, sy, sz]) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
    mesh.position.set(x, y, z);
    prepBarrierGroup.add(mesh);
  });
  scene.add(prepBarrierGroup);
}

function buildSurfaceMap() {
  addFloor("surface", 0xa99682, [96, 112]);
  const sun = new THREE.DirectionalLight(0xffd7a5, 2.5);
  sun.position.set(26, 54, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x4b241f, 1.28));

  addSpawnPad(spawns.attack.x, spawns.attack.z, 0xffbe70, "attack spawn");
  addSpawnPad(spawns.defense.x, spawns.defense.z, 0x8ed3ff, "defense spawn");
  addBombSite("surface", -26, -26, "A", 0xffbe70, "east");
  addBombSite("surface", 28, 24, "B", 0xff7668, "west");

  addBox(0, 0, -55, 92, 7, 4, mats.stone, "north boundary");
  addBox(0, 0, 55, 92, 7, 4, mats.stone, "south boundary");
  addBox(-47, 0, 0, 4, 7, 110, mats.stone, "west boundary");
  addBox(47, 0, 0, 4, 7, 110, mats.stone, "east boundary");

  addDetailBuilding(-39, -37, 10, 9, 19, mats.brick, mats.whiteWall);
  addDetailBuilding(-39, 17, 10, 10, 22, mats.redPlaster, mats.concrete);
  addDetailBuilding(39, -18, 11, 10, 24, mats.whiteWall, mats.copper);
  addDetailBuilding(38, 40, 13, 9, 14, mats.peach, mats.concrete);
  addDetailBuilding(-12, -46, 17, 8, 9, mats.deepRed, mats.whiteWall);
  addDetailBuilding(17, 48, 18, 8, 8, mats.brick, mats.copper);

  addBox(0, 0, -16, 5, 5, 15, mats.concrete, "central divider");
  addBox(-12, 0, 4, 9, 3.2, 4, mats.stone, "mid cover");
  addBox(14, 0, -4, 9, 3.2, 4, mats.stone, "mid cover");
  addBox(-22, 0, 9, 4, 3, 12, mats.paintedSteel, "A connector wall");
  addBox(24, 0, -11, 4, 3, 12, mats.paintedSteel, "B connector wall");
  addDenseCover(-28, -24, 4.8, 4.8, mats.crate);
  addDenseCover(-21, -31, 4.6, 4.4, mats.wood);
  addDenseCover(29, 22, 5.2, 4.6, mats.crate);
  addDenseCover(22, 30, 4.4, 4.4, mats.wood);
  addDenseCover(-8, 22, 4.5, 7, mats.concrete);
  addDenseCover(9, -24, 4.5, 7, mats.concrete);

  for (let i = -3; i <= 3; i += 1) {
    addBox(i * 10, 0.03, 0, 5.5, 0.05, 0.75, mats.plazaLine, "mid paving", false);
    addBox(0, 0.04, i * 10, 0.75, 0.05, 5.5, mats.plazaLine, "mid paving", false);
  }

  addLamp(-17, -6);
  addLamp(18, 7);
  addLamp(-34, 32);
  addLamp(35, -32);

  addBox(0, 0, -31, 8, 18, 8, mats.deepRed, "compact tower");
  addBox(0, 18, -31, 10, 3.5, 10, mats.whiteWall, "tower cap", false);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(5.4, 12, 4), mats.terracotta);
  spire.position.set(0, 27, -31);
  spire.rotation.y = Math.PI / 4;
  scene.add(spire);
}

function addCrateStack(x, z, level, rows = 2) {
  const y = LEVEL_Y[level];
  for (let i = 0; i < rows; i += 1) addBox(x, y + i * 2.2, z, 5.2, 2.2, 5.2, mats.crate, "wood crate");
}

function buildUndergroundMap() {
  addFloor("underground", 0x6d6658, [78, 88]);
  const y = LEVEL_Y.underground;
  const warm = new THREE.PointLight(0xffc884, 2.2, 80);
  warm.position.set(0, y + 21, -4);
  scene.add(warm);
  addBox(0, y, -43, 72, 12, 4, mats.wood, "warehouse wall");
  addBox(0, y, 43, 72, 12, 4, mats.wood, "warehouse wall");
  addBox(-39, y, 0, 4, 12, 80, mats.wood, "warehouse wall");
  addBox(39, y, 0, 4, 12, 80, mats.wood, "warehouse wall");
  addArch(0, y, -36, 15, 9, 4, mats.stone);
  for (let i = -3; i <= 3; i += 1) {
    addBox(i * 10, y + 8.4, 0, 1, 1, 80, mats.wood, "roof beam", false);
    const beam = addBox(0, y + 9.6 + Math.abs(i) * 0.12, i * 10, 70, 0.7, 1, mats.wood, "roof beam", false);
    beam.rotation.z = i % 2 === 0 ? 0.08 : -0.08;
  }
  addPlane(-20, y + 9.6, -1, 24, 14, mats.tarp, [-0.6, 0.2, 0.08]);
  addPlane(22, y + 10.2, -6, 24, 13, mats.tarp, [-0.7, -0.1, -0.06]);
  addPlane(0, y + 10.8, -20, 20, 12, mats.glass, [-Math.PI / 2, 0, 0]);
  [
    [-28, -24, 3], [-20, -17, 2], [-8, -29, 2], [12, -26, 2], [27, -22, 3],
    [-28, 17, 2], [-18, 26, 3], [-2, 18, 2], [19, 16, 2], [29, 27, 3],
    [-10, -3, 2], [11, 5, 2], [0, -14, 1], [24, -5, 2], [-24, 6, 2],
  ].forEach(([x, z, rows]) => addCrateStack(x, z, "underground", rows));
}

function buildElevator() {
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xffbe70, emissive: 0x3b2106, roughness: 0.42, metalness: 0.15 });
  ["surface", "underground"].forEach((level) => {
    const y = LEVEL_Y[level];
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.16, 48), ringMat);
    pad.position.set(0, y + 0.08, 0);
    pad.receiveShadow = true;
    scene.add(pad);
    addBox(-4.6, y, 0, 0.35, 3.2, 7.8, mats.blackMetal, "elevator rail", false);
    addBox(4.6, y, 0, 0.35, 3.2, 7.8, mats.blackMetal, "elevator rail", false);
    addBox(0, y + 3.1, -4.6, 8.8, 0.28, 0.35, mats.blackMetal, "elevator lintel", false);
    addBox(0, y + 3.1, 4.6, 8.8, 0.28, 0.35, mats.blackMetal, "elevator lintel", false);
  });
  addBox(0, LEVEL_Y.underground + 0.25, 0, 4.6, 31.5, 4.6, mats.glass, "central elevator glass shaft", false);
  const liftLight = new THREE.PointLight(0xffbe70, 1.1, 24);
  liftLight.position.set(0, 3.2, 0);
  scene.add(liftLight);
}

function registerHitbox(mesh, type, id, zone) {
  mesh.userData.damageTarget = { type, id, zone };
  damageTargets.push(mesh);
}

function createCharacterModel(type, id) {
  const group = new THREE.Group();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: characterTexture, transparent: true }));
  sprite.position.y = 1.95;
  sprite.scale.set(2.35, 3.25, 1);
  group.add(sprite);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.5, 0.8), mats.invisible);
  body.position.y = 1.15;
  group.add(body);
  registerHitbox(body, type, id, "nose");

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.7), mats.invisible);
  head.position.y = 2.45;
  group.add(head);
  registerHitbox(head, type, id, "eye");

  const legs = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.75, 0.7), mats.invisible);
  legs.position.y = 0.35;
  group.add(legs);
  registerHitbox(legs, type, id, "lower");

  const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 10), mats.yellow);
  marker.position.y = 6;
  marker.visible = false;
  group.add(marker);
  group.userData.marker = marker;
  return group;
}

function addBot(id, name, x, level, z, armor) {
  const hpLimit = armor === "큰갑옷" ? 150 : armor === "작은갑옷" ? 125 : 100;
  const bot = {
    id, name, level, hpLimit, hp: hpLimit, armor, alive: true,
    base: new THREE.Vector3(x, LEVEL_Y[level], z),
    group: createCharacterModel("bot", id),
    lastShot: 0,
    money: 800,
    owned: new Set(["칼"]),
    weaponIndex: 0,
  };
  bot.group.position.copy(bot.base);
  scene.add(bot.group);
  bots.push(bot);
}

function setupBots() {
  addBot("surface-a", "지상 A 감시자", -26, "surface", -26, "큰갑옷");
  addBot("surface-b", "지상 B 돌격수", 28, "surface", 24, "작은갑옷");
  addBot("under-a", "지하 잠복병", -20, "underground", -20, "큰갑옷");
  addBot("under-b", "지하 수비병", 22, "underground", 22, "없음");
}

function initUi() {
  ui.weaponRow.innerHTML = weapons
    .map((w, i) => `<button class="weapon-card" data-index="${i}" type="button"><b>${w.key}. ${w.name}</b><span>$${w.price} · ${w.role}</span></button>`)
    .join("");
  [...ui.weaponRow.children].forEach((el) => {
    el.addEventListener("click", () => handleWeaponSlot(Number(el.dataset.index)));
  });
  ui.buyLightArmor.addEventListener("click", () => buyArmor("작은갑옷", 125, 650));
  ui.buyHeavyArmor.addEventListener("click", () => buyArmor("큰갑옷", 150, 1000));
  const savedServer = getInitialServerUrl();
  ui.serverUrl.value = savedServer;
  ui.connect.addEventListener("click", () => connectMultiplayer(ui.serverUrl.value));
  selectWeapon(0, true);
  setNetStatus("solo", "혼자 연습");
  startPrep();
  log("준비 시간에만 총과 갑옷 구매 가능. 킬 보상은 $200입니다.");
  if (new URLSearchParams(location.search).get("server")) connectMultiplayer(savedServer);
}

function handleWeaponSlot(index) {
  if (match.phase === "prep") {
    buyWeapon(index);
    return;
  }
  selectWeapon(index);
}

function buyWeapon(index) {
  const weapon = weapons[index];
  if (player.owned.has(weapon.name)) {
    selectWeapon(index);
    return;
  }
  if (player.money < weapon.price) {
    log(`${weapon.name} 구매 실패: $${weapon.price} 필요`);
    return;
  }
  player.money -= weapon.price;
  player.owned.add(weapon.name);
  selectWeapon(index, true);
  refreshWeaponCards();
  log(`${weapon.name} 구매 완료. 남은 돈 $${player.money}`);
}

function buyArmor(name, hpLimit, price) {
  if (match.phase !== "prep") {
    log("갑옷은 준비 시간에만 살 수 있습니다.");
    return;
  }
  if (player.money < price) {
    log(`${name} 구매 실패: $${price} 필요`);
    return;
  }
  if (player.armorLimit >= hpLimit) {
    log(`이미 ${player.armor} 상태입니다.`);
    return;
  }
  player.money -= price;
  player.armor = name;
  player.armorLimit = hpLimit;
  player.hp = hpLimit;
  log(`${name} 구매 완료. 남은 돈 $${player.money}`);
}

function selectWeapon(index, silent = false) {
  const weapon = weapons[index];
  if (!player.owned.has(weapon.name)) {
    if (!silent) log(`${weapon.name}은 아직 구매하지 않았습니다.`);
    return;
  }
  weaponIndex = THREE.MathUtils.clamp(index, 0, weapons.length - 1);
  const selected = weapons[weaponIndex];
  if (!canScopeWeapon(selected)) player.scoped = false;
  refreshWeaponCards();
  ui.weaponName.textContent = `${selected.name} · ${selected.role}`;
  ui.weaponStats.textContent =
    selected.name === "칼"
      ? "2m 이내. 좌클릭 베기, 우클릭 찌르기. 등 뒤 공격은 큰 피해."
      : `${selected.rate}발/초 · 탄퍼짐 ${selected.name === "저격" ? "조준 0, 비조준 큼" : selected.spread < 0.04 ? "낮음" : selected.spread < 0.08 ? "높음" : "매우 넓음"} · 거리 기준 ${selected.falloff}m`;
  ui.ammoLine.textContent = `가격 $${selected.price} · 무갑 100 / 작은갑옷 125 / 큰갑옷 150`;
  updateHeldWeaponModel(selected.name);
}

function refreshWeaponCards() {
  [...ui.weaponRow.children].forEach((el, i) => {
    const weapon = weapons[i];
    const owned = player.owned.has(weapon.name);
    el.classList.toggle("active", i === weaponIndex);
    el.classList.toggle("owned", owned);
    el.classList.toggle("locked", !owned);
    el.disabled = match.phase !== "prep" && !owned;
    el.querySelector("span").textContent = owned ? "보유" : `$${weapon.price} · 구매`;
  });
}

function addMoney(amount) {
  player.money = Math.min(MONEY_CAP, player.money + amount);
}

function addBotMoney(amount) {
  bots.forEach((bot) => {
    bot.money = Math.min(MONEY_CAP, bot.money + amount);
  });
}

function getLossReward(nextLossStreak) {
  return nextLossStreak >= 2 ? WIN_MONEY : FIRST_LOSS_MONEY;
}

function getWeaponIndexByName(name) {
  return weapons.findIndex((weapon) => weapon.name === name);
}

function chooseAiBuyTarget(bot) {
  const preferred = [];
  if (match.round >= 7) preferred.push(bot.id.includes("a") ? "저격" : "기관총");
  if (match.round >= 5) preferred.push("기관총");
  if (match.round >= 3) preferred.push("소총");
  if (match.round >= 2) preferred.push("산탄총");
  preferred.push("고총");

  for (const name of preferred) {
    const index = getWeaponIndexByName(name);
    if (index < 0) continue;
    const weapon = weapons[index];
    if (bot.owned.has(name) || bot.money >= weapon.price) return index;
  }
  return 0;
}

function buyAiLoadouts() {
  const buys = [];
  bots.forEach((bot) => {
    const targetIndex = chooseAiBuyTarget(bot);
    const target = weapons[targetIndex];
    if (!bot.owned.has(target.name) && bot.money >= target.price) {
      bot.money -= target.price;
      bot.owned.add(target.name);
      buys.push(target.name);
    }
    const ownedIndexes = weapons
      .map((weapon, index) => ({ weapon, index }))
      .filter(({ weapon }) => bot.owned.has(weapon.name));
    bot.weaponIndex = ownedIndexes.reduce((best, entry) => {
      return entry.weapon.price > weapons[best].price ? entry.index : best;
    }, 0);
  });
  if (buys.length > 0) {
    log(`상대 AI 구매: ${[...new Set(buys)].join(", ")}`);
  }
}

function startPrep() {
  if (match.ended) return;
  match.phase = "prep";
  match.phaseEnd = performance.now() / 1000 + PREP_SECONDS;
  match.bombPlanted = false;
  match.bombSite = null;
  match.bombEnd = 0;
  prepBarrierGroup.visible = true;
  player.alive = true;
  player.hp = player.armorLimit;
  player.level = "surface";
  player.position.copy(spawns.attack);
  player.velocityY = 0;
  player.jumpOffset = 0;
  player.grounded = true;
  player.scoped = false;
  camera.position.copy(player.position);
  bots.forEach(respawnBot);
  buyAiLoadouts();
  refreshWeaponCards();
  log(`${match.round}라운드 준비 시작. 시작 지점 안에서만 구매할 수 있습니다.`);
}

function startCombat() {
  match.phase = "combat";
  match.phaseEnd = performance.now() / 1000 + COMBAT_SECONDS;
  prepBarrierGroup.visible = false;
  refreshWeaponCards();
  log(`${match.round}라운드 전투 시작.`);
}

function finishRound(playerWon, reason) {
  if (match.phase === "post" || match.ended) return;
  match.phase = "post";
  match.phaseEnd = performance.now() / 1000 + 4;
  if (playerWon) {
    match.playerScore += 1;
    match.losingStreak = 0;
    match.aiLosingStreak += 1;
    addMoney(WIN_MONEY);
    addBotMoney(getLossReward(match.aiLosingStreak));
    log(`라운드 승리: ${reason}. 승리 보상 $${WIN_MONEY}`);
  } else {
    match.enemyScore += 1;
    match.losingStreak += 1;
    match.aiLosingStreak = 0;
    const reward = getLossReward(match.losingStreak);
    addMoney(reward);
    addBotMoney(WIN_MONEY);
    log(`라운드 패배: ${reason}. 패배 보상 $${reward}`);
  }
  if (isMatchOver()) {
    match.ended = true;
    log(`경기 종료: ${match.playerScore}:${match.enemyScore}`);
  }
}

function isMatchOver() {
  if (match.playerScore === 12 && match.enemyScore === 12) return false;
  if (match.playerScore >= 13 || match.enemyScore >= 13) {
    if (match.playerScore >= 12 && match.enemyScore >= 12) return Math.abs(match.playerScore - match.enemyScore) >= 2;
    return true;
  }
  return false;
}

function advanceRoundIfNeeded(time) {
  if (match.ended) return;
  if (match.phase === "prep" && time >= match.phaseEnd) startCombat();
  if (match.phase === "combat") {
    if (match.bombPlanted && time >= match.bombEnd) finishRound(true, `${match.bombSite} 폭탄 폭발`);
    if (!player.alive) finishRound(false, "플레이어 전멸");
    else if (bots.every((bot) => !bot.alive)) finishRound(true, "적 전멸");
    else if (time >= match.phaseEnd) finishRound(false, "시간 종료");
  }
  if (match.phase === "post" && time >= match.phaseEnd) {
    match.round += 1;
    startPrep();
  }
}

function log(text) {
  const line = document.createElement("div");
  line.textContent = text;
  ui.log.prepend(line);
  while (ui.log.children.length > 7) ui.log.lastChild.remove();
}

function setNetStatus(status, text) {
  networkStatus = status;
  ui.net.textContent = text;
  ui.net.classList.toggle("online", status === "online");
  ui.net.classList.toggle("offline", status === "offline");
}

function getInitialServerUrl() {
  const fromQuery = new URLSearchParams(location.search).get("server");
  if (fromQuery) return normalizeServerUrl(fromQuery);
  const stored = localStorage.getItem("kotgunServerUrl");
  if (stored) return normalizeServerUrl(stored);
  return DEFAULT_SERVER_URL;
}

function normalizeServerUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!url) return "";
  if (url.startsWith("hss://")) url = `wss://${url.slice(6)}`;
  if (url.startsWith("https://")) url = `wss://${url.slice(8)}`;
  else if (url.startsWith("http://")) url = `ws://${url.slice(7)}`;
  else if (!url.startsWith("ws://") && !url.startsWith("wss://")) url = `wss://${url}`;
  return url.replace(/\/$/, "");
}

function connectMultiplayer(rawUrl) {
  const url = normalizeServerUrl(rawUrl);
  if (!url) {
    log("Render 서버 주소를 넣으면 멀티플레이에 연결됩니다.");
    return;
  }
  localStorage.setItem("kotgunServerUrl", url);
  if (socket) socket.close();
  setNetStatus("offline", "연결 중");
  const ws = new WebSocket(url);
  socket = ws;
  ws.addEventListener("open", () => {
    if (socket !== ws) return;
    setNetStatus("online", "멀티 연결");
    sendNet("join", { name: player.name, armor: player.armor, state: makeNetworkState() });
    log("멀티플레이 서버 연결 성공.");
  });
  ws.addEventListener("message", (event) => {
    if (socket !== ws) return;
    try {
      handleNetMessage(JSON.parse(event.data));
    } catch (error) {
      console.warn(error);
    }
  });
  ws.addEventListener("close", () => {
    if (socket !== ws) return;
    setNetStatus("offline", "서버 끊김");
    remotePlayers.forEach((remote) => removeRemote(remote.id));
    log("멀티플레이 서버 연결이 끊겼습니다.");
  });
  ws.addEventListener("error", () => {
    if (socket !== ws) return;
    setNetStatus("offline", "연결 실패");
    log("서버 연결 실패. Render 주소가 맞는지 확인하세요.");
  });
}

function sendNet(type, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type, ...payload }));
}

function makeNetworkState() {
  return {
    x: player.position.x,
    z: player.position.z,
    level: player.level,
    yaw: player.yaw,
    pitch: player.pitch,
    weapon: weapons[weaponIndex].name,
    scoped: player.scoped,
    hp: player.hp,
    armor: player.armor,
    alive: player.alive,
  };
}

function handleNetMessage(message) {
  if (message.type === "welcome") {
    player.id = message.id;
    message.players.forEach((entry) => {
      if (entry.id !== player.id) ensureRemote(entry.id, entry);
    });
  }
  if (message.type === "player-joined" && message.id !== player.id) {
    ensureRemote(message.id, message);
    log(`${message.name} 입장.`);
  }
  if (message.type === "state" && message.id !== player.id) updateRemote(message.id, message.state, message.name);
  if (message.type === "left") removeRemote(message.id);
  if (message.type === "shot" && message.id !== player.id) drawTracer(message.origin, message.direction, 0xff7668);
  if (message.type === "hit") handleServerHit(message);
  if (message.type === "respawn") {
    if (message.id === player.id) {
      player.hp = player.armorLimit;
      player.alive = true;
      player.level = message.state.level;
      player.position.set(message.state.x, bounds[player.level].y, message.state.z);
      log("리스폰 완료.");
    } else {
      updateRemote(message.id, message.state, message.name);
    }
  }
}

function ensureRemote(id, data) {
  if (remotePlayers.has(id)) return remotePlayers.get(id);
  const remote = {
    id,
    name: data.name ?? "Player",
    level: data.state?.level ?? "surface",
    hp: data.hp ?? data.state?.hp ?? 150,
    alive: data.alive ?? data.state?.alive ?? true,
    group: createCharacterModel("remote", id),
  };
  scene.add(remote.group);
  remotePlayers.set(id, remote);
  updateRemote(id, data.state ?? data, remote.name);
  return remote;
}

function updateRemote(id, state, name = "Player") {
  const remote = remotePlayers.get(id) ?? ensureRemote(id, { id, name, state });
  if (!state) return;
  remote.name = name;
  remote.level = state.level ?? remote.level;
  remote.hp = state.hp ?? remote.hp;
  remote.alive = state.alive ?? remote.alive;
  remote.group.visible = remote.alive;
  remote.group.position.set(state.x ?? 0, LEVEL_Y[remote.level] ?? 0, state.z ?? 0);
  remote.group.rotation.y = state.yaw ?? 0;
  remote.group.userData.marker.visible = remote.level !== player.level && remote.alive;
}

function removeRemote(id) {
  const remote = remotePlayers.get(id);
  if (!remote) return;
  scene.remove(remote.group);
  for (let i = damageTargets.length - 1; i >= 0; i -= 1) {
    const target = damageTargets[i].userData.damageTarget;
    if (target?.type === "remote" && target.id === id) damageTargets.splice(i, 1);
  }
  remotePlayers.delete(id);
}

function handleServerHit(message) {
  if (message.targetId === player.id) {
    player.hp = Math.max(0, message.targetHp);
    player.alive = !message.dead;
    log(message.dead ? `${message.weapon}에 당했습니다.` : `${message.weapon} 피격 · 체력 ${player.hp}`);
  }
  const remote = remotePlayers.get(message.targetId);
  if (remote) {
    remote.hp = Math.max(0, message.targetHp);
    remote.alive = !message.dead;
    remote.group.visible = remote.alive;
  }
  if (message.sourceId === player.id && message.dead) {
    addMoney(KILL_MONEY);
    log(`멀티플레이 적 처치. +$${KILL_MONEY}`);
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function startAudio() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playSound(type) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const presets = {
    deagle: [95, 0.14, 0.55], shotgun: [70, 0.24, 0.9], sniper: [120, 0.32, 0.75],
    rifle: [150, 0.08, 0.32], machine: [115, 0.055, 0.24], knife: [520, 0.09, 0.18],
    hit: [260, 0.05, 0.18],
  };
  const [freq, len, peak] = presets[type] ?? presets.rifle;
  osc.type = type === "knife" ? "triangle" : "sawtooth";
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.42), now + len);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(type === "knife" ? 1800 : 760, now);
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + len);
  osc.connect(filter).connect(gain).connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + len);
}

function spreadDirection(base, spread) {
  const dir = base.clone();
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const radius = Math.random() * spread;
  const angle = Math.random() * Math.PI * 2;
  dir.addScaledVector(right, Math.cos(angle) * radius);
  dir.addScaledVector(up, Math.sin(angle) * radius);
  return dir.normalize();
}

function getCurrentSpread(weapon) {
  const scopedSpread = weapon.scopedSpread !== undefined && player.scoped ? weapon.scopedSpread : weapon.spread;
  if (weapon.name !== "소총" && weapon.name !== "기관총") return scopedSpread;
  const hold = firingSince ? Math.min(2.2, performance.now() / 1000 - firingSince) : 0;
  return scopedSpread + hold * (weapon.name === "기관총" ? 0.06 : 0.026) + burstShots * (weapon.name === "기관총" ? 0.003 : 0.0015);
}

function shoot(heavy = false) {
  if (!player.alive || match.phase !== "combat") {
    if (match.phase === "prep") log("준비 시간에는 공격할 수 없습니다.");
    return;
  }
  const weapon = weapons[weaponIndex];
  const now = performance.now() / 1000;
  const rate = weapon.name === "칼" && heavy ? weapon.heavyRate : weapon.rate;
  if (now - player.lastShot < 1 / rate) return;
  player.lastShot = now;
  burstShots += 1;
  if (weapon.name === "칼") {
    knifeAttack(heavy);
    return;
  }
  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);
  const pellets = weapon.pellets ?? 1;
  let hitSomething = false;
  for (let i = 0; i < pellets; i += 1) {
    const dir = spreadDirection(baseDir, getCurrentSpread(weapon));
    const hit = traceDamageTarget(dir);
    if (!hit) continue;
    hitSomething = true;
    const target = hit.object.userData.damageTarget;
    const damage = getGunDamage(weapon, target.zone, hit.distance);
    applyDamageTarget(target, damage, weapon.name, hit.distance);
  }
  playSound(weapon.sound);
  drawTracer(camera.position, baseDir, 0xffe1a3);
  sendNet("shot", { origin: vectorPayload(camera.position), direction: vectorPayload(baseDir), weapon: weapon.name });
  if (weapon.recoil) {
    const recoil = weapon.recoil * (player.scoped ? 0.72 : 1);
    player.pitch = Math.max(-1.25, player.pitch - recoil);
    player.yaw += (Math.random() - 0.5) * recoil * 0.35;
  }
  if (!hitSomething && weapon.name === "산탄총") log("산탄이 엄폐물에 흩어졌습니다.");
}

function traceDamageTarget(direction) {
  raycaster.set(camera.position, direction);
  raycaster.far = 190;
  const damageHits = raycaster.intersectObjects(damageTargets, false).filter((hit) => isDamageTargetAlive(hit.object.userData.damageTarget));
  if (damageHits.length === 0) return null;
  const wallHits = raycaster.intersectObjects(solidTargets, false);
  const firstDamage = damageHits[0];
  const firstWall = wallHits[0];
  return !firstWall || firstDamage.distance < firstWall.distance ? firstDamage : null;
}

function isDamageTargetAlive(target) {
  if (!target) return false;
  if (target.type === "bot") return bots.find((bot) => bot.id === target.id)?.alive ?? false;
  if (target.type === "remote") return remotePlayers.get(target.id)?.alive ?? false;
  return false;
}

function getGunDamage(weapon, zone, distance) {
  const pair = weapon.damage[zone] ?? weapon.damage.nose;
  return distance >= weapon.falloff ? pair[1] : pair[0];
}

function knifeAttack(heavy) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const hit = traceDamageTarget(dir);
  playSound("knife");
  if (!hit || hit.distance > 2) {
    log(heavy ? "칼 찌르기가 빗나갔습니다." : "칼 베기가 빗나갔습니다.");
    return;
  }
  const target = hit.object.userData.damageTarget;
  const targetGroup = getTargetGroup(target);
  const toPlayer = camera.position.clone().sub(targetGroup.position).normalize();
  const enemyForward = new THREE.Vector3(0, 0, -1).applyQuaternion(targetGroup.quaternion);
  const backstab = enemyForward.dot(toPlayer) < -0.35;
  const suffix = heavy ? "Heavy" : "Light";
  const damage = backstab ? weapons[0].damage[`back${suffix}`] : weapons[0].damage[`${target.zone}${suffix}`];
  applyDamageTarget(target, damage, heavy ? "칼 찌르기" : "칼 베기", hit.distance, backstab);
}

function getTargetGroup(target) {
  if (target.type === "bot") return bots.find((bot) => bot.id === target.id).group;
  return remotePlayers.get(target.id).group;
}

function applyDamageTarget(target, damage, weaponName, distance, backstab = false) {
  const zoneName = backstab ? "등 뒤" : { eye: "머리", nose: "몸통", lower: "하체" }[target.zone];
  if (target.type === "bot") {
    const bot = bots.find((entry) => entry.id === target.id);
    bot.hp -= damage;
    playSound("hit");
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.group.visible = false;
      addMoney(KILL_MONEY);
      log(`${weaponName} ${zoneName} ${Math.round(damage)} 피해: ${bot.name} 처치 +$${KILL_MONEY}`);
    } else {
      log(`${weaponName} ${zoneName} ${Math.round(damage)} 피해 · ${bot.name} 남은 체력 ${Math.ceil(bot.hp)}`);
    }
  }
  if (target.type === "remote") {
    sendNet("hit", { targetId: target.id, damage, zone: target.zone, weapon: weaponName, distance });
    playSound("hit");
  }
}

function respawnBot(bot) {
  bot.hp = bot.hpLimit;
  bot.alive = true;
  bot.group.visible = true;
  bot.group.position.copy(bot.base);
  bot.lastShot = 0;
}

function drawTracer(originPayload, directionPayload, color) {
  const origin = payloadVector(originPayload);
  const direction = payloadVector(directionPayload).normalize();
  const geometry = new THREE.BufferGeometry().setFromPoints([origin, origin.clone().addScaledVector(direction, 48)]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 }));
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geometry.dispose();
    line.material.dispose();
  }, 85);
}

function payloadVector(value) {
  if (value instanceof THREE.Vector3) return value.clone();
  return new THREE.Vector3(value.x, value.y, value.z);
}

function vectorPayload(value) {
  return { x: value.x, y: value.y, z: value.z };
}

function entityCollidesAt(level, position, radius = PLAYER_RADIUS, height = PLAYER_BODY_HEIGHT) {
  const feetY = LEVEL_Y[level];
  const headY = feetY + height;
  return solidTargets.some((mesh) => {
    const c = mesh.userData.collider;
    if (!c) return false;
    if (headY < c.minY || feetY > c.maxY) return false;
    return (
      position.x + radius > c.minX &&
      position.x - radius < c.maxX &&
      position.z + radius > c.minZ &&
      position.z - radius < c.maxZ
    );
  });
}

function playerCollidesAt(position) {
  return entityCollidesAt(player.level, position);
}

function movePlayer(dt) {
  const weapon = weapons[weaponIndex];
  const speed = 9.4 * weapon.move * (player.scoped ? 0.54 : 1);
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const wish = new THREE.Vector3();
  if (keys.has("KeyW")) wish.add(forward.clone().multiplyScalar(-1));
  if (keys.has("KeyS")) wish.add(forward);
  if (keys.has("KeyA")) wish.add(right.clone().multiplyScalar(-1));
  if (keys.has("KeyD")) wish.add(right);
  if (mobileInput.x || mobileInput.y) {
    wish.add(right.clone().multiplyScalar(mobileInput.x));
    wish.add(forward.clone().multiplyScalar(mobileInput.y));
  }
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * dt);
  const limit = bounds[player.level];
  const nextX = player.position.clone();
  nextX.x = THREE.MathUtils.clamp(nextX.x + wish.x, -limit.x, limit.x);
  nextX.y = limit.y;
  if (!playerCollidesAt(nextX)) player.position.x = nextX.x;

  const nextZ = player.position.clone();
  nextZ.z = THREE.MathUtils.clamp(nextZ.z + wish.z, -limit.z, limit.z);
  nextZ.y = limit.y;
  if (!playerCollidesAt(nextZ)) player.position.z = nextZ.z;

  if (match.phase === "prep" && player.level === "surface") {
    player.position.x = THREE.MathUtils.clamp(player.position.x, prepZone.minX, prepZone.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, prepZone.minZ, prepZone.maxZ);
  }

  if (!player.grounded) {
    player.velocityY -= GRAVITY * dt;
    player.jumpOffset += player.velocityY * dt;
    if (player.jumpOffset <= 0) {
      player.jumpOffset = 0;
      player.velocityY = 0;
      player.grounded = true;
    }
  }

  player.position.y = limit.y;
  camera.position.set(player.position.x, player.position.y + player.jumpOffset, player.position.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function useElevator() {
  const onPad = Math.hypot(player.position.x, player.position.z) < 6.5;
  if (!onPad) {
    log("엘리베이터는 중앙 노란 패드에서만 작동합니다.");
    return;
  }
  player.level = player.level === "surface" ? "underground" : "surface";
  player.position.y = bounds[player.level].y;
  player.velocityY = 0;
  player.jumpOffset = 0;
  player.grounded = true;
  log(`엘리베이터 이동: ${levelNames[player.level]}`);
}

function getCurrentBombSite() {
  if (player.level !== "surface") return null;
  const x = player.position.x;
  const z = player.position.z;
  if (Math.hypot(x + 26, z + 26) < 10) return "A";
  if (Math.hypot(x - 28, z - 24) < 10) return "B";
  return null;
}

function plantBomb() {
  if (player.team !== "attack") {
    log("공격팀만 폭탄을 설치할 수 있습니다.");
    return;
  }
  if (match.phase !== "combat") {
    log("폭탄은 전투 시간에만 설치할 수 있습니다.");
    return;
  }
  if (match.bombPlanted) {
    log(`${match.bombSite}에 이미 폭탄이 설치되었습니다.`);
    return;
  }
  const site = getCurrentBombSite();
  if (!site) {
    log("폭탄은 지상 A 또는 지상 B 안에서만 설치할 수 있습니다.");
    return;
  }
  match.bombPlanted = true;
  match.bombSite = site;
  match.bombEnd = performance.now() / 1000 + BOMB_SECONDS;
  log(`${site} 사이트에 폭탄 설치. ${BOMB_SECONDS}초 뒤 폭발합니다.`);
}

function updateBots(time) {
  bots.forEach((bot, index) => {
    if (!bot.alive) return;
    const radius = 3.2 + index * 0.35;
    const next = bot.group.position.clone();
    next.x = bot.base.x + Math.sin(time * 0.45 + index) * radius;
    next.z = bot.base.z + Math.cos(time * 0.32 + index) * radius;
    next.y = LEVEL_Y[bot.level];
    if (!entityCollidesAt(bot.level, next, 0.68, 2.55)) {
      bot.group.position.copy(next);
    } else {
      bot.group.position.y = LEVEL_Y[bot.level];
    }
    bot.group.lookAt(camera.position.x, bot.group.position.y + 1.4, camera.position.z);
    bot.group.userData.marker.visible = bot.level !== player.level;
    botShoot(bot, time);
  });
}

function botShoot(bot, time) {
  if (match.phase !== "combat" || !player.alive || bot.level !== player.level) return;
  const weapon = weapons[bot.weaponIndex] ?? weapons[1];
  const distance = bot.group.position.distanceTo(player.position);
  const maxRange = weapon.name === "저격" ? 76 : weapon.name === "기관총" || weapon.name === "소총" ? 54 : 38;
  if (distance > maxRange || time - bot.lastShot < 1 / Math.max(0.7, weapon.rate * 0.42)) return;
  bot.lastShot = time;
  const accuracy =
    weapon.name === "저격" ? 0.62 :
    weapon.name === "소총" ? 0.5 :
    weapon.name === "기관총" ? 0.44 :
    weapon.name === "산탄총" ? (distance < 20 ? 0.58 : 0.24) :
    weapon.name === "고총" ? 0.38 : 0.2;
  if (Math.random() < accuracy) {
    const damage = weapon.name === "저격" ? 45 : weapon.name === "소총" ? 18 : weapon.name === "기관총" ? 14 : weapon.name === "산탄총" ? 22 : 12;
    player.hp = Math.max(0, player.hp - damage);
    player.alive = player.hp > 0;
    if (!player.alive) bot.money = Math.min(MONEY_CAP, bot.money + KILL_MONEY);
    log(`${bot.name} ${weapon.name} 피격 · 체력 ${player.hp}`);
  }
  const dir = player.position.clone().sub(bot.group.position).normalize();
  drawTracer(bot.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)), dir, 0xff7668);
}

function updateRemoteMarkers() {
  remotePlayers.forEach((remote) => {
    remote.group.userData.marker.visible = remote.alive && remote.level !== player.level;
  });
}

function updateHud(time) {
  const secondsLeft = Math.max(0, Math.ceil(match.phaseEnd - time));
  ui.hp.textContent = player.hp;
  ui.armor.textContent = player.armor;
  ui.level.textContent = levelNames[player.level];
  ui.speed.textContent = weapons[weaponIndex].move > 1 ? "빠름" : weapons[weaponIndex].move < 0.8 ? "느림" : "보통";
  ui.site.textContent = getSite();
  ui.round.textContent = match.ended
    ? "종료"
    : `${match.bombPlanted ? `${match.bombSite} 폭탄` : match.phase === "prep" ? "준비" : match.phase === "combat" ? "전투" : "정산"} ${match.round}R`;
  ui.score.textContent = `${match.playerScore} : ${match.enemyScore}`;
  ui.money.textContent = `$${player.money}`;
  ui.timer.textContent = match.ended
    ? "--"
    : String(match.bombPlanted ? Math.max(0, Math.ceil(match.bombEnd - time)) : secondsLeft);
  ui.shopHint.textContent = match.phase === "prep" ? "준비 시간: 총과 갑옷 구매 가능" : "전투 중: 구매 불가";
  const crossLevelThreat = bots.some((bot) => bot.alive && bot.level !== player.level) || [...remotePlayers.values()].some((remote) => remote.alive && remote.level !== player.level);
  ui.intel.textContent = crossLevelThreat ? "다른 층 적 있음" : "같은 층 확인";
  ui.intel.classList.toggle("revealed", crossLevelThreat);
}

function getSite() {
  const x = player.position.x;
  const z = player.position.z;
  if (player.level === "surface") {
    if (Math.hypot(x + 26, z + 26) < 12) return "지상 A";
    if (Math.hypot(x - 28, z - 24) < 12) return "지상 B";
    if (z > prepZone.minZ && Math.abs(x) < prepZone.maxX) return "공격 시작";
    if (z < -36 && Math.abs(x) < 14) return "수비 시작";
  }
  if (player.level === "underground") return "지하";
  if (Math.hypot(x, z) < 8) return "엘리베이터";
  return "중앙";
}

function sendStateIfNeeded(time) {
  if (networkStatus !== "online") return;
  if (time - lastNetSend < 1 / 14) return;
  lastNetSend = time;
  sendNet("state", { state: makeNetworkState() });
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;
  const now = performance.now() / 1000;
  if (fireHeld) shoot(false);
  advanceRoundIfNeeded(now);
  movePlayer(dt);
  updateBots(elapsed);
  updateRemoteMarkers();
  updateHeldWeaponMotion(elapsed);
  updateScopeView();
  updateHud(now);
  sendStateIfNeeded(elapsed);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function beginFire() {
  if (!fireHeld) {
    firingSince = performance.now() / 1000;
    burstShots = 0;
  }
  fireHeld = true;
  shoot(false);
}

function endFire() {
  fireHeld = false;
  firingSince = 0;
  burstShots = 0;
}

function setMobileJoystick(event) {
  const dx = event.clientX - mobileInput.centerX;
  const dy = event.clientY - mobileInput.centerY;
  const max = 42;
  const length = Math.min(max, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const knobX = Math.cos(angle) * length;
  const knobY = Math.sin(angle) * length;
  mobileInput.x = knobX / max;
  mobileInput.y = knobY / max;
  ui.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
}

function resetMobileJoystick() {
  mobileInput.x = 0;
  mobileInput.y = 0;
  mobileInput.activeId = null;
  ui.joystickKnob.style.transform = "translate(-50%, -50%)";
}

function startMobileAim() {
  const weapon = weapons[weaponIndex];
  if (weapon.name === "칼") shoot(true);
  else if (canScopeWeapon(weapon)) player.scoped = true;
}

function stopMobileAim() {
  player.scoped = false;
}

function bindHoldButton(button, onDown, onUp = () => {}) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    onDown(event);
  });
  button.addEventListener("pointerup", (event) => {
    event.preventDefault();
    onUp(event);
  });
  button.addEventListener("pointercancel", (event) => {
    event.preventDefault();
    onUp(event);
  });
}

function initMobileControls() {
  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    event.preventDefault();
    mobileLook.activeId = event.pointerId;
    mobileLook.lastX = event.clientX;
    mobileLook.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== mobileLook.activeId) return;
    event.preventDefault();
    const sensitivity = player.scoped ? (weapons[weaponIndex].name === "저격" ? 0.001 : 0.0015) : 0.0026;
    player.yaw -= (event.clientX - mobileLook.lastX) * sensitivity;
    player.pitch -= (event.clientY - mobileLook.lastY) * sensitivity;
    player.pitch = THREE.MathUtils.clamp(player.pitch, -1.32, 1.32);
    mobileLook.lastX = event.clientX;
    mobileLook.lastY = event.clientY;
  });
  canvas.addEventListener("pointerup", (event) => {
    if (event.pointerId === mobileLook.activeId) mobileLook.activeId = null;
  });
  canvas.addEventListener("pointercancel", (event) => {
    if (event.pointerId === mobileLook.activeId) mobileLook.activeId = null;
  });

  ui.joystickBase.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const rect = ui.joystickBase.getBoundingClientRect();
    mobileInput.activeId = event.pointerId;
    mobileInput.centerX = rect.left + rect.width / 2;
    mobileInput.centerY = rect.top + rect.height / 2;
    ui.joystickBase.setPointerCapture(event.pointerId);
    setMobileJoystick(event);
  });
  ui.joystickBase.addEventListener("pointermove", (event) => {
    if (event.pointerId !== mobileInput.activeId) return;
    event.preventDefault();
    setMobileJoystick(event);
  });
  ui.joystickBase.addEventListener("pointerup", (event) => {
    if (event.pointerId === mobileInput.activeId) resetMobileJoystick();
  });
  ui.joystickBase.addEventListener("pointercancel", resetMobileJoystick);

  bindHoldButton(ui.mobileFire, beginFire, endFire);
  bindHoldButton(ui.mobileAim, startMobileAim, stopMobileAim);
  bindHoldButton(ui.mobileJump, jump);
  bindHoldButton(ui.mobilePlant, plantBomb);
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  const number = Number(event.key);
  if (number >= 1 && number <= 6) handleWeaponSlot(number - 1);
  if (event.code === "KeyE") useElevator();
  if (event.code === "KeyF") plantBomb();
  if (event.code === "Space") {
    event.preventDefault();
    jump();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));

window.addEventListener("mousedown", (event) => {
  if (event.button === 1) {
    event.preventDefault();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    log("마우스가 풀렸습니다. 버튼을 누른 뒤 가운데 시작 버튼으로 복귀하세요.");
    return;
  }
  if (event.target.closest?.(".server-panel, .shop-panel, .weapon-row")) return;
  if (document.pointerLockElement !== canvas) return;
  if (event.button === 0) beginFire();
  if (event.button === 2) {
    const weapon = weapons[weaponIndex];
    if (weapon.name === "칼") shoot(true);
    else if (canScopeWeapon(weapon)) player.scoped = true;
  }
});

window.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) endFire();
  if (event.button === 2) player.scoped = false;
});

window.addEventListener("blur", endFire);
window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
  const sensitivity = player.scoped ? (weapons[weaponIndex].name === "저격" ? 0.00072 : 0.00135) : 0.0022;
  player.yaw -= event.movementX * sensitivity;
  player.pitch -= event.movementY * sensitivity;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.32, 1.32);
});

ui.start.addEventListener("click", async () => {
  startAudio();
  try {
    await canvas.requestPointerLock();
  } catch (error) {
    console.warn(error);
  }
  ui.start.style.display = "none";
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas) {
    endFire();
    ui.start.style.display = "block";
    ui.start.querySelector("span").textContent = "클릭해서 계속";
  }
});

buildSurfaceMap();
buildUndergroundMap();
buildElevator();
buildPrepBarrier();
setupBots();
initHeldWeaponView();
initMobileControls();
initUi();
resize();
camera.position.copy(player.position);
animate();
