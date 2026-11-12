// The game room drawn in 3D (three.js): floor, table, chairs, the face-down fan each
// opponent holds in their hands, the player's own hand held at the edge of the table, the laid-down sets in the
// middle of the felt, and the cards that fly when the round is dealt, a card changes hands
// or a set is laid down. It follows the real game state.
// Players, bubbles, arrows and every button stay ordinary page elements on top; this
// module tells the page where each seat sits on screen.
import * as THREE from 'three';

const SUIT = { hearts: ['♥', '#c0283a'], diamonds: ['♦', '#c0283a'], clubs: ['♣', '#1c2430'], spades: ['♠', '#1c2430'] };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const TEAM_COLOR = { A: 0x7ca6bd, B: 0xc98f87 };
const CW = 0.62, CH = 0.88, CT = 0.006;
const FAN_SCALE = 0.7;    // the cards an opponent holds in their hands
const FLY_SCALE = 0.8;     // a card on its way to someone
const SHUFFLE_SECONDS = 3.2, DEAL_SECONDS = 27;   // same pacing as the deal sounds (dealTiming.js)
const REST_SECONDS = 5;    // a passed card stays face up this long, like a seat bubble
const LAY_HOLD_SECONDS = 4.3;   // a laid set stays in the middle this long before it joins the others
const SUIT_ORDER = ['hearts', 'diamonds', 'clubs', 'spades'];
const keyOf = (c) => `${c.suit}-${c.rank}`;
const byHandOrder = (a, b) => SUIT_ORDER.indexOf(a.suit) - SUIT_ORDER.indexOf(b.suit) || RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank);

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const feltTexture = () => canvasTexture(512, 512, (g) => {
  const grad = g.createRadialGradient(256, 200, 30, 256, 256, 300);
  grad.addColorStop(0, '#2f7355'); grad.addColorStop(1, '#174433');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? 255 : 0},255,220,${Math.random() * .035})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5); }
  g.strokeStyle = 'rgba(190,220,190,.28)'; g.lineWidth = 2; g.setLineDash([8, 7]);
  g.beginPath(); g.arc(256, 256, 232, 0, Math.PI * 2); g.stroke();
});
const backTexture = () => canvasTexture(200, 284, (g) => {
  g.fillStyle = '#f4ecd6'; g.beginPath(); g.roundRect(0, 0, 200, 284, 18); g.fill();
  g.fillStyle = '#1f4f42'; g.beginPath(); g.roundRect(12, 12, 176, 260, 12); g.fill();
  g.strokeStyle = '#c9a25f'; g.lineWidth = 3; g.globalAlpha = .35;
  for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(i * 26, 0); g.lineTo(i * 26 + 284, 284); g.stroke(); g.beginPath(); g.moveTo(i * 26 + 284, 0); g.lineTo(i * 26, 284); g.stroke(); }
  g.globalAlpha = 1; g.lineWidth = 5; g.beginPath(); g.roundRect(22, 22, 156, 240, 8); g.stroke();
});
// Card faces are real playing-card artwork: "Vectorized Playing Cards 1.3" by Chris Aguilar (LGPL 3;
// see public/cards/LICENSE.txt), rendered to PNGs in public/cards.
// A plain card shows until the picture has loaded, then the texture is repainted.
const FACE_W = 360, FACE_H = 502;
const cardImages = new Map();
function cardImage(rank, suit) {
  const key = `${suit}-${rank}`;
  if (!cardImages.has(key)) {
    const img = new Image(); img.decoding = 'async';
    img.src = `${import.meta.env.BASE_URL}cards/${key}.png`;
    cardImages.set(key, img);
  }
  return cardImages.get(key);
}
const faceTexture = (rank, suit, onReady) => {
  const [sym, color] = SUIT[suit] || ['?', '#222'];
  const t = canvasTexture(FACE_W, FACE_H, (g) => {
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(1, 1, FACE_W - 2, FACE_H - 2, 18); g.fill();
    g.strokeStyle = '#999'; g.lineWidth = 2; g.stroke();
    g.fillStyle = color; g.textAlign = 'center';
    g.font = '64px Georgia, serif'; g.fillText(rank, 44, 74); g.font = '52px Georgia, serif'; g.fillText(sym, 44, 128);
  });
  const img = cardImage(rank, suit);
  const paint = () => {
    const g = t.image.getContext('2d');
    g.clearRect(0, 0, FACE_W, FACE_H); g.drawImage(img, 0, 0, FACE_W, FACE_H);
    t.needsUpdate = true; onReady?.();
  };
  if (img.complete && img.naturalWidth) paint(); else img.addEventListener('load', paint, { once: true });
  return t;
};


export function createGameTable3D(container, { portrait, onLift }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101e1b);
  scene.fog = new THREE.Fog(0x101e1b, 16, 42);
  const camera = new THREE.PerspectiveCamera(portrait ? 50 : 40, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight(0xf6f4e9, 0x344b45, 1.5));
  const lamp = new THREE.SpotLight(0xfff0d6, 85, 34, 0.8, 0.5, 1.6);
  lamp.position.set(0.5, 8.5, 1.5); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0005;
  scene.add(lamp, lamp.target);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.35); fill.position.set(-4, 5, 6); scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x101e1b, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = false; scene.add(floor);

  // A wide table on wide screens; on a tall phone screen the table runs away from the player.
  // On a wide screen the height is what limits the picture, so the table is a long oval that uses the width.
  const RX = portrait ? 2.3 : 6.6, RZ = portrait ? 3.65 : 2.2;
  const wood = new THREE.MeshStandardMaterial({ color: 0x49382b, roughness: 0.75, metalness: 0.02 });
  const disc = (r, h, mat, y) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 96), mat); m.scale.set(RX, 1, RZ); m.position.y = y; m.receiveShadow = true; return m; };
  const rim = disc(1.09, 0.22, wood, -0.13); rim.castShadow = true; scene.add(rim);
  scene.add(disc(1.0, 0.06, [wood, new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }), wood], -0.03));
  const trim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.012, 8, 120), new THREE.MeshStandardMaterial({ color: 0xc9a25f, metalness: 0.7, roughness: 0.3 }));
  trim.rotation.x = Math.PI / 2; trim.scale.set(RX, RZ, 1); trim.position.y = 0.003; scene.add(trim);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 1.4, 32), wood); leg.position.y = -0.92; leg.castShadow = true; scene.add(leg);

  // Seats by position relative to the player: 0 is the player (nearest), then round the table.
  const spots = Array.from({ length: 6 }, (_, rel) => {
    const a = Math.PI / 2 + (rel / 6) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    // the player's own chair sits further back: their hand is held at the table edge in front of it
    // On a phone the side players sit tight to the rim, so the table can fill the screen's width.
    const pos = rel === 0 ? new THREE.Vector3(0, 0, RZ + 0.85) : new THREE.Vector3(dir.x * RX * (portrait ? 1.06 : 1.1), 0, dir.z * RZ * 1.24);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.7 });
    const chair = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.5, 40), chairMat);
    chair.position.set(pos.x, -0.45, pos.z); chair.castShadow = false; chair.receiveShadow = true; scene.add(chair);
    // Each avatar sits above a clothed, seated figure oriented toward the table.
    const figure = new THREE.Group(); figure.position.copy(pos); figure.rotation.y = Math.atan2(-dir.x, -dir.z);
    const shirt = new THREE.MeshStandardMaterial({ color: rel % 2 ? 0x70594e : 0x375c61, roughness:0.95 });
    const trousers = new THREE.MeshStandardMaterial({ color:0x25302e, roughness:1 });
    const skin = new THREE.MeshStandardMaterial({ color:0xbb967c, roughness:0.85 });
    // The upper body moves on its own (while talking); chair and legs stay put.
    const body = new THREE.Group(); figure.add(body);
    const form = (mat, x,y,z, sx,sy,sz) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1,24,16), mat);
      mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh); return mesh;
    };
    form(shirt,0,0.23,0, .34,.48,.23); // torso
    form(shirt,0,0.54,0, .43,.17,.24); // shoulders
    form(skin,0,0.77,0, .115,.14,.11); // neck: the player avatar is the face
    // Elbows resting on the table, forearms raised to hold the cards: one hand grips the bottom
    // of the fan, the other steadies its side. Each limb is an ellipsoid stretched between its two joints.
    const limb = (mat, a, b, r) => {
      const d = new THREE.Vector3().subVectors(b, a), m = form(mat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, r, r, d.length() / 2 + r * 0.3);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()); return m;
    };
    const grip = new THREE.Vector3(0.04, 0.14, 0.64), steady = new THREE.Vector3(-0.22, 0.3, 0.62);
    for (const side of [-1,1]) {
      const shoulder = new THREE.Vector3(side * .36, .5, .02), elbow = new THREE.Vector3(side * .4, .06, .34);
      const hand = side > 0 ? grip : steady;
      limb(shirt, shoulder, elbow, .12);           // upper arm, in the sleeve
      limb(skin, elbow, hand, .085);               // forearm
      form(skin, hand.x, hand.y, hand.z, .085, .095, .07);
      form(trousers,side*.17,-.38,.27, .16,.16,.39); // bent thighs
      form(trousers,side*.17,-.78,.53, .12,.38,.13);
      form(trousers,side*.17,-1.13,.62, .14,.10,.23);
    }
    // Upholstered backrest and four slender chair legs.
    const back = new THREE.Mesh(new THREE.BoxGeometry(.77,.85,.13),chairMat);
    back.position.set(0,.12,-.28); figure.add(back);
    for (const x of [-.29,.29]) for (const z of [-.25,.25]) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.9,10),wood);
      foot.position.set(x,-.98,z); figure.add(foot);
    }
    // The cards this player holds: a face-down fan held up just over the table edge, top leaned back toward them.
    const fanRoot = new THREE.Object3D(); fanRoot.position.set(0.04, 0.11, 0.66);
    fanRoot.rotation.set(-0.38, 0, [0.1, -0.08, 0.14, -0.12, 0.06, -0.1][rel]);   // leaned back toward them, a little crooked, different for everyone
    body.add(fanRoot);
    scene.add(figure);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 10, 60), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb300, emissiveIntensity: 1.5 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(pos.x, -0.18, pos.z); ring.visible = false; scene.add(ring);
    return { rel, angle: a, dir, pos, chair, chairMat, ring, fanRoot, body, glow: 0, tangent: new THREE.Vector3(-dir.z, 0, dir.x) };
  });

  // ---- voice: who is talking ----
  // The talker's upper body nods and sways, and glassy bubbles swell out of their head and fade.
  const speaking = new Set();
  let voiceIdle = true;
  const BUBBLE_Y = 1.02, BUBBLE_R = 0.5;                // around the avatar at head height
  const bubbleGeo = new THREE.SphereGeometry(1, 32, 20);
  const voices = spots.map((sp) => ({
    level: 0,
    bubbles: [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(bubbleGeo, new THREE.MeshPhysicalMaterial({ color: 0x9dffb8, emissive: 0x2fd46a, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.position.set(0, BUBBLE_Y, 0); m.visible = false; m.userData = { i }; sp.body.add(m); return m;
    }),
  }));
  // A rough stand-in for a voice level: syllable-like bursts that vary per seat.
  const voiceLevel = (t, rel) => Math.max(0, Math.sin(t * 9.3 + rel * 2) * 0.5 + Math.sin(t * 4.1 + rel) * 0.35 + Math.sin(t * 1.3 + rel * 5) * 0.3);
  function animateVoice(now) {
    const t = now / 1000;
    spots.forEach((sp, rel) => {
      const v = voices[rel], on = speaking.has(rel);
      v.level += ((on ? 1 : 0) - v.level) * 0.12;                   // fade in and out
      if (v.level < 0.002) v.level = 0;
      const k = v.level, lv = on ? voiceLevel(t, rel) : 0;
      // small nods with the syllables, a slow sway, leaning in a touch
      sp.body.rotation.x = k * (0.05 + lv * 0.06);
      sp.body.rotation.z = k * Math.sin(t * 1.7 + rel) * 0.04;
      sp.body.position.y = k * lv * 0.025;
      v.bubbles.forEach((m) => {
        m.visible = k > 0.01; if (!m.visible) return;
        const ph = (t * 0.7 + m.userData.i / 3) % 1;
        m.scale.setScalar(BUBBLE_R * (1 + ph * 0.8));   // kept close to the head so six talkers stay apart
        m.material.opacity = k * (1 - ph) * (0.4 + lv * 0.25);
      });
    });
    if (!speaking.size && voices.every((v) => v.level === 0)) voiceIdle = true;
  }

  // ---- cards ----
  const cardGeo = new THREE.BoxGeometry(CW, CT, CH);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d2, roughness: 0.8 });
  const backMat = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.6, alphaTest:0.5 });
  const newBack = (scale) => { const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, backMat, backMat, edgeMat, edgeMat]); m.castShadow = true; m.receiveShadow = true; m.visible = false; m.scale.setScalar(scale); m.rotation.order = 'XYZ'; scene.add(m); return m; };
  const backs = Array.from({ length: 54 }, () => newBack(FAN_SCALE));
  const deck = Array.from({ length: 16 }, () => newBack(FLY_SCALE));       // the pile being dealt from
  const faceMats = new Map();
  const collectedMats = new Map();
  const faceMat = (rank, suit) => {
    const key = `${rank}|${suit}`;
    if (!faceMats.has(key)) faceMats.set(key, new THREE.MeshStandardMaterial({ map: faceTexture(rank, suit, repaint), roughness: 0.55, alphaTest:0.5 }));
    return faceMats.get(key);
  };
  const newFace = (card, scale) => { const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, faceMat(card.rank, card.suit), backMat, edgeMat, edgeMat]); m.castShadow = true; m.scale.setScalar(scale); m.rotation.order = 'XYZ'; return m; };
  const setGroup = new THREE.Group(); scene.add(setGroup);
  const flyGroup = new THREE.Group(); scene.add(flyGroup);

  const handEdge = () => new THREE.Vector3(0, HAND_Y, HAND_Z);              // the middle of the player's own hand
  const restSpot = (rel) => (rel === 0
    ? new THREE.Vector3(0, 0.03, RZ * 0.62)
    : new THREE.Vector3(spots[rel].dir.x * RX * 0.46, 0.03, spots[rel].dir.z * RZ * 0.44));

  // Where card j of n sits in a player's hand fan, in world terms (position, Euler angles, scale).
  const probe = new THREE.Object3D(), probeQ = new THREE.Quaternion(), probeE = new THREE.Euler(0, 0, 0, 'XYZ');
  function fanPose(rel, j, n) {
    const sp = spots[rel]; n = Math.max(1, Math.min(n, 13)); j = Math.max(0, Math.min(j, n - 1));
    const spread = Math.min(1.25, 0.13 * (n - 1)), phi = n > 1 ? spread / 2 - (j / (n - 1)) * spread : 0;
    sp.fanRoot.add(probe);
    probe.position.set(Math.sin(-phi) * CH * FAN_SCALE * 0.42, Math.cos(phi) * CH * FAN_SCALE * 0.42, 0.004 * j);
    probe.quaternion.setFromEuler(new THREE.Euler(0, 0, phi)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)));
    probe.scale.setScalar(FAN_SCALE);
    sp.fanRoot.updateWorldMatrix(true, false); probe.updateMatrixWorld(true);
    const p = new THREE.Vector3(); probe.matrixWorld.decompose(p, probeQ, new THREE.Vector3());
    probeE.setFromQuaternion(probeQ, 'XYZ');
    sp.fanRoot.remove(probe);
    return { p, rx: probeE.x, ry: probeE.y, rz: probeE.z, s: FAN_SCALE };
  }

  function drawStacks(counts) {
    let used = 0;
    spots.forEach((s) => {
      const n = s.rel === 0 ? 0 : Math.min(counts[s.rel] || 0, 13);
      for (let j = 0; j < n && used < backs.length; j++, used++) {
        const m = backs[used], f = fanPose(s.rel, j, n);
        m.position.copy(f.p); m.rotation.set(f.rx, f.ry, f.rz); m.scale.setScalar(f.s);
        m.visible = true;
      }
    });
    for (; used < backs.length; used++) backs[used].visible = false;
  }

  const setKey = (set) => `${set.suit}|${set.set_type}`;
  // Laid-down sets in the middle: the players' cards are in their hands now, so the felt is free
  // and the sets can be big enough to read.
  const SET_SCALE = portrait ? 0.8 : 1.0;
  function setCell(k, n) {
    const cols = portrait ? 2 : Math.min(4, n), rows = Math.ceil(n / cols);
    const cellW = portrait ? 1.32 : 2.15, cellH = portrait ? 1.0 : 1.04;
    const back = portrait ? 0.15 : 0.4;          // kept back from the player's edge, clear of their badge
    const col = k % cols, row = Math.floor(k / cols);
    const inRow = Math.min(cols, n - row * cols);
    return { cx: (col - (inRow - 1) / 2) * cellW, cz: (row - (rows - 1) / 2) * cellH - back };
  }
  let layingKey = null;                    // the set still flying in; drawn once it lands
  function drawSets(sets) {
    // Materials and textures below are cached; release only transient tray materials.
    setGroup.children.filter(m => m.userData.tray).forEach(m => m.material.dispose());
    setGroup.clear();
    const n = sets.length;
    if (!n) return;
    sets.forEach((set, k) => {
      if (setKey(set) === layingKey) return;
      const { cx, cz } = setCell(k, n);
      const cards = [...(set.cards || [])].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
      const step = 0.17 * SET_SCALE, width = (cards.length - 1) * step + CW * SET_SCALE;
      cards.forEach((card, i) => {
        const key = keyOf(card);
        if (!collectedMats.has(key)) collectedMats.set(key, new THREE.MeshBasicMaterial({ map: faceTexture(card.rank, card.suit, repaint), alphaTest: 0.5 }));
        const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, collectedMats.get(key), backMat, edgeMat, edgeMat]);
        m.scale.setScalar(SET_SCALE);
        m.position.set(cx + (i - (cards.length - 1) / 2) * step, 0.02 + i * 0.002, cz);
        setGroup.add(m);
      });

    });
  }

  // ---- animation: runs only while something is moving ----
  const tweens = [];
  const timers = new Set();
  let raf = 0, lastT = 0;
  const ease = (k) => (k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  // Spotlight cones: one straight cone from a lamp above the player's head (tilted halfway between
  // straight up and the camera's "up", so on side seats it doesn't lean away from the head) down to
  // the floor right under their chair, where the pool of light lies. The cone is wide enough at head
  // height to cover the head.
  const FLOOR_Y = -1.6, HEAD_Y = 0.98, LAMP = 1.9;
  function makeBeam(mat) {
    const g = new THREE.CylinderGeometry(0.2, 1.05, 1, 40, 1, true);
    const m = new THREE.Mesh(g, mat); m.userData = { x: 0, z: 0, pool: null }; aimed.add(m);
    return m;
  }
  const aimed = new Set(), camUp = new THREE.Vector3(), dir = new THREE.Vector3(), Y_AXIS = new THREE.Vector3(0, 1, 0);
  const apex = new THREE.Vector3(), base = new THREE.Vector3();
  function aimBeams() {
    if (!aimed.size) return;
    camUp.copy(camera.up).applyQuaternion(camera.quaternion).normalize();
    dir.copy(camUp).add(Y_AXIS).normalize();
    for (const m of aimed) {
      const { x, z, pool } = m.userData;
      apex.set(x, HEAD_Y, z).addScaledVector(dir, LAMP);
      base.set(x, FLOOR_Y, z);
      const len = apex.distanceTo(base);
      m.quaternion.setFromUnitVectors(Y_AXIS, base.subVectors(apex, base).normalize());
      base.set(x, FLOOR_Y, z);
      m.position.addVectors(apex, base).multiplyScalar(0.5); m.scale.y = len;
      if (pool) { pool.position.x = base.x; pool.position.z = base.z; }
    }
  }
  function render() { aimBeams(); renderer.render(scene, camera); handRenderer.render(handScene, camera); }
  // a card picture finished loading: draw it (once per frame at most; nothing after dispose)
  let alive = true, repaintQueued = false;
  const repaint = () => { if (!alive || repaintQueued) return; repaintQueued = true; requestAnimationFrame(() => { repaintQueued = false; if (alive) render(); }); };
  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
    if (dealing && dealing.shuffleTime < SHUFFLE_SECONDS) {
      dealing.shuffleTime = Math.min(SHUFFLE_SECONDS, dealing.shuffleTime + dt);
      const phase = dealing.shuffleTime / SHUFFLE_SECONDS;
      // Two packets separate, riffle together, then square up, twice.
      const cycle = (phase * 2) % 1;
      const spread = Math.sin(Math.PI * Math.min(1, cycle / 0.72));
      deck.forEach((m, i) => {
        const side = i % 2 ? 1 : -1;
        m.position.set(side * spread * 0.65, CT + i * 0.012 + spread * (0.14 + (i % 3) * 0.025), 0);
        m.rotation.set(0, 0.2 + side * spread * 0.3, side * spread * 0.12);
      });
      if (phase === 1) deck.forEach((m,i) => { m.position.set(0, CT + i * 0.012, 0); m.rotation.set(0,0.2,0); });
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t += dt;
      if (tw.t < 0) continue;
      if (!tw.started) { tw.started = true; tw.mesh.visible = true; tw.onStart?.(); }
      const raw = Math.min(1, tw.t / tw.dur), k = ease(raw);
      tw.mesh.position.lerpVectors(tw.from, tw.to, k);
      tw.mesh.position.y += Math.sin(Math.PI * k) * tw.arc;
      tw.mesh.rotation.x = tw.rx0 + (tw.rx1 - tw.rx0) * k;
      tw.mesh.rotation.y = tw.ry0 + (tw.ry1 - tw.ry0) * k + Math.sin(Math.PI * k) * tw.spin;
      tw.mesh.rotation.z = tw.rz0 + (tw.rz1 - tw.rz0) * k;
      if (tw.s1) tw.mesh.scale.setScalar(tw.s0 + (tw.s1 - tw.s0) * k);
      if (raw >= 1) { tweens.splice(i, 1); tw.onDone?.(); }
    }
    if (pointers.size) animatePointers(now);
    if (turnAnim) animateTurn(now);
    if (!voiceIdle) animateVoice(now);
    render();
    raf = tweens.length || pointers.size || turnAnim || !voiceIdle ? requestAnimationFrame(tick) : 0;
  }
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }
  function fly(mesh, from, to, o = {}) {
    if (!o.keepVisible) mesh.visible = false;      // cards already on screen keep showing while they slide
    mesh.position.copy(from); mesh.rotation.set(o.rx0 ?? 0, o.ry0 ?? 0, o.rz0 ?? 0);
    if (o.s0) mesh.scale.setScalar(o.s0);
    tweens.push({ mesh, from: from.clone(), to: to.clone(), t: -(o.delay || 0), dur: o.dur || 0.7, arc: o.arc ?? 0.8, spin: o.spin || 0,
      rx0: o.rx0 ?? 0, rx1: o.rx1 ?? 0, ry0: o.ry0 ?? 0, ry1: o.ry1 ?? 0, rz0: o.rz0 ?? 0, rz1: o.rz1 ?? 0, s0: o.s0, s1: o.s1, onStart: o.onStart, onDone: o.onDone });
    kick();
  }
  function later(seconds, fn) { const id = setTimeout(() => { timers.delete(id); fn(); }, seconds * 1000); timers.add(id); return id; }

  // ---- Turn Play pointers: instead of an arrow, the thing being passed travels across the table.
  // An ask sends a copy of the asked-for card gliding from the asker to hover in front of the asked
  // player; laydown arrows send a card back, turn passes send a "TURN" chip. The player it goes to
  // stands in a soft spotlight (a cone of light and a pool on the floor); the sender gets a faint glow. ----
  const TONE3D = { ask: 0xffd27a, lay: 0x7ee2a0, turn: 0x7cc8f0 };
  const pointers = new Map();      // key -> pointer
  const beamTex = canvasTexture(8, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(.3, 'rgba(255,255,255,.5)'); grad.addColorStop(1, 'rgba(255,255,255,.6)');
    g.fillStyle = grad; g.fillRect(0, 0, 8, 128);
  });
  const poolTex = canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,.85)'); grad.addColorStop(.45, 'rgba(255,255,255,.4)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  });
  const toCentre = (sp) => new THREE.Vector3(-sp.pos.x, 0, -sp.pos.z).normalize();
  function labelSprite(text, color) {
    const tex = canvasTexture(256, 80, (g) => {
      g.fillStyle = 'rgba(13,26,22,.92)'; g.beginPath(); g.roundRect(4, 4, 248, 72, 36); g.fill();
      g.strokeStyle = `#${color.toString(16).padStart(6, '0')}`; g.lineWidth = 5; g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 38px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(text).toUpperCase(), 128, 42);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.scale.set(0.9, 0.28, 1); sp.renderOrder = 5; return sp;
  }
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  // a point part-way between two seats, going around the table rather than straight across it
  function arcPos(from, to, k) {
    const a0 = Math.atan2(from.z, from.x), r0 = Math.hypot(from.x, from.z);
    let d = Math.atan2(to.z, to.x) - a0; d = Math.atan2(Math.sin(d), Math.cos(d));
    const r = r0 + (Math.hypot(to.x, to.z) - r0) * k, ang = a0 + d * k;
    return new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r);
  }
  const glowMat = (color, map, opacity) => new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  // Where the travelling card(s) hover: just in front of the receiver, over the table edge. The cards
  // are nearer to us than that player, so like real held-up cards they may cover the head behind them.
  const HOVER_IN = portrait ? 0.95 : 1.15;
  function hoverPoint(b) {
    return b.pos.clone().addScaledVector(toCentre(b), HOVER_IN).setY(0.85);
  }
  // A solid gold "?" over asked cards: a tube bent into the hook, and a ball for the dot (shared).
  const askHook = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    [-0.30, 0.42], [-0.26, 0.62], [-0.08, 0.76], [0.14, 0.74], [0.30, 0.58], [0.28, 0.38], [0.12, 0.24], [0.02, 0.12], [0, -0.04],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'catmullrom', 0.3), 64, 0.1, 16, false);
  const askDot = new THREE.SphereGeometry(0.12, 24, 16);
  const askCap = new THREE.SphereGeometry(0.1, 16, 12);
  const askGold = new THREE.MeshStandardMaterial({ color: 0xf2c24e, metalness: 0.75, roughness: 0.28, emissive: 0x5a3c08, emissiveIntensity: 0.6 });
  function askMark() {
    const g = new THREE.Group();
    const hook = new THREE.Mesh(askHook, askGold), dot = new THREE.Mesh(askDot, askGold), cap = new THREE.Mesh(askCap, askGold);
    dot.position.set(0, -0.3, 0); cap.position.set(-0.30, 0.42, 0);      // rounded end on the hook
    for (const m of [hook, dot, cap]) { m.castShadow = true; g.add(m); }
    g.position.y = -0.24;                                                   // centre the shape on its pivot
    const pivot = new THREE.Group(); pivot.add(g); return pivot;
  }
  function makePointer(pt) {
    const a = spots[pt.from], b = spots[pt.to];
    const color = TONE3D[pt.tone] || TONE3D.ask;
    const start = a.pos.clone().addScaledVector(toCentre(a), 0.6).setY(0.7);
    const nCards = pt.tone === 'turn' ? 0 : Math.max(1, Math.min(6, pt.cards?.length || 1));
    const end = hoverPoint(b);
    const mid = start.clone().add(end).multiplyScalar(0.5).multiplyScalar(0.7);
    mid.y = 1.3 + start.distanceTo(end) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const group = new THREE.Group(), owned = [];
    // the travelling object: the asked card's face, a card back, or a chip
    const flyer = new THREE.Group(), cards = new THREE.Group();   // cards may be lifted onto the hand layer (see animatePointers)
    if (pt.tone === 'turn') {
      const chip = labelSprite(pt.label || 'turn', color); chip.scale.set(1.1, 0.34, 1); flyer.add(chip); owned.push(chip.material.map, chip.material);
    } else {
      // one card, or a small fan when several cards are asked for at once
      const list = (pt.cards?.length ? pt.cards : pt.card ? [pt.card] : [null]).slice(0, 6);
      const n = list.length, size = n > 1 ? 1.35 : 1.6, step = n > 1 ? Math.min(0.24, 0.9 / (n - 1)) : 0;
      list.forEach((c, i) => {
        const face = c?.rank && c?.suit ? faceMat(c.rank, c.suit) : backMat;
        const card = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, face, backMat, edgeMat, edgeMat]);
        card.rotation.x = Math.PI / 2; card.scale.setScalar(size); card.castShadow = true;
        const holder = new THREE.Group();                         // pivots below the card so the fan opens like a hand
        card.position.y = CH * size * 0.9; holder.position.set(0, -CH * size * 0.9 + (n > 1 ? 0.05 : 0), i * 0.012);
        holder.rotation.z = -(i - (n - 1) / 2) * step;
        holder.add(card); cards.add(holder);
      });
      if (pt.tone === 'ask') {
        // a question mark over the asked cards: they're being asked for, not handed over
        const q = askMark(), r = n > 1 ? 0.6 : 0.62;
        q.scale.setScalar(r); q.position.set(0, CH * size * 0.5 + r * 0.55 + (n > 1 ? 0.12 : 0), 0.1);
        q.userData.askMark = true; cards.add(q);
      }
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(CW * (3.2 + (n - 1) * 0.7), CH * 2.7), glowMat(color, poolTex, 0.7));
      halo.position.z = -0.03; owned.push(halo.geometry, halo.material);
      flyer.add(halo);
      if (pt.label) { const l = labelSprite(pt.label, color); l.position.y = -0.75; flyer.add(l); owned.push(l.material.map, l.material); }
    }
    // spotlight on the receiver: a cone of light from above and a pool on the floor; a faint pool under the sender
    const beamMat = glowMat(color, beamTex, 0.6);
    const beam = makeBeam(beamMat);
    Object.assign(beam.userData, { x: a.pos.x, z: a.pos.z });
    const poolMat = glowMat(color, poolTex, 0.7);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), poolMat);
    pool.rotation.x = -Math.PI / 2; pool.position.set(a.pos.x, FLOOR_Y + 0.02, a.pos.z);
    const fromMat = glowMat(color, poolTex, 0.3);
    const fromPool = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), fromMat);
    fromPool.rotation.x = -Math.PI / 2; fromPool.position.set(a.pos.x, FLOOR_Y + 0.02, a.pos.z);
    owned.push(beam.geometry, beamMat, pool.geometry, poolMat, fromPool.geometry, fromMat);
    group.add(beam, pool, fromPool, flyer, cards);
    scene.add(group);
    beam.userData.pool = pool;
    return { key: pt.key, group, flyer, cards, cardR: nCards ? CH * (nCards > 1 ? 1.35 : 1.6) / 2 + 0.1 + (pt.tone === 'ask' ? 0.55 : 0) : 0.25, beam, beamMat, poolMat, pool, curve, aPos: a.pos.clone(), bPos: b.pos.clone(), owned, born: performance.now(), sig: sigOf(pt) };
  }
  const sigOf = (pt) => `${pt.from}>${pt.to}:${pt.tone}:${pt.label || ''}:${(pt.cards || (pt.card ? [pt.card] : [])).map((c) => c.rank + c.suit).join(',')}`;
  function dropPointer(p) {
    scene.remove(p.group); p.cards.parent?.remove(p.cards); aimed.delete(p.beam);
    p.owned.forEach((o) => o.dispose());
  }
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const FLY = 0.95;
  const headPts = spots.map((sp) => new THREE.Vector3(sp.pos.x, 0.98, sp.pos.z));
  const HEAD_PX = 44;
  // Which heads the cards overlap on screen: those farther away than the cards are covered by them
  // (front), those nearer cover the cards (nearer: their seats are lifted above the cards' layer).
  function cardsInFront(pos, radius) {
    const c = project(pos), edge = project(pos.clone().addScaledVector(camUp.copy(camera.up).applyQuaternion(camera.quaternion), radius));
    const r = Math.abs(edge.y - c.y) + HEAD_PX, dCard = camera.position.distanceTo(pos);
    let front = false; const nearer = [];
    headPts.forEach((h, rel) => {
      const hp = project(h);
      if (Math.abs(hp.x - c.x) > r || Math.abs(hp.y - c.y) > r) return;
      if (camera.position.distanceTo(h) < dCard) { if (rel) nearer.push(rel); } else front = true;   // the player's own seat stays under their hand
    });
    return { front, nearer };
  }
  let liftedKey = '';
  function lift(rels) {
    const key = [...new Set(rels)].sort().join(',');
    if (key !== liftedKey) { liftedKey = key; onLift?.(key ? key.split(',').map(Number) : []); }
  }
  function animatePointers(now) {
    const lifted = [];
    for (const p of pointers.values()) {
      const el = (now - p.born) / 1000;
      const t = reduceMotion ? 1 : Math.min(1, el / FLY);
      const k = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;      // ease in and out
      const at = arcPos(p.aPos, p.bPos, k);                                    // the spotlight sweeps over with the card
      p.beam.userData.x = at.x; p.beam.userData.z = at.z;
      p.flyer.position.copy(p.curve.getPoint(k));
      const hover = reduceMotion ? 0 : Math.max(0, el - FLY);
      p.flyer.position.y += 0.06 * Math.sin(hover * 2.4);
      p.flyer.quaternion.copy(camera.quaternion);                                 // always faces the player
      if (!reduceMotion) p.flyer.rotateY(t < 1 ? (1 - k) * Math.PI * 2 : 0.18 * Math.sin(hover * 1.6));
      const s = 0.55 + 0.45 * k; p.flyer.scale.setScalar(s);
      p.cards.children.forEach((c) => { if (c.userData.askMark) c.rotation.y = reduceMotion ? 0.35 : Math.sin(el * 1.5) * 0.7; });   // the "?" turns to and fro
      p.cards.position.copy(p.flyer.position); p.cards.quaternion.copy(p.flyer.quaternion); p.cards.scale.setScalar(s);
      // Avatars are HTML drawn over the 3D table. When the cards overlap a player's head on screen and
      // are nearer to us than that head, they belong in front of it, so they move to the hand layer
      // (which sits above the seats); behind a nearer head they stay in the table scene, under it.
      // Seats nearer to us than the cards are lifted above that layer, so each head sits in its own depth.
      const over = cardsInFront(p.flyer.position, p.cardR * s);
      const parent = over.front ? handScene : p.group;
      if (p.cards.parent !== parent) parent.add(p.cards);
      if (over.front) lifted.push(...over.nearer);
      const on = Math.min(1, el / 0.4), pulse = 0.5 + 0.5 * Math.sin(el * 2 * Math.PI / 1.6);
      p.beamMat.opacity = on * (0.85 + 0.15 * pulse);
      p.poolMat.opacity = on * (0.8 + 0.2 * pulse);
      p.pool.scale.setScalar(1 + 0.06 * pulse);
    }
    lift(lifted);
  }
  // ---- Whose turn it is (Turn Play): a cool spotlight on that player, a cone of light from above
  // and a pool at their chair. When the turn passes it glides around the table to the next player
  // (dimming a little on the way), and it fades in and out when Turn Play starts or stops. ----
  const TURN_COLOR = 0x8fd3ff;
  const turnBeamMat = glowMat(TURN_COLOR, beamTex, 0), turnPoolMat = glowMat(TURN_COLOR, poolTex, 0);
  const turnBeam = makeBeam(turnBeamMat);
  const turnPool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 48), turnPoolMat);
  turnPool.rotation.x = -Math.PI / 2;
  turnPool.position.y = FLOOR_Y + 0.01;
  turnBeam.userData.pool = turnPool;
  const turnLight = new THREE.Group(); turnLight.add(turnBeam, turnPool); turnLight.visible = false; scene.add(turnLight);
  const turnBeamFor = (rel) => (rel === 0 ? 0.35 : 0.75);     // your own seat is right by the camera, so keep it softer
  let turnNow = { pos: null, alpha: 0, beam: 0.75 }, turnAnim = null;
  function setTurn(rel) {
    const sp = rel == null ? null : spots[rel];
    const from = turnNow.pos || (sp ? sp.pos.clone() : null);
    if (!from) return;
    const to = sp ? sp.pos.clone() : from.clone();
    const moving = sp && turnNow.alpha > 0.01 && from.distanceTo(to) > 0.01;
    turnAnim = { from: from.clone(), to, a0: turnNow.alpha, a1: sp ? 1 : 0, b0: turnNow.beam, b1: sp ? turnBeamFor(rel) : turnNow.beam,
      moving, t0: performance.now(), dur: reduceMotion ? 0 : moving ? 0.85 : 0.45 };
    kick();
  }
  function animateTurn(now) {
    const t = turnAnim.dur ? Math.min(1, (now - turnAnim.t0) / 1000 / turnAnim.dur) : 1;
    const k = easeInOut(t);
    const pos = arcPos(turnAnim.from, turnAnim.to, k);
    let alpha = turnAnim.a0 + (turnAnim.a1 - turnAnim.a0) * k;
    if (turnAnim.moving) alpha *= 1 - 0.3 * Math.sin(Math.PI * k);
    const beam = turnAnim.b0 + (turnAnim.b1 - turnAnim.b0) * k;
    turnNow = { pos, alpha, beam };
    turnBeam.userData.x = pos.x; turnBeam.userData.z = pos.z;
    turnBeamMat.opacity = beam * alpha; turnPoolMat.opacity = 0.85 * alpha;
    const grow = turnAnim.moving ? 1 : 0.5 + 0.5 * alpha;          // the pool opens up as the light comes on
    turnPool.scale.setScalar(grow); turnBeam.scale.x = turnBeam.scale.z = grow;
    turnLight.visible = alpha > 0.01;
    if (t >= 1) turnAnim = null;
  }
  /** pts: [{ key, from, to, tone: 'ask'|'lay'|'turn', label?, card?: {rank, suit}, cards?: [{rank, suit}] }] with seats relative to the player. */
  function setPointers(pts) {
    const want = new Map();
    for (const pt of pts || []) if (pt && spots[pt.from] && spots[pt.to] && pt.from !== pt.to) want.set(pt.key, pt);
    for (const [key, p] of pointers) {
      const pt = want.get(key);
      if (!pt || p.sig !== sigOf(pt)) { dropPointer(p); pointers.delete(key); }
    }
    for (const [key, pt] of want) if (!pointers.has(key)) pointers.set(key, makePointer(pt));
    if (pointers.size) kick(); else { lift([]); render(); }
  }

  // ---- state ----
  let state = { counts: [0, 0, 0, 0, 0, 0], teams: [], sets: [] };
  let dealing = null;                      // { shown: [..], flights: [...] } while a deal is animating
  const resting = new Map();               // rel -> { meshes, timer }: passed cards lying face up

  function refresh() { drawStacks(dealing ? dealing.shown : state.counts); render(); }

  function clearRest(rel) {
    const list = rel === undefined ? [...resting.keys()] : [rel];
    list.forEach((r) => { const it = resting.get(r); if (!it) return; clearTimeout(it.timer); timers.delete(it.timer); it.meshes.forEach((m) => flyGroup.remove(m)); resting.delete(r); });
    render();
  }

  function stopDeal() {
    if (!dealing) return;
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].deal) { tweens[i].mesh.visible = false; tweens.splice(i, 1); }
    dealing.flights.forEach((m) => { m.visible = false; m.removeFromParent(); if (m.userData.ownMats) m.material.forEach((mat) => mat.dispose()); });
    deck.forEach((m) => { m.visible = false; });
    dealing = null;
    drawHand();
    sortHand();
    refresh();
  }
  /** Arrange the dealt cards by suit and rank, sliding each card to its new place. */
  function sortHand() {
    if (!hand.dealt || dealing && dealing.shown[0] < hand.dealt.length) return;
    const previous = new Map([...handPool].filter(([, m]) => m.visible).map(([k, m]) => [k, { p: m.position.clone(), rx: m.rotation.x, ry: m.rotation.y, rz: m.rotation.z }]));
    hand.dealt = null;
    drawHand();
    handPool.forEach((m, k) => {
      const old = previous.get(k);
      if (!m.visible || !old) return;
      fly(m, old.p, m.position.clone(), { dur: 0.45, arc: 0.12, keepVisible: true, rx0: old.rx, rx1: m.rotation.x, ry0: old.ry, ry1: m.rotation.y, rz0: old.rz, rz1: m.rotation.z, s0: HAND_SCALE, s1: HAND_SCALE });
    });
    render();
  }

  function startDeal(dealerRel, dealOrder) {
    stopDeal(); clearRest();
    const target = [...state.counts];
    dealing = { shown: [0, 0, 0, 0, 0, 0], flights: [], shuffleTime: 0 };
    hand.incoming.clear(); hand.gone.clear();
    // Cards arrive in the order they come off the deck; they are sorted once all are in.
    hand.dealt = [...hand.cards];
    for (let i = hand.dealt.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [hand.dealt[i], hand.dealt[j]] = [hand.dealt[j], hand.dealt[i]]; }
    drawHand();
    deck.forEach((m, i) => { m.visible = true; m.position.set(0, CT + i * 0.012, 0); m.rotation.set(0, 0.2 + (i % 3) * 0.03, 0); });
    // who gets each card, in turn, starting to the dealer's left
    const order = []; const given = [0, 0, 0, 0, 0, 0];
    // Live rounds follow the server sequence; preview and older servers use round-robin.
    for (const rel of dealOrder || []) {
      if (Number.isInteger(rel) && rel >= 0 && rel < 6 && given[rel] < target[rel]) {
        given[rel]++; order.push(rel);
      }
    }
    for (let k = 0; order.length < target.reduce((a, b) => a + b, 0) && k < 400; k++) {
      const rel = (dealerRel + 1 + k) % 6;
      if (given[rel] < target[rel]) { given[rel]++; order.push(rel); }
    }
    const total = order.length || 1, gap = (DEAL_SECONDS - 0.9) / total;
    order.forEach((rel, k) => {
      // The local player's cards flip face up and land in their actual fan slots.
      const ownIndex = order.slice(0, k).filter(r => r === 0).length;
      const card = rel === 0 ? hand.dealt[ownIndex] : null;
      const slot = rel === 0 ? handSlot(ownIndex, target[0], false) : null;
      const mesh = card ? newFace(card, FLY_SCALE) : newBack(FLY_SCALE);
      // Your own cards fly on the hand layer so they stay in front of the cards already held.
      if (card) {
        // ...and draw over them, rather than passing behind the fan until they land.
        mesh.material = mesh.material.map((mat) => { const c = mat.clone(); c.depthTest = false; return c; });
        mesh.renderOrder = 10; mesh.userData.ownMats = true;
      }
      (card ? handGroup : flyGroup).add(mesh);
      dealing.flights.push(mesh);
      const fan = slot ? null : fanPose(rel, order.slice(0, k).filter((r) => r === rel).length, target[rel]);   // its place in their hand
      fly(mesh, new THREE.Vector3(0, 0.22, 0), slot ? slot.p : fan.p, {
        delay: SHUFFLE_SECONDS + k * gap, dur: slot ? 1.1 : 0.8, arc: slot ? 1.15 : 0.9, spin: slot ? 0.35 : 1.4,
        rx1: slot ? slot.rx : fan.rx, ry0: 0.2, ry1: slot ? slot.ry : fan.ry,
        rz0: card ? Math.PI : 0, rz1: slot ? slot.rz || 0 : fan.rz, s0: FLY_SCALE, s1: slot ? HAND_SCALE : FAN_SCALE,
        onDone: () => {
          mesh.visible = false;
          if (!dealing) return;
          dealing.shown[rel]++;
          if (rel === 0) { drawHand(); if (dealing.shown[0] >= hand.dealt?.length) later(0.7, sortHand); }
          const left = total - (k + 1);
          deck.forEach((m, i) => { m.visible = i < Math.ceil((left / total) * deck.length); });
          drawStacks(dealing.shown);
        },
      });
      tweens[tweens.length - 1].deal = true;
    });
    refresh();   // seats start empty; their cards arrive one by one
  }

  // Light the chairs of the players involved for a while (a pass, a laydown).
  function glow(rels, seconds) {
    rels.forEach((rel) => { const sp = spots[rel]; if (!sp) return; sp.glow++; sp.ring.visible = true; });
    render();
    later(seconds, () => { rels.forEach((rel) => { const sp = spots[rel]; if (!sp) return; sp.glow = Math.max(0, sp.glow - 1); sp.ring.visible = sp.glow > 0; }); render(); });
  }

  // Where a card leaves from: the player's own hand (where it was last held) or the middle of a seat's fan.
  function startOf(rel, card) {
    if (rel === 0) {
      const last = hand.last.get(keyOf(card));
      if (last) return { p: last.p.clone(), rx: last.rx, ry: last.ry, rz: last.rz || 0, s: HAND_SCALE };
      return { p: handEdge(), rx: HAND_LEAN, ry: 0, rz: 0, s: HAND_SCALE };
    }
    const n = Math.max(1, state.counts[rel] || 1);
    return fanPose(rel, Math.floor(n / 2), n);
  }

  function pass(fromRel, toRel, cards) {
    if (!cards?.length || fromRel === toRel) return;
    clearRest(toRel);
    glow([fromRel, toRel], toRel === 0 ? 2.2 : REST_SECONDS);
    const shown = cards.slice(0, 4);
    if (toRel === 0) {
      // Straight into the player's hand: the card leaves the giver, flips face up in the air
      // and drops into its place in the fan.
      const next = [...hand.cards.filter((c) => !shown.some((x) => keyOf(x) === keyOf(c))), ...shown].sort(byHandOrder);
      shown.forEach((card, i) => {
        const key = keyOf(card); hand.incoming.add(key);
        const st = startOf(fromRel, card), slot = handSlot(next.findIndex((c) => keyOf(c) === key), next.length, false);
        const m = newFace(card, st.s); flyGroup.add(m);
        fly(m, st.p, slot.p, { delay: i * 0.1, dur: 0.95, arc: 1.6, spin: 3.2, rx0: st.rx, rx1: slot.rx, ry0: st.ry, ry1: slot.ry, rz0: st.rz, rz1: slot.rz || 0, s0: st.s, s1: HAND_SCALE,
          onDone: () => { flyGroup.remove(m); hand.incoming.delete(key); drawHand(); render(); } });
      });
      drawHand();
      return;
    }
    // To anyone else: it flies over, lands face up in front of them for a moment, then
    // goes up into the fan in their hands.
    const s = spots[toRel], rest = restSpot(toRel);
    const meshes = shown.map((card, i) => {
      const st = startOf(fromRel, card);
      const m = newFace(card, st.s); flyGroup.add(m);
      const off = (i - (shown.length - 1) / 2) * 0.34;
      const to = rest.clone().addScaledVector(s.tangent, off).setY(0.03 + i * 0.004);
      fly(m, st.p, to, { delay: i * 0.1, dur: 0.95, arc: 1.6, spin: 3.2, rx0: st.rx, rx1: 0, ry0: st.ry, ry1: -s.angle + Math.PI / 2, rz0: st.rz, rz1: 0, s0: st.s, s1: FLY_SCALE });
      return m;
    });
    if (fromRel === 0) { markGone(shown.map(keyOf)); drawHand(); }
    const timer = later(REST_SECONDS, () => {
      const it = resting.get(toRel); if (!it) return;
      resting.delete(toRel);
      const n = Math.max(1, state.counts[toRel] || it.meshes.length);
      it.meshes.forEach((m, i) => { const f = fanPose(toRel, n - it.meshes.length + i, n);
        fly(m, m.position.clone(), f.p, { delay: i * 0.05, dur: 0.6, arc: 0.35, rx0: m.rotation.x, rx1: f.rx, ry0: m.rotation.y, ry1: f.ry, rz0: m.rotation.z, rz1: f.rz, s0: FLY_SCALE, s1: FAN_SCALE, onDone: () => { flyGroup.remove(m); render(); } }); });
    });
    resting.set(toRel, { meshes, timer });
  }

  // A set being laid down, the way the preview did it: every card flies from whoever held it
  // to the middle of the table, face up in a row, waits there, then slides to its place
  // among the collected sets.
  let laying = null;
  function lay({ contributors, suit, setType }) {
    if (laying) { laying.meshes.forEach((m) => flyGroup.remove(m)); clearTimeout(laying.timer); timers.delete(laying.timer); }
    const items = [];
    contributors.forEach(({ rel, cards }) => (cards || []).forEach((card) => items.push({ rel, card })));
    if (!items.length) return;
    items.sort((a, b) => RANKS.indexOf(a.card.rank) - RANKS.indexOf(b.card.rank));
    layingKey = `${suit}|${setType}`; drawSets(state.sets);
    glow([...new Set(contributors.map((c) => c.rel))], LAY_HOLD_SECONDS + 1);
    const n = items.length, step = Math.min(0.5, (portrait ? 3.2 : 4.4) / n);
    const meshes = items.map(({ rel, card }, k) => {
      const st = startOf(rel, card);
      const m = newFace(card, st.s); flyGroup.add(m);
      const to = new THREE.Vector3((k - (n - 1) / 2) * step, 0.02 + k * 0.004, Math.abs(k - (n - 1) / 2) * 0.05);
      fly(m, st.p, to, { delay: k * 0.14, dur: 0.9, arc: 1.3, spin: 2.2, rx0: st.rx, rx1: 0, ry0: st.ry, ry1: -(k - (n - 1) / 2) * 0.09, rz0: st.rz, rz1: 0, s0: st.s, s1: 1 });
      return m;
    });
    markGone(items.filter((it) => it.rel === 0).map((it) => keyOf(it.card))); drawHand();
    const timer = later(LAY_HOLD_SECONDS + n * 0.14, () => {
      const idx = state.sets.findIndex((x) => setKey(x) === layingKey);
      const done = () => { if (laying?.meshes !== meshes) return; meshes.forEach((m) => flyGroup.remove(m)); laying = null; layingKey = null; drawSets(state.sets); render(); };
      if (idx < 0) { done(); return; }
      const { cx, cz } = setCell(idx, state.sets.length);
      meshes.forEach((m, k) => fly(m, m.position.clone(), new THREE.Vector3(cx + (k - (n - 1) / 2) * 0.17 * SET_SCALE, 0.02 + k * 0.002, cz),
        { delay: k * 0.05, dur: 0.6, arc: 0.4, ry0: m.rotation.y, ry1: 0, s0: 1, s1: SET_SCALE, onDone: k === n - 1 ? done : undefined }));
    });
    laying = { meshes, timer };
  }

  // ---- camera: looks down the table from the player's seat, as close as the seats allow.
  // The player can drag to turn the table and pinch or scroll to zoom. ----
  const target = new THREE.Vector3(0, 0, portrait ? 0.15 : 0.25);
  const POLAR0 = portrait ? 1.0 : 1.0;                  // angle down from straight overhead
  const anchors = spots.map((s) => new THREE.Vector3(s.pos.x, 0.98, s.pos.z));
  const view = { az: 0, polar: POLAR0, zoom: 1, dist0: 12, ox: 0, oy: 0, dy: 0 };
  let size = { w: 1, h: 1 }, area = null;
  function project(v) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * size.w, y: (-p.y * 0.5 + 0.5) * size.h };
  }
  function place(d, az, polar) {
    const dir = new THREE.Vector3(Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az));
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // slide the picture so the table's middle sits in the middle of the players' area
    view.ox = size.w / 2 - (area.left + area.width / 2);
    view.oy = size.h / 2 - (area.top + (area.height - Math.min(150, area.height * .25)) / 2) + view.dy;
    camera.setViewOffset(size.w, size.h, view.ox, view.oy, size.w, size.h);
    camera.updateProjectionMatrix();
  }
  const applyView = () => place(view.dist0 * view.zoom, view.az, view.polar);
  // Where the held cards end, and how tall they are (px).
  const handBottom = () => area ? Math.min(size.h - 82, area.top + area.height - 12) : size.h - 150;
  const handCardH = () => Math.min(150, Math.max(110, size.h * 0.18));
  /** `a` is where the seats must fit, in px inside the container (the canvas fills the container). */
  function fit(a) {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h || !a?.width || !a?.height) return false;
    size = { w, h }; area = a;
    renderer.setSize(w, h, false); handRenderer.setSize(w, h);
    camera.aspect = w / h;
    const padX = Math.min(portrait ? 38 : 64, a.width * 0.1), padTop = portrait ? 76 : 56, padBottom = portrait ? Math.min(170, a.height * .28)
      // on a wide screen, keep the seats just above the top of the held cards
      : (a.top + a.height) - (handBottom() - handCardH()) + 34;
    // On a wide screen the others sit above the held cards; the player's own head may tuck
    // behind the top of their cards (the fan covers it), so it gets a looser limit.
    const fitAnchors = portrait ? anchors : anchors.slice(1);
    const meLimit = handBottom() - handCardH() + 12;
    let lo = 4, hi = 44;
    for (let i = 0; i < 18; i++) {
      const d = (lo + hi) / 2; view.dy = 0; place(d, 0, POLAR0);
      if (!portrait) {
        // On a wide screen, slide the seats so they sit in the middle of the free band above the hand.
        const ys = fitAnchors.map((p3) => project(p3).y);
        view.dy = (Math.min(...ys) + Math.max(...ys)) / 2 - (a.top + padTop + a.top + a.height - padBottom) / 2;
        place(d, 0, POLAR0);
      }
      const ok = (portrait || project(anchors[0]).y <= meLimit) && [...fitAnchors, ...handBounds()].every((p3) => { const p = project(p3); return p.x >= a.left + padX && p.x <= a.left + a.width - padX && p.y >= a.top + padTop && p.y <= a.top + a.height - padBottom; });
      if (ok) hi = d; else lo = d;
    }
    view.dist0 = hi;
    applyView();
    return true;
  }
  function seatLayout() {
    if (!area) return null;
    const rel = (p) => ({ x: p.x - area.left, y: p.y - area.top });
    return { seats: spots.map((s, i) => ({ rel: i, ...rel(project(anchors[i])) })), collected: state.sets.map((set, i) => { const { cx, cz } = setCell(i, state.sets.length); return { key: setKey(set), ...project(new THREE.Vector3(cx, 0.12, cz)) }; }), center: rel(project(new THREE.Vector3(0, 0, 0))), width: area.width, height: area.height,
      turned: Math.abs(view.az) > 0.02 || Math.abs(view.polar - POLAR0) > 0.02 || Math.abs(view.zoom - 1) > 0.02 };
  }

  // ---- the player's own hand: held at the edge of the table in front of their chair,
  // leaning back toward them in a fan. It turns with the table. ----
  let HAND_SCALE = 1;
  const HAND_LEAN = 0.95;                                  // how far the cards lean back toward the player
  const HAND_Y = 0.76, HAND_Z = RZ + (portrait ? 0.80 : 0.75);
  // Leave space beside the hand for the two nearest seats in the initial view.
  // Seat anchors remain fixed in world space as the camera rotates.
  const HAND_WIDTH = portrait ? RX * 1.55 : RX * 1.22;
  const handFaceMats = new Map();
  const handFaceMat = (rank, suit) => {                   // a little self-lit so the faces read well at the edge of the lamp
    const key = `${rank}|${suit}`;
    if (!handFaceMats.has(key)) { const map = faceTexture(rank, suit, repaint); handFaceMats.set(key, new THREE.MeshBasicMaterial({ map, toneMapped: false, alphaTest:0.5 })); }
    return handFaceMats.get(key);
  };
  // The hand is drawn on its own see-through layer that the page puts above the players' seats,
  // so the cards in front of the player cover their own avatar like real held cards.
  const handRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  handRenderer.setPixelRatio(renderer.getPixelRatio());
  handRenderer.outputColorSpace = THREE.SRGBColorSpace;
  handRenderer.setClearColor(0x000000, 0);
  Object.assign(handRenderer.domElement.style, { position: 'absolute', pointerEvents: 'none' });
  const handScene = new THREE.Scene();
  handScene.add(new THREE.HemisphereLight(0xf6f4e9, 0x344b45, 1.5));
  const handLight = new THREE.DirectionalLight(0xfff0d6, 1.2); handLight.position.set(0.5, 8.5, 6); handScene.add(handLight);
  const handGroup = new THREE.Group(); handScene.add(handGroup);
  const handPool = new Map();                              // "suit-rank" -> mesh
  // last: where each card was last held (a card leaving the hand flies from there)
  // incoming: cards still in the air on their way in; gone: cards that just left
  const hand = { cards: [], hover: null, selected: new Set(), last: new Map(), incoming: new Set(), gone: new Set(), drag: null, dealt: null };
  function handSlot(i, n, selected) {
    // Screen-sized cards stay readable and stable while the table is rotated.
    const cardHeight = handCardH();
    const cardWidth = cardHeight * CW / CH;
    const k = i - (n - 1) / 2;
    const step = Math.min(cardWidth * 0.66, (Math.min(size.w - 36, 720) - cardWidth) / Math.max(1,n - 1));
    const angle = k * Math.min(0.045, 0.30 / Math.max(1,n - 1));
    const x = size.w / 2 + k * step;
    const bottom = handBottom();
    const y = bottom - cardHeight / 2 + Math.abs(k) * 1.5 - (selected ? 22 : 0);
    const distance = 4 - i * 0.003;
    HAND_SCALE = cardHeight * (2 * 4 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / size.h / CH;
    const point = new THREE.Vector3(x / size.w * 2 - 1, 1 - y / size.h * 2, 0.5).unproject(camera);
    const direction = point.sub(camera.position).normalize();
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const p = camera.position.clone().addScaledVector(direction, distance / direction.dot(forward));
    const q = camera.quaternion.clone()
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), -angle))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI / 2));
    const rotation = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    return { p, rx:rotation.x, ry:rotation.y, rz:rotation.z };
  }
  // The hand is fitted independently in screen space.
  function handBounds() { return []; }
  function handMesh(card) {
    const key = keyOf(card);
    if (!handPool.has(key)) {
      const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, handFaceMat(card.rank, card.suit), backMat, edgeMat, edgeMat]);
      m.rotation.order = 'XYZ'; m.castShadow = true; m.scale.setScalar(HAND_SCALE); m.userData.card = card;
      handPool.set(key, m); handGroup.add(m);
    }
    return handPool.get(key);
  }
  // Cards that just left the hand stay hidden until the game confirms it; if it never
  // does (the pass was refused), they come back.
  function markGone(keys) {
    keys.forEach((key) => hand.gone.add(key));
    later(4, () => { keys.forEach((key) => hand.gone.delete(key)); drawHand(); render(); });
  }
  function drawHand() {
    const live = new Set();
    const order = hand.dealt || hand.cards;
    const available = dealing ? order.slice(0, dealing.shown[0]) : order;
    const cards = available.filter((c) => !hand.gone.has(keyOf(c)));
    cards.forEach((card, i) => {
      const key = keyOf(card), m = handMesh(card), slot = handSlot(i, dealing ? hand.cards.length : cards.length, hand.selected.has(key) || hand.hover === key);
      live.add(key);
      hand.last.set(key, { p: slot.p.clone(), rx: slot.rx, ry: slot.ry, rz: slot.rz });
      if (hand.drag?.keys.has(key)) return;                // following the pointer
      m.position.copy(slot.p); m.rotation.set(slot.rx, slot.ry, slot.rz || 0); m.scale.setScalar(HAND_SCALE);
      // Selection changes only the vertical slot offset. Preserve the same
      // depth-tested left-to-right overlap as the resting fan.
      m.visible = !hand.incoming.has(key);
    });
    handPool.forEach((m, key) => { if (!live.has(key)) m.visible = false; });
  }
  function hoverHand(card) {
    const key = card ? keyOf(card) : null;
    if (hand.hover === key || dealing || hand.drag) return;
    hand.hover = key;
    const previous = new Map([...handPool].map(([k,m]) => [k, { p:m.position.clone(), rx:m.rotation.x, ry:m.rotation.y, rz:m.rotation.z }]));
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].handHover) tweens.splice(i,1);
    drawHand();
    handPool.forEach((m,k) => {
      if (!m.visible || hand.incoming.has(k)) return;
      const old = previous.get(k);
      fly(m, old.p, m.position.clone(), { dur:0.13, arc:0, keepVisible:true, rx0:old.rx, rx1:m.rotation.x, ry0:old.ry, ry1:m.rotation.y, rz0:old.rz, rz1:m.rotation.z });
      tweens[tweens.length - 1].handHover = true;
    });
  }
  const raycaster = new THREE.Raycaster();
  // (the camera's view offset is part of its projection, so screen px map straight to rays)
  const aim = (sx, sy) => raycaster.setFromCamera(new THREE.Vector2((sx / size.w) * 2 - 1, 1 - (sy / size.h) * 2), camera);
  function pickHand(sx, sy) {
    // Hit-test the cards' resting places, not the meshes: a hover tween hides a card for a frame
    // and lifts it away from the pointer, which made the hover flicker between cards.
    const cards = (hand.dealt || hand.cards).filter(c => !hand.gone.has(keyOf(c)));
    const shown = cards.filter((c) => !hand.incoming.has(keyOf(c)) && handPool.has(keyOf(c)) && !hand.drag?.keys.has(keyOf(c))).map((c) => handPool.get(keyOf(c)));
    if (!shown.length || dealing) return null;
    aim(sx, sy);
    const proxies = shown.map(m => {
      const card = m.userData.card, i = cards.findIndex(c => keyOf(c) === keyOf(card));
      const slot = handSlot(i, cards.length, hand.selected.has(keyOf(card)));
      const proxy = m.userData.pickProxy || (m.userData.pickProxy = new THREE.Mesh(cardGeo, edgeMat));
      proxy.position.copy(slot.p); proxy.rotation.order = 'XYZ'; proxy.rotation.set(slot.rx,slot.ry,slot.rz || 0);
      proxy.scale.copy(m.scale); proxy.userData.card = card; proxy.updateMatrixWorld(true);
      return proxy;
    });
    const hit = raycaster.intersectObjects(proxies, false)[0];
    return hit ? hit.object.userData.card : null;
  }
  // Dragging cards out of the hand: they follow the pointer, held up over the table.
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);
  function dragHand(keys, sx, sy) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].handHover) tweens.splice(i, 1);
    if (!hand.drag) hand.drag = { keys: new Set(keys) };
    aim(sx, sy);
    const at = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(dragPlane, at)) return;
    const list = [...hand.drag.keys], yaw = view.az;
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    list.forEach((key, i) => {
      const m = handPool.get(key); if (!m) return;
      m.position.copy(at).addScaledVector(side, (i - (list.length - 1) / 2) * 0.22).setY(0.9 + i * 0.01);
      m.rotation.set(0.5, yaw - (i - (list.length - 1) / 2) * 0.06, 0);
      m.visible = true;
      hand.last.set(key, { p: m.position.clone(), rx: m.rotation.x, ry: m.rotation.y });
    });
    render();
  }
  function endDragHand(dropped) {
    if (!hand.drag) return;
    const keys = [...hand.drag.keys];
    hand.drag = null; hand.hover = null;
    if (dropped) markGone(keys);
    drawHand(); render();
  }

  /** Seats (rel) whose player is talking. */
  function setSpeaking(rels) {
    speaking.clear(); (rels || []).forEach((r) => speaking.add(r));
    voiceIdle = false; kick();
  }
  return {
    setSpeaking,
    /** counts/teams are indexed by position relative to the player (0 = the player). */
    update({ counts, teams, sets }) {
      state = { counts, teams, sets };
      spots.forEach((s) => s.chairMat.color.set(teams[s.rel] === 'A' ? 0x24404f : teams[s.rel] === 'B' ? 0x4a2c29 : 0x3a2c22));
      drawSets(sets);
      refresh();
    },
    /** Refits the camera to `a`; returns each seat's screen position (px, relative to `a`) and the table centre. */
    layout(a) {
      if (!fit(a)) return null;
      drawHand(); render();
      return seatLayout();
    },
    /** Turn the table (radians) and/or zoom (factor); returns the new seat positions. */
    orbit(dAz, dPolar, zoomFactor = 1) {
      if (!area) return null;
      view.az += dAz;
      view.polar = Math.max(0.2, Math.min(1.2, view.polar + dPolar));
      view.zoom = Math.max(0.55, Math.min(1.8, view.zoom * zoomFactor));
      applyView(); drawHand(); render();
      return seatLayout();
    },
    resetView() { view.az = 0; view.polar = POLAR0; view.zoom = 1; if (!area) return null; applyView(); drawHand(); render(); return seatLayout(); },
    /** Top edge of the held cards in px inside the container (raised cards included), or null with no hand. */
    /** The player's cards and which are selected ("suit-rank" keys). */
    setHand(cards, selectedKeys) {
      // A completed hover tween must not move a newly selected card back down.
      for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].handHover) tweens.splice(i, 1);
      const now = new Set(cards.map(keyOf));
      hand.gone.forEach((key) => { if (!now.has(key)) hand.gone.delete(key); });   // the game has caught up
      const same = hand.dealt && hand.dealt.length === cards.length && hand.dealt.every((c) => now.has(keyOf(c)));
      if (!same) hand.dealt = null;
      hand.cards = [...cards].sort(byHandOrder); hand.selected = new Set(selectedKeys); drawHand(); render();
    },
    getLayout: seatLayout,
    /** The hand's own layer: the page places it above the seats (same size as the container). */
    handLayer: handRenderer.domElement,
    pickHand, hoverHand, dragHand, endDragHand,
    /** contributors: [{ rel, cards }] */
    lay,
    startDeal, stopDeal, pass, clearRest, setPointers, setTurn,
    dispose() {
      alive = false; cancelAnimationFrame(raf); pointers.forEach(dropPointer); pointers.clear(); beamTex.dispose(); poolTex.dispose(); askHook.dispose(); askDot.dispose(); askCap.dispose(); askGold.dispose(); turnBeam.geometry.dispose(); turnPool.geometry.dispose(); turnBeamMat.dispose(); turnPoolMat.dispose(); timers.forEach((id) => clearTimeout(id)); tweens.length = 0;
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
      faceMats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      handFaceMats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      collectedMats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      handScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose(); handRenderer.dispose();
      renderer.domElement.remove(); handRenderer.domElement.remove();
    },
  };
}
