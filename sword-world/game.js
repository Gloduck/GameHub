(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const restartButton = document.getElementById("restartButton");
  const surviveTimeEl = document.getElementById("surviveTime");
  const killCountEl = document.getElementById("killCount");
  const bladeCountEl = document.getElementById("bladeCount");

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const CHUNK_SIZE = 640;
  const ACTIVE_RADIUS = 2;
  const MAX_ENEMIES = 18;
  const BLADE_DISTANCE = 48;
  const BLADE_SIZE = 10;
  const PICKUP_RADIUS = 12;
  const BODY_RADIUS = 20;
  const ENEMY_BODY_RADIUS = 18;
  const PLAYER_SPEED = 190;
  const ENEMY_SPEED = 112;
  const BLADE_SPIN = 2.85;
  const CAMERA_PULLBACK = 0.88;
  const PI2 = Math.PI * 2;
  const WORLD_SEED = 71237;
  const SHOW_HITBOX = (() => {
    const value = new URLSearchParams(window.location.search).get("hitbox");
    return value === "1" || value === "true" || value === "on" || value === "show";
  })();

  const keys = new Set();
  const chunks = new Map();
  const world = {
    pickups: new Map(),
  };
  const effects = [];
  const assets = {};
  const assetConfig = {
    playerSheet: { path: "assets/player-sheet.png", scale: 0.205, anchorY: 0.74, frameWidth: 256, frameHeight: 256, frames: 8 },
    enemyRoseSheet: { path: "assets/enemy-rose-sheet.png", scale: 0.195, anchorY: 0.74, frameWidth: 256, frameHeight: 256, frames: 8 },
    enemyTealSheet: { path: "assets/enemy-teal-sheet.png", scale: 0.195, anchorY: 0.74, frameWidth: 256, frameHeight: 256, frames: 8 },
    enemyGoldSheet: { path: "assets/enemy-gold-sheet.png", scale: 0.195, anchorY: 0.74, frameWidth: 256, frameHeight: 256, frames: 8 },
    enemyMintSheet: { path: "assets/enemy-mint-sheet.png", scale: 0.195, anchorY: 0.74, frameWidth: 256, frameHeight: 256, frames: 8 },
    dagger: { path: "assets/dagger.png", scale: 0.08, anchorY: 0.55 },
    tree: { path: "assets/tree.png", scale: 0.175, anchorY: 0.72 },
    sakura: { path: "assets/sakura.png", scale: 0.175, anchorY: 0.72 },
    crystal: { path: "assets/crystal.png", scale: 0.145, anchorY: 0.7 },
    lantern: { path: "assets/lantern.png", scale: 0.118, anchorY: 0.74 },
    stump: { path: "assets/stump.png", scale: 0.118, anchorY: 0.72 },
    ruin: { path: "assets/ruin.png", scale: 0.135, anchorY: 0.74 },
    floorGrass: { path: "assets/floor-grass.png", scale: 1, anchorY: 0.5 },
    floorStone: { path: "assets/floor-stone.png", scale: 1, anchorY: 0.5 },
    floorMeadow: { path: "assets/floor-meadow.png", scale: 1, anchorY: 0.5 },
  };
  const joystick = {
    active: false,
    identifier: null,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
  };

  let viewWidth = 0;
  let viewHeight = 0;
  let time = 0;
  let enemySpawnTimer = 0;
  let nextPickupId = 1;
  let nextEnemyId = 1;

  const state = {
    running: false,
    player: null,
    enemies: [],
    score: 0,
    kills: 0,
  };

  const obstacleColliderConfig = {
    tree: { shape: "circle", offsetX: 0, offsetY: 18, radius: 24 },
    sakura: { shape: "circle", offsetX: 0, offsetY: 18, radius: 24 },
    stump: { shape: "rect", offsetX: 0, offsetY: 2, width: 34, height: 20 },
    crystal: { shape: "rect", offsetX: 0, offsetY: -2, width: 24, height: 46 },
    lantern: { shape: "rect", offsetX: 0, offsetY: 7, width: 20, height: 30 },
    ruin: { shape: "rect", offsetX: 0, offsetY: 6, width: 40, height: 28 },
  };

  function loadImageAsset(key, config) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        assets[key] = {
          image,
          width: image.width,
          height: image.height,
          scale: config.scale,
          anchorY: config.anchorY,
          frameWidth: config.frameWidth || Math.floor(image.width / (config.frames || 1)),
          frameHeight: config.frameHeight || image.height,
          frames: config.frames || 1,
          loaded: true,
        };
        resolve();
      };
      image.onerror = () => resolve();
      image.src = config.path;
    });
  }

  function preloadAssets() {
    return Promise.all(Object.entries(assetConfig).map(([key, config]) => loadImageAsset(key, config)));
  }

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * DPR);
    canvas.height = Math.floor(height * DPR);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    viewWidth = width;
    viewHeight = height;
  }

  function hash2(a, b) {
    let value = Math.imul((a ^ WORLD_SEED) + 374761393, 668265263);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    value ^= Math.imul((b + 0x9e3779b9) ^ (value >>> 16), 2246822519);
    return (value >>> 0) / 4294967295;
  }

  function randBetween(seedA, seedB, min, max) {
    return min + hash2(seedA, seedB) * (max - min);
  }

  function pick(array, seedA, seedB) {
    return array[Math.floor(hash2(seedA, seedB) * array.length) % array.length];
  }

  function createBlade(owner, angleOffset) {
    return {
      owner,
      angle: angleOffset,
      orbit: BLADE_DISTANCE + randBetween(owner.seed + angleOffset * 99, 77, -4, 8),
      spin: BLADE_SPIN + randBetween(owner.seed + angleOffset * 77, 22, -0.4, 0.55),
      size: BLADE_SIZE + randBetween(owner.seed + angleOffset * 45, 88, -1.4, 1.2),
      removed: false,
    };
  }

  function createPlayer() {
    return {
      id: "player",
      team: "player",
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: BODY_RADIUS,
      hitRadius: 18,
      speed: PLAYER_SPEED,
      blades: [],
      alive: true,
      facing: 1,
      direction8: 0,
      seed: 101,
      assetSheet: "playerSheet",
      blink: 0,
    };
  }

  function createEnemy(x, y) {
    const enemyBases = ["enemyRose", "enemyTeal", "enemyGold", "enemyMint"];
    const assetBase = enemyBases[nextEnemyId % enemyBases.length];
    const enemy = {
      id: nextEnemyId++,
      team: "enemy",
      x,
      y,
      vx: 0,
      vy: 0,
      radius: ENEMY_BODY_RADIUS,
      hitRadius: 17,
      speed: ENEMY_SPEED + randBetween(x, y, -8, 18),
      blades: [],
      alive: true,
      facing: -1,
      direction8: 0,
      seed: x * 13.37 + y * 7.17,
      assetSheet: assetBase + "Sheet",
      blink: randBetween(x, y, 0, PI2),
    };
    if (hash2(x, y) > 0.56) {
      grantRandomBlades(enemy, 1, 3);
    }
    return enemy;
  }

  function restartGame() {
    state.running = true;
    state.player = createPlayer();
    state.enemies = [];
    state.score = 0;
    state.kills = 0;
    time = 0;
    enemySpawnTimer = 0.4;
    nextEnemyId = 1;
    world.pickups.clear();
    effects.length = 0;
    chunks.clear();
    nextPickupId = 1;
    overlay.classList.add("hidden");
  }

  function addPickup(x, y, options) {
    const pickup = {
      id: nextPickupId++,
      x,
      y,
      bob: randBetween(x, y, 0, PI2),
      vx: options?.vx || 0,
      vy: options?.vy || 0,
      age: 0,
      settle: options?.settle || 0,
      scale: options?.scale || 0.72,
    };
    resolvePickupObstacleCollisions(pickup);
    world.pickups.set(pickup.id, pickup);
    return pickup;
  }

  function spawnBurst(x, y, color, count, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const angle = (PI2 * i) / Math.max(count, 1) + hash2(x + i, y - i) * 0.4;
      const velocity = speed * (0.6 + hash2(y + i, x - i) * 0.8);
      effects.push({
        type: "particle",
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        drag: 0.92,
        life,
        maxLife: life,
        size: size * (0.7 + hash2(i, x) * 0.9),
        color,
      });
    }
  }

  function spawnBladeClash(x, y, team) {
    spawnBurst(x, y, team === "player" ? "#9cf6ff" : "#ff9ec6", 7, 82, 0.28, 4);
    effects.push({ type: "ring", x, y, life: 0.18, maxLife: 0.18, radius: 8, color: team === "player" ? "rgba(156,246,255,0.45)" : "rgba(255,158,198,0.45)" });
  }

  function spawnObstacleShards(x, y) {
    spawnBurst(x, y, "#f4f8ff", 5, 74, 0.26, 3.5);
  }

  function spawnDeathEffect(entity) {
    const base = entity.team === "player" ? "#93dfff" : "#ff90be";
    spawnBurst(entity.x, entity.y, base, 16, 110, 0.58, 6);
    spawnBurst(entity.x, entity.y, "#ffffff", 8, 78, 0.32, 3.5);
    effects.push({ type: "ring", x: entity.x, y: entity.y, life: 0.36, maxLife: 0.36, radius: 16, color: entity.team === "player" ? "rgba(147,223,255,0.36)" : "rgba(255,144,190,0.34)" });
  }

  function spawnSlashTrail(x, y, team) {
    effects.push({
      type: "slash",
      x,
      y,
      life: 0.16,
      maxLife: 0.16,
      radius: 18,
      color: team === "player" ? "rgba(124,231,255,0.28)" : "rgba(255,138,184,0.26)",
    });
  }

  function grantRandomBlades(entity, min, max) {
    const count = Math.floor(randBetween(entity.seed + time * 100, entity.blades.length + 1, min, max + 1));
    const current = entity.blades.length;
    const limit = 14;
    const target = Math.min(limit, current + count);
    for (let i = current; i < target; i += 1) {
      entity.blades.push(createBlade(entity, (PI2 * i) / Math.max(target, 1)));
    }
    redistributeBlades(entity);
  }

  function redistributeBlades(entity) {
    const total = entity.blades.length;
    entity.blades.forEach((blade, index) => {
      blade.angle = (PI2 * index) / Math.max(total, 1) + index * 0.04;
    });
  }

  function obstacleCollider(type) {
    return obstacleColliderConfig[type] || { shape: "circle", offsetX: 0, offsetY: 0, radius: 18 };
  }

  function obstacleBroadRadius(collider) {
    if (collider.shape === "circle") {
      return collider.radius;
    }
    return Math.hypot(collider.width * 0.5, collider.height * 0.5);
  }

  function entityCircle(entity) {
    return { x: entity.x, y: entity.y, radius: entity.hitRadius || entity.radius };
  }

  function bladeRect(entity, blade) {
    const pos = bladePosition(entity, blade);
    const tangent = blade.angle + Math.PI * 0.5;
    const centerOffset = blade.size * 0.4;
    return {
      shape: "rect",
      x: pos.x + Math.cos(tangent) * centerOffset,
      y: pos.y + Math.sin(tangent) * centerOffset,
      width: blade.size * 1.4,
      height: blade.size * 4.6,
      rotation: tangent,
    };
  }

  function obstacleShape(obstacle) {
    const collider = obstacle.collider || obstacleCollider(obstacle.type);
    if (collider.shape === "circle") {
      return {
        shape: "circle",
        x: obstacle.x + collider.offsetX,
        y: obstacle.y + collider.offsetY,
        radius: collider.radius,
      };
    }
    return {
      shape: "rect",
      x: obstacle.x + collider.offsetX,
      y: obstacle.y + collider.offsetY,
      width: collider.width,
      height: collider.height,
      rotation: 0,
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rotatePoint(x, y, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos,
    };
  }

  function circleIntersectsCircle(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y) < a.radius + b.radius;
  }

  function circleIntersectsRect(circle, rect) {
    const local = rotatePoint(circle.x - rect.x, circle.y - rect.y, -(rect.rotation || 0));
    const halfW = rect.width * 0.5;
    const halfH = rect.height * 0.5;
    const closestX = clamp(local.x, -halfW, halfW);
    const closestY = clamp(local.y, -halfH, halfH);
    const dx = local.x - closestX;
    const dy = local.y - closestY;
    return dx * dx + dy * dy < circle.radius * circle.radius;
  }

  function shapesIntersect(a, b) {
    if (a.shape === "circle" && b.shape === "circle") {
      return circleIntersectsCircle(a, b);
    }
    if (a.shape === "circle" && b.shape === "rect") {
      return circleIntersectsRect(a, b);
    }
    if (a.shape === "rect" && b.shape === "circle") {
      return circleIntersectsRect(b, a);
    }
    const aRadius = Math.hypot(a.width * 0.5, a.height * 0.5);
    const bRadius = Math.hypot(b.width * 0.5, b.height * 0.5);
    return Math.hypot(a.x - b.x, a.y - b.y) < aRadius + bRadius;
  }

  function pushCircleOutOfCircle(circle, blocker) {
    const dx = circle.x - blocker.x;
    const dy = circle.y - blocker.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const overlap = circle.radius + blocker.radius - dist;
    if (overlap <= 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: (dx / dist) * overlap,
      y: (dy / dist) * overlap,
    };
  }

  function pushCircleOutOfRect(circle, rect) {
    const local = rotatePoint(circle.x - rect.x, circle.y - rect.y, -(rect.rotation || 0));
    const halfW = rect.width * 0.5;
    const halfH = rect.height * 0.5;
    const closestX = clamp(local.x, -halfW, halfW);
    const closestY = clamp(local.y, -halfH, halfH);
    let deltaX = local.x - closestX;
    let deltaY = local.y - closestY;
    let dist = Math.hypot(deltaX, deltaY);
    let pushX = 0;
    let pushY = 0;

    if (dist > 0.001) {
      const overlap = circle.radius - dist;
      if (overlap <= 0) {
        return { x: 0, y: 0 };
      }
      pushX = (deltaX / dist) * overlap;
      pushY = (deltaY / dist) * overlap;
    } else {
      const left = halfW + local.x;
      const right = halfW - local.x;
      const top = halfH + local.y;
      const bottom = halfH - local.y;
      const minAxis = Math.min(left, right, top, bottom);
      if (minAxis === left) {
        pushX = -(circle.radius + left);
      } else if (minAxis === right) {
        pushX = circle.radius + right;
      } else if (minAxis === top) {
        pushY = -(circle.radius + top);
      } else {
        pushY = circle.radius + bottom;
      }
    }

    return rotatePoint(pushX, pushY, rect.rotation || 0);
  }

  function resolvePickupObstacleCollisions(pickup) {
    const body = { x: pickup.x, y: pickup.y, radius: PICKUP_RADIUS };
    for (let i = 0; i < 3; i += 1) {
      let moved = false;
      forNearbyObstacles(body.x, body.y, 120, (obstacle) => {
        if (Math.abs(obstacle.x - body.x) > 80 || Math.abs(obstacle.y - body.y) > 80) {
          return;
        }
        const shape = obstacleShape(obstacle);
        const push = shape.shape === "circle"
          ? pushCircleOutOfCircle(body, shape)
          : pushCircleOutOfRect(body, shape);
        if (push.x || push.y) {
          body.x += push.x;
          body.y += push.y;
          moved = true;
        }
      });
      if (!moved) {
        break;
      }
    }
    pickup.x = body.x;
    pickup.y = body.y;
  }

  function removeBlade(entity, blade) {
    blade.removed = true;
    entity.blades = entity.blades.filter((item) => !item.removed);
    redistributeBlades(entity);
  }

  function ensureChunksAround(x, y) {
    const centerChunkX = Math.floor(x / CHUNK_SIZE);
    const centerChunkY = Math.floor(y / CHUNK_SIZE);
    for (let cy = centerChunkY - ACTIVE_RADIUS; cy <= centerChunkY + ACTIVE_RADIUS; cy += 1) {
      for (let cx = centerChunkX - ACTIVE_RADIUS; cx <= centerChunkX + ACTIVE_RADIUS; cx += 1) {
        ensureChunk(cx, cy);
      }
    }
  }

  function ensureChunk(cx, cy) {
    const key = cx + "," + cy;
    if (chunks.has(key)) {
      return;
    }

    const chunk = { key, cx, cy, obstacles: [], decorations: [] };
    const baseX = cx * CHUNK_SIZE;
    const baseY = cy * CHUNK_SIZE;

    const obstacleCount = 5 + Math.floor(hash2(cx * 31, cy * 47) * 5);
    for (let i = 0; i < obstacleCount; i += 1) {
      const ox = baseX + randBetween(cx * 73 + i, cy * 37 + i, 58, CHUNK_SIZE - 58);
      const oy = baseY + randBetween(cy * 91 + i, cx * 29 + i, 58, CHUNK_SIZE - 58);
      const distFromOrigin = Math.hypot(ox, oy);
      if (distFromOrigin < 160) {
        continue;
      }
      const type = pick(["tree", "sakura", "stump", "crystal", "lantern", "ruin"], cx * 17 + i, cy * 13 + i);
      const collider = obstacleCollider(type);
      chunk.obstacles.push({ x: ox, y: oy, radius: obstacleBroadRadius(collider), type, collider });
    }

    const pickupCount = 2 + Math.floor(hash2(cx * 7, cy * 5) * 3);
    for (let i = 0; i < pickupCount; i += 1) {
      const px = baseX + randBetween(cx * 149 + i, cy * 157 + i, 48, CHUNK_SIZE - 48);
      const py = baseY + randBetween(cy * 173 + i, cx * 181 + i, 48, CHUNK_SIZE - 48);
      if (Math.hypot(px, py) < 140) {
        continue;
      }
      addPickup(px, py);
    }

    chunks.set(key, chunk);
  }

  function getActiveChunks(x, y, radius) {
    const list = [];
    const centerChunkX = Math.floor(x / CHUNK_SIZE);
    const centerChunkY = Math.floor(y / CHUNK_SIZE);
    for (let cy = centerChunkY - radius; cy <= centerChunkY + radius; cy += 1) {
      for (let cx = centerChunkX - radius; cx <= centerChunkX + radius; cx += 1) {
        const chunk = chunks.get(cx + "," + cy);
        if (chunk) {
          list.push(chunk);
        }
      }
    }
    return list;
  }

  function forNearbyObstacles(x, y, radius, callback) {
    const chunkRadius = Math.max(1, Math.ceil(radius / CHUNK_SIZE));
    const activeChunks = getActiveChunks(x, y, chunkRadius);
    for (const chunk of activeChunks) {
      for (const obstacle of chunk.obstacles) {
        callback(obstacle);
      }
    }
  }

  function getInputVector() {
    let x = 0;
    let y = 0;
    if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) x -= 1;
    if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) x += 1;
    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) y -= 1;
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) y += 1;

    if (joystick.active) {
      x += joystick.x;
      y += joystick.y;
    }

    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length, active: Math.abs(x) > 0.02 || Math.abs(y) > 0.02 };
  }

  function moveEntity(entity, dt) {
    entity.x += entity.vx * dt;
    resolveObstacleCollisions(entity);
    entity.y += entity.vy * dt;
    resolveObstacleCollisions(entity);
    updateEntityFacing(entity);
  }

  function updateEntityFacing(entity) {
    const absX = Math.abs(entity.vx);
    const absY = Math.abs(entity.vy);
    if (absX < 4 && absY < 4) {
      return;
    }

    if (absX > 4) {
      entity.facing = entity.vx >= 0 ? 1 : -1;
    }

    const octant = Math.round(Math.atan2(entity.vy, entity.vx) / (Math.PI / 4));
    const octantToFrame = {
      0: 6,
      1: 7,
      2: 0,
      3: 1,
      4: 2,
      "-4": 2,
      "-3": 3,
      "-2": 4,
      "-1": 5,
    };
    entity.direction8 = octantToFrame[octant] ?? entity.direction8;
  }

  function resolveObstacleCollisions(entity) {
    const body = entityCircle(entity);
    forNearbyObstacles(entity.x, entity.y, 120, (obstacle) => {
      if (Math.abs(obstacle.x - entity.x) > 80 || Math.abs(obstacle.y - entity.y) > 80) {
        return;
      }
      const shape = obstacleShape(obstacle);
      const push = shape.shape === "circle"
        ? pushCircleOutOfCircle(body, shape)
        : pushCircleOutOfRect(body, shape);
      if (push.x || push.y) {
        entity.x += push.x;
        entity.y += push.y;
        body.x += push.x;
        body.y += push.y;
      }
    });
  }

  function separateBodies(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const minDist = (a.hitRadius || a.radius) + (b.hitRadius || b.radius) + 2;
    if (dist >= minDist) {
      return;
    }
    const overlap = (minDist - dist) * 0.5;
    const nx = dx / dist;
    const ny = dy / dist;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
  }

  function updatePlayer(dt) {
    const player = state.player;
    const input = getInputVector();
    player.vx = input.active ? input.x * player.speed : 0;
    player.vy = input.active ? input.y * player.speed : 0;
    moveEntity(player, dt);
    player.blink += dt * 4;
  }

  function nearestPickupFrom(entity, maxDistance) {
    let closest = null;
    let closestDist = maxDistance;
    for (const pickup of world.pickups.values()) {
      const dist = Math.hypot(entity.x - pickup.x, entity.y - pickup.y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = pickup;
      }
    }
    return closest;
  }

  function updateEnemies(dt) {
    const player = state.player;
    for (const enemy of state.enemies) {
      if (!enemy.alive) {
        continue;
      }
      let targetX = player.x;
      let targetY = player.y;
      let intentWeight = 1;
      const pickup = nearestPickupFrom(enemy, enemy.blades.length < 5 ? 360 : 180);
      if (pickup) {
        const playerDist = Math.hypot(enemy.x - player.x, enemy.y - player.y);
        const pickupDist = Math.hypot(enemy.x - pickup.x, enemy.y - pickup.y);
        if (enemy.blades.length < 4 || pickupDist < playerDist * 0.72) {
          targetX = pickup.x;
          targetY = pickup.y;
          intentWeight = 0.76;
        }
      }

      let steerX = targetX - enemy.x;
      let steerY = targetY - enemy.y;
      const steerLength = Math.hypot(steerX, steerY) || 1;
      steerX /= steerLength;
      steerY /= steerLength;

      let avoidX = 0;
      let avoidY = 0;
      forNearbyObstacles(enemy.x, enemy.y, 160, (obstacle) => {
        const dx = enemy.x - obstacle.x;
        const dy = enemy.y - obstacle.y;
        const dist = Math.hypot(dx, dy);
        const repel = obstacle.radius + 40 - dist;
        if (repel > 0) {
          avoidX += (dx / (dist || 1)) * repel;
          avoidY += (dy / (dist || 1)) * repel;
        }
      });

      const avoidLength = Math.hypot(avoidX, avoidY) || 1;
      avoidX /= avoidLength;
      avoidY /= avoidLength;

      enemy.vx = (steerX * intentWeight + avoidX * 0.55) * enemy.speed;
      enemy.vy = (steerY * intentWeight + avoidY * 0.55) * enemy.speed;
      moveEntity(enemy, dt);
      enemy.blink += dt * 3.2;
    }

    for (let i = 0; i < state.enemies.length; i += 1) {
      const a = state.enemies[i];
      if (!a.alive) continue;
      separateBodies(state.player, a);
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const b = state.enemies[j];
        if (!b.alive) continue;
        separateBodies(a, b);
      }
    }
  }

  function updateBlades(entity, dt) {
    for (const blade of entity.blades) {
      blade.angle += blade.spin * dt;
    }
  }

  function bladePosition(entity, blade) {
    return {
      x: entity.x + Math.cos(blade.angle) * blade.orbit,
      y: entity.y + Math.sin(blade.angle) * blade.orbit,
    };
  }

  function updatePickups(dt) {
    const entities = [state.player, ...state.enemies.filter((enemy) => enemy.alive)];
    for (const pickup of world.pickups.values()) {
      pickup.age += dt;
      if (pickup.settle > 0) {
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
        pickup.vx *= 0.9;
        pickup.vy *= 0.9;
        pickup.settle -= dt;
      }
      resolvePickupObstacleCollisions(pickup);
      pickup.scale += (1 - pickup.scale) * 0.16;
    }
    for (const entity of entities) {
      for (const pickup of world.pickups.values()) {
        if (Math.abs(entity.x - pickup.x) > 30 || Math.abs(entity.y - pickup.y) > 30) {
          continue;
        }
        if (Math.hypot(entity.x - pickup.x, entity.y - pickup.y) <= entity.radius + 12) {
          world.pickups.delete(pickup.id);
          grantRandomBlades(entity, 1, 5);
          spawnBurst(pickup.x, pickup.y, entity.team === "player" ? "#96f6ff" : "#ffd3e7", 8, 76, 0.32, 4);
        }
      }
    }
  }

  function resolveBladeObstacleHits(entity) {
    for (const blade of [...entity.blades]) {
      const hitbox = bladeRect(entity, blade);
      let hit = false;
      forNearbyObstacles(hitbox.x, hitbox.y, 100, (obstacle) => {
        if (hit) {
          return;
        }
        if (Math.abs(obstacle.x - hitbox.x) > 50 || Math.abs(obstacle.y - hitbox.y) > 50) {
          return;
        }
        if (shapesIntersect(hitbox, obstacleShape(obstacle))) {
          removeBlade(entity, blade);
          spawnObstacleShards(hitbox.x, hitbox.y);
          hit = true;
        }
      });
    }
  }

  function killEntity(entity) {
    entity.alive = false;
    spawnDeathEffect(entity);
    entity.blades.length = 0;
    if (entity.team === "enemy") {
      state.kills += 1;
      for (let i = 0; i < 1 + Math.floor(hash2(entity.x, entity.y) * 2); i += 1) {
        const angle = randBetween(entity.x + i, entity.y - i, 0, PI2);
        const distance = randBetween(entity.y + i, entity.x + i, 8, 28);
        addPickup(
          entity.x + Math.cos(angle) * distance,
          entity.y + Math.sin(angle) * distance,
          {
            vx: Math.cos(angle) * randBetween(i, entity.x, 36, 72),
            vy: Math.sin(angle) * randBetween(i, entity.y, 36, 72),
            settle: 0.22,
            scale: 0.3,
          },
        );
      }
    } else {
      state.running = false;
      restartButton.textContent = "重新开始";
      overlay.classList.remove("hidden");
    }
  }

  function resolveBladeCombat() {
    const player = state.player;
    for (const enemy of state.enemies) {
      if (!enemy.alive) {
        continue;
      }

      for (const playerBlade of [...player.blades]) {
        const pPos = bladePosition(player, playerBlade);

        for (const enemyBlade of [...enemy.blades]) {
          const ePos = bladePosition(enemy, enemyBlade);
          if (Math.hypot(pPos.x - ePos.x, pPos.y - ePos.y) < (playerBlade.size + enemyBlade.size) * 0.82) {
            spawnBladeClash((pPos.x + ePos.x) * 0.5, (pPos.y + ePos.y) * 0.5, player.team);
            removeBlade(player, playerBlade);
            removeBlade(enemy, enemyBlade);
            break;
          }
        }
      }

      for (const blade of [...player.blades]) {
        const hitbox = bladeRect(player, blade);
        if (shapesIntersect(hitbox, { shape: "circle", ...entityCircle(enemy) })) {
          spawnSlashTrail(hitbox.x, hitbox.y, "player");
          killEntity(enemy);
          break;
        }
      }

      if (!enemy.alive) {
        continue;
      }

      for (const blade of [...enemy.blades]) {
        const hitbox = bladeRect(enemy, blade);
        if (shapesIntersect(hitbox, { shape: "circle", ...entityCircle(player) })) {
          spawnSlashTrail(hitbox.x, hitbox.y, "enemy");
          killEntity(player);
          break;
        }
      }
    }

    resolveBladeObstacleHits(player);
    for (const enemy of state.enemies) {
      if (enemy.alive) {
        resolveBladeObstacleHits(enemy);
      }
    }
  }

  function spawnEnemies(dt) {
    enemySpawnTimer -= dt;
    if (enemySpawnTimer > 0 || state.enemies.filter((enemy) => enemy.alive).length >= MAX_ENEMIES) {
      return;
    }

    enemySpawnTimer = 1.1 + hash2(time * 100, state.kills + 7) * 0.8;
    const angle = hash2(time * 200, state.kills + 11) * PI2;
    const distance = Math.max(viewWidth, viewHeight) * 0.58 + 240;
    const x = state.player.x + Math.cos(angle) * distance;
    const y = state.player.y + Math.sin(angle) * distance;
    ensureChunksAround(x, y);
    state.enemies.push(createEnemy(x, y));
  }

  function cullEnemies() {
    state.enemies = state.enemies.filter((enemy) => {
      if (enemy.alive) {
        return true;
      }
      return false;
    });
  }

  function update(dt) {
    if (!state.running) {
      return;
    }
    time += dt;
    state.score = time;
    ensureChunksAround(state.player.x, state.player.y);
    updatePlayer(dt);
    updateEnemies(dt);
    updateBlades(state.player, dt);
    for (const enemy of state.enemies) {
      if (enemy.alive) {
        updateBlades(enemy, dt);
      }
    }
    updatePickups(dt);
    resolveBladeCombat();
    updateEffects(dt);
    spawnEnemies(dt);
    cullEnemies();
  }

  function updateEffects(dt) {
    for (const effect of effects) {
      effect.life -= dt;
      if (effect.type === "particle") {
        effect.x += effect.vx * dt;
        effect.y += effect.vy * dt;
        effect.vx *= effect.drag;
        effect.vy *= effect.drag;
      }
    }
    for (let i = effects.length - 1; i >= 0; i -= 1) {
      if (effects[i].life <= 0) {
        effects.splice(i, 1);
      }
    }
  }

  function worldToScreen(x, y) {
    return {
      x: (x - state.player.x) * CAMERA_PULLBACK + viewWidth * 0.5,
      y: (y - state.player.y) * CAMERA_PULLBACK + viewHeight * 0.5,
    };
  }

  function renderGround() {
    const gradient = ctx.createLinearGradient(0, 0, 0, viewHeight);
    gradient.addColorStop(0, "#17243b");
    gradient.addColorStop(0.55, "#11202a");
    gradient.addColorStop(1, "#0b131b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const tile = 84;
    const startX = Math.floor((state.player.x - viewWidth * 0.5) / tile) - 1;
    const endX = Math.floor((state.player.x + viewWidth * 0.5) / tile) + 1;
    const startY = Math.floor((state.player.y - viewHeight * 0.5) / tile) - 1;
    const endY = Math.floor((state.player.y + viewHeight * 0.5) / tile) + 1;

    for (let gy = startY; gy <= endY; gy += 1) {
      for (let gx = startX; gx <= endX; gx += 1) {
        const worldX = gx * tile;
        const worldY = gy * tile;
        const screen = worldToScreen(worldX, worldY);
        const noise = hash2(gx, gy);
        const biome = hash2(Math.floor(gx / 4), Math.floor(gy / 4));
        const spriteKey = biome > 0.68 ? "floorStone" : biome < 0.24 ? "floorGrass" : "floorMeadow";
        const floorSprite = assets[spriteKey];
        const floorLoaded = floorSprite && floorSprite.loaded;
        if (floorLoaded) {
          ctx.drawImage(floorSprite.image, Math.floor(screen.x), Math.floor(screen.y), tile + 1, tile + 1);
        } else {
          ctx.fillStyle = "#7a7a7a";
          ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), tile + 1, tile + 1);
          continue;
        }

        if (biome > 0.7) {
          ctx.fillStyle = "rgba(255,255,255,0.04)";
          ctx.fillRect(Math.floor(screen.x) + 4, Math.floor(screen.y) + 4, tile - 10, 5);
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.fillRect(Math.floor(screen.x) + 6, Math.floor(screen.y) + tile - 10, tile - 12, 4);
        }

        if (biome < 0.25) {
          ctx.fillStyle = "rgba(55, 150, 124, 0.22)";
          ctx.fillRect(Math.floor(screen.x) + 8, Math.floor(screen.y) + 18, tile - 16, tile - 24);
        }

        if (noise > 0.58 && noise < 0.66) {
          ctx.fillStyle = "rgba(158, 228, 167, 0.10)";
          ctx.fillRect(Math.floor(screen.x) + 10, Math.floor(screen.y) + 11, 8, 8);
          ctx.fillRect(Math.floor(screen.x) + 29, Math.floor(screen.y) + 28, 7, 7);
        }

        if (noise < 0.08) {
          ctx.fillStyle = "rgba(123, 191, 255, 0.12)";
          ctx.fillRect(Math.floor(screen.x) + 14, Math.floor(screen.y) + 16, tile - 28, tile - 30);
        }
      }
    }
  }

  function drawObstacle(obstacle) {
    const screen = worldToScreen(obstacle.x, obstacle.y);
    if (screen.x < -80 || screen.x > viewWidth + 80 || screen.y < -80 || screen.y > viewHeight + 80) {
      return;
    }

    const spriteKey = obstacle.type === "tree"
      ? "tree"
      : obstacle.type === "sakura"
        ? "sakura"
        : obstacle.type === "crystal"
          ? "crystal"
          : obstacle.type === "lantern"
            ? "lantern"
            : obstacle.type === "stump"
              ? "stump"
              : obstacle.type === "ruin"
                ? "ruin"
                : null;
    drawSpriteKey(spriteKey, screen.x, screen.y, 1);
  }

  function drawPickup(pickup) {
    const screen = worldToScreen(pickup.x, pickup.y + Math.sin(time * 3 + pickup.bob) * 4);
    if (screen.x < -40 || screen.x > viewWidth + 40 || screen.y < -40 || screen.y > viewHeight + 40) {
      return;
    }
    ctx.fillStyle = "rgba(80, 255, 204, 0.16)";
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 22, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "rgba(176, 255, 226, 0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 14 + Math.sin(time * 4 + pickup.bob) * 2, 0, PI2);
    ctx.stroke();
    drawSpriteKey("dagger", screen.x, screen.y, pickup.scale * 0.92, 0);
  }

  function drawSpriteKey(key, x, y, scaleMultiplier, rotation, options) {
    const sprite = assets[key];
    if (!sprite || !sprite.loaded) {
      return false;
    }
    const frameIndex = options?.frameIndex ?? 0;
    const sourceWidth = sprite.frameWidth;
    const sourceHeight = sprite.frameHeight;
    const width = sourceWidth * sprite.scale * scaleMultiplier * CAMERA_PULLBACK;
    const height = sourceHeight * sprite.scale * scaleMultiplier * CAMERA_PULLBACK;
    const scaleX = options?.scaleX ?? 1;
    const scaleY = options?.scaleY ?? 1;
    const offsetX = options?.offsetX ?? 0;
    const offsetY = options?.offsetY ?? 0;
    const sx = Math.max(0, Math.min(sprite.frames - 1, frameIndex)) * sourceWidth;
    ctx.save();
    ctx.translate(x + offsetX, y + offsetY);
    if (rotation) {
      ctx.rotate(rotation);
    }
    ctx.scale(scaleX, scaleY);
    ctx.drawImage(sprite.image, sx, 0, sourceWidth, sourceHeight, -width * 0.5, -height * sprite.anchorY, width, height);
    ctx.restore();
    return true;
  }

  function drawCharacter(entity) {
    const screen = worldToScreen(entity.x, entity.y);
    const speed = Math.hypot(entity.vx, entity.vy);
    const moveBlend = Math.min(1, speed / Math.max(entity.speed, 1));
    const gait = time * (7 + moveBlend * 7) + entity.seed * 0.03;
    const sway = Math.sin(gait) * (1.1 + moveBlend * 1.9);
    const bob = Math.abs(Math.sin(gait * 0.5)) * (1.2 + moveBlend * 2.5);
    const lean = Math.max(-0.18, Math.min(0.18, entity.vx / Math.max(entity.speed, 1) * 0.12));
    const squash = 1 + Math.sin(gait) * 0.015 + moveBlend * 0.02;

    ctx.fillStyle = entity.team === "player" ? "rgba(96, 170, 255, 0.24)" : "rgba(255, 137, 191, 0.20)";
    ctx.beginPath();
    ctx.ellipse(screen.x, screen.y + 18, (entity.radius + 10) * CAMERA_PULLBACK, 7 * CAMERA_PULLBACK, 0, 0, PI2);
    ctx.fill();

    drawSpriteKey(entity.assetSheet, screen.x, screen.y + 4 - bob, (entity.team === "player" ? 1.04 : 0.98) * squash, lean * 0.6 + sway * 0.004, {
      frameIndex: entity.direction8,
      offsetY: entity.direction8 === 4 ? -4 : entity.direction8 === 0 ? 2 : 0,
    });
  }

  function drawBlades(entity) {
    for (const blade of entity.blades) {
      const pos = bladePosition(entity, blade);
      const screen = worldToScreen(pos.x, pos.y);
      const tangent = blade.angle + Math.PI * 0.5;
      const accent = entity.team === "player" ? "#7ce7ff" : "#ff8ab8";
      ctx.strokeStyle = entity.team === "player" ? "rgba(124, 231, 255, 0.18)" : "rgba(255, 138, 184, 0.16)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 6 + blade.size * 0.3, tangent - 0.8, tangent + 0.8);
      ctx.stroke();
      drawSpriteKey("dagger", screen.x, screen.y, blade.size / 10, tangent);
    }
  }

  function drawDebugShape(shape, fill, stroke) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    if (shape.shape === "circle") {
      const screen = worldToScreen(shape.x, shape.y);
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, shape.radius * CAMERA_PULLBACK, 0, PI2);
      ctx.fill();
      ctx.stroke();
    } else {
      const screen = worldToScreen(shape.x, shape.y);
      ctx.translate(screen.x, screen.y);
      ctx.rotate(shape.rotation || 0);
      ctx.fillRect(-shape.width * 0.5 * CAMERA_PULLBACK, -shape.height * 0.5 * CAMERA_PULLBACK, shape.width * CAMERA_PULLBACK, shape.height * CAMERA_PULLBACK);
      ctx.strokeRect(-shape.width * 0.5 * CAMERA_PULLBACK, -shape.height * 0.5 * CAMERA_PULLBACK, shape.width * CAMERA_PULLBACK, shape.height * CAMERA_PULLBACK);
    }
    ctx.restore();
  }

  function drawHitboxes() {
    for (const chunk of getActiveChunks(state.player.x, state.player.y, ACTIVE_RADIUS)) {
      for (const obstacle of chunk.obstacles) {
        drawDebugShape(obstacleShape(obstacle), "rgba(82, 255, 164, 0.34)", "rgba(214, 255, 231, 0.95)");
      }
    }

    drawDebugShape({ shape: "circle", ...entityCircle(state.player) }, "rgba(73, 182, 255, 0.34)", "rgba(220, 245, 255, 0.95)");
    for (const enemy of state.enemies) {
      if (enemy.alive) {
        drawDebugShape({ shape: "circle", ...entityCircle(enemy) }, "rgba(255, 110, 176, 0.34)", "rgba(255, 226, 237, 0.95)");
      }
    }

    for (const blade of state.player.blades) {
      drawDebugShape(bladeRect(state.player, blade), "rgba(93, 238, 255, 0.32)", "rgba(225, 251, 255, 0.95)");
    }
    for (const enemy of state.enemies) {
      if (!enemy.alive) {
        continue;
      }
      for (const blade of enemy.blades) {
        drawDebugShape(bladeRect(enemy, blade), "rgba(255, 136, 191, 0.32)", "rgba(255, 229, 239, 0.95)");
      }
    }
  }

  function drawEffects() {
    for (const effect of effects) {
      const screen = worldToScreen(effect.x, effect.y);
      const alpha = Math.max(0, effect.life / effect.maxLife);
      if (effect.type === "particle") {
        ctx.fillStyle = effect.color;
        ctx.globalAlpha = alpha;
        ctx.fillRect(screen.x - effect.size * 0.5, screen.y - effect.size * 0.5, effect.size, effect.size);
        ctx.globalAlpha = 1;
      } else if (effect.type === "ring") {
        ctx.strokeStyle = effect.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, effect.radius + (1 - alpha) * 18, 0, PI2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (effect.type === "slash") {
        ctx.strokeStyle = effect.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, effect.radius + (1 - alpha) * 8, -0.7, 0.9);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawEdgeMist() {
    const gradient = ctx.createRadialGradient(viewWidth * 0.5, viewHeight * 0.5, 120, viewWidth * 0.5, viewHeight * 0.5, Math.max(viewWidth, viewHeight) * 0.74);
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(1, "rgba(2,4,8,0.44)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewWidth, viewHeight);
  }

  function render() {
    renderGround();

    for (const chunk of getActiveChunks(state.player.x, state.player.y, ACTIVE_RADIUS)) {
      for (const obstacle of chunk.obstacles) {
        drawObstacle(obstacle);
      }
    }
    for (const pickup of world.pickups.values()) {
      drawPickup(pickup);
    }

    drawBlades(state.player);
    for (const enemy of state.enemies) {
      if (enemy.alive) {
        drawBlades(enemy);
      }
    }

    drawEffects();

    drawCharacter(state.player);
    for (const enemy of state.enemies) {
      if (enemy.alive) {
        drawCharacter(enemy);
      }
    }

    if (SHOW_HITBOX) {
      drawHitboxes();
    }

    drawJoystick();
    drawEdgeMist();
    surviveTimeEl.textContent = state.score.toFixed(1) + "s";
    killCountEl.textContent = String(state.kills);
    bladeCountEl.textContent = String(state.player.blades.length);
  }

  function drawJoystick() {
    if (!joystick.active) {
      return;
    }
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.arc(joystick.originX, joystick.originY, 44, 0, PI2);
    ctx.fill();
    ctx.fillStyle = "rgba(167, 245, 220, 0.22)";
    ctx.beginPath();
    ctx.arc(joystick.originX + joystick.x * 32, joystick.originY + joystick.y * 32, 22, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  function loop(now) {
    const current = now * 0.001;
    const dt = Math.min(0.033, current - (loop.last || current));
    loop.last = current;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function setJoystickFromTouch(touch) {
    const dx = touch.clientX - joystick.originX;
    const dy = touch.clientY - joystick.originY;
    const length = Math.hypot(dx, dy);
    const clamped = Math.min(1, length / 48);
    const nx = length > 0 ? dx / length : 0;
    const ny = length > 0 ? dy / length : 0;
    joystick.x = nx * clamped;
    joystick.y = ny * clamped;
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "r" || event.key === "R") {
      if (!state.running) {
        restartGame();
      }
    }
    keys.add(event.key);
  });

  window.addEventListener("keyup", (event) => {
    keys.delete(event.key);
  });

  canvas.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    if (!touch || joystick.active) {
      return;
    }
    joystick.active = true;
    joystick.identifier = touch.identifier;
    joystick.originX = touch.clientX;
    joystick.originY = touch.clientY;
    joystick.x = 0;
    joystick.y = 0;
    setJoystickFromTouch(touch);
    if (!state.running) {
      restartGame();
    }
  }, { passive: true });

  canvas.addEventListener("touchmove", (event) => {
    for (const touch of event.changedTouches) {
      if (touch.identifier === joystick.identifier) {
        setJoystickFromTouch(touch);
        break;
      }
    }
  }, { passive: true });

  canvas.addEventListener("touchend", (event) => {
    for (const touch of event.changedTouches) {
      if (touch.identifier === joystick.identifier) {
        joystick.active = false;
        joystick.identifier = null;
        joystick.x = 0;
        joystick.y = 0;
      }
    }
  }, { passive: true });

  canvas.addEventListener("touchcancel", () => {
    joystick.active = false;
    joystick.identifier = null;
    joystick.x = 0;
    joystick.y = 0;
  }, { passive: true });

  restartButton.addEventListener("click", restartGame);
  window.addEventListener("resize", resize);

  resize();
  state.player = createPlayer();
  ensureChunksAround(0, 0);
  preloadAssets();
  requestAnimationFrame(loop);
})();
