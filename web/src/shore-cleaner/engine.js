// Adapted from the user-supplied Shore Cleaner game; original mechanics retained.
import {readShoreSave,writeShoreSave} from './storage.js';
export function startShoreCleaner(root,{storage,onProgress,onSave}={}) {
  const document=root.ownerDocument,window=document.defaultView,performance=window.performance;
  const events=new window.AbortController(),timers=new Set();let alive=true,animation=null;
  function listen(target,type,callback,options={}){target.addEventListener(type,callback,{...options,signal:events.signal});}
  function schedule(callback,delay){const id=window.setTimeout(()=>{timers.delete(id);if(alive)callback();},delay);timers.add(id);return id;}
  function scheduleFrame(callback){if(alive)animation=window.requestAnimationFrame(callback);}



  // ------------------------------------------------------------------ Setup
  const canvas = root.getElementById("game");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");
  const W=820,H=600,pixelRatio=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(W*pixelRatio);canvas.height=Math.round(H*pixelRatio);
  ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  const TAU = Math.PI * 2;

  const el = {
    money: root.getElementById("stat-money"),
    collected: root.getElementById("stat-collected"),
    bag: root.getElementById("stat-bag"),
    combo: root.getElementById("stat-combo"),
    next: root.getElementById("stat-next"),
    zone: root.getElementById("stat-zone"),
    level: root.getElementById("stat-level"),
    record: root.getElementById("stat-record"),
    shards: root.getElementById("stat-shards"),
    eggs: root.getElementById("stat-eggs"),
    quests: root.getElementById("quest-panel"),
    mini: root.getElementById("mini-btn"),
    questBtn: root.getElementById("quest-btn"),
    recordBtn: root.getElementById("record-btn"),
    achBtn: root.getElementById("ach-btn"),
    fightBtn: root.getElementById("fight-btn"),
    tradeBtn: root.getElementById("trade-btn"),
    indexBtn: root.getElementById("index-btn"),
    petbox: root.getElementById("petbox-panel"),
    shop: root.getElementById("shop-list"),
    overlay: root.getElementById("start-overlay"),
    dialog: root.getElementById("dialog-overlay"),
    dialogModal: root.getElementById("dialog-modal"),
    start: root.getElementById("start-btn"),
    pause: root.getElementById("pause-btn"),
    sound: root.getElementById("sound-btn"),
    battle: root.getElementById("battle-btn"),
    ascend: root.getElementById("ascend-btn"),
    hatchBtn: root.getElementById("hatch-btn"),
    eggSelect: root.getElementById("egg-select"),
    eggDetail: root.getElementById("egg-detail"),
    eggCount: root.getElementById("egg-count"),
    companionInfo: root.getElementById("companion-info"),
  };

  const BIN = { x: 66, y: 512 };

  const state = {
    started: false,
    paused: false,
    time: 0,
    money: 0,
    recycled: 0,
    collected: 0,
    bag: [],
    combo: 0,
    comboTimer: 0,
    garbage: [],
    particles: [],
    floaters: [],
    birds: [],
    drones: [],
    upgrades: {},
    spawnTimer: 1,
    turtleTimer: 0,
    droneTimer: 0,
    gullTimer: 0,
    creaturePopup: null,
    creatureIndex: 0,

    // Ascension / rebirth
    ascensions: 0,
    shards: 0,
    lifetime: 0,
    ascendProgress: 0,

    // Hatchery (everyone starts with one egg)
    eggs: 1,
    companion: null,
    petBox: [],
    equipped: [],
    collection: {},
    hazards: [],
    hazardTimer: 9,

    // Local 2-player battle
    battle: { active: false, timeLeft: 0, p1: 0, p2: 0, result: "", resultTime: 0 },
    p2: { x: 500, y: 430, dir: -1, walkPhase: 0 },

    // Cloud multiplayer
    cloud: { active: false, id: "", room: "", name: "", source: null,
      players: [], connected: false, lastInput: 0, base: "", records: {}, host: false },

    // Grinding, records, minigame, admin
    collectorXp: 0,
    collectorLevel: 1,
    lifetimeEggs: 0,
    zoneCollected: 0,
    relics: 0,
    quests: [],
    achievements: {},
    records: {},
    runStart: 0,
    runEarned: 0,
    mini: { active: false, timeLeft: 0, targets: [], score: 0, hits: 0, spawnTimer: 0, best: 0 },
    fight: { active: false, enemy: null, pet: null, mana: 100, maxMana: 100,
      enemyTimer: 0, petTimer: 0, shield: 0, cooldowns: {}, resultTime: 0, reward: 0 },
    admin: false,
    waveFrozen: false,

    player: { x: 420, y: 430, dir: 1, walkPhase: 0, target: null },
    turtle: { x: 620, y: 198, dir: 1 },
  };

  // ------------------------------------------------------------------ Audio
  let audioCtx = null, soundOn = false;
  function beep(freq = 440, dur = 0.08, type = "sine", vol = 0.05) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (_) { /* audio is optional */ }
  }

  // ------------------------------------------------------------------ Upgrades
  const UPGRADE_DEFS = [
    { id:"speed",   icon:"👟", name:"Speedy Sneakers",  base:40,     growth:1.60, max:8, eff:"+20% move speed each level",         color:"#e67e22" },
    { id:"bag",     icon:"🎒", name:"Jumbo Bag",        base:55,     growth:1.60, max:8, eff:"+4 bag capacity each level",        color:"#f39c12" },
    { id:"combo",   icon:"🔥", name:"Combo Keeper",     base:70,     growth:1.70, max:5, eff:"+1.5s combo window each level",     color:"#e74c3c" },
    { id:"magnet",  icon:"🧲", name:"Magnet Grabber",   base:80,     growth:1.70, max:6, eff:"+12 pickup radius each level",      color:"#e74c3c" },
    { id:"waves",   icon:"🌊", name:"Quick Waves",      base:90,     growth:1.70, max:6, eff:"Trash washes ashore faster",        color:"#3498db" },
    { id:"recycle", icon:"♻️", name:"Recycling Bonus",  base:100,    growth:1.75, max:8, eff:"+25% cash-out money each level",    color:"#27ae60" },
    { id:"income1", icon:"🐚", name:"Seashell Savings", base:100,    growth:1.80, max:8, eff:"Passive +$1 / sec each level",      color:"#48c9b0" },
    { id:"shell",   icon:"🍀", name:"Lucky Seashell",   base:120,    growth:1.80, max:5, eff:"10% chance for a rare $25 find",    color:"#9b59b6" },
    { id:"golden",  icon:"💰", name:"Golden Touch",     base:250,    growth:1.90, max:6, eff:"+$3 extra value per item/level",    color:"#f1c40f" },
    { id:"turtle",  icon:"🐢", name:"Turtle Helper",    base:400,    growth:2.00, max:5, eff:"Turtle auto-collects nearby trash", color:"#2ecc71" },
    { id:"gull",    icon:"🕊️", name:"Seagull Scout",    base:700,    growth:2.00, max:4, eff:"Gulls deliver bonus coins",         color:"#1abc9c" },
    { id:"double",  icon:"🎯", name:"Double Deposit",   base:1200,   growth:2.10, max:5, eff:"+10% chance to double cash-out",    color:"#d35400" },
    { id:"equip",   icon:"👥", name:"Pet Slots",        base:2500,   growth:2.20, max:6, eff:"+1 equipped pet at once (up to 7)", color:"#8e44ad" },
    { id:"drone",   icon:"🚁", name:"Cleanup Drone",    base:2500,   growth:2.15, max:4, eff:"Auto-sweeps all trash on a timer",   color:"#34495e" },
    { id:"income2", icon:"🏖️", name:"Beach Booth",      base:5000,   growth:2.00, max:6, eff:"Passive +$10 / sec each level",     color:"#e67e22" },
    { id:"grip",    icon:"🧤", name:"Super Grip",       base:9000,   growth:2.10, max:4, eff:"+30 pickup radius each level",      color:"#c0392b" },
    { id:"income3", icon:"🏭", name:"Recycling Plant",  base:40000,  growth:2.20, max:5, eff:"Passive +$100 / sec each level",    color:"#16a085" },
    { id:"diamond", icon:"💎", name:"Diamond Grabber",  base:75000,  growth:2.25, max:4, eff:"+$10 extra value per item/level",   color:"#8e44ad" },
    { id:"income4", icon:"🌊", name:"Ocean Farm",       base:150000, growth:2.30, max:4, eff:"Passive +$500 / sec each level",    color:"#2980b9" },
  ];

  const lv = id => state.upgrades[id] || 0;
  const cost = (u, l) => Math.round(u.base * Math.pow(u.growth, l));
  const capacity     = () => 6 + 4 * lv("bag");
  const moveSpeed    = () => 190 * (1 + 0.2 * lv("speed"));
  const pickupRadius = () => 30 + 12 * lv("magnet") + 30 * lv("grip");
  const cashMult     = () => 1 + 0.25 * lv("recycle");
  const goldenBonus  = () => 3 * lv("golden") + 10 * lv("diamond");
  const comboWindow  = () => 2 + 1.5 * lv("combo");
  const rareChance   = () => 0.10 * lv("shell");
  const doubleChance = () => 0.10 * lv("double");
  const spawnDelay   = () => Math.max(0.25, zone().spawn - 0.18 * lv("waves")) * (0.75 + Math.random() * 0.55);
  const droneDelay   = () => Math.max(4, 12 - 2 * lv("drone"));
  const gullDelay    = () => Math.max(6, 16 - 3 * lv("gull"));
  const passiveIncome= () => lv("income1") + 10 * lv("income2") + 100 * lv("income3") + 500 * lv("income4");
  const shardMult    = () => 1 + 0.10 * state.shards;
  const maxEquip = () => 1 + lv("equip");
  const companionMult = () => {
    const pets = state.equipped.filter(p => p && p.hidden <= 0);
    if (!pets.length) return 1;
    return pets.reduce((m, c) => m * rarityInfo(c.rarity).mult *
      (c.shiny ? 2 : 1) * (1 + 0.05 * (c.level - 1)), 1);
  };
  // Shards, zone relics and collector level all stack multiplicatively.
  const globalMult = () => shardMult() * (1 + 0.05 * state.relics) *
    (1 + 0.01 * (state.collectorLevel - 1));

  function buildShop() {
    el.shop.innerHTML = "";
    UPGRADE_DEFS.forEach(u => {
      state.upgrades[u.id] ??= 0;
      const card = document.createElement("div");
      card.className = "card";
      card.id = "card-" + u.id;
      card.innerHTML =
        '<div class="card-top">' +
          '<span class="icon">' + u.icon + '</span>' +
          '<span class="name">' + u.name + '</span>' +
          '<span class="lvl" id="lvl-' + u.id + '"></span>' +
        '</div>' +
        '<div class="pips" id="pips-' + u.id + '"></div>' +
        '<div class="desc">' + u.eff + '</div>' +
        '<button class="buy" id="buy-' + u.id + '"></button>';
      listen(card.querySelector("button"),"click", () => buy(u));
      el.shop.appendChild(card);
    });
    renderShop();
  }

  function renderShop() {
    UPGRADE_DEFS.forEach(u => {
      const l = lv(u.id), maxed = l >= u.max, c = cost(u, l);
      const card = root.getElementById("card-" + u.id);
      const pips = root.getElementById("pips-" + u.id);
      const btn = root.getElementById("buy-" + u.id);
      root.getElementById("lvl-" + u.id).textContent = "Lv " + l + "/" + u.max;
      if(pips.dataset.level!==String(l)) {
      pips.replaceChildren();pips.dataset.level=String(l);
      for (let i = 0; i < u.max; i++) {
        const p = document.createElement("span");
        p.className = "pip" + (i < l ? " on" : "");
        p.style.background = i < l ? u.color : "";
        pips.appendChild(p);
      }
      }
      card.classList.toggle("afford", !maxed && state.money >= c);
      card.classList.toggle("maxed", maxed);
      btn.disabled = maxed || state.money < c;
      btn.textContent = maxed ? "MAXED ✓" : "Buy  $" + c;
    });
  }

  function buy(u) {
    const l = lv(u.id);
    if (l >= u.max) return;
    const c = cost(u, l);
    if (state.money < c) return;
    state.money -= c;
    state.upgrades[u.id]++;
    beep(700, 0.08, "square", 0.05);
    schedule(() => beep(950, 0.1, "square", 0.045), 80);
    const card = root.getElementById("card-" + u.id);
    card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
    renderShop(); updateStats();
  }

  // ------------------------------------------------------------------ Trash
  const TRASH = [
    { name:"bottle", value:3, color:"#3fa9e0", w:10, h:22, shape:"bottle" },
    { name:"can",    value:2, color:"#e74c3c", w:13, h:18, shape:"can" },
    { name:"cup",    value:2, color:"#f4c542", w:15, h:16, shape:"cup" },
    { name:"bag",    value:1, color:"#eef2f3", w:22, h:17, shape:"bag" },
    { name:"tire",   value:5, color:"#34495e", w:24, h:15, shape:"tire" },
    { name:"net",    value:4, color:"#c0392b", w:22, h:17, shape:"net" },
  ];

  function spawnTrash() {
    if (state.garbage.length >= 34) return;
    const r = Math.random();
    const eggChance = 0.035 + 0.008 * zoneIndex();
    const specialChance = 0.05 + 0.012 * zoneIndex();
    let t;
    if (r < eggChance) {
      t = { name:"egg", value:5, color:"#fff3cd", w:15, h:20, shape:"egg", egg:true };
    } else if (zone().special && r < eggChance + specialChance) {
      t = { ...zone().special, rare:true, special:true };
    } else if (r < eggChance + specialChance + rareChance()) {
      t = { name:"treasure", value:25, color:"#f5d76e", w:16, h:24, shape:"bottle", rare:true };
    } else {
      t = { ...TRASH[(Math.random() * TRASH.length) | 0] };
    }
    const restY = 245 + Math.random() * 305;
    state.garbage.push({
      x: 30 + Math.random() * (W - 60),
      y: 184 + Math.random() * 10,
      restY, vy: 26 + Math.random() * 26,
      bob: Math.random() * Math.PI * 2,
      rot: (Math.random() - 0.5) * 0.5,
      ...t,
    });
  }

  // Each sea creature takes a turn cheering you on every 5 pieces.
  const SEA_CREATURES = [
    { key:"turtle",   name:"Shelly the Turtle",   color:"#2fa365", line:"You're saving us! 🐢" },
    { key:"dolphin",  name:"Flipper the Dolphin", color:"#5dade2", line:"Good job! The water's never been cleaner! 🐬" },
    { key:"crab",     name:"Clawdia the Crab",    color:"#e74c3c", line:"Nice scooping, human! 🦀" },
    { key:"fish",     name:"Nemo the Fish",       color:"#f5b041", line:"Our reef looks amazing now! 🐠" },
    { key:"octopus",  name:"Inky the Octopus",    color:"#9b59b6", line:"Eight arms, one big THANK YOU! 🐙" },
    { key:"seal",     name:"Sammy the Seal",      color:"#85929e", line:"Clap clap! You're doing great! 🦭" },
    { key:"whale",    name:"Wally the Whale",     color:"#2471a3", line:"You're an ocean hero! 🐳" },
    { key:"jelly",    name:"Jelly the Jellyfish", color:"#bb8fce", line:"We're so grateful for you! 🪼✨" },
  ];

  function creatureVisits() {
    const c = SEA_CREATURES[state.creatureIndex % SEA_CREATURES.length];
    state.creatureIndex++;
    state.creaturePopup = { creature: c, phase: "in", t: 0 };
    beep(660, 0.1, "sine", 0.05);
    schedule(() => beep(880, 0.12, "sine", 0.045), 110);
    for (let k = 0; k < 12; k++) {
      state.particles.push({
        x: W - 90 + (Math.random() - 0.5) * 50, y: H - 70,
        vx: (Math.random() - 0.5) * 70, vy: -40 - Math.random() * 55,
        life: 1, max: 1, size: 3 + Math.random() * 3,
        color: [c.color, "#ffd166", "#ff8fb1"][k % 3], shape: "heart",
      });
    }
  }

  // -------------------------------------------------------- Ascension / rebirth
  const ASCEND_MIN = 50;
  const pendingShards = () => Math.max(1, Math.floor(state.ascendProgress / 50));

  function showDialog(html, yesText, onYes) {
    el.dialogModal.innerHTML = html +
      '<div class="choices"><button class="choice yes" id="dlg-yes">' + yesText + '</button>' +
      '<button class="choice no" id="dlg-no">Not yet</button></div>';
    el.dialog.classList.remove("hidden");
    root.getElementById("dlg-yes").onclick = () => { el.dialog.classList.add("hidden"); onYes && onYes(); };
    root.getElementById("dlg-no").onclick = () => el.dialog.classList.add("hidden");
  }
  function showNotice(html) {
    el.dialogModal.innerHTML = html +
      '<div class="choices"><button class="choice yes" id="dlg-ok">Keep cleaning!</button></div>';
    el.dialog.classList.remove("hidden");
    root.getElementById("dlg-ok").onclick = () => el.dialog.classList.add("hidden");
  }

  // Local two-player racing uses the existing keyboard simulation only.
  function openMultiplayerDialog() {
    if (!state.started) return;
    showDialog('<h2>Local two-player race</h2><p>Player one uses WASD or arrows; player two uses IJKL on the same keyboard. Race scores stay separate from your cleanup run.</p>',
      state.battle.active ? 'End race' : 'Start race', () => { if (state.battle.active) endBattle(true); else startBattle(); canvas.focus(); });
  }
  function cloudSend() {} // Legacy offline bookkeeping calls have no network side effects.
  function leaveCloud() {}

  function updateAscendButton() {
    const ready = state.ascendProgress >= ASCEND_MIN;
    el.ascend.disabled = !ready;
    el.ascend.textContent = ready ? "⭐ Ascend +" + pendingShards()
      : "⭐ Ascend (" + state.ascendProgress + "/" + ASCEND_MIN + ")";
  }

  function askAscend() {
    if (!state.started || state.ascendProgress < ASCEND_MIN) return;
    const n = pendingShards();
    showDialog(
      '<div class="big">⭐✨</div><h2>Ascend & Rebirth?</h2>' +
      '<p>You will wipe money, upgrades, bag and current progress — but gain <b>' + n + ' Star Shards</b>.</p>' +
      '<p>Every shard gives <b>+10% all income forever</b>, and you advance to <b>Zone ' +
      (Math.min(ZONES.length, zoneIndex() + 2)) + ' · ' + ZONES[Math.min(ZONES.length - 1, zoneIndex() + 1)].name +
      '</b> with richer trash and better eggs!</p>',
      "Ascend ⭐", () => ascend(n));
  }

  function ascend(n) {
    state.ascensions++;
    state.shards += n;
    state.ascendProgress = 0;
    setRecord("asc", state.ascensions);
    announcedZone = zoneIndex();
    state.money = 0; state.collected = 0; state.bag = [];
    state.combo = 0; state.comboTimer = 0;
    state.garbage = []; state.eggs = 1; state.companion = null;
    state.petBox = []; state.equipped = []; state.hazards = [];
    state.particles = []; state.floaters = []; state.birds = []; state.drones = [];
    state.creaturePopup = null;
    Object.keys(state.upgrades).forEach(k => { state.upgrades[k] = 0; });
    state.player.x = 420; state.player.y = 430; state.player.target = null;
    if (state.battle.active) endBattle(true);
    buildShop(); renderHatchery(); renderPetBox(); updateAscendButton(); updateStats();
    beep(520, 0.12, "sine", 0.06);
    schedule(() => beep(780, 0.14, "sine", 0.055), 130);
    schedule(() => beep(1040, 0.18, "sine", 0.05), 270);
    showNotice(
      '<div class="big">⭐🏝️</div><h2>Welcome to Zone ' + (zoneIndex() + 1) + ' · ' + zone().name + '!</h2>' +
      '<p>You earned <b>' + n + ' Star Shards</b> — <b>' + state.shards + '</b> in total.</p>' +
      '<p>Income boost: <b>+' + (state.shards * 10) + '%</b> · Trash value: <b>×' + zone().mult +
      '</b> · New eggs unlocked. Go explore!</p>');
  }

  // -------------------------------------------------------- Zones / rarities / eggs
  const ZONES = [
    { name:"Sunny Shore", icon:"🏖️", mult:1, spawn:1.7, tint:null,
      seaTop:"#0d4a73", seaBot:"#2e86c1", wet:"#d9b882", sandTop:"#ecd2a0", sandBot:"#f6e4bc",
      goal:40, reward:500, special:null, hazard:1 },
    { name:"Coral Cove", icon:"🪸", mult:2, spawn:1.5, tint:"rgba(255,110,150,.06)",
      seaTop:"#075e69", seaBot:"#27a6ab", wet:"#d7b49a", sandTop:"#f2d6bb", sandBot:"#fae8cf",
      goal:60, reward:2500, special:{ name:"coral", value:9, color:"#ff7f9f", w:18, h:17, shape:"coral" }, hazard:1 },
    { name:"Jelly Bay", icon:"🪼", mult:4, spawn:1.35, tint:"rgba(155,110,255,.08)",
      seaTop:"#2c2472", seaBot:"#7a5fc1", wet:"#b9a6cf", sandTop:"#d8c9e8", sandBot:"#efe6f7",
      goal:80, reward:10000, special:{ name:"lantern", value:18, color:"#b9ff66", w:16, h:21, shape:"lantern" }, hazard:1.1 },
    { name:"Turtle Reef", icon:"🐢", mult:8, spawn:1.2, tint:"rgba(60,200,140,.06)",
      seaTop:"#065f46", seaBot:"#22a06b", wet:"#b6cf9c", sandTop:"#dfecbd", sandBot:"#f2f7da",
      goal:110, reward:50000, special:{ name:"pearl", value:35, color:"#eef6ff", w:16, h:16, shape:"pearl" }, hazard:1.2 },
    { name:"Whale Deep", icon:"🐋", mult:16, spawn:1.05, tint:"rgba(40,90,190,.10)",
      seaTop:"#062a5a", seaBot:"#1a5fa8", wet:"#9fb6cf", sandTop:"#c7d6e6", sandBot:"#e6eef7",
      goal:150, reward:250000, special:{ name:"fossil", value:80, color:"#d9c7a3", w:23, h:18, shape:"fossil" }, hazard:1.35 },
    { name:"Mythic Atoll", icon:"🌟", mult:32, spawn:0.9, tint:"rgba(255,205,70,.10)",
      seaTop:"#4a0e6b", seaBot:"#c252a8", wet:"#e0b9d4", sandTop:"#f6dcc0", sandBot:"#fff0d6",
      goal:200, reward:1000000, special:{ name:"crown", value:200, color:"#ffd700", w:24, h:18, shape:"crown" }, hazard:1.5 },
  ];
  // Zones unlock at collector levels; ascending can also push you ahead.
  const LEVEL_TIERS = [1, 5, 12, 22, 35, 50];
  const levelTier = () => {
    let t = 0;
    for (let i = 0; i < LEVEL_TIERS.length; i++) {
      if (state.collectorLevel >= LEVEL_TIERS[i]) t = i;
    }
    return t;
  };
  const zoneIndex = () => Math.min(ZONES.length - 1, Math.max(levelTier(), state.ascensions));
  const zone = () => ZONES[zoneIndex()];

  const RARITIES = [
    { key:"Common",    color:"#95a5a6", mult:1,   weight:55,  auto:false },
    { key:"Uncommon",  color:"#2ecc71", mult:1.6, weight:27,  auto:false },
    { key:"Rare",      color:"#3498db", mult:2.8, weight:12,  auto:true },
    { key:"Epic",      color:"#9b59b6", mult:5,   weight:4.5, auto:true },
    { key:"Legendary", color:"#f1c40f", mult:10,  weight:1.4, auto:true },
    { key:"Mythic",    color:"#ff6b9d", mult:25,  weight:0.1, auto:true },
  ];
  const rarityInfo = key => RARITIES.find(r => r.key === key) || RARITIES[0];

  const EGGS = [
    { key:"basic",   name:"Basic Egg",   icon:"🥚",    cost:1,       currency:"tokens", max:2, zone:0 },
    { key:"sparkle", name:"Sparkle Egg", icon:"✨🥚", cost:5000,    currency:"money",  max:3, zone:1 },
    { key:"coral",   name:"Coral Egg",   icon:"🪸🥚", cost:50000,   currency:"money",  max:4, zone:2 },
    { key:"reef",    name:"Reef Egg",    icon:"🐢🥚", cost:200000,  currency:"money",  max:4, zone:3, shinyBoost:0.08 },
    { key:"galaxy",  name:"Galaxy Egg",  icon:"🌌🥚", cost:500000,  currency:"money",  max:5, zone:4, shinyBoost:0.12 },
    { key:"abyssal", name:"Abyssal Egg", icon:"🐙🥚", cost:5000000, currency:"money",  max:5, zone:5, shinyBoost:0.25 },
  ];

  const PET_POOL = [
    { key:"fish",    name:"Goldie",  rarity:"Common" },
    { key:"turtle",  name:"Pip",     rarity:"Common" },
    { key:"star",    name:"Stella",  rarity:"Uncommon" },
    { key:"seal",    name:"Sammy",   rarity:"Uncommon" },
    { key:"dolphin", name:"Flipper", rarity:"Rare" },
    { key:"jelly",   name:"Jelly",   rarity:"Rare" },
    { key:"octopus", name:"Inky",    rarity:"Epic" },
    { key:"manta",   name:"Momo",    rarity:"Epic" },
    { key:"whale",   name:"Neptune", rarity:"Legendary" },
    { key:"narwhal", name:"Nova",    rarity:"Legendary" },
    { key:"kraken",  name:"KRAKEN",  rarity:"Mythic" },
    { key:"star",    name:"Astra",   rarity:"Mythic" },
  ];

  // -------------------------------------------------------- Meta: records, grind, quests, badges
  const RECORD_ROWS = [
    ["Highest money", "money"], ["Most trash in a run", "runTrash"],
    ["Best combo", "combo"], ["Top pet level", "pet"],
    ["Pearl Rush score", "mini"], ["Furthest zone", "zone"], ["Ascensions", "asc"],
    ["Monster wins", "fightWins"], ["Pet trades", "trades"],
  ];

  let lastSave = -Infinity;
  const runFields = ['money','collected','recycled','bag','upgrades','ascensions','shards','lifetime','ascendProgress','eggs','player','zoneCollected'];
  function loadMeta() {
    const m=readShoreSave(storage);
    for (const key of ['records','achievements','collection']) if(m[key] && typeof m[key]==='object' && !Array.isArray(m[key])) state[key]=m[key];
    for (const key of ['relics','collectorXp','collectorLevel','lifetimeEggs']) if(Number.isFinite(m[key]) && m[key]>=0) state[key]=m[key];
    state.collectorLevel=Math.max(1,state.collectorLevel);
    if(Number.isFinite(m.bestMini))state.mini.best=m.bestMini;
    const run=m.run;
    if (!run) return;
    for(const key of runFields) {
      if(['bag','upgrades','player'].includes(key))continue;
      if(Number.isFinite(run[key]) && run[key]>=0)state[key]=run[key];
    }
    if(Array.isArray(run.bag))state.bag=run.bag.filter(item=>Number.isFinite(item?.value)&&item.value>=0).slice(0,100);
    for(const upgrade of UPGRADE_DEFS)if(Number.isFinite(run.upgrades?.[upgrade.id]))state.upgrades[upgrade.id]=Math.max(0,Math.min(upgrade.max,Math.floor(run.upgrades[upgrade.id])));
    if(Number.isFinite(run.player?.x)&&Number.isFinite(run.player?.y))Object.assign(state.player,{x:Math.max(24,Math.min(W-24,run.player.x)),y:Math.max(208,Math.min(H-26,run.player.y)),target:null});
    if(Array.isArray(run.petBox))state.petBox=run.petBox.slice(0,16).map(importPet).filter(Boolean);
    if(Array.isArray(run.equippedIndexes))for(const index of run.equippedIndexes)if(Number.isInteger(index))equipPet(state.petBox[index]);
    state.companion=state.equipped[0]||null;
  }
  function saveMeta(force=false) {
    const now=performance.now();if(!force&&now-lastSave<2500)return;
    lastSave=now;
    const run=Object.fromEntries(runFields.map(key=>[key,state[key]]));
    run.petBox=state.petBox.map(exportPet);run.equippedIndexes=state.equipped.map(pet=>state.petBox.indexOf(pet)).filter(index=>index>=0);
    const persisted=writeShoreSave(storage,{records:state.records,achievements:state.achievements,relics:state.relics,
      collectorXp:state.collectorXp,collectorLevel:state.collectorLevel,lifetimeEggs:state.lifetimeEggs,
      collection:state.collection,bestMini:state.mini.best,run});
    onSave?.(persisted);
  }
  function recordText(key, v) {
    return (key === "money" ? "$" : key === "pet" ? "Lv " : "") +
      (key === "money" ? Math.floor(v).toLocaleString() : v);
  }
  function setRecord(key, value) {
    const v = Math.floor(value);
    if (!(v > (state.records[key] || 0))) return false;
    state.records[key] = v;
    if (key === "money") el.record.textContent = "$" + v.toLocaleString();
    saveMeta();
    // Admin cheats never leak into shared cloud records.
    if (!state.admin) cloudSend({ action: "record", key, value: v });
    return true;
  }

  const QUEST_TEMPLATES = [
    { id:"bottles", icon:"🍾", text:"Collect 12 bottles", type:"shape", target:"bottle", need:12, reward:300 },
    { id:"cans",    icon:"🥫", text:"Collect 15 cans",    type:"shape", target:"can",    need:15, reward:350 },
    { id:"any",     icon:"🧹", text:"Collect 25 trash",   type:"collect", need:25, reward:500 },
    { id:"cash",    icon:"💵", text:"Earn $500 cash",     type:"earn", need:500, reward:400 },
    { id:"eggs",    icon:"🥚", text:"Find 3 eggs",        type:"egg", need:3, reward:600 },
    { id:"hazard",  icon:"🟢", text:"Clean 3 blobs",      type:"hazard", need:3, reward:700 },
    { id:"mini",    icon:"🫧", text:"Score 10 in Rush",   type:"mini", need:10, reward:800 },
    { id:"bags",    icon:"♻️", text:"Deposit 2 bags",     type:"deposit", need:2, reward:900 },
    { id:"pet",     icon:"🐾", text:"Reach pet Lv3",      type:"petlevel", need:3, reward:1200 },
  ];
  function makeQuest() {
    const t = QUEST_TEMPLATES[(Math.random() * QUEST_TEMPLATES.length) | 0];
    return { ...t, progress: 0, done: false };
  }
  function renderQuests() {
    el.quests.innerHTML = "<h3>📜 Quests</h3>" + state.quests.map(q =>
      '<div class="quest"><div class="q-top"><span>' + q.icon + " " + q.text + "</span>" +
      '<span class="q-reward">$' + q.reward + "</span></div>" +
      '<div class="qbar"><i style="width:' + Math.floor(q.progress / q.need * 100) + '%"></i></div></div>'
    ).join("");
  }
  function questProgress(type, amount, extra) {
    let changed = false;
    for (const q of state.quests) {
      if (q.done) continue;
      const hit = q.type === "shape" ? extra === q.target : q.type === type;
      if (!hit) continue;
      q.progress = Math.min(q.need, q.progress + amount);
      changed = true;
      if (q.progress >= q.need) {
        q.done = true;
        state.money += q.reward;
        floatText(W / 2, 160, "QUEST DONE! +$" + q.reward, "#a9f5c5", 16);
        burst(W / 2, 175, "#a9f5c5", 16);
        beep(950, 0.1); schedule(() => beep(1250, 0.1), 110);
        schedule(() => {
          const i = state.quests.indexOf(q);
          if (i >= 0) state.quests[i] = makeQuest();
          renderQuests(); updateStats();
        }, 900);
      }
    }
    if (changed) renderQuests();
  }

  const ACHIEVEMENTS = [
    { id:"a10",    text:"Scoop 10 pieces",      reward:200,   check:()=>state.lifetime>=10 },
    { id:"a100",   text:"Scoop 100 pieces",     reward:1000,  check:()=>state.lifetime>=100 },
    { id:"a1000",  text:"Scoop 1,000 pieces",   reward:15000, check:()=>state.lifetime>=1000 },
    { id:"egg1",   text:"Find your first egg",  reward:300,   check:()=>state.lifetimeEggs>=1 },
    { id:"egg25",  text:"Find 25 eggs",         reward:3000,  check:()=>state.lifetimeEggs>=25 },
    { id:"pet",    text:"Hatch a pet",          reward:500,   check:()=>!!state.companion },
    { id:"shiny",  text:"Hatch a Shiny pet",    reward:5000,  check:()=>!!state.companion&&state.companion.shiny },
    { id:"mythic", text:"Hatch a Mythic pet",   reward:50000, check:()=>!!state.companion&&state.companion.rarity==="Mythic" },
    { id:"zone3",  text:"Reach Jelly Bay",      reward:2500,  check:()=>zoneIndex()>=2 },
    { id:"zone6",  text:"Reach Mythic Atoll",   reward:100000,check:()=>zoneIndex()>=5 },
    { id:"asc5",   text:"Ascend 5 times",       reward:20000, check:()=>state.ascensions>=5 },
    { id:"mini15", text:"Score 15 in Pearl Rush",reward:2000, check:()=>state.mini.best>=15 },
    { id:"combo20",text:"Reach x1.20 combo",    reward:1500,  check:()=>state.combo>=20 },
    { id:"rich",   text:"Hold $10,000",         reward:5000,  check:()=>state.money>=10000 },
    { id:"col10",  text:"Collector Lv 10",      reward:10000, check:()=>state.collectorLevel>=10 },
    { id:"relic5", text:"Earn 5 zone relics",   reward:25000, check:()=>state.relics>=5 },
    { id:"merge",  text:"Merge two pets",       reward:2500,  check:()=>!!(state.companion&&state.companion.mergeCount) },
    { id:"fight",  text:"Win a monster fight",  reward:3000,  check:()=>(state.records.fightWins||0)>=1 },
    { id:"trade",  text:"Trade a pet online",   reward:2000,  check:()=>(state.records.trades||0)>=1 },
    { id:"equip3", text:"Equip 3 pets at once",  reward:3000,  check:()=>state.equipped.length>=3 },
    { id:"index8", text:"Discover 8 pets in the index", reward:5000,
      check:()=>PET_POOL.filter(p => state.collection[p.key+"|"+p.rarity]).length>=8 },
  ];
  function checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (state.achievements[a.id]) continue;
      if (!a.check()) continue;
      state.achievements[a.id] = Date.now();
      state.money += a.reward;
      saveMeta();
      floatText(W / 2, 195, "🏅 " + a.text + " +$" + a.reward, "#ffd166", 15);
      beep(1080, 0.1, "sine", 0.05);
      schedule(() => beep(1360, 0.1, "sine", 0.045), 100);
    }
  }
  function showAchievements() {
    el.dialogModal.innerHTML = '<div class="big">🏅</div><h2>Badges</h2>' +
      '<p>' + Object.keys(state.achievements).length + " / " + ACHIEVEMENTS.length + ' earned</p>' +
      '<div class="ach-grid">' + ACHIEVEMENTS.map(a =>
        '<div class="ach' + (state.achievements[a.id] ? " done" : "") + '">' +
        (state.achievements[a.id] ? "✓ " : "🔒 ") + a.text + " · $" + a.reward + "</div>").join("") +
      '</div><div class="choices"><button class="choice no" id="dlg-close">Close</button></div>';
    el.dialog.classList.remove("hidden");
    root.getElementById("dlg-close").onclick = () => el.dialog.classList.add("hidden");
  }
  function showRecords() {
    const local = RECORD_ROWS.map(([label, key]) =>
      "<div><span>" + label + "</span><b>" + recordText(key, state.records[key] || 0) + "</b></div>").join("");
    const cr = state.cloud.records || {};
    const cloud = RECORD_ROWS.map(([label, key]) => {
      const top = (cr[key] || [])[0];
      return "<div><span>" + label + "</span><b>" +
        (top ? top.name + " · " + recordText(key, top.value) : "—") + "</b></div>";
    }).join("");
    el.dialogModal.innerHTML = '<div class="big">🏆</div><h2>World Records</h2>' +
      '<div class="rec-list"><h3>🌟 Your best</h3>' + local + "</div>" +
      '<div class="rec-list"><h3>☁️ Cloud best</h3>' + cloud + "</div>" +
      '<div class="choices"><button class="choice no" id="dlg-close">Close</button></div>';
    el.dialog.classList.remove("hidden");
    root.getElementById("dlg-close").onclick = () => el.dialog.classList.add("hidden");
  }

  function addCollectorXp(amount) {
    state.collectorXp += amount;
    const need = collectorXpNeed();
    if (state.collectorXp >= need) {
      state.collectorXp -= need; state.collectorLevel++;
      saveMeta();
      floatText(state.player.x, state.player.y - 46, "COLLECTOR Lv" + state.collectorLevel, "#8ce99a", 14);
      burst(state.player.x, state.player.y, "#8ce99a", 12);
      beep(980, 0.1, "sine", 0.05);
      checkZoneUnlock();
    }
  }
  function collectorXpNeed() { return Math.round(100 * Math.pow(state.collectorLevel, 1.25)); }

  let announcedZone = -1;
  function checkZoneUnlock() {
    const z = zoneIndex();
    if (announcedZone < 0) announcedZone = z;
    if (z <= announcedZone) return;
    announcedZone = z;
    builtEggZone = -1; // force egg menu to refresh with new zones
    renderHatchery(); updateStats();
    beep(660, 0.12, "sine", 0.05);
    schedule(() => beep(880, 0.14, "sine", 0.05), 130);
    showNotice('<div class="big">' + zone().icon + '🎉</div><h2>Zone unlocked!</h2>' +
      '<p>Collector level <b>' + state.collectorLevel + '</b> opened <b>Zone ' + (z + 1) +
      ' · ' + zone().name + '</b>.</p><p>Trash is worth <b>×' + zone().mult +
      '</b> here, new treasures wash ashore, and better eggs are available!</p>');
  }

  // Shared progression for a single piece of trash (local or cloud).
  function progressTrash(g) {
    if (state.battle.active) return; // 2P races never affect the main game
    state.collected++; state.lifetime++; state.ascendProgress++;
    if (g.egg) {
      const tokens = 1 + zoneIndex();
      state.eggs += tokens; state.lifetimeEggs += tokens;
      questProgress("egg", tokens);
      floatText(g.x, g.y - 26, "🥚 +" + tokens + " TOKEN", "#fff3cd", 14);
      renderHatchery(); beep(1000, 0.12, "sine", 0.05);
    }
    for (const pet of state.equipped) {
      if (!pet || pet.hidden > 0) continue;
      pet.xp += g.value || 3;
      const need = 40 * pet.level;
      if (pet.xp >= need) {
        pet.xp = 0; pet.level++; pet.maxHp++; pet.hp = pet.maxHp;
        floatText(pet.x, pet.y - 42, "PET Lv" + pet.level + "!", "#ffd166", 14);
        burst(pet.x, pet.y, "#ffd166", 14);
        beep(1050, 0.12, "sine", 0.05);
        renderHatchery(); renderPetBox(); questProgress("petlevel", pet.level);
        setRecord("pet", pet.level);
      }
    }
    addCollectorXp(g.value || 3);
    state.zoneCollected++;
    if (state.zoneCollected >= zone().goal) {
      state.zoneCollected = 0; state.relics++; saveMeta();
      const bonus = Math.round(zone().reward * globalMult());
      state.money += bonus;
      floatText(W / 2, 175, "ZONE MISSION! +$" + bonus + " 🏺", "#ffd166", 18);
      burst(W / 2, 195, "#ffd166", 26);
      showNotice('<div class="big">🏺🎊</div><h2>Zone mission complete!</h2>' +
        "<p>You cleaned <b>" + zone().goal + " pieces</b> in <b>" + zone().name + "</b>.</p>" +
        "<p>Reward: <b>$" + bonus.toLocaleString() + "</b> and a <b>zone relic</b> (+5% permanent income). " +
        "Mission restarts for more loot!</p>");
    }
    questProgress("collect", 1, g.shape || g.name);
    questProgress("shape", 1, g.shape || g.name);
    updateAscendButton();
    setRecord("combo", state.combo);
    setRecord("runTrash", state.collected);
    setRecord("zone", zoneIndex() + 1);
    if (state.collected % 5 === 0) creatureVisits();
    checkAchievements();
  }

  // -------------------------------------------------------- Pearl Rush minigame
  function startMini() {
    if (!state.started || state.fight.active) return;
    const m = state.mini;
    m.active = true; m.timeLeft = 12; m.targets = []; m.score = 0; m.hits = 0; m.spawnTimer = 0;
    el.dialog.classList.add("hidden");
    beep(700, 0.09); schedule(() => beep(950, 0.11), 110);
    floatText(W / 2, 280, "PEARL RUSH! Click the bubbles!", "#ffd166", 20);
  }
  function updateMini(dt) {
    const m = state.mini;
    if (!m.active) return;
    m.timeLeft -= dt;
    m.spawnTimer -= dt;
    if (m.spawnTimer <= 0 && m.targets.length < 5) {
      m.spawnTimer = 0.28 + Math.random() * 0.3;
      m.targets.push({ x: 60 + Math.random() * (W - 120), y: 130 + Math.random() * (H - 220),
        life: 1.35, max: 1.35, kind: Math.random() < 0.25 ? "💎" : "🫧",
        rot: (Math.random() - 0.5) * 0.5 });
    }
    for (let i = m.targets.length - 1; i >= 0; i--) {
      m.targets[i].life -= dt;
      if (m.targets[i].life <= 0) m.targets.splice(i, 1);
    }
    if (m.timeLeft <= 0) endMini();
  }
  function hitMini(x, y) {
    const m = state.mini;
    if (!m.active) return false;
    for (let i = m.targets.length - 1; i >= 0; i--) {
      const t = m.targets[i];
      if (Math.hypot(t.x - x, t.y - y) < 30) {
        m.targets.splice(i, 1); m.hits++;
        const pts = t.kind === "💎" ? 3 : 1;
        m.score += pts;
        floatText(t.x, t.y, "+" + pts, "#ffd166", 15);
        burst(t.x, t.y, t.kind === "💎" ? "#b9f5ff" : "#eaf6ff", 10);
        beep(760 + m.hits * 12, 0.05, "sine", 0.04);
        questProgress("mini", pts);
        setRecord("mini", m.score);
        return true;
      }
    }
    return false;
  }
  function endMini() {
    const m = state.mini;
    m.active = false;
    const reward = Math.round((m.score * 25 + (m.score >= 20 ? 500 : 0)) * zone().mult);
    state.money += reward;
    if (m.score > m.best) { m.best = m.score; saveMeta(); }
    setRecord("money", state.money);
    checkAchievements();
    showNotice('<div class="big">🫧🏆</div><h2>Pearl Rush over!</h2>' +
      "<p>You popped <b>" + m.hits + "</b> targets for <b>" + m.score + " points</b>.</p>" +
      "<p>Cash reward: <b>$" + reward.toLocaleString() + "</b> · Personal best: <b>" + m.best + "</b></p>");
  }
  function drawMini() {
    const m = state.mini;
    ctx.save();
    ctx.fillStyle = "rgba(8,30,60,.55)"; ctx.fillRect(0, 0, W, H);
    for (const t of m.targets) {
      const a = Math.min(1, t.life / 0.35);
      ctx.globalAlpha = a;
      ctx.fillStyle = t.kind === "💎" ? "rgba(185,245,255,.35)" : "rgba(255,255,255,.25)";
      ctx.beginPath(); ctx.arc(t.x, t.y, 27 + Math.sin(state.time * 6) * 2, 0, TAU); ctx.fill();
      ctx.font = "30px Manrope"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(t.kind, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(20,50,75,.9)"; roundRect(W / 2 - 170, 12, 340, 46, 12); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 15px Manrope";
    ctx.fillText("🫧 PEARL RUSH  ·  " + m.score + " pts  ·  " + Math.ceil(m.timeLeft) + "s", W / 2, 41);
    ctx.restore();
  }

  // -------------------------------------------------------- Pet box, merging & trading
  const PET_EXPORT_KEYS = ["key", "name", "rarity", "color", "shiny", "hp", "maxHp",
    "level", "xp", "mergeCount"];
  function exportPet(p) {
    if (!p) return null;
    const o = {};
    for (const k of PET_EXPORT_KEYS) if(p[k]!==undefined) o[k] = p[k];
    return o;
  }
  function importPet(d) {
    if (!d) return null;
    const rarity = RARITIES.some(r => r.key === d.rarity) ? d.rarity : "Common";
    return {
      key: d.key || "fish", name: d.name || "Pet", rarity,
      color: d.color || rarityInfo(rarity).color, shiny: !!d.shiny,
      hp: Math.max(1, d.hp || 3), maxHp: Math.max(d.hp || 3, d.maxHp || 3),
      level: Math.max(1, d.level || 1), xp: d.xp || 0, mergeCount: d.mergeCount || 0,
      hidden: 0, hurt: 0, regen: 0, collectTimer: 1, phase: 0,
      x: state.player.x, y: state.player.y,
    };
  }
  function recordDiscovery(p) {
    if (!p) return;
    const id = p.key + "|" + p.rarity;
    state.collection[id] = (state.collection[id] || 0) + 1;
    if (p.shiny) state.collection[id + "|shiny"] = (state.collection[id + "|shiny"] || 0) + 1;
    saveMeta();
  }
  function equipPet(p) {
    if (!p || p.equipped) return false;
    if (state.equipped.length >= maxEquip()) return false;
    p.equipped = true;
    state.equipped.push(p);
    if (!state.companion) state.companion = p;
    return true;
  }
  function unequipPet(p) {
    const i = state.equipped.indexOf(p);
    if (i < 0) return;
    state.equipped.splice(i, 1);
    p.equipped = false;
    if (state.companion === p) state.companion = state.equipped[0] || null;
  }
  function removePet(p) {
    if (!p) return;
    unequipPet(p);
    const i = state.petBox.indexOf(p);
    if (i >= 0) state.petBox.splice(i, 1);
  }
  function acquirePet(p) {
    if (!p) return;
    if (state.petBox.length < 16) state.petBox.push(p); else state.petBox[0] = p;
    recordDiscovery(p);
    if (state.equipped.length >= maxEquip()) unequipPet(state.equipped[state.equipped.length - 1]);
    equipPet(p);
    state.companion = p;
    state.hazards = [];
  }
  function showIndex() {
    const found = PET_POOL.filter(p => (state.collection[p.key + "|" + p.rarity] || 0) > 0).length;
    const shiny = PET_POOL.filter(p => (state.collection[p.key + "|" + p.rarity + "|shiny"] || 0) > 0).length;
    const rows = RARITIES.map(r => {
      const pets = PET_POOL.filter(p => p.rarity === r.key);
      return '<div style="grid-column:1/-1;margin-top:6px" class="rarity-' + r.key + '">' +
        r.key + " · ×" + r.mult + " cash</div>" + pets.map(p => {
          const id = p.key + "|" + p.rarity;
          const n = state.collection[id] || 0;
          const sh = state.collection[id + "|shiny"] || 0;
          return '<div class="ach' + (n ? " done" : "") + '">' + (n ? "✓ " : "🔒 ") + p.name +
            '<span style="opacity:.6;font-size:10px"> ' +
            (n ? "found " + n + (sh ? " · ✨" + sh : "") : "?") + "</span></div>";
        }).join("");
    }).join("");
    el.dialogModal.innerHTML = '<div class="big">📖</div><h2>Pet Index</h2>' +
      "<p><b>" + found + "/" + PET_POOL.length + "</b> pets found · <b>" + shiny +
      "</b> shiny discovered</p>" +
      '<div class="ach-grid">' + rows + "</div>" +
      '<div class="choices"><button class="choice no" id="dlg-close">Close</button></div>';
    el.dialog.classList.remove("hidden");
    root.getElementById("dlg-close").onclick = () => el.dialog.classList.add("hidden");
  }
  function renderPetBox() {
    const box = state.petBox, slots = maxEquip();
    el.petbox.innerHTML = '<h3>🐾 Pet Inventory <span style="opacity:.6">' + box.length +
      "/16 · equipped " + state.equipped.length + "/" + slots + "</span></h3>" +
      (box.length ? box.map((p, i) => {
        const active = state.companion === p;
        const on = !!p.equipped;
        return '<div class="pet-row">' +
          '<button class="pick' + (active ? " on" : "") + '" data-i="' + i + '">' +
          (active ? "★ " : "") + (p.shiny ? "✨ " : "") + p.name + " · " + p.rarity +
          " Lv" + p.level + (p.mergeCount ? " 🧬" + p.mergeCount : "") + "</button>" +
          '<button class="slot' + (on ? " on" : "") + '" data-e="' + i + '" title="' +
          (on ? "Unequip" : "Equip") + '">' + (on ? "✓" : "E") + "</button>" +
          (active ? "" : '<button class="merge" data-m="' + i + '" title="Merge into active pet">🧬</button>') +
          "</div>";
      }).join("") : '<div class="small-note">No pets yet — hatch an egg!</div>') +
      '<div class="small-note">★ active · ✓ equipped (' + state.equipped.length + "/" + slots +
      "). Equipped pets stack income and auto-collect. Buy <b>Pet Slots</b> for up to 7.</div>";
    el.petbox.querySelectorAll("[data-i]").forEach(b => b.onclick = () => {
      const p = box[+b.dataset.i];
      if (!p) return;
      if (!p.equipped) {
        if (state.equipped.length >= maxEquip()) unequipPet(state.equipped[state.equipped.length - 1]);
        equipPet(p);
      }
      state.companion = p; state.hazards = [];
      renderPetBox(); renderHatchery(); updateStats();
      floatText(state.player.x, state.player.y - 42, p.name + " active!", "#d2b4de", 13);
      beep(760, 0.08, "sine", 0.05);
    });
    el.petbox.querySelectorAll("[data-e]").forEach(b => b.onclick = () => {
      const p = box[+b.dataset.e];
      if (!p) return;
      if (p.equipped) unequipPet(p); else equipPet(p);
      renderPetBox(); renderHatchery(); updateStats();
      beep(p.equipped ? 780 : 420, 0.07, "sine", 0.04);
    });
    el.petbox.querySelectorAll("[data-m]").forEach(b => b.onclick = () => mergePets(+b.dataset.m));
  }
  function mergePets(index) {
    const active = state.companion, other = state.petBox[index];
    if (!active || !other || active === other) return;
    const ai = state.petBox.indexOf(active);
    if (ai < 0) return;
    const ar = RARITIES.findIndex(r => r.key === active.rarity);
    const or = RARITIES.findIndex(r => r.key === other.rarity);
    const hi = Math.max(ar, or);
    const same = ar === or;
    const newRarity = same ? RARITIES[Math.min(RARITIES.length - 1, ar + 1)].key : RARITIES[hi].key;
    const info = rarityInfo(newRarity);
    const merged = {
      ...active, rarity: newRarity, color: info.color,
      shiny: active.shiny || other.shiny,
      level: Math.max(active.level, other.level) + 2,
      xp: 0, mergeCount: (active.mergeCount || 0) + (other.mergeCount || 0) + 1,
    };
    merged.maxHp = 3 + Math.floor(info.mult * 0.6) + Math.floor(merged.level / 2);
    merged.hp = merged.maxHp;
    unequipPet(other);
    const eqi = state.equipped.indexOf(active);
    state.petBox[ai] = merged;
    state.petBox.splice(ai < index ? index - 1 : index, 1);
    if (eqi >= 0) state.equipped[eqi] = merged; else equipPet(merged);
    state.companion = merged;
    state.hazards = [];
    recordDiscovery(merged);
    renderPetBox(); renderHatchery(); updateStats(); checkAchievements();
    beep(620, 0.12, "triangle", 0.05);
    schedule(() => beep(940, 0.16, "triangle", 0.05), 120);
    showNotice('<div class="big">🧬✨</div><h2>Pets merged!</h2>' +
      "<p>Your new companion is <b class='rarity-" + newRarity + "'>" +
      (merged.shiny ? "✨ Shiny " : "") + merged.name + "</b> — " +
      "<b class='rarity-" + newRarity + "'>" + newRarity + "</b> Lv" + merged.level + "!</p>" +
      "<p>" + (same ? "Same rarity merged: rarity increased!" : "Kept the higher rarity.") +
      " Incomes and fighting power are much stronger now.</p>");
  }

  function openTradeDialog() {
    if (!state.started) return;
    if (!state.cloud.active || !state.cloud.connected) {
      showNotice('<div class="big">🤝</div><h2>Cloud trade</h2>' +
        "<p>Join a <b>☁️ Cloud room</b> first, then trade pets with players inside it.</p>");
      return;
    }
    if (!state.companion) {
      showNotice('<div class="big">🥚</div><h2>No pet to trade</h2><p>Hatch an egg first!</p>');
      return;
    }
    const others = state.cloud.players.filter(p => p.id !== state.cloud.id);
    if (!others.length) {
      showNotice('<div class="big">🤝</div><h2>Nobody here yet</h2><p>Share your room code so a friend can join.</p>');
      return;
    }
    const c = state.companion;
    el.dialogModal.innerHTML = '<div class="big">🤝</div><h2>Trade a Pet</h2>' +
      '<p>You offer <b class="rarity-' + c.rarity + '">' + (c.shiny ? "✨ " : "") + c.name +
      "</b> · " + c.rarity + " Lv" + c.level + ".</p><p>Choose a player:</p>" +
      others.map(p => '<button class="choice yes trade-target" data-id="' + p.id +
        '" style="margin:4px">' + p.name + "</button>").join("") +
      '<div class="choices"><button class="choice no" id="dlg-close">Cancel</button></div>';
    el.dialog.classList.remove("hidden");
    el.dialogModal.querySelectorAll("[data-id]").forEach(b => b.onclick = () => {
      cloudSend({ action: "trade-offer", to: b.dataset.id, pet: exportPet(state.companion) });
      el.dialog.classList.add("hidden");
      floatText(W / 2, 150, "Trade offer sent! 🤝", "#aed6f1", 14);
    });
    root.getElementById("dlg-close").onclick = () => el.dialog.classList.add("hidden");
  }
  function receiveTradeOffer(m) {
    const incoming = importPet(m.pet);
    if (!incoming) return;
    const mine = state.companion;
    const canTrade = !!mine;
    showDialog('<div class="big">🤝</div><h2>Pet trade offer</h2>' +
      "<p><b>" + m.fromName + "</b> offers you <b class='rarity-" + incoming.rarity + "'>" +
      (incoming.shiny ? "✨ " : "") + incoming.name + "</b> · " + incoming.rarity +
      " Lv" + incoming.level + ".</p>" +
      (canTrade ? "<p>You give: <b class='rarity-" + mine.rarity + "'>" + mine.name +
        "</b> · " + mine.rarity + " Lv" + mine.level + ".</p>" : "<p>You have no pet to give back.</p>"),
      canTrade ? "Accept trade" : "No pet to trade", () => {
        if (!canTrade) return;
        removePet(mine);
        cloudSend({ action: "trade-reply", to: m.from, accept: true, pet: exportPet(mine) });
        renderPetBox(); renderHatchery(); updateStats();
      });
    const no = root.getElementById("dlg-no");
    if (no) no.onclick = () => {
      cloudSend({ action: "trade-reply", to: m.from, accept: false });
      el.dialog.classList.add("hidden");
    };
  }
  function completeTrade(petData) {
    const p = importPet(petData);
    if (!p) return;
    acquirePet(p);
    setRecord("trades", (state.records.trades || 0) + 1);
    renderPetBox(); renderHatchery(); updateStats(); checkAchievements();
    beep(700, 0.1, "sine", 0.05);
    schedule(() => beep(980, 0.12, "sine", 0.05), 110);
    floatText(W / 2, 160, "🤝 Trade complete: " + p.name + "!", "#d2b4de", 15);
  }

  // -------------------------------------------------------- Monster fights & spells
  const FIGHT_ENEMIES = [
    { key:"crab",    name:"Claw the Crab",   hp:26, atk:3 },
    { key:"jelly",   name:"Sting Jelly",     hp:34, atk:4 },
    { key:"octopus", name:"Inky Brute",      hp:44, atk:5 },
    { key:"whale",   name:"Rogue Whale",     hp:58, atk:6 },
    { key:"kraken",  name:"The Kraken",      hp:78, atk:8 },
  ];
  const SPELLS = [
    { name:"Water Jet",   icon:"💧", cost:18, cd:0.5, hint:"Quick damage" },
    { name:"Shell Guard", icon:"🛡️", cost:24, cd:4,   hint:"Block + heal" },
    { name:"Thunder",     icon:"⚡", cost:46, cd:3,   hint:"Heavy damage" },
    { name:"Heal",        icon:"💚", cost:34, cd:5,   hint:"Restore HP" },
  ];
  function startFight() {
    if (!state.started) return;
    const f = state.fight;
    if (f.active) { endFight(false); return; }
    if (state.mini.active) return;
    const c = state.companion;
    const base = FIGHT_ENEMIES[Math.min(FIGHT_ENEMIES.length - 1, zoneIndex())];
    const scale = 1 + 0.06 * (state.collectorLevel - 1);
    const hp = Math.round(base.hp * scale);
    f.enemy = { ...base, hp, maxHp: hp, hurt: 0 };
    const squad = Math.max(1, state.equipped.length);
    const petHp = Math.round((c ? Math.max(14, c.maxHp * 3 + c.level * 2) : 18) *
      (1 + 0.25 * (squad - 1)));
    f.pet = { name: c ? c.name : "Bare Hands", key: c ? c.key : null,
      rarity: c ? c.rarity : "Common", hp: petHp, maxHp: petHp,
      atk: (c ? 2 + rarityInfo(c.rarity).mult * 1.6 + c.level : 2.5) *
        (1 + 0.35 * (squad - 1)) };
    f.active = true; f.mana = f.maxMana; f.enemyTimer = 1.4; f.petTimer = 0.8;
    f.shield = 0; f.cooldowns = {}; f.resultTime = 0; f.reward = 0;
    el.dialog.classList.add("hidden");
    beep(520, 0.1, "sawtooth", 0.04);
    schedule(() => beep(720, 0.12, "sawtooth", 0.04), 120);
    floatText(W / 2, 270, "⚔️ " + base.name + " appears!", "#ffd166", 18);
  }
  function castSpell(i) {
    const f = state.fight, s = SPELLS[i];
    if (!f.active || !s) return;
    if ((f.cooldowns[i] || 0) > 0) return;
    if (f.mana < s.cost) {
      floatText(W / 2, H - 92, "Not enough mana!", "#ff6b6b", 12);
      return;
    }
    f.mana -= s.cost; f.cooldowns[i] = s.cd;
    const atk = f.pet.atk;
    if (i === 0) {
      const dmg = Math.round(atk * (0.9 + Math.random() * 0.4));
      damageEnemy(dmg, "💧 " + dmg); beep(620, 0.09, "sine", 0.05);
    } else if (i === 1) {
      f.shield = 1;
      const heal = Math.round(f.pet.maxHp * 0.15);
      f.pet.hp = Math.min(f.pet.maxHp, f.pet.hp + heal);
      floatText(W / 2 - 130, H - 150, "🛡️ BLOCK +" + heal, "#a9f5c5", 14);
      beep(480, 0.12, "triangle", 0.05);
    } else if (i === 2) {
      const dmg = Math.round(atk * (2.2 + Math.random() * 0.6));
      damageEnemy(dmg, "⚡ " + dmg); beep(880, 0.14, "sawtooth", 0.05);
    } else if (i === 3) {
      const heal = Math.round(f.pet.maxHp * 0.32);
      f.pet.hp = Math.min(f.pet.maxHp, f.pet.hp + heal);
      floatText(W / 2 - 130, H - 150, "💚 +" + heal, "#a9f5c5", 15);
      beep(740, 0.12, "sine", 0.05);
    }
  }
  function damageEnemy(dmg, label) {
    const f = state.fight;
    f.enemy.hp -= dmg; f.enemy.hurt = 0.25;
    floatText(W / 2 + 40, 190, label, "#ffd166", 16);
    burst(W / 2, 190, "#ffd166", 12);
    if (f.enemy.hp <= 0) { f.enemy.hp = 0; endFight(true); }
  }
  function updateFight(dt) {
    const f = state.fight;
    if (!f.active) { if (f.resultTime > 0) f.resultTime -= dt; return; }
    f.mana = Math.min(f.maxMana, f.mana + 8 * dt);
    for (const k in f.cooldowns) f.cooldowns[k] = Math.max(0, f.cooldowns[k] - dt);
    if (f.enemy.hurt > 0) f.enemy.hurt -= dt;
    f.petTimer -= dt;
    if (f.petTimer <= 0) {
      f.petTimer = 1.1;
      const dmg = Math.round(f.pet.atk * (0.7 + Math.random() * 0.6));
      damageEnemy(dmg, dmg + "");
    }
    if (!f.active) return;
    f.enemyTimer -= dt;
    if (f.enemyTimer <= 0) {
      f.enemyTimer = Math.max(0.9, 1.8 - 0.1 * zoneIndex());
      let dmg = Math.round(f.enemy.atk * (0.8 + Math.random() * 0.4));
      if (f.shield > 0) {
        f.shield = 0;
        floatText(W / 2 - 130, 300, "BLOCKED!", "#aed6f1", 15);
        beep(360, 0.1, "square", 0.04);
      } else {
        f.pet.hp -= dmg;
        floatText(W / 2 - 130, 300, "-" + dmg, "#ff6b6b", 16);
        beep(220, 0.1, "sawtooth", 0.04);
        if (f.pet.hp <= 0) { f.pet.hp = 0; endFight(false); }
      }
    }
  }
  function endFight(win) {
    const f = state.fight;
    if (!f.active) return;
    f.active = false; f.resultTime = 5;
    if (win) {
      f.reward = Math.round((35 + f.enemy.maxHp * 2.5) * zone().mult * (1 + 0.1 * state.shards));
      state.money += f.reward;
      setRecord("money", state.money);
      setRecord("fightWins", (state.records.fightWins || 0) + 1);
      addCollectorXp(f.enemy.maxHp / 2);
      if (Math.random() < 0.3) { state.eggs++; renderHatchery(); }
      questProgress("fight", 1);
      beep(880, 0.12); schedule(() => beep(1180, 0.16), 140);
    } else {
      f.reward = 0;
      beep(180, 0.2, "sawtooth", 0.04);
    }
    checkAchievements(); updateStats(); renderShop();
  }
  function spellRects() {
    const x0 = W / 2 - 200, y = H - 62, w = 94, gap = 8;
    return SPELLS.map((s, i) => ({ x: x0 + i * (w + gap), y, w, h: 46, i }));
  }
  function drawBar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = "rgba(0,0,0,.45)"; roundRect(x, y, w, h, h / 2); ctx.fill();
    ctx.fillStyle = color; roundRect(x + 2, y + 2, Math.max(0, (w - 4) * frac), h - 4, (h - 4) / 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px Manrope"; ctx.textAlign = "center";
    ctx.fillText(label, x + w / 2, y + h - 4);
  }
  function drawFight() {
    const f = state.fight;
    if (!f.active && f.resultTime <= 0) return;
    ctx.save();
    ctx.fillStyle = "rgba(8,25,55,.72)"; ctx.fillRect(0, 0, W, H);
    if (f.active && f.enemy) {
      const shake = f.enemy.hurt > 0 ? Math.sin(state.time * 60) * 5 : 0;
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.beginPath(); ctx.ellipse(W / 2 + shake, 218, 74, 16, 0, 0, TAU); ctx.fill();
      if (f.pet.key) drawSeaCreature(f.pet.key, W / 2 - 150, 300, 1.1);
      else drawPlayer({ x: W / 2 - 150, y: 300, dir: 1, walkPhase: state.time * 6 });
      drawSeaCreature(f.enemy.key, W / 2 + shake, 190, 1.9);
      ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "bold 15px Manrope";
      ctx.fillText("⚔️ " + f.enemy.name, W / 2, 70);
      drawBar(W / 2 - 130, 82, 260, 18, f.enemy.hp / f.enemy.maxHp, "#e74c3c",
        "ENEMY  " + f.enemy.hp + "/" + f.enemy.maxHp);
      drawBar(W / 2 - 130, 108, 260, 18, f.pet.hp / f.pet.maxHp, "#2ecc71",
        f.pet.name + "  " + f.pet.hp + "/" + f.pet.maxHp);
      drawBar(W / 2 - 130, 134, 260, 14, f.mana / f.maxMana, "#3498db",
        "MANA  " + Math.floor(f.mana) + (f.shield ? "  🛡️ SHIELD" : ""));
      for (const r of spellRects()) {
        const s = SPELLS[r.i], cd = f.cooldowns[r.i] || 0;
        const ready = cd <= 0 && f.mana >= s.cost;
        ctx.fillStyle = ready ? "rgba(22,160,133,.92)" : "rgba(90,100,110,.75)";
        roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px Manrope";
        ctx.fillText((r.i + 1) + " " + s.icon + " " + s.name, r.x + r.w / 2, r.y + 20);
        ctx.font = "10px Manrope";
        ctx.fillText(cd > 0 ? cd.toFixed(1) + "s" : s.cost + " mana", r.x + r.w / 2, r.y + 37);
      }
      ctx.fillStyle = "#d5f5e3"; ctx.font = "11px Manrope";
      ctx.fillText("Press 1-4 or click a spell · Your pet attacks automatically", W / 2, H - 8);
    } else if (f.resultTime > 0) {
      ctx.fillStyle = "rgba(20,50,75,.9)";
      roundRect(W / 2 - 180, H / 2 - 50, 360, 100, 16); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 20px Manrope"; ctx.textAlign = "center";
      ctx.fillText(f.reward > 0 ? "🏆 Victory! +$" + f.reward : "💔 Defeat...", W / 2, H / 2);
      ctx.font = "12px Manrope";
      ctx.fillText(f.reward > 0 ? "Loot + XP + maybe an egg!" : "Rest and try again.", W / 2, H / 2 + 28);
    }
    ctx.restore();
  }

  function selectedEgg() {
    const e = EGGS.find(x => x.key === el.eggSelect.value) || EGGS[0];
    return e.zone <= zoneIndex() ? e : EGGS[0];
  }

  function rollCompanion(egg) {
    const pool = RARITIES.slice(0, (egg ? egg.max : 2) + 1);
    const total = pool.reduce((a, r) => a + r.weight, 0);
    let roll = Math.random() * total, chosen = pool[0];
    for (const r of pool) { roll -= r.weight; if (roll <= 0) { chosen = r; break; } }
    const pets = PET_POOL.filter(p => p.rarity === chosen.key);
    const base = pets[(Math.random() * pets.length) | 0];
    const shiny = Math.random() < 0.12 + (egg && egg.shinyBoost ? egg.shinyBoost : 0);
    const hp = 3 + Math.floor(chosen.mult * 0.6);
    return { ...base, rarity: chosen.key, color: chosen.color, shiny,
      hp, maxHp: hp, level: 1, xp: 0, hidden: 0, hurt: 0, regen: 0,
      collectTimer: 1, phase: 0, x: state.player.x - 30, y: state.player.y - 24 };
  }

  let builtEggZone = -1;
  function renderHatchery() {
    // Only rebuild the dropdown when a new zone unlocks new eggs — rebuilding it
    // every HUD tick would close the menu while the player is choosing.
    if (builtEggZone !== zoneIndex()) {
      builtEggZone = zoneIndex();
      const current = el.eggSelect.value;
      el.eggSelect.innerHTML = EGGS.map(e => {
        const locked = e.zone > zoneIndex();
        return '<option value="' + e.key + '"' + (locked ? " disabled" : "") + '>' +
          e.icon + " " + e.name + (locked ? " 🔒 Zone " + (e.zone + 1) : "") + "</option>";
      }).join("");
      const valid = [...el.eggSelect.options].some(o => o.value === current && !o.disabled);
      el.eggSelect.value = valid ? current : EGGS[0].key;
    }
    const egg = selectedEgg();
    el.eggCount.textContent = state.eggs;
    const c = state.companion;
    const active = state.equipped.filter(p => p && p.hidden <= 0);
    const power = active.reduce((m, p) => m * rarityInfo(p.rarity).mult *
      (p.shiny ? 2 : 1) * (1 + 0.05 * (p.level - 1)), 1);
    const head = '<div class="small-note" style="margin:0 0 4px">👥 ' +
      state.equipped.length + "/" + maxEquip() + " equipped · ×" + power.toFixed(1) +
      " total pet power</div>";
    el.companionInfo.innerHTML = head + (c
      ? '<b class="rarity-' + c.rarity + '">' + (c.shiny ? "✨ " : "") + c.name + "</b> · " +
        '<b class="rarity-' + c.rarity + '">' + c.rarity + "</b> Lv" + c.level + "<br>" +
        "×" + rarityInfo(c.rarity).mult.toFixed(1) + " cash" + (c.shiny ? " · ✨Shiny ×2" : "") +
        " · " + c.hp + "/" + c.maxHp + " ❤️" +
        " · XP " + c.xp + "/" + (40 * c.level) +
        (c.hidden > 0 ? " · hiding " + Math.ceil(c.hidden) + "s" : "")
      : "No pet yet — hatch an egg and protect it from pollution!");
    el.eggDetail.innerHTML = egg.currency === "tokens"
      ? "Cost: <b>" + egg.cost + (egg.cost === 1 ? " token" : " tokens") +
        "</b> (you have " + state.eggs + ") · up to <b>" + RARITIES[egg.max].key + "</b>"
      : "Cost: <b>$" + egg.cost.toLocaleString() + "</b> · up to <b>" + RARITIES[egg.max].key + "</b>";
    el.hatchBtn.disabled = egg.currency === "tokens" ? state.eggs < egg.cost : state.money < egg.cost;
    el.hatchBtn.textContent = (state.equipped.length >= maxEquip()
      ? "Swap in · " : c ? "Add · " : "Hatch ") + egg.name;
  }

  function hatchCompanion() {
    const egg = selectedEgg();
    if (egg.currency === "tokens") {
      if (state.eggs < egg.cost) return;
      state.eggs -= egg.cost;
    } else {
      if (state.money < egg.cost) return;
      state.money -= egg.cost;
    }
    const c = rollCompanion(egg);
    acquirePet(c);
    setRecord("pet", c.level);
    renderHatchery(); renderPetBox(); updateStats(); renderShop();
    beep(600, 0.1, "sine", 0.05);
    schedule(() => beep(900, 0.14, "sine", 0.05), 130);
    showNotice(
      '<div class="big">🥚✨</div><h2>It hatched!</h2>' +
      '<p>You got <b class="rarity-' + c.rarity + '">' + (c.shiny ? "✨ Shiny " : "") + c.name +
      "</b> — a <b class='rarity-" + c.rarity + "'>" + c.rarity + "</b> pet!</p>" +
      "<p>Base power <b>×" + rarityInfo(c.rarity).mult + "</b>" + (c.shiny ? " ×2 for Shiny" : "") +
      ". Collect trash to level it up, and bump into pollution blobs to keep it safe!</p>");
  }

  function updateCompanion(dt) {
    const p = state.player, pets = state.equipped;
    pets.forEach((c, i) => {
      if (!c) return;
      const spread = (i - (pets.length - 1) / 2) * 30;
      c.x += ((p.x - 32 * p.dir + spread) - c.x) * Math.min(1, dt * 4);
      c.y += ((p.y - 26 + Math.abs(spread) * 0.25) - c.y) * Math.min(1, dt * 4);
      c.phase += dt * 3;
      if (c.hidden > 0) {
        c.hidden -= dt;
        if (c.hidden <= 0) {
          c.hidden = 0; c.hp = c.maxHp; c.regen = 0;
          floatText(c.x, c.y - 30, "I'm back! 💙", "#a9f5c5", 13);
        }
        return;
      }
      if (c.hurt > 0) c.hurt -= dt;
      c.regen += dt;
      if (c.regen >= 18 && c.hp < c.maxHp) {
        c.regen = 0; c.hp++;
        floatText(c.x, c.y - 30, "+1 ❤️", "#ff8fb1", 12);
      }
      const info = rarityInfo(c.rarity);
      if (!info.auto) return;
      c.collectTimer -= dt;
      if (c.collectTimer > 0) return;
      const powerful = info.mult >= 10;
      c.collectTimer = powerful ? 1.2 : 2.4;
      let best = null, bd = powerful ? 210 : 140;
      for (const g of state.garbage) {
        const d = Math.hypot(c.x - g.x, c.y - g.y);
        if (d < bd) { bd = d; best = g; }
      }
      if (best && tryCollect(best, true)) floatText(c.x, c.y - 34, "got it!", "#a9f5c5", 11);
    });
  }

  function updateHazards(dt) {
    if (state.battle.active) return;
    const pets = state.equipped.filter(p => p && p.hidden <= 0);
    if (pets.length) {
      state.hazardTimer -= dt;
      if (state.hazardTimer <= 0) {
        state.hazardTimer = 11 + Math.random() * 8;
        state.hazards.push({ x: W + 45, y: 260 + Math.random() * 250, phase: Math.random() * 6 });
      }
    }
    for (let i = state.hazards.length - 1; i >= 0; i--) {
      const h = state.hazards[i];
      h.x -= 58 * dt; h.phase += dt * 3;
      let victim = null, vd = 36;
      for (const pet of pets) {
        const d = Math.hypot(h.x - pet.x, h.y - pet.y);
        if (d < vd) { vd = d; victim = pet; }
      }
      if (victim) {
        victim.hp--; victim.hurt = 0.6; victim.regen = 0;
        floatText(victim.x, victim.y - 30, "OUCH! -1 ❤️", "#ff6b6b", 13);
        burst(h.x, h.y, "#4a5d23", 10);
        state.hazards.splice(i, 1);
        if (victim.hp <= 0) {
          victim.hidden = 18;
          floatText(victim.x, victim.y - 44, "Too scared — hiding!", "#fff", 13);
        }
        renderHatchery(); renderPetBox();
        continue;
      }
      if (Math.hypot(state.player.x - h.x, state.player.y - h.y) < 44) {
        state.money += 25;
        questProgress("hazard", 1);
        floatText(h.x, h.y, "+$25 cleaned!", "#a9f5c5", 13);
        burst(h.x, h.y, "#7bc47f", 12);
        beep(620, 0.08, "square", 0.04);
        state.hazards.splice(i, 1);
        continue;
      }
      if (h.x < -50) state.hazards.splice(i, 1);
    }
  }

  // -------------------------------------------------------- Local 2P battle
  function startBattle() {
    if (!state.started) return;
    if (state.battle.active) { endBattle(true); return; }
    const b = state.battle;
    state.mini.active = false;
    if (state.fight.active) endFight(false);
    b.active = true; b.timeLeft = 60; b.p1 = 0; b.p2 = 0; b.result = ""; b.resultTime = 0;
    state.p2.x = 500; state.p2.y = 430; state.p2.dir = -1;
    state.bag = [];
    showNotice('<div class="big">⚔️</div><h2>Battle started!</h2>' +
      '<p><b>Player 1</b>: arrows / WASD / click · <b>Player 2</b>: IJKL</p>' +
      '<p>60 seconds to grab the most trash. <b>Battle scores don\'t affect your main game</b> — no cash, XP or eggs here!</p>');
    beep(500, 0.1); schedule(() => beep(750, 0.12), 120);
  }

  function endBattle(silent) {
    const b = state.battle;
    if (!b.active) return;
    b.active = false;
    if (silent) return;
    b.result = b.p1 === b.p2 ? "It's a tie!" : b.p1 > b.p2 ? "🏆 Player 1 wins!" : "🏆 Player 2 wins!";
    b.resultTime = 5;
    floatText(W / 2, 280, b.result + "  (battle only — no cash)", "#ffd700", 22);
    burst(W / 2, 300, "#ffd700", 26);
    beep(880, 0.15);
    schedule(() => beep(1170, 0.18), 150);
  }

  function updateBattle(dt) {
    const b = state.battle;
    if (b.active) {
      b.timeLeft -= dt;
      if (b.timeLeft <= 0) { b.timeLeft = 0; endBattle(false); }
    } else if (b.resultTime > 0) {
      b.resultTime -= dt;
    }
  }

  function tryCollect(g, auto = false, collector = "p1") {
    if (state.cloud.active) return false; // cloud trash is handled by the server
    const battle = state.battle.active;
    if (battle && auto) return false; // helpers cannot farm a 2P race
    if (!battle && state.bag.length >= capacity()) return false;
    const i = state.garbage.indexOf(g);
    if (i < 0) return false;
    state.garbage.splice(i, 1);

    const itemValue = Math.round((g.value + goldenBonus()) * zone().mult);
    if (battle) {
      // Battle is an isolated race: no money, XP, eggs or records leak into the main game.
      if (collector === "p1") state.battle.p1++; else state.battle.p2++;
      floatText(g.x, g.y - 12, "+1  P" + (collector === "p1" ? "1" : "2"),
        collector === "p1" ? "#8ce99a" : "#ffa8a8", 13);
    } else {
      state.bag.push({ value: itemValue, color: g.color });
    }

    if (!auto && !battle) {
      state.combo++;
      state.comboTimer = comboWindow();
      floatText(g.x, g.y - 12, "+" + g.value, "#ffffff");
    }
    progressTrash(g);
    burst(g.x, g.y, g.color, g.rare || g.egg ? 18 : 8);
    beep((auto ? 430 : 520) + Math.min(state.combo, 22) * 14, 0.06, "triangle", 0.04);
    return true;
  }

  function deposit() {
    if (!state.bag.length) return;
    let sum = 0;
    for (const item of state.bag) sum += item.value;
    let mult = cashMult() * globalMult() * companionMult() * (1 + Math.min(state.combo, 30) * 0.01);
    const doubled = Math.random() < doubleChance();
    if (doubled) mult *= 2;
    const earned = Math.max(1, Math.round(sum * mult));
    state.money += earned;
    state.recycled += state.bag.length;
    state.bag.length = 0;
    onProgress?.({...getStatus(),reason:"deposit"});
    state.combo = 0; state.comboTimer = 0;
    floatText(BIN.x, BIN.y - 34, "+$" + earned + (doubled ? " x2!" : ""), "#ffd700", 18);
    burst(BIN.x, BIN.y - 8, "#f1c40f", 18);
    beep(780, 0.1, "sine", 0.06);
    schedule(() => beep(1040, 0.12, "sine", 0.05), 90);
    questProgress("deposit", 1);
    questProgress("earn", earned);
    setRecord("money", state.money);
    checkAchievements();
    renderShop();
  }

  // ------------------------------------------------------------------ Effects
  function burst(x, y, color, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 90;
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        life: 0.55 + Math.random() * 0.35, max: 0.9,
        size: 2 + Math.random() * 3, color, shape: "dot",
      });
    }
  }
  function floatText(x, y, text, color = "#fff", size = 14) {
    state.floaters.push({ x, y, text, color, size, life: 1.1, max: 1.1 });
  }

  // ------------------------------------------------------------------ Input
  const keys = {};
  listen(window,"keydown", e => {
    const target=e.composedPath()[0];
    if(target!==canvas || e.ctrlKey || e.metaKey || e.altKey || e.repeat)return;
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
    if (k === "p") togglePause();
    if (state.fight.active && ["1","2","3","4"].includes(k)) castSpell(+k - 1);
  });
  listen(window,"keyup", e => { keys[e.key.toLowerCase()] = false; });

  function pointerTarget(e) {
    const r = canvas.getBoundingClientRect();
    state.player.target = {
      x: Math.max(24, Math.min(W - 24, (e.clientX - r.left) * (W / r.width))),
      y: Math.max(208, Math.min(H - 26, (e.clientY - r.top) * (H / r.height))),
    };
  }
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height) };
  }
  listen(canvas,"pointerdown", e => {
    if(e.isPrimary===false || e.button!==0)return;
    canvas.focus();
    const pt = canvasPoint(e);
    if (state.fight.active) {
      for (const r of spellRects()) {
        if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) {
          castSpell(r.i); return;
        }
      }
      return;
    }
    if (state.mini.active) { if (hitMini(pt.x, pt.y)) return; }
    pointerTarget(e); beep(500, 0.03, "sine", 0.025);
  });
  listen(canvas,"pointermove", e => {
    if (e.buttons && !state.fight.active && !state.mini.active) pointerTarget(e);
  });

  listen(el.start,"click", () => {
    state.started = true; state.paused = false;
    canvas.focus();
    el.overlay.classList.add("hidden");
    el.pause.textContent = "⏸ Pause";
    beep(600, 0.08); schedule(() => beep(800, 0.1), 100);
  });
  listen(el.pause,"click", togglePause);
  listen(el.battle,"click", openMultiplayerDialog);
  listen(el.ascend,"click", askAscend);
  listen(el.hatchBtn,"click", hatchCompanion);
  listen(el.eggSelect,"change", renderHatchery);
  listen(el.mini,"click", startMini);
  listen(el.questBtn,"click", () => {
    if (state.quests.length) renderQuests();
    showNotice('<div class="big">📜</div><h2>Grind Quests</h2>' +
      "<p>Three quests rotate in the shop panel. Finish them for cash; new ones appear automatically.</p>");
  });
  listen(el.recordBtn,"click", showRecords);
  listen(el.achBtn,"click", showAchievements);
  listen(el.fightBtn,"click", startFight);
  listen(el.indexBtn,"click", showIndex);
  listen(el.sound,"click", () => {
    soundOn = !soundOn;
    el.sound.textContent = soundOn ? "Sound on" : "Sound off";
    if (soundOn) beep(700, 0.07);
  });
  function togglePause() {
    if (!state.started) return;
    state.paused = !state.paused;
    saveMeta(true);
    el.pause.textContent = state.paused ? "▶ Resume" : "⏸ Pause";
  }

  // ------------------------------------------------------------------ Update
  let waveHigh = false;
  function update(dt) {
    state.time += dt;
    const p = state.player;

    // breaking wave spray at high tide
    const high = wavePhase() > 0.92;
    if (high && !waveHigh) {
      waveHigh = true;
      for (let i = 0; i < 12; i++) {
        state.particles.push({ x: Math.random() * W, y: waterline(),
          vx: (Math.random() - 0.5) * 70, vy: -35 - Math.random() * 55,
          life: 0.55, max: 0.55, size: 2 + Math.random() * 2,
          color: "rgba(255,255,255,.9)", shape: "dot" });
      }
    } else if (wavePhase() < 0.7) waveHigh = false;

    // --- passive income (per second upgrades, boosted by shards & companion)
    const passive = passiveIncome();
    if (passive > 0 && !state.battle.active) {
      state.money += passive * globalMult() * companionMult() * dt;
    }

    // --- player movement
    let vx = 0, vy = 0;
    if (keys.arrowleft || keys.a) vx -= 1;
    if (keys.arrowright || keys.d) vx += 1;
    if (keys.arrowup || keys.w) vy -= 1;
    if (keys.arrowdown || keys.s) vy += 1;
    const usingKeys = vx !== 0 || vy !== 0;
    if (usingKeys) p.target = null;
    if (!usingKeys && p.target) {
      const dx = p.target.x - p.x, dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 3) { vx = dx / d; vy = dy / d; }
      else p.target = null;
    }
    const len = Math.hypot(vx, vy) || 1;
    const sp = moveSpeed();
    p.x = Math.max(24, Math.min(W - 24, p.x + (vx / len) * sp * dt));
    p.y = Math.max(208, Math.min(H - 26, p.y + (vy / len) * sp * dt));
    if (vx < -0.1) p.dir = -1; else if (vx > 0.1) p.dir = 1;
    if (usingKeys || p.target) p.walkPhase += dt * 11;

    // --- player 2 movement (local PvP, IJKL keys)
    if (state.battle.active) {
      const q = state.p2;
      let qx = 0, qy = 0;
      if (keys.i) qy -= 1;
      if (keys.k) qy += 1;
      if (keys.j) qx -= 1;
      if (keys.l) qx += 1;
      const ql = Math.hypot(qx, qy) || 1;
      q.x = Math.max(24, Math.min(W - 24, q.x + (qx / ql) * sp * dt));
      q.y = Math.max(208, Math.min(H - 26, q.y + (qy / ql) * sp * dt));
      if (qx < -0.1) q.dir = -1; else if (qx > 0.1) q.dir = 1;
      if (qx || qy) q.walkPhase += dt * 11;
    }

    // --- deposit at bin
    if (state.bag.length && Math.hypot(p.x - BIN.x, p.y - BIN.y) < 46) deposit();

    // --- trash spawning (the cloud server owns trash while online)
    if (!state.cloud.active) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) { spawnTrash(); state.spawnTimer = spawnDelay(); }
    }

    // --- trash drift + player pickup
    const pr = pickupRadius();
    if (state.cloud.active) {
      // Send position + pickup attempts to the server; it owns the trash and scores.
      if (state.time - state.cloud.lastInput > 0.1) {
        state.cloud.lastInput = state.time;
        cloudSend({ action: "input", x: p.x, y: p.y, dir: p.dir });
      }
      for (const g of state.garbage) {
        if (Math.hypot(p.x - g.x, p.y - g.y) < pr + 10) {
          cloudSend({ action: "collect", x: g.x, y: g.y });
          break;
        }
      }
    } else {
      for (let i = state.garbage.length - 1; i >= 0; i--) {
        const g = state.garbage[i];
        if (g.y < g.restY) g.y = Math.min(g.restY, g.y + g.vy * dt);
        g.bob += dt * 3;
        // trash caught in the swash is carried sideways by the wave
        const wl = waterline();
        if (g.y >= wl - 8 && g.y <= wl + 40) {
          g.x = Math.max(18, Math.min(W - 18, g.x + waveDrift() * dt));
          g.rot += waveDrift() * dt * 0.008;
        }
        if (Math.hypot(p.x - g.x, p.y - g.y) < pr + 10) tryCollect(g, false, "p1");
        else if (state.battle.active && Math.hypot(state.p2.x - g.x, state.p2.y - g.y) < pr + 10)
          tryCollect(g, false, "p2");
      }
    }

    // --- combo decay
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }

    // --- turtle patrol
    state.turtle.x += state.turtle.dir * 22 * dt;
    if (state.turtle.x < 520) { state.turtle.x = 520; state.turtle.dir = 1; }
    if (state.turtle.x > 720) { state.turtle.x = 720; state.turtle.dir = -1; }

    // --- visiting sea creature popup (slides up from bottom-right, then leaves)
    const cp = state.creaturePopup;
    if (cp) {
      cp.t += dt;
      if (cp.phase === "in" && cp.t >= 0.5) { cp.phase = "hold"; cp.t = 0; }
      else if (cp.phase === "hold" && cp.t >= 3.4) { cp.phase = "out"; cp.t = 0; }
      else if (cp.phase === "out" && cp.t >= 0.5) state.creaturePopup = null;
    }

    // --- turtle helper
    if (lv("turtle") > 0) {
      state.turtleTimer -= dt;
      if (state.turtleTimer <= 0) {
        state.turtleTimer = Math.max(1.0, 3.2 - 0.5 * lv("turtle"));
        let best = null, bd = 145;
        for (const g of state.garbage) {
          const d = Math.hypot(state.turtle.x - g.x, state.turtle.y - g.y);
          if (d < bd) { bd = d; best = g; }
        }
        if (best && tryCollect(best, true)) {
          state.floaters.push({ x: state.turtle.x + 18, y: state.turtle.y - 18,
            text: "got it!", color: "#a9f5c5", size: 11, life: 0.9, max: 0.9 });
        }
      }
    }

    // --- cleanup drone
    if (lv("drone") > 0) {
      state.droneTimer -= dt;
      if (state.droneTimer <= 0) {
        state.droneTimer = droneDelay();
        state.drones.push({ x: -40, y: 150, t: 0 });
        beep(240, 0.18, "sawtooth", 0.03);
      }
    }
    for (let i = state.drones.length - 1; i >= 0; i--) {
      const d = state.drones[i];
      d.x += (W + 80) / 1.7 * dt; d.t += dt;
      for (let j = state.garbage.length - 1; j >= 0; j--) {
        if (Math.abs(state.garbage[j].x - d.x) < 38) tryCollect(state.garbage[j], true);
      }
      if (d.x > W + 45) state.drones.splice(i, 1);
    }

    // --- seagull scout
    if (lv("gull") > 0) {
      state.gullTimer -= dt;
      if (state.gullTimer <= 0) {
        state.gullTimer = gullDelay();
        state.birds.push({ x: -40, y: 95 + Math.random() * 45, paid: false, phase: Math.random() * 6 });
      }
    }
    for (let i = state.birds.length - 1; i >= 0; i--) {
      const b = state.birds[i];
      b.x += 105 * dt; b.phase += dt * 12;
      if (!b.paid && b.x > W * 0.5) {
        b.paid = true;
        if (state.battle.active) continue;
        const bonus = 5 * lv("gull");
        state.money += bonus;
        floatText(b.x, b.y + 16, "+" + bonus + " coins 🕊️", "#fff", 14);
        beep(920, 0.08, "sine", 0.04);
        renderShop();
      }
      if (b.x > W + 45) state.birds.splice(i, 1);
    }

    // --- battle timer, companion and pollution hazards
    updateBattle(dt);
    updateMini(dt);
    updateFight(dt);
    updateCompanion(dt);
    updateHazards(dt);

    // --- particles & floaters
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const q = state.particles[i];
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 150 * dt; q.life -= dt;
      if (q.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floaters.length - 1; i >= 0; i--) {
      const f = state.floaters[i];
      f.y -= 34 * dt; f.life -= dt;
      if (f.life <= 0) state.floaters.splice(i, 1);
    }
  }

  // ------------------------------------------------------------------ Drawing helpers
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapText(text, maxChars) {
    const words = text.split(" ");
    const lines = []; let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > maxChars) { lines.push(cur); cur = w; }
      else cur = (cur + " " + w).trim();
    }
    if (cur) lines.push(cur);
    return lines;
  }

  const speckles = Array.from({ length: 150 }, () => ({
    x: Math.random() * W, y: 200 + Math.random() * 400,
    r: 0.7 + Math.random() * 1.4,
    c: Math.random() < 0.5 ? "rgba(180,140,80,.18)" : "rgba(255,255,255,.35)",
  }));

  // The tide rolls in and out; landed trash within the swash gets carried along.
  const wavePhase = () => state.waveFrozen ? 0.6 : Math.sin(state.time * 0.55);
  const waterline = () => 182 + wavePhase() * 26;
  const waveDrift = () => state.waveFrozen ? 0 : Math.cos(state.time * 0.55) * 30;

  function drawFoam(y, phase, color, width, dir) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const yy = y + Math.sin(x * 0.035 + state.time * 2.1 * dir + phase) * 4
                   + Math.sin(x * 0.011 - state.time * 1.3) * 2;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.stroke();
  }

  function drawBackground() {
    const z = zone();
    const wl = waterline();
    const sea = ctx.createLinearGradient(0, 0, 0, wl + 12);
    sea.addColorStop(0, z.seaTop); sea.addColorStop(1, z.seaBot);
    ctx.fillStyle = sea; ctx.fillRect(0, 0, W, wl + 12);
    // rolling swell lines drifting across the surface
    for (let i = 0; i < 6; i++) {
      const y = 22 + i * 30 + Math.sin(state.time * 0.8 + i) * 6;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const yy = y + Math.sin(x * 0.02 + state.time * 1.7 + i * 0.8) * 5;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 2; ctx.stroke();
    }
    // wet sand band grows and shrinks with the tide
    ctx.fillStyle = z.wet; ctx.fillRect(0, wl, W, 66);
    const sand = ctx.createLinearGradient(0, wl + 62, 0, H);
    sand.addColorStop(0, z.sandTop); sand.addColorStop(1, z.sandBot);
    ctx.fillStyle = sand; ctx.fillRect(0, wl + 62, W, H - wl - 62);
    for (const s of speckles) {
      ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    // foamy shoreline: three crests chasing each other back and forth
    drawFoam(wl, 0, "rgba(255,255,255,.85)", 5, 1);
    drawFoam(wl + 15, 2, "rgba(255,255,255,.38)", 2, -1);
    drawFoam(wl + 32, 4, "rgba(255,255,255,.22)", 1.5, 1);
    // zone flag floating on the water
    ctx.save(); ctx.font = "20px Manrope"; ctx.globalAlpha = 0.55;
    ctx.fillText(z.icon, W - 44, 34 + Math.sin(state.time * 1.2) * 5); ctx.restore();
    // beach decor
    drawStarfish(760, 520, 14);
    drawShell(300, 560, "#f3a6a6");
    drawShell(470, 300, "#f6cf8f");
    drawPalm(752, 262);
  }

  function drawStarfish(x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(state.time * 0.15);
    ctx.fillStyle = "#e8894a";
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.42;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.45)";
    ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawShell(x, y, c) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(0, 0, 7, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.12)"; ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(i * 2.6, -6); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPalm(x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "rgba(0,0,0,.08)";
    ctx.beginPath(); ctx.ellipse(4, 2, 22, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#9c6b3f"; ctx.lineWidth = 7; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-6, -34, 4, -62); ctx.stroke();
    ctx.fillStyle = "#27ae60";
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.save(); ctx.translate(4, -62); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(18, 0, 20, 6, 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#8e5a33";
    ctx.beginPath(); ctx.arc(2, -58, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBin() {
    const full = state.bag.length > 0;
    ctx.save(); ctx.translate(BIN.x, BIN.y);
    const glow = 0.5 + Math.sin(state.time * 4) * 0.5;
    if (full) {
      ctx.fillStyle = "rgba(46,204,113," + (0.12 + glow * 0.16) + ")";
      ctx.beginPath(); ctx.ellipse(0, 6, 38 + glow * 5, 14 + glow * 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,.15)";
    ctx.beginPath(); ctx.ellipse(0, 12, 20, 6, 0, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = "#2478b5"; roundRect(-17, -16, 34, 28, 4); ctx.fill();
    ctx.fillStyle = "#1b5f92"; roundRect(-17, -16, 34, 6, 3); ctx.fill();
    // lid
    ctx.fillStyle = "#2e8bcc"; roundRect(-20, -22, 40, 7, 3); ctx.fill();
    ctx.fillStyle = "#165a8a"; roundRect(-5, -25, 10, 4, 2); ctx.fill();
    // recycle triangles
    ctx.strokeStyle = "#eaf6ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-6, 2); ctx.lineTo(6, 2); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = "#eaf6ff"; ctx.font = "bold 8px Manrope"; ctx.textAlign = "center";
    ctx.fillText("RECYCLE", 0, 9);
    if (full) {
      ctx.fillStyle = "#fff"; ctx.font = "bold 9px Manrope";
      ctx.fillText(state.bag.length + " ITEMS", 0, -30);
    }
    ctx.restore();
  }

  function drawTrashShape(g) {
    ctx.save(); ctx.translate(g.x, g.y + Math.sin(g.bob) * 2.5); ctx.rotate(g.rot);
    const w = g.w, h = g.h;
    if (g.shape === "bottle") {
      ctx.fillStyle = g.rare ? "#f7d774" : g.color;
      roundRect(-w/2, -h/2 + 4, w, h - 4, 3); ctx.fill();
      ctx.fillRect(-3, -h/2 - 2, 6, 7);
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillRect(-w/2 + 2, -h/2 + 7, 3, h - 12);
      if (g.rare) {
        ctx.fillStyle = "#b8860b"; ctx.fillRect(-w/2, -1, w, 5);
      }
    } else if (g.shape === "can") {
      ctx.fillStyle = "#bdc3c7"; roundRect(-w/2, -h/2, w, h, 3); ctx.fill();
      ctx.fillStyle = g.color; ctx.fillRect(-w/2, -h/2 + 3, w, h - 6);
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(-w/2 + 2, -h/2 + 4, 2, h - 8);
    } else if (g.shape === "cup") {
      ctx.fillStyle = g.color;
      ctx.beginPath(); ctx.moveTo(-w/2, -h/2); ctx.lineTo(w/2, -h/2);
      ctx.lineTo(w/2 - 3, h/2); ctx.lineTo(-w/2 + 3, h/2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillRect(-w/2 - 1, -h/2 - 2, w + 2, 3);
    } else if (g.shape === "bag") {
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.beginPath(); ctx.moveTo(-w/2, -h/2); ctx.lineTo(w/2, -h/2);
      ctx.quadraticCurveTo(w/2 + 3, h/2, 0, h/2);
      ctx.quadraticCurveTo(-w/2 - 3, h/2, -w/2, -h/2); ctx.fill();
      ctx.strokeStyle = "#bdc3c7"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-5, -h/2); ctx.lineTo(-7, -h/2 - 4);
      ctx.moveTo(5, -h/2); ctx.lineTo(7, -h/2 - 4); ctx.stroke();
    } else if (g.shape === "tire") {
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath(); ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#7f8c8d";
      ctx.beginPath(); ctx.ellipse(0, 0, w/2 - 5, h/2 - 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath(); ctx.ellipse(0, 0, w/2 - 9, h/2 - 7, 0, 0, Math.PI * 2); ctx.fill();
    } else if (g.shape === "net") {
      ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 5, -h/2); ctx.lineTo(i * 5 + 3, h/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-w/2, i * 4); ctx.lineTo(w/2, i * 4); ctx.stroke();
      }
    } else if (g.shape === "egg") {
      ctx.fillStyle = "#fffaf0";
      ctx.beginPath(); ctx.ellipse(0, 1, w / 2, h / 2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#e8cf9a"; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.fillStyle = "#e8b96a";
      for (const [sx, sy] of [[-4,-5],[3,-2],[-1,4],[5,6],[-5,2]]) {
        ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = "#8e5a33"; ctx.font = "bold 7px Manrope"; ctx.textAlign = "center";
      ctx.fillText("?", 0, 3);

    } else if (g.shape === "coral") {
      ctx.strokeStyle = "#ff7f9f"; ctx.lineWidth = 4; ctx.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * 6, 8);
        ctx.quadraticCurveTo(i * 9, -2, i * 5, -9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i * 6, 2); ctx.lineTo(i * 11, -4); ctx.stroke();
      }
      ctx.fillStyle = "#ffd1dc";
      for (const [sx, sy] of [[-5,-8],[0,-10],[5,-8]]) {
        ctx.beginPath(); ctx.arc(sx, sy, 2, 0, TAU); ctx.fill();
      }
    } else if (g.shape === "lantern") {
      ctx.fillStyle = "rgba(185,255,102,.3)";
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
      ctx.fillStyle = "#b9ff66"; roundRect(-5, -8, 10, 15, 4); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(-3, -5, 6, 8);
      ctx.strokeStyle = "#7cb342"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, -13); ctx.stroke();
      ctx.fillStyle = "#b9ff66"; ctx.beginPath(); ctx.arc(0, -13, 2, 0, TAU); ctx.fill();
    } else if (g.shape === "pearl") {
      const grd = ctx.createRadialGradient(-4, -5, 1, 0, 0, 11);
      grd.addColorStop(0, "#ffffff"); grd.addColorStop(1, "#b7d7ec");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.beginPath(); ctx.ellipse(-4, -5, 3, 1.5, -0.5, 0, TAU); ctx.fill();
    } else if (g.shape === "fossil") {
      ctx.fillStyle = "#d9c7a3";
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, 0.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#a78b5a"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 0, 7, 0.3, Math.PI * 1.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 9, Math.sin(a) * 6);
        ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 9); ctx.stroke();
      }
    } else if (g.shape === "crown") {
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.moveTo(-12, 7); ctx.lineTo(-12, -5); ctx.lineTo(-6, 0);
      ctx.lineTo(0, -9); ctx.lineTo(6, 0); ctx.lineTo(12, -5);
      ctx.lineTo(12, 7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#e74c3c";
      ctx.beginPath(); ctx.arc(0, 3, 2.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#27ae60";
      ctx.beginPath(); ctx.arc(-8, 2, 1.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(8, 2, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff9c4"; ctx.fillRect(-12, 6, 24, 3);
    }
    ctx.restore();
  }

  function drawTurtle() {
    const t = state.turtle;
    ctx.save(); ctx.translate(t.x, t.y + Math.sin(state.time * 2) * 2.5);
    ctx.scale(t.dir, 1);
    // flippers
    ctx.fillStyle = "#4fb87a";
    ctx.beginPath(); ctx.ellipse(-9, 9, 9, 5, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(8, 9, 9, 5, 0.5, 0, Math.PI * 2); ctx.fill();
    // tail
    ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-26, 3); ctx.lineTo(-18, 5); ctx.fill();
    // shell
    ctx.fillStyle = "#257a4d";
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2f9c63";
    ctx.beginPath(); ctx.ellipse(0, -1, 18, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#1c6b3f"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, -1, 8, 6, 0, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 8, -1 + Math.sin(a) * 6);
      ctx.lineTo(Math.cos(a) * 17, -1 + Math.sin(a) * 11);
      ctx.stroke();
    }
    // head
    ctx.fillStyle = "#5cc98a";
    ctx.beginPath(); ctx.arc(24, -3, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(27, -5, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#183a24"; ctx.beginPath(); ctx.arc(28, -5, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#183a24"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(27, -1, 3, 0.1, Math.PI - 0.1); ctx.stroke();
    ctx.restore();
  }

  // ---------- Sea creatures that pop up from the bottom-right ----------
  function easeOutBack(t) {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }

  function drawSeaCreature(key, x, y, s) {
    ctx.save();
    ctx.translate(x, y + Math.sin(state.time * 3) * 3);
    ctx.scale(s, s);
    ctx.lineCap = "round";

    if (key === "turtle") {
      ctx.fillStyle = "#48a76d";
      ctx.beginPath(); ctx.ellipse(-14, 10, 9, 5, -0.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(12, 10, 9, 5, 0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1f7a4d";
      ctx.beginPath(); ctx.ellipse(0, 0, 20, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2fa365";
      ctx.beginPath(); ctx.ellipse(0, -1, 17, 11, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#17643c"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(0, -1, 7, 5, 0, 0, TAU); ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7, -1 + Math.sin(a) * 5);
        ctx.lineTo(Math.cos(a) * 16, -1 + Math.sin(a) * 10); ctx.stroke();
      }
      ctx.fillStyle = "#5cc98a";
      ctx.beginPath(); ctx.arc(22, -3, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(25, -5, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = "#183a24"; ctx.beginPath(); ctx.arc(26, -5, 1.3, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#183a24"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(25, -1, 3, 0.1, Math.PI - 0.1); ctx.stroke();

    } else if (key === "dolphin") {
      ctx.fillStyle = "#5dade2";
      ctx.beginPath();
      ctx.moveTo(-28, 6); ctx.quadraticCurveTo(-10, -18, 14, -6);
      ctx.quadraticCurveTo(24, -2, 30, -8); ctx.quadraticCurveTo(26, 5, 14, 9);
      ctx.quadraticCurveTo(-8, 18, -28, 6); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(1, -22); ctx.lineTo(9, -9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-26, 5); ctx.lineTo(-40, -4); ctx.lineTo(-34, 7);
      ctx.lineTo(-40, 14); ctx.lineTo(-24, 9); ctx.fill();
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath(); ctx.moveTo(-20, 9); ctx.quadraticCurveTo(0, 17, 16, 7);
      ctx.quadraticCurveTo(0, 13, -20, 9); ctx.fill();
      ctx.fillStyle = "#154360"; ctx.beginPath(); ctx.arc(19, -4, 1.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#154360"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(23, 1, 3, 0.1, Math.PI - 0.1); ctx.stroke();

    } else if (key === "crab") {
      ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(-8, 9 + i * 3); ctx.lineTo(-22, 16 + i * 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, 9 + i * 3); ctx.lineTo(22, 16 + i * 4); ctx.stroke();
      }
      ctx.fillStyle = "#e74c3c";
      ctx.beginPath(); ctx.arc(-25, -4, 7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(25, -4, 7, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-28, -6); ctx.lineTo(-36, -12); ctx.lineTo(-30, -2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(28, -6); ctx.lineTo(36, -12); ctx.lineTo(30, -2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 3, 18, 12, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#c0392b"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(-7, -17); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, -6); ctx.lineTo(7, -17); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-7, -18, 4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(7, -18, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath(); ctx.arc(-6, -18, 1.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(8, -18, 1.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#922b21"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 2, 5, 0.2, Math.PI - 0.2); ctx.stroke();

    } else if (key === "fish") {
      ctx.fillStyle = "#e67e22";
      ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(-33, -12); ctx.lineTo(-28, 0);
      ctx.lineTo(-33, 12); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2, -13); ctx.lineTo(6, -23); ctx.lineTo(11, -12); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2, 13); ctx.lineTo(5, 21); ctx.lineTo(10, 12); ctx.fill();
      ctx.fillStyle = "#f5b041";
      ctx.beginPath(); ctx.ellipse(0, 0, 22, 14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#e67e22"; ctx.lineWidth = 3;
      for (const sx of [-7, 3, 13]) {
        ctx.beginPath(); ctx.moveTo(sx, -10); ctx.quadraticCurveTo(sx + 4, 0, sx, 10); ctx.stroke();
      }
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(15, -4, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2c3e50"; ctx.beginPath(); ctx.arc(16, -4, 1.9, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#a04000"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(18, 3, 3, 0.2, Math.PI - 0.2); ctx.stroke();

    } else if (key === "octopus") {
      ctx.strokeStyle = "#8e44ad"; ctx.lineWidth = 5;
      for (let i = 0; i < 7; i++) {
        const tx = -21 + i * 7;
        ctx.beginPath(); ctx.moveTo(tx, 5);
        ctx.bezierCurveTo(tx + 8, 14, tx - 8, 20, tx + Math.sin(i * 1.7) * 5, 28);
        ctx.stroke();
      }
      ctx.fillStyle = "#9b59b6";
      ctx.beginPath(); ctx.ellipse(0, -5, 20, 18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(-8, -6, 6, 7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, -6, 6, 7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath(); ctx.arc(-7, -5, 2.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(9, -5, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = "#e8daef";
      ctx.beginPath(); ctx.arc(-15, 3, 3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(15, 3, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#5b2c6f"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 4, 4, 0.2, Math.PI - 0.2); ctx.stroke();

    } else if (key === "seal") {
      ctx.fillStyle = "#95a5a6";
      ctx.beginPath(); ctx.moveTo(-18, 11); ctx.lineTo(-36, 4); ctx.lineTo(-30, 14);
      ctx.lineTo(-36, 21); ctx.lineTo(-16, 17); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-2, 8, 23, 14, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(13, -8, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = "#7f8c8d";
      ctx.beginPath(); ctx.ellipse(-4, 17, 9, 4, 0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = "#bdc3c7";
      ctx.beginPath(); ctx.ellipse(21, -5, 6, 4.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath(); ctx.arc(23, -6, 1.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(17, -11, 1.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 1;
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(24, -3 + i * 2); ctx.lineTo(32, -5 + i * 3); ctx.stroke();
      }
      ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(22, -1, 2.5, 0.2, Math.PI - 0.2); ctx.stroke();

    } else if (key === "whale") {
      ctx.fillStyle = "#2471a3";
      ctx.beginPath(); ctx.moveTo(-28, 0); ctx.lineTo(-44, -11); ctx.lineTo(-38, 0);
      ctx.lineTo(-45, 11); ctx.lineTo(-26, 6); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 2, 27, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#d6eaf8";
      ctx.beginPath(); ctx.ellipse(5, 10, 21, 6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#85c1e9"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(10, -11); ctx.quadraticCurveTo(7, -23, 3, -29); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(12, -11); ctx.quadraticCurveTo(15, -24, 19, -28); ctx.stroke();
      ctx.fillStyle = "#154360"; ctx.beginPath(); ctx.arc(17, -3, 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#154360"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(21, 3, 4, 0.2, Math.PI - 0.2); ctx.stroke();

    } else if (key === "jelly") {
      ctx.strokeStyle = "#c39bd3"; ctx.lineWidth = 2.5;
      for (let i = 0; i < 7; i++) {
        const tx = -19 + i * 6.3;
        ctx.beginPath(); ctx.moveTo(tx, 4);
        ctx.bezierCurveTo(tx + 6, 12, tx - 6, 18, tx + Math.sin(i * 2) * 4, 28);
        ctx.stroke();
      }
      const grad = ctx.createLinearGradient(0, -22, 0, 6);
      grad.addColorStop(0, "rgba(230,200,250,.97)");
      grad.addColorStop(1, "rgba(155,89,182,.97)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, 20, Math.PI, 0);
      ctx.quadraticCurveTo(20, 9, 10, 4); ctx.quadraticCurveTo(0, 10, -10, 4);
      ctx.quadraticCurveTo(-20, 9, -20, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#4a235a";
      ctx.beginPath(); ctx.arc(-7, -7, 2.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(7, -7, 2.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#4a235a"; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, -3, 3.5, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,.65)";
      ctx.beginPath(); ctx.ellipse(-10, -12, 5, 2.5, -0.4, 0, TAU); ctx.fill();

    } else if (key === "star") {
      ctx.save(); ctx.rotate(Math.sin(state.time * 2) * 0.12);
      ctx.fillStyle = "#f5b041";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 === 0 ? 21 : 9;
        const a = (i / 10) * TAU - Math.PI / 2;
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#f7dc6f";
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath(); ctx.arc(-3, -1, 1.8, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -1, 1.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 2, 3, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.restore();

    } else if (key === "manta") {
      ctx.fillStyle = "#34495e";
      ctx.beginPath();
      ctx.moveTo(0, -10); ctx.quadraticCurveTo(-34, -20, -40, 6);
      ctx.quadraticCurveTo(-18, 2, 0, 14);
      ctx.quadraticCurveTo(18, 2, 40, 6);
      ctx.quadraticCurveTo(34, -20, 0, -10); ctx.fill();
      ctx.fillStyle = "#5d6d7e";
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 11, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#34495e"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-4, 12); ctx.quadraticCurveTo(-8, 24, -2, 30); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(-5, -2, 2.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -2, 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath(); ctx.arc(-5, -2, 1.1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -2, 1.1, 0, TAU); ctx.fill();

    } else if (key === "narwhal") {
      ctx.fillStyle = "#5dade2";
      ctx.beginPath(); ctx.moveTo(-24, 2); ctx.lineTo(-38, -8); ctx.lineTo(-34, 3);
      ctx.lineTo(-40, 12); ctx.lineTo(-22, 8); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 2, 25, 12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#eaf6ff";
      ctx.beginPath(); ctx.ellipse(4, 9, 19, 5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#f7dc6f"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(23, -2); ctx.lineTo(47, -12); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(25, -3); ctx.lineTo(46, -12); ctx.stroke();
      ctx.fillStyle = "#154360"; ctx.beginPath(); ctx.arc(16, -2, 2, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#154360"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(19, 3, 3, 0.2, Math.PI - 0.2); ctx.stroke();

    } else if (key === "kraken") {
      ctx.strokeStyle = "#8e44ad"; ctx.lineWidth = 5;
      for (let i = 0; i < 8; i++) {
        const tx = -24 + i * 7;
        ctx.beginPath(); ctx.moveTo(tx, 6);
        ctx.bezierCurveTo(tx + 10, 15, tx - 10, 24, tx + Math.sin(i * 2) * 8, 34);
        ctx.stroke();
      }
      ctx.fillStyle = "#7d3c98";
      ctx.beginPath(); ctx.ellipse(0, -6, 22, 19, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f1c40f";
      ctx.beginPath(); ctx.arc(-8, -8, 5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(8, -8, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#2c3e50";
      ctx.beginPath(); ctx.arc(-8, -8, 2.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(8, -8, 2.2, 0, TAU); ctx.fill();
      ctx.fillStyle = "#f7dc6f";
      ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(0, 14); ctx.lineTo(6, 4); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.25)";
      ctx.beginPath(); ctx.ellipse(-10, -16, 6, 3, -0.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawCreaturePopup() {
    const cp = state.creaturePopup;
    if (!cp) return;
    let p;
    if (cp.phase === "in") p = easeOutBack(Math.min(1, cp.t / 0.5));
    else if (cp.phase === "hold") p = 1;
    else p = 1 - Math.min(1, cp.t / 0.5);
    p = Math.max(0, Math.min(1.12, p));

    const cx = W - 86;
    const cy = (H + 85) + ((H - 84) - (H + 85)) * p + Math.sin(state.time * 3) * 3;

    ctx.save();
    ctx.globalAlpha = Math.min(1, p * 1.8);
    // little patch of sea foam under the visitor
    ctx.fillStyle = "rgba(255,255,255,.35)";
    ctx.beginPath(); ctx.ellipse(cx, cy + 34, 40, 8, 0, 0, TAU); ctx.fill();
    drawSeaCreature(cp.creature.key, cx, cy, 1.15);

    // speech bubble to the left, pointing at the creature
    const lines = wrapText(cp.creature.line, 26);
    const tw = Math.max(180, Math.max(...lines.map(s => s.length)) * 8.1 + 24);
    const th = lines.length * 18 + 30;
    const bx = Math.max(8, cx - 50 - tw);
    const by = cy - 52 - th;
    ctx.fillStyle = "rgba(255,255,255,.97)";
    ctx.strokeStyle = cp.creature.color; ctx.lineWidth = 2.5;
    roundRect(bx, by, tw, th, 12); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + tw - 26, by + th - 1);
    ctx.lineTo(cx - 30, cy + 6);
    ctx.lineTo(bx + tw - 8, by + th - 1);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = cp.creature.color;
    ctx.font = "bold 11px Manrope"; ctx.textAlign = "left";
    ctx.fillText(cp.creature.name, bx + 13, by + 16);
    ctx.fillStyle = "#2c3e50"; ctx.font = "bold 13px Manrope";
    lines.forEach((ln, i) => ctx.fillText(ln, bx + 13, by + 35 + i * 18));
    ctx.restore();
  }

  function drawPlayer(p = state.player, shirt = "#16a085", shade = "#117a68", bagColor = "#f39c12") {
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.dir, 1);
    // shadow
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.beginPath(); ctx.ellipse(0, 19, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
    const sw = Math.sin(p.walkPhase) * 4;
    // legs
    ctx.strokeStyle = "#34495e"; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-3, 5); ctx.lineTo(-3 + sw, 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 5); ctx.lineTo(3 - sw, 18); ctx.stroke();
    // body
    ctx.fillStyle = shirt; roundRect(-9, -8, 18, 17, 5); ctx.fill();
    ctx.fillStyle = shade; ctx.fillRect(-9, 1, 18, 3);
    // arms
    ctx.strokeStyle = "#e8b98a"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-14, 3 + sw * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(14, 3 - sw * 0.5); ctx.stroke();
    // bag/bucket in hand
    ctx.fillStyle = bagColor; roundRect(10, 5, 11, 11, 2); ctx.fill();
    ctx.strokeStyle = "#8a6d1f"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(15.5, 5, 3.2, Math.PI, 0); ctx.stroke();
    // head
    ctx.fillStyle = "#f5c396"; ctx.beginPath(); ctx.arc(0, -16, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4a3020"; ctx.beginPath(); ctx.arc(0, -18, 8.2, Math.PI, 0); ctx.fill();
    // eyes
    ctx.fillStyle = "#2c3e50";
    ctx.beginPath(); ctx.arc(1.5, -16, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -16, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(3.5, -13, 2.5, 0.15, Math.PI - 0.15); ctx.stroke();
    ctx.restore();
  }

  function drawDrone(d) {
    ctx.save(); ctx.translate(d.x, d.y + Math.sin(d.t * 12) * 3);
    // tractor beam
    const beam = ctx.createLinearGradient(0, 12, 0, 340);
    beam.addColorStop(0, "rgba(120,220,255,.28)"); beam.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(8, 10); ctx.lineTo(48, 340); ctx.lineTo(-48, 340); ctx.closePath(); ctx.fill();
    // body
    ctx.fillStyle = "#34495e"; roundRect(-13, -6, 26, 12, 5); ctx.fill();
    ctx.fillStyle = "#2ecc71"; ctx.beginPath(); ctx.arc(8, 0, 2.5, 0, Math.PI * 2); ctx.fill();
    // rotors
    ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-18, -7); ctx.lineTo(18, -7); ctx.stroke();
    ctx.fillStyle = "rgba(236,240,241,.75)";
    const spin = Math.sin(d.t * 40) * 6 + 12;
    ctx.beginPath(); ctx.ellipse(-18, -8, spin, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(18, -8, spin, 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBird(b) {
    ctx.save(); ctx.translate(b.x, b.y + Math.sin(b.phase) * 5);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3; ctx.lineCap = "round";
    const flap = Math.sin(b.phase * 1.6) * 7;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.quadraticCurveTo(-4, -6 - flap, 0, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(4, -6 - flap, 10, 0); ctx.stroke();
    ctx.fillStyle = "#f5f6f7"; ctx.beginPath(); ctx.ellipse(0, 1, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f39c12"; ctx.beginPath(); ctx.moveTo(4, 1); ctx.lineTo(9, 2); ctx.lineTo(4, 3); ctx.fill();
    ctx.restore();
  }

  function drawHazard(h) {
    ctx.save(); ctx.translate(h.x, h.y + Math.sin(h.phase) * 4);
    ctx.fillStyle = "rgba(40,55,20,.22)";
    ctx.beginPath(); ctx.ellipse(0, 6, 24, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#4a5d23";
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 13, Math.sin(a) * 9 - 2, 10, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = "#5f7a2e";
    ctx.beginPath(); ctx.arc(0, -3, 17, 0, TAU); ctx.fill();
    ctx.fillStyle = "#2f3d16";
    ctx.beginPath(); ctx.arc(-6, -6, 2.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6, -6, 2.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#2f3d16"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 5, Math.PI + 0.2, TAU - 0.2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 9px Manrope"; ctx.textAlign = "center";
    ctx.fillText("POLLUTION", 0, -24);
    ctx.restore();
  }

  function drawCompanion() {
    for (const c of state.equipped) {
      if (!c || c.hidden > 0) continue;
      const info = rarityInfo(c.rarity);
      ctx.save();
      if (c.hurt > 0) ctx.globalAlpha = 0.55 + Math.sin(state.time * 30) * 0.35;
      if (info.mult >= 5) {
        ctx.fillStyle = c.rarity === "Mythic" ? "rgba(255,105,180,.26)"
          : c.rarity === "Legendary" ? "rgba(241,196,15,.22)" : "rgba(142,68,173,.22)";
        ctx.beginPath(); ctx.arc(c.x, c.y, 30 + Math.sin(state.time * 4) * 3, 0, TAU); ctx.fill();
      }
      drawSeaCreature(c.key, c.x, c.y, 0.62);
      if (c.shiny) {
        ctx.fillStyle = "#fff";
        for (let i = 0; i < 3; i++) {
          const a = state.time * 3 + i * TAU / 3;
          ctx.beginPath();
          ctx.arc(c.x + Math.cos(a) * 22, c.y - 16 + Math.sin(a) * 18, 1.8, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
      // name + hearts
      ctx.save(); ctx.textAlign = "center";
      ctx.font = "bold 10px Manrope";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.8)";
      ctx.strokeText(c.name, c.x, c.y - 30);
      ctx.fillStyle = info.color;
      ctx.fillText(c.name, c.x, c.y - 30);
      ctx.font = "12px Manrope";
      let hearts = "";
      for (let i = 0; i < c.maxHp; i++) hearts += i < c.hp ? "❤️" : "🖤";
      ctx.fillText(hearts, c.x, c.y - 18);
      ctx.restore();
    }
  }

  function drawBattleHUD() {
    const b = state.battle;
    if (b.active) {
      ctx.save();
      ctx.fillStyle = "rgba(20,50,75,.85)";
      roundRect(W / 2 - 190, 10, 380, 40, 12); ctx.fill();
      ctx.textAlign = "center"; ctx.font = "bold 15px Manrope";
      ctx.fillStyle = "#8ce99a"; ctx.fillText("P1  " + b.p1, W / 2 - 120, 35);
      ctx.fillStyle = "#fff"; ctx.fillText("⚔️", W / 2, 35);
      ctx.fillStyle = "#ffa8a8"; ctx.fillText("P2  " + b.p2, W / 2 + 120, 35);
      ctx.fillStyle = "#ffd166"; ctx.font = "bold 12px Manrope";
      ctx.fillText(Math.ceil(b.timeLeft) + "s left · P2 uses IJKL", W / 2, 62);
      ctx.restore();
    } else if (b.resultTime > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(243,156,18,.92)";
      roundRect(W / 2 - 170, 100, 340, 44, 12); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 18px Manrope"; ctx.textAlign = "center";
      ctx.fillText(b.result, W / 2, 129);
      ctx.restore();
    }
  }

  function drawCloudPlayers() {
    if (!state.cloud.active) return;
    for (const rp of state.cloud.players) {
      if (rp.id === state.cloud.id) continue;
      drawPlayer({ x: rp.x, y: rp.y, dir: rp.dir, walkPhase: state.time * 8 },
        rp.color, "rgba(0,0,0,.25)", "#f1c40f");
      ctx.save();
      ctx.textAlign = "center"; ctx.font = "bold 11px Manrope";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.5)";
      const label = rp.name + "  " + rp.score;
      ctx.strokeText(label, rp.x, rp.y - 34);
      ctx.fillStyle = "#fff"; ctx.fillText(label, rp.x, rp.y - 34);
      ctx.restore();
    }
  }

  function drawCloudHUD() {
    if (!state.cloud.active) return;
    const c = state.cloud;
    ctx.save();
    ctx.fillStyle = c.connected ? "rgba(15,80,110,.85)" : "rgba(150,60,50,.85)";
    roundRect(12, 12, 250, 46, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "left";
    ctx.font = "bold 13px Manrope";
    ctx.fillText((c.connected ? "☁️ ONLINE" : "⚠ OFFLINE") + "  " + c.room, 24, 30);
    ctx.font = "11px Manrope";
    ctx.fillText(c.players.length + " players · You: " + c.name, 24, 47);
    const sorted = [...c.players].sort((a, b) => b.score - a.score);
    ctx.fillStyle = "rgba(0,0,0,.35)";
    roundRect(12, 64, 205, 20 + sorted.length * 16, 10); ctx.fill();
    sorted.forEach((p, i) => {
      ctx.fillStyle = p.id === c.id ? "#ffd166" : "#fff";
      ctx.font = "bold 12px Manrope";
      ctx.fillText((i + 1) + ". " + p.name + "  " + p.score, 24, 82 + i * 16);
    });
    ctx.restore();
  }

  function drawEffects() {
    for (const q of state.particles) {
      const a = Math.max(0, q.life / q.max);
      ctx.globalAlpha = a; ctx.fillStyle = q.color;
      if (q.shape === "heart") {
        ctx.save(); ctx.translate(q.x, q.y); ctx.scale(q.size / 4, q.size / 4);
        ctx.beginPath();
        ctx.moveTo(0, 3); ctx.bezierCurveTo(-6, -2, -3, -7, 0, -3);
        ctx.bezierCurveTo(3, -7, 6, -2, 0, 3); ctx.fill(); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const f of state.floaters) {
      const a = Math.min(1, f.life / 0.4);
      ctx.globalAlpha = a;
      ctx.font = "bold " + f.size + "px Manrope";
      ctx.textAlign = "center";
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0,0,0,.35)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawBagFullHint() {
    if (state.bag.length < capacity()) return;
    const a = 0.6 + Math.sin(state.time * 6) * 0.4;
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(231,76,60,.92)";
    roundRect(W / 2 - 150, 218, 300, 30, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 13px Manrope"; ctx.textAlign = "center";
    ctx.fillText("🎒 Bag full! Take it to the ♻️ recycle bin", W / 2, 238);
    ctx.globalAlpha = 1;
  }

  function drawCombo() {
    if (state.combo < 3) return;
    ctx.save();
    ctx.fillStyle = "rgba(231,76,60,.9)";
    roundRect(W - 118, 12, 106, 30, 10); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px Manrope"; ctx.textAlign = "center";
    ctx.fillText("🔥 COMBO x" + (1 + Math.min(state.combo, 30) * 0.01).toFixed(2), W - 65, 32);
    // timer bar
    const w = Math.max(0, Math.min(1, state.comboTimer / comboWindow())) * 100;
    ctx.fillStyle = "rgba(255,255,255,.35)"; roundRect(W - 115, 45, 100, 4, 2); ctx.fill();
    ctx.fillStyle = "#ffd166"; roundRect(W - 115, 45, w, 4, 2); ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    if (zone().tint) { ctx.fillStyle = zone().tint; ctx.fillRect(0, 0, W, H); }
    drawBin();
    for (const g of state.garbage) drawTrashShape(g);
    for (const h of state.hazards) drawHazard(h);
    for (const d of state.drones) drawDrone(d);
    drawTurtle();
    drawPlayer();
    if (state.battle.active) drawPlayer(state.p2, "#c0392b", "#922b21", "#f5b041");
    drawCloudPlayers();
    drawCompanion();
    drawCreaturePopup();
    for (const b of state.birds) drawBird(b);
    drawEffects();
    drawBagFullHint();
    drawCombo();
    drawBattleHUD();
    drawCloudHUD();
    if (state.mini.active) drawMini();
    drawFight();
    if (state.paused && state.started) {
      ctx.fillStyle = "rgba(10,40,60,.35)"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff"; ctx.font = "bold 34px Manrope"; ctx.textAlign = "center";
      ctx.fillText("PAUSED", W / 2, H / 2);
    }
  }

  // ------------------------------------------------------------------ HUD + loop
  function updateStats() {
    el.money.textContent = "$" + Math.floor(state.money);
    el.collected.textContent = state.collected;
    el.bag.textContent = state.bag.length + "/" + capacity();
    el.combo.textContent = "x" + (1 + Math.min(state.combo, 30) * 0.01).toFixed(2);
    el.next.textContent = 5 - (state.collected % 5);
    el.zone.textContent = (zoneIndex() + 1) + " · " + zone().name;
    const nextTier = LEVEL_TIERS[zoneIndex() + 1];
    el.level.textContent = "Lv " + state.collectorLevel +
      (nextTier ? "  →Z" + (zoneIndex() + 2) + ":" + nextTier : "  MAX");
    el.level.title = "Collector XP " + Math.floor(state.collectorXp) + "/" + collectorXpNeed() +
      " · next zone at collector Lv " + (nextTier || "max");
    el.record.textContent = "$" + Math.floor(state.records.money || 0).toLocaleString();
    el.shards.textContent = state.shards + (state.shards ? " (+" + state.shards * 10 + "%)" : "");
    el.eggs.textContent = state.eggs;
    el.eggs.title = state.equipped.length + "/" + maxEquip() + " pets equipped · " +
      PET_POOL.filter(p => state.collection[p.key + "|" + p.rarity]).length + "/" +
      PET_POOL.length + " pets in index";
  }

  let last = null, hudTick = 0;
  function loop(now) {
    if(!alive)return;
    const dt = last===null?0:Math.min(0.05, Math.max(0,(now-last)/1000));
    last = now;
    if (state.started && !state.paused && el.dialog.classList.contains("hidden")) update(dt);
    render();
    hudTick += dt;
    if (hudTick > 0.15) {
      hudTick = 0;
      updateStats(); renderShop(); renderHatchery();
      if (!state.battle.active) {
        setRecord("money", state.money);
        checkAchievements();
      }
    }
    scheduleFrame(loop);
  }

  loadMeta();
  announcedZone = zoneIndex();
  state.quests = [makeQuest(), makeQuest(), makeQuest()];
  buildShop();
  renderQuests();
  renderPetBox();
  updateStats();
  updateAscendButton();
  renderHatchery();
  scheduleFrame(loop);

  function getStatus(){return {started:state.started,paused:state.paused,collected:state.collected,recycled:state.recycled,
    money:state.money,bagCount:state.bag.length,player:{x:state.player.x,y:state.player.y}};}
  function clearKeys(){for(const key of Object.keys(keys))delete keys[key];}
  listen(canvas,'blur',clearKeys);
  listen(window,'blur',()=>{clearKeys();if(state.started&&!state.paused){state.paused=true;el.pause.textContent='Resume';saveMeta(true);}});
  listen(document,'visibilitychange',()=>{if(document.hidden){clearKeys();if(state.started&&!state.paused){state.paused=true;el.pause.textContent='Resume';saveMeta(true);}}});
  return {getStatus,destroy(){if(!alive)return;saveMeta(true);alive=false;events.abort();window.cancelAnimationFrame(animation);
    for(const timer of timers)window.clearTimeout(timer);timers.clear();clearKeys();
    try{audioCtx?.close()?.catch(()=>{});}catch{} }};
}
