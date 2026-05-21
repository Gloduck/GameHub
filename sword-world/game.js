(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const restartButton = document.getElementById("restartButton");
  const surviveTimeEl = document.getElementById("surviveTime");
  const killCountEl = document.getElementById("killCount");
  const bladeCountEl = document.getElementById("bladeCount");
  const settingsToggle = document.getElementById("settingsToggle");
  const settingsPanel = document.getElementById("settingsPanel");
  const helpPanel = document.getElementById("helpPanel");
  const maxBladesInput = document.getElementById("maxBladesInput");
  const maxEnemyDropInput = document.getElementById("maxEnemyDropInput");
  const pickupBladeCountInput = document.getElementById("pickupBladeCountInput");
  const keepBladeOnKillInput = document.getElementById("keepBladeOnKillInput");
  const showHitboxInput = document.getElementById("showHitboxInput");
  const showHelpInput = document.getElementById("showHelpInput");
  const tierSpeedList = document.getElementById("tierSpeedList");
  const tierVarianceList = document.getElementById("tierVarianceList");
  const tierRateList = document.getElementById("tierRateList");
  const dropChanceList = document.getElementById("dropChanceList");
  const dropChanceSummary = document.getElementById("dropChanceSummary");
  const pickupBladeChanceList = document.getElementById("pickupBladeChanceList");
  const pickupBladeChanceSummary = document.getElementById("pickupBladeChanceSummary");
  const settingsCancel = document.getElementById("settingsCancel");
  const settingsConfirm = document.getElementById("settingsConfirm");

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
    swordCommon: { path: "assets/sword-common.png", scale: 0.08, anchorY: 0.55 },
    swordRare: { path: "assets/sword-rare.png", scale: 0.08, anchorY: 0.55 },
    swordLegendary: { path: "assets/sword-legendary.png", scale: 0.08, anchorY: 0.55 },
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
  const SWORD_TIERS = [
    {
      id: 1,
      label: "1 级 朴素",
      assetKey: "swordCommon",
      sizeScale: 0.92,
      trail: "rgba(178, 212, 255, 0.18)",
      pickupFill: "rgba(148, 196, 255, 0.16)",
      pickupStroke: "rgba(201, 224, 255, 0.42)",
      burstPlayer: "#b9dcff",
      burstEnemy: "#ffdbe7",
    },
    {
      id: 2,
      label: "2 级 精良",
      assetKey: "swordRare",
      sizeScale: 1.02,
      trail: "rgba(104, 222, 255, 0.20)",
      pickupFill: "rgba(92, 223, 255, 0.18)",
      pickupStroke: "rgba(176, 245, 255, 0.46)",
      burstPlayer: "#8be9ff",
      burstEnemy: "#ffe0f5",
    },
    {
      id: 3,
      label: "3 级 传说",
      assetKey: "swordLegendary",
      sizeScale: 1.14,
      trail: "rgba(140, 255, 248, 0.22)",
      pickupFill: "rgba(124, 255, 244, 0.18)",
      pickupStroke: "rgba(216, 255, 252, 0.52)",
      burstPlayer: "#b8fff7",
      burstEnemy: "#ffeaff",
    },
  ];
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
    settingsOpen: false,
    player: null,
    enemies: [],
    score: 0,
    kills: 0,
  };
  const settings = {
    maxBlades: 15,
    keepBladeOnKill: false,
    maxEnemyDropBlades: 2,
    enemyDropChances: [0.4, 0.1],
    maxPickupBladeCount: 5,
    pickupBladeChances: [0.2, 0.2, 0.2, 0.2, 0.2],
    tierSpinSpeeds: [1.55, 2.45, 3.2],
    tierSpinVariances: [0.95, 0.45, 0.18],
    tierSpawnRates: [0.7, 0.22, 0.08],
    showHitbox: false,
    showHelp: false,
  };
  const draftSettings = {
    maxBlades: settings.maxBlades,
    keepBladeOnKill: settings.keepBladeOnKill,
    maxEnemyDropBlades: settings.maxEnemyDropBlades,
    enemyDropChances: [...settings.enemyDropChances],
    enemyDropChanceTexts: settings.enemyDropChances.map((value) => String(value)),
    maxPickupBladeCount: settings.maxPickupBladeCount,
    pickupBladeChances: [...settings.pickupBladeChances],
    pickupBladeChanceTexts: settings.pickupBladeChances.map((value) => String(value)),
    tierSpinSpeeds: [...settings.tierSpinSpeeds],
    tierSpinSpeedTexts: settings.tierSpinSpeeds.map((value) => String(value)),
    tierSpinVariances: [...settings.tierSpinVariances],
    tierSpinVarianceTexts: settings.tierSpinVariances.map((value) => String(value)),
    tierSpawnRates: [...settings.tierSpawnRates],
    tierSpawnRateTexts: settings.tierSpawnRates.map((value) => String(value)),
    showHitbox: settings.showHitbox,
    showHelp: settings.showHelp,
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

  function swordTierById(tierId) {
    return SWORD_TIERS.find((tier) => tier.id === tierId) || SWORD_TIERS[0];
  }

  function normalizedTierSpawnRates() {
    const rates = settings.tierSpawnRates.map((value) => Math.max(0, value || 0));
    const total = rates.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      return [1, 0, 0];
    }
    return rates.map((value) => value / total);
  }

  function sampleSwordTier(seedA, seedB) {
    const rates = normalizedTierSpawnRates();
    const roll = hash2(seedA, seedB);
    let acc = 0;
    for (let i = 0; i < rates.length; i += 1) {
      acc += rates[i];
      if (roll <= acc || i === rates.length - 1) {
        return SWORD_TIERS[i].id;
      }
    }
    return 1;
  }

  function createBlade(owner, angleOffset, tierId) {
    const tier = swordTierById(tierId);
    const baseSpin = settings.tierSpinSpeeds[tier.id - 1] ?? BLADE_SPIN;
    const spinOffsetFactor = randBetween(owner.seed + angleOffset * 77, 22, -1, 1);
    const spinVariance = settings.tierSpinVariances[tier.id - 1] ?? 0;
    return {
      owner,
      tierId: tier.id,
      angle: angleOffset,
      orbit: BLADE_DISTANCE + randBetween(owner.seed + angleOffset * 99, 77, -4, 8),
      spinOffsetFactor,
      spin: baseSpin + spinOffsetFactor * spinVariance,
      size: (BLADE_SIZE + randBetween(owner.seed + angleOffset * 45, 88, -1.1, 1.2)) * tier.sizeScale,
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
    state.settingsOpen = false;
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
      tierId: options?.tierId || sampleSwordTier(x, y),
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
    const limit = settings.maxBlades;
    const target = Math.min(limit, current + count);
    for (let i = current; i < target; i += 1) {
      const tierId = sampleSwordTier(entity.seed + i * 17, time * 1000 + i * 29);
      entity.blades.push(createBlade(entity, (PI2 * i) / Math.max(target, 1), tierId));
    }
    redistributeBlades(entity);
  }

  function grantTierBlades(entity, min, max, tierId) {
    const count = Math.floor(randBetween(entity.seed + time * 100, entity.blades.length + 1, min, max + 1));
    const current = entity.blades.length;
    const limit = settings.maxBlades;
    const target = Math.min(limit, current + count);
    for (let i = current; i < target; i += 1) {
      entity.blades.push(createBlade(entity, (PI2 * i) / Math.max(target, 1), tierId));
    }
    redistributeBlades(entity);
  }

  function grantTierBladeCount(entity, count, tierId) {
    const current = entity.blades.length;
    const limit = settings.maxBlades;
    const target = Math.min(limit, current + Math.max(0, count));
    for (let i = current; i < target; i += 1) {
      entity.blades.push(createBlade(entity, (PI2 * i) / Math.max(target, 1), tierId));
    }
    redistributeBlades(entity);
  }

  function enforceBladeLimit(entity) {
    if (!entity) {
      return;
    }
    if (entity.blades.length > settings.maxBlades) {
      entity.blades.length = settings.maxBlades;
      redistributeBlades(entity);
    }
  }

  function applyBladeLimit() {
    enforceBladeLimit(state.player);
    for (const enemy of state.enemies) {
      enforceBladeLimit(enemy);
    }
  }

  function refreshBladeSpin(entity) {
    if (!entity) {
      return;
    }
    for (const blade of entity.blades) {
      const tier = swordTierById(blade.tierId);
      const baseSpin = settings.tierSpinSpeeds[tier.id - 1] ?? BLADE_SPIN;
      const variance = settings.tierSpinVariances[tier.id - 1] ?? 0;
      blade.spin = baseSpin + (blade.spinOffsetFactor || 0) * variance;
    }
  }

  function applyTierSpinSettings() {
    refreshBladeSpin(state.player);
    for (const enemy of state.enemies) {
      refreshBladeSpin(enemy);
    }
  }

  function cloneSettingsToDraft() {
    draftSettings.maxBlades = settings.maxBlades;
    draftSettings.maxEnemyDropBlades = settings.maxEnemyDropBlades;
    draftSettings.enemyDropChances = [...settings.enemyDropChances];
    draftSettings.enemyDropChanceTexts = settings.enemyDropChances.map((value) => String(value));
    draftSettings.maxPickupBladeCount = settings.maxPickupBladeCount;
    draftSettings.pickupBladeChances = [...settings.pickupBladeChances];
    draftSettings.pickupBladeChanceTexts = settings.pickupBladeChances.map((value) => String(value));
    draftSettings.tierSpinSpeeds = [...settings.tierSpinSpeeds];
    draftSettings.tierSpinSpeedTexts = settings.tierSpinSpeeds.map((value) => String(value));
    draftSettings.tierSpinVariances = [...settings.tierSpinVariances];
    draftSettings.tierSpinVarianceTexts = settings.tierSpinVariances.map((value) => String(value));
    draftSettings.tierSpawnRates = [...settings.tierSpawnRates];
    draftSettings.tierSpawnRateTexts = settings.tierSpawnRates.map((value) => String(value));
    draftSettings.showHitbox = settings.showHitbox;
    draftSettings.showHelp = settings.showHelp;
  }

  function ensureDraftDropChanceLength() {
    while (draftSettings.enemyDropChances.length < draftSettings.maxEnemyDropBlades) {
      draftSettings.enemyDropChances.push(0);
    }
    draftSettings.enemyDropChances.length = draftSettings.maxEnemyDropBlades;

    while (draftSettings.enemyDropChanceTexts.length < draftSettings.maxEnemyDropBlades) {
      draftSettings.enemyDropChanceTexts.push("0");
    }
    draftSettings.enemyDropChanceTexts.length = draftSettings.maxEnemyDropBlades;
  }

  function ensureDraftPickupBladeChanceLength() {
    while (draftSettings.pickupBladeChances.length < draftSettings.maxPickupBladeCount) {
      draftSettings.pickupBladeChances.push(0);
    }
    draftSettings.pickupBladeChances.length = draftSettings.maxPickupBladeCount;

    while (draftSettings.pickupBladeChanceTexts.length < draftSettings.maxPickupBladeCount) {
      draftSettings.pickupBladeChanceTexts.push("0");
    }
    draftSettings.pickupBladeChanceTexts.length = draftSettings.maxPickupBladeCount;
  }

  function parseChanceText(text) {
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(1, value));
  }

  function parseSpeedText(text, fallback) {
    const value = Number.parseFloat(text);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(0.2, Math.min(12, value));
  }

  function syncSettingsInputs() {
    maxBladesInput.value = String(draftSettings.maxBlades);
    keepBladeOnKillInput.checked = draftSettings.keepBladeOnKill;
    maxEnemyDropInput.value = String(draftSettings.maxEnemyDropBlades);
    pickupBladeCountInput.value = String(draftSettings.maxPickupBladeCount);
    showHitboxInput.checked = draftSettings.showHitbox;
    showHelpInput.checked = draftSettings.showHelp;
  }

  function syncHelpVisibility() {
    helpPanel.classList.toggle("hidden", !settings.showHelp);
  }

  function renderDropChanceInputs() {
    ensureDraftDropChanceLength();
    dropChanceList.innerHTML = "";
    for (let i = 0; i < draftSettings.maxEnemyDropBlades; i += 1) {
      const item = document.createElement("div");
      item.className = "settings-probability-item";

      const label = document.createElement("label");
      label.htmlFor = "dropChanceInput" + (i + 1);
      label.textContent = (i + 1) + " 把剑";

      const input = document.createElement("input");
      input.id = "dropChanceInput" + (i + 1);
      input.type = "number";
      input.min = "0";
      input.max = "1";
      input.step = "0.01";
      input.inputMode = "decimal";
      input.value = draftSettings.enemyDropChanceTexts[i] ?? String(draftSettings.enemyDropChances[i] ?? 0);
      input.addEventListener("input", () => {
        draftSettings.enemyDropChanceTexts[i] = input.value;
        draftSettings.enemyDropChances[i] = parseChanceText(input.value);
        updateDropChanceSummary();
      });
      input.addEventListener("change", () => {
        const totalWithoutCurrent = draftSettings.enemyDropChances.reduce((sum, value, index) => sum + (index === i ? 0 : value), 0);
        const allowedMax = Math.max(0, 1 - totalWithoutCurrent);
        const nextValue = Math.min(parseChanceText(input.value), allowedMax);
        draftSettings.enemyDropChances[i] = nextValue;
        draftSettings.enemyDropChanceTexts[i] = String(Number(nextValue.toFixed(2)));
        input.value = draftSettings.enemyDropChanceTexts[i];
        updateDropChanceSummary();
      });

      item.append(label, input);
      dropChanceList.append(item);
    }
    updateDropChanceSummary();
  }

  function renderTierSettingInputs() {
    tierSpeedList.innerHTML = "";
    tierVarianceList.innerHTML = "";
    tierRateList.innerHTML = "";

    for (let i = 0; i < SWORD_TIERS.length; i += 1) {
      const tier = SWORD_TIERS[i];

      const speedItem = document.createElement("div");
      speedItem.className = "settings-probability-item";
      const speedLabel = document.createElement("label");
      speedLabel.htmlFor = "tierSpeedInput" + tier.id;
      speedLabel.textContent = tier.label;
      const speedInput = document.createElement("input");
      speedInput.id = "tierSpeedInput" + tier.id;
      speedInput.type = "number";
      speedInput.min = "0.2";
      speedInput.max = "12";
      speedInput.step = "0.05";
      speedInput.inputMode = "decimal";
      speedInput.value = draftSettings.tierSpinSpeedTexts[i] ?? String(draftSettings.tierSpinSpeeds[i]);
      speedInput.addEventListener("input", () => {
        draftSettings.tierSpinSpeedTexts[i] = speedInput.value;
        draftSettings.tierSpinSpeeds[i] = parseSpeedText(speedInput.value, settings.tierSpinSpeeds[i]);
      });
      speedInput.addEventListener("change", () => {
        const nextValue = parseSpeedText(speedInput.value, settings.tierSpinSpeeds[i]);
        draftSettings.tierSpinSpeeds[i] = nextValue;
        draftSettings.tierSpinSpeedTexts[i] = String(Number(nextValue.toFixed(2)));
        speedInput.value = draftSettings.tierSpinSpeedTexts[i];
      });
      speedItem.append(speedLabel, speedInput);
      tierSpeedList.append(speedItem);

      const varianceItem = document.createElement("div");
      varianceItem.className = "settings-probability-item";
      const varianceLabel = document.createElement("label");
      varianceLabel.htmlFor = "tierVarianceInput" + tier.id;
      varianceLabel.textContent = tier.label;
      const varianceInput = document.createElement("input");
      varianceInput.id = "tierVarianceInput" + tier.id;
      varianceInput.type = "number";
      varianceInput.min = "0";
      varianceInput.max = "3";
      varianceInput.step = "0.05";
      varianceInput.inputMode = "decimal";
      varianceInput.value = draftSettings.tierSpinVarianceTexts[i] ?? String(draftSettings.tierSpinVariances[i]);
      varianceInput.addEventListener("input", () => {
        draftSettings.tierSpinVarianceTexts[i] = varianceInput.value;
        draftSettings.tierSpinVariances[i] = parseSpeedText(varianceInput.value, settings.tierSpinVariances[i]);
      });
      varianceInput.addEventListener("change", () => {
        const nextValue = parseSpeedText(varianceInput.value, settings.tierSpinVariances[i]);
        draftSettings.tierSpinVariances[i] = nextValue;
        draftSettings.tierSpinVarianceTexts[i] = String(Number(nextValue.toFixed(2)));
        varianceInput.value = draftSettings.tierSpinVarianceTexts[i];
      });
      varianceItem.append(varianceLabel, varianceInput);
      tierVarianceList.append(varianceItem);

      const rateItem = document.createElement("div");
      rateItem.className = "settings-probability-item";
      const rateLabel = document.createElement("label");
      rateLabel.htmlFor = "tierRateInput" + tier.id;
      rateLabel.textContent = tier.label;
      const rateInput = document.createElement("input");
      rateInput.id = "tierRateInput" + tier.id;
      rateInput.type = "number";
      rateInput.min = "0";
      rateInput.max = "1";
      rateInput.step = "0.01";
      rateInput.inputMode = "decimal";
      rateInput.value = draftSettings.tierSpawnRateTexts[i] ?? String(draftSettings.tierSpawnRates[i]);
      rateInput.addEventListener("input", () => {
        draftSettings.tierSpawnRateTexts[i] = rateInput.value;
        draftSettings.tierSpawnRates[i] = parseChanceText(rateInput.value);
      });
      rateInput.addEventListener("change", () => {
        const nextValue = parseChanceText(rateInput.value);
        draftSettings.tierSpawnRates[i] = nextValue;
        draftSettings.tierSpawnRateTexts[i] = String(Number(nextValue.toFixed(2)));
        rateInput.value = draftSettings.tierSpawnRateTexts[i];
      });
      rateItem.append(rateLabel, rateInput);
      tierRateList.append(rateItem);
    }
  }

  function updateDropChanceSummary() {
    const total = draftSettings.enemyDropChances.reduce((sum, value) => sum + value, 0);
    const clampedTotal = Math.min(1, total);
    const noneChance = Math.max(0, 1 - clampedTotal);
    dropChanceSummary.textContent = "当前总和: " + clampedTotal.toFixed(2) + "，0 把掉落概率: " + noneChance.toFixed(2);
  }

  function renderPickupBladeChanceInputs() {
    ensureDraftPickupBladeChanceLength();
    pickupBladeChanceList.innerHTML = "";
    for (let i = 0; i < draftSettings.maxPickupBladeCount; i += 1) {
      const item = document.createElement("div");
      item.className = "settings-probability-item";

      const label = document.createElement("label");
      label.htmlFor = "pickupBladeChanceInput" + (i + 1);
      label.textContent = (i + 1) + " 把旋转剑";

      const input = document.createElement("input");
      input.id = "pickupBladeChanceInput" + (i + 1);
      input.type = "number";
      input.min = "0";
      input.max = "1";
      input.step = "0.01";
      input.inputMode = "decimal";
      input.value = draftSettings.pickupBladeChanceTexts[i] ?? String(draftSettings.pickupBladeChances[i] ?? 0);
      input.addEventListener("input", () => {
        draftSettings.pickupBladeChanceTexts[i] = input.value;
        draftSettings.pickupBladeChances[i] = parseChanceText(input.value);
        updatePickupBladeChanceSummary();
      });
      input.addEventListener("change", () => {
        const totalWithoutCurrent = draftSettings.pickupBladeChances.reduce((sum, value, index) => sum + (index === i ? 0 : value), 0);
        const allowedMax = Math.max(0, 1 - totalWithoutCurrent);
        const nextValue = Math.min(parseChanceText(input.value), allowedMax);
        draftSettings.pickupBladeChances[i] = nextValue;
        draftSettings.pickupBladeChanceTexts[i] = String(Number(nextValue.toFixed(2)));
        input.value = draftSettings.pickupBladeChanceTexts[i];
        updatePickupBladeChanceSummary();
      });

      item.append(label, input);
      pickupBladeChanceList.append(item);
    }
    updatePickupBladeChanceSummary();
  }

  function updatePickupBladeChanceSummary() {
    const total = draftSettings.pickupBladeChances.reduce((sum, value) => sum + value, 0);
    const clampedTotal = Math.min(1, total);
    const noneChance = Math.max(0, 1 - clampedTotal);
    pickupBladeChanceSummary.textContent = "当前总和: " + clampedTotal.toFixed(2) + "，0 把旋转剑概率: " + noneChance.toFixed(2);
  }

  function openSettings() {
    cloneSettingsToDraft();
    syncSettingsInputs();
    renderTierSettingInputs();
    renderDropChanceInputs();
    renderPickupBladeChanceInputs();
    state.settingsOpen = true;
    settingsPanel.classList.remove("hidden");
  }

  function closeSettings() {
    state.settingsOpen = false;
    settingsPanel.classList.add("hidden");
  }

  function rollEnemyDropCount(entity) {
    const chances = settings.enemyDropChances.slice(0, settings.maxEnemyDropBlades).map((value) => Math.max(0, Math.min(1, value || 0)));
    const roll = hash2(entity.x * 1.91, entity.y * 2.17);
    let acc = 0;
    for (let i = 0; i < chances.length; i += 1) {
      acc += chances[i];
      if (roll <= acc) {
        return i + 1;
      }
    }
    return 0;
  }

  function rollPickupBladeCount(pickup) {
    const chances = settings.pickupBladeChances.slice(0, settings.maxPickupBladeCount).map((value) => Math.max(0, Math.min(1, value || 0)));
    const roll = hash2(pickup.x * 2.31, pickup.y * 1.73);
    let acc = 0;
    for (let i = 0; i < chances.length; i += 1) {
      acc += chances[i];
      if (roll <= acc) {
        return i + 1;
      }
    }
    return 0;
  }

  function applyDraftSettings() {
    ensureDraftDropChanceLength();
    const total = draftSettings.enemyDropChances.reduce((sum, value) => sum + Math.max(0, Math.min(1, value || 0)), 0);
    if (total > 1) {
      let remaining = 1;
      draftSettings.enemyDropChances = draftSettings.enemyDropChances.map((value) => {
        const next = Math.max(0, Math.min(remaining, value || 0));
        remaining -= next;
        return Number(next.toFixed(2));
      });
    }
    draftSettings.enemyDropChanceTexts = draftSettings.enemyDropChances.map((value) => String(Number(value.toFixed(2))));
    ensureDraftPickupBladeChanceLength();
    const pickupTotal = draftSettings.pickupBladeChances.reduce((sum, value) => sum + Math.max(0, Math.min(1, value || 0)), 0);
    if (pickupTotal > 1) {
      let remaining = 1;
      draftSettings.pickupBladeChances = draftSettings.pickupBladeChances.map((value) => {
        const next = Math.max(0, Math.min(remaining, value || 0));
        remaining -= next;
        return Number(next.toFixed(2));
      });
    }
    draftSettings.pickupBladeChanceTexts = draftSettings.pickupBladeChances.map((value) => String(Number(value.toFixed(2))));
    settings.maxBlades = draftSettings.maxBlades;
    settings.keepBladeOnKill = draftSettings.keepBladeOnKill;
    settings.maxEnemyDropBlades = draftSettings.maxEnemyDropBlades;
    settings.enemyDropChances = draftSettings.enemyDropChances.slice(0, draftSettings.maxEnemyDropBlades);
    settings.maxPickupBladeCount = draftSettings.maxPickupBladeCount;
    settings.pickupBladeChances = draftSettings.pickupBladeChances.slice(0, draftSettings.maxPickupBladeCount);
    settings.tierSpinSpeeds = draftSettings.tierSpinSpeeds.map((value) => Number(parseSpeedText(String(value), 2.5).toFixed(2)));
    settings.tierSpinVariances = draftSettings.tierSpinVariances.map((value) => Number(parseSpeedText(String(value), 0).toFixed(2)));
    settings.tierSpawnRates = draftSettings.tierSpawnRates.map((value) => Number(parseChanceText(String(value)).toFixed(2)));
    settings.showHitbox = draftSettings.showHitbox;
    settings.showHelp = draftSettings.showHelp;
    applyBladeLimit();
    applyTierSpinSettings();
    syncHelpVisibility();
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
          grantTierBladeCount(entity, rollPickupBladeCount(pickup), pickup.tierId);
          const tier = swordTierById(pickup.tierId);
          spawnBurst(pickup.x, pickup.y, entity.team === "player" ? tier.burstPlayer : tier.burstEnemy, 8, 76, 0.32, 4);
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
      const dropCount = rollEnemyDropCount(entity);
      for (let i = 0; i < dropCount; i += 1) {
        const angle = randBetween(entity.x + i, entity.y - i, 0, PI2);
        const distance = randBetween(entity.y + i, entity.x + i, 8, 28);
        const tierId = sampleSwordTier(entity.x + i * 19, entity.y - i * 23);
        addPickup(
          entity.x + Math.cos(angle) * distance,
          entity.y + Math.sin(angle) * distance,
          {
            tierId,
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
          if (!settings.keepBladeOnKill) {
            removeBlade(player, blade);
          }
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
    if (!state.running || state.settingsOpen) {
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

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  function valueNoise(x, y, scale) {
    const scaledX = x / scale;
    const scaledY = y / scale;
    const x0 = Math.floor(scaledX);
    const y0 = Math.floor(scaledY);
    const tx = smoothstep(scaledX - x0);
    const ty = smoothstep(scaledY - y0);
    const n00 = hash2(x0, y0);
    const n10 = hash2(x0 + 1, y0);
    const n01 = hash2(x0, y0 + 1);
    const n11 = hash2(x0 + 1, y0 + 1);
    const nx0 = lerp(n00, n10, tx);
    const nx1 = lerp(n01, n11, tx);
    return lerp(nx0, nx1, ty);
  }

  function sampleBiome(worldX, worldY) {
    const large = valueNoise(worldX + 1200, worldY - 800, 420);
    const medium = valueNoise(worldX - 300, worldY + 500, 210);
    const detail = valueNoise(worldX + 90, worldY + 60, 96);
    return large * 0.58 + medium * 0.3 + detail * 0.12;
  }

  function floorSpriteKeyAt(worldX, worldY) {
    const biome = sampleBiome(worldX, worldY);
    if (biome > 0.64) {
      return "floorStone";
    }
    if (biome < 0.3) {
      return "floorGrass";
    }
    return "floorMeadow";
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
        const spriteKey = floorSpriteKeyAt(worldX, worldY);
        const floorSprite = assets[spriteKey];
        const floorLoaded = floorSprite && floorSprite.loaded;
        if (floorLoaded) {
          ctx.drawImage(floorSprite.image, Math.floor(screen.x), Math.floor(screen.y), tile + 1, tile + 1);
        } else {
          ctx.fillStyle = "#7a7a7a";
          ctx.fillRect(Math.floor(screen.x), Math.floor(screen.y), tile + 1, tile + 1);
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
    const tier = swordTierById(pickup.tierId);
    ctx.fillStyle = tier.pickupFill;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 22, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = tier.pickupStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 14 + Math.sin(time * 4 + pickup.bob) * 2, 0, PI2);
    ctx.stroke();
    drawSpriteKey(tier.assetKey, screen.x, screen.y, pickup.scale * 0.92, 0);
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
      const tier = swordTierById(blade.tierId);
      const pos = bladePosition(entity, blade);
      const screen = worldToScreen(pos.x, pos.y);
      const tangent = blade.angle + Math.PI * 0.5;
      ctx.strokeStyle = entity.team === "player" ? tier.trail : "rgba(255, 138, 184, 0.16)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, 6 + blade.size * 0.3, tangent - 0.8, tangent + 0.8);
      ctx.stroke();
      drawSpriteKey(tier.assetKey, screen.x, screen.y, blade.size / 10, tangent);
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

    if (settings.showHitbox) {
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
  settingsToggle.addEventListener("click", () => {
    if (state.settingsOpen) {
      closeSettings();
      return;
    }
    openSettings();
  });
  maxBladesInput.addEventListener("input", () => {
    const nextValue = Math.max(1, Math.min(32, Number.parseInt(maxBladesInput.value || "14", 10) || 14));
    draftSettings.maxBlades = nextValue;
    maxBladesInput.value = String(nextValue);
  });
  keepBladeOnKillInput.addEventListener("change", () => {
    draftSettings.keepBladeOnKill = keepBladeOnKillInput.checked;
  });
  maxEnemyDropInput.addEventListener("input", () => {
    const nextValue = Math.max(1, Math.min(5, Number.parseInt(maxEnemyDropInput.value || "2", 10) || 2));
    draftSettings.maxEnemyDropBlades = nextValue;
    maxEnemyDropInput.value = String(nextValue);
    renderDropChanceInputs();
  });
  pickupBladeCountInput.addEventListener("input", () => {
    const nextValue = Math.max(1, Math.min(8, Number.parseInt(pickupBladeCountInput.value || "5", 10) || 5));
    draftSettings.maxPickupBladeCount = nextValue;
    pickupBladeCountInput.value = String(nextValue);
    renderPickupBladeChanceInputs();
  });
  showHitboxInput.addEventListener("change", () => {
    draftSettings.showHitbox = showHitboxInput.checked;
  });
  showHelpInput.addEventListener("change", () => {
    draftSettings.showHelp = showHelpInput.checked;
  });
  settingsCancel.addEventListener("click", closeSettings);
  settingsConfirm.addEventListener("click", () => {
    applyDraftSettings();
    closeSettings();
  });
  window.addEventListener("resize", resize);

  resize();
  state.player = createPlayer();
  syncHelpVisibility();
  ensureChunksAround(0, 0);
  preloadAssets();
  requestAnimationFrame(loop);
})();
