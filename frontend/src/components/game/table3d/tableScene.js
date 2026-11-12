// The game room drawn in 3D (three.js): floor, table, chairs, each opponent's face-down
// cards, the player's own hand held at the edge of the table, the laid-down sets in the
// middle of the felt, and the cards that fly when the round is dealt, a card changes hands
// or a set is laid down. It follows the real game state.
// Players, bubbles, arrows and every button stay ordinary page elements on top; this
// module tells the page where each seat sits on screen.
import * as THREE from 'three';

const SUIT = { hearts: ['♥', '#c0283a'], diamonds: ['♦', '#c0283a'], clubs: ['♣', '#1c2430'], spades: ['♠', '#1c2430'] };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const TEAM_COLOR = { A: 0x7ca6bd, B: 0xc98f87 };
const CW = 0.62, CH = 0.88, CT = 0.006;
const STACK_SCALE = 0.6;   // opponents' face-down cards
const SET_SCALE = 0.5;     // laid-down sets in the middle
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


export function createGameTable3D(container, { portrait }) {
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
    const form = (mat, x,y,z, sx,sy,sz) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1,24,16), mat);
      mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow = true; mesh.receiveShadow = true; figure.add(mesh); return mesh;
    };
    form(shirt,0,0.23,0, .34,.48,.23); // torso
    form(shirt,0,0.54,0, .43,.17,.24); // shoulders
    form(skin,0,0.77,0, .115,.14,.11); // neck: the player avatar is the face
    for (const side of [-1,1]) {
      const sleeve = form(shirt,side*.36,.28,.10, .13,.32,.14); sleeve.rotation.x = -.35;
      const arm = form(skin,side*.35,.075,.36, .10,.105,.28); arm.rotation.y = side*-.2;
      form(skin,side*.29,.08,.60, .105,.07,.14);
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
    scene.add(figure);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.04, 10, 60), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb300, emissiveIntensity: 1.5 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(pos.x, -0.18, pos.z); ring.visible = false; scene.add(ring);
    return { rel, angle: a, dir, pos, chair, chairMat, ring, glow: 0, tangent: new THREE.Vector3(-dir.z, 0, dir.x) };
  });

  // ---- cards ----
  const cardGeo = new THREE.BoxGeometry(CW, CT, CH);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d2, roughness: 0.8 });
  const backMat = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.6, alphaTest:0.5 });
  const newBack = (scale) => { const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, backMat, backMat, edgeMat, edgeMat]); m.castShadow = true; m.receiveShadow = true; m.visible = false; m.scale.setScalar(scale); m.rotation.order = 'XYZ'; scene.add(m); return m; };
  const backs = Array.from({ length: 54 }, () => newBack(STACK_SCALE));
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

  const stackBase = (s) => new THREE.Vector3(s.dir.x * RX * 0.7, 0, s.dir.z * RZ * 0.68);
  const handEdge = () => new THREE.Vector3(0, HAND_Y, HAND_Z);              // the middle of the player's own hand
  const seatSpot = (rel) => (rel === 0 ? handEdge() : stackBase(spots[rel]).setY(0.02));
  const restSpot = (rel) => (rel === 0
    ? new THREE.Vector3(0, 0.03, RZ * 0.62)
    : new THREE.Vector3(spots[rel].dir.x * RX * 0.46, 0.03, spots[rel].dir.z * RZ * 0.44));

  function drawStacks(counts) {
    let used = 0;
    spots.forEach((s) => {
      const n = s.rel === 0 ? 0 : Math.min(counts[s.rel] || 0, 13);
      const base = stackBase(s);
      for (let j = 0; j < n && used < backs.length; j++, used++) {
        const m = backs[used];
        m.position.copy(base).addScaledVector(s.tangent, (j - (n - 1) / 2) * 0.075).setY(CT / 2 + j * 0.003);
        m.rotation.set(0, -s.angle + Math.PI / 2 + (j - (n - 1) / 2) * 0.05, 0);
        m.visible = true;
      }
    });
    for (; used < backs.length; used++) backs[used].visible = false;
  }

  const setKey = (set) => `${set.suit}|${set.set_type}`;
  function setCell(k, n) {
    const cols = portrait ? 2 : Math.min(3, n), rows = Math.ceil(n / cols);
    const cellW = portrait ? 1.15 : 1.25, cellH = 0.76;
    const col = k % cols, row = Math.floor(k / cols);
    const inRow = Math.min(cols, n - row * cols);
    return { cx: (col - (inRow - 1) / 2) * cellW, cz: (row - (rows - 1) / 2) * cellH };
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
      const step = 0.09, width = (cards.length - 1) * step + CW * SET_SCALE;
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
  function render() { renderer.render(scene, camera); handRenderer.render(handScene, camera); }
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
    render();
    raf = tweens.length ? requestAnimationFrame(tick) : 0;
  }
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }
  function fly(mesh, from, to, o = {}) {
    mesh.visible = false;
    mesh.position.copy(from); mesh.rotation.set(o.rx0 ?? 0, o.ry0 ?? 0, o.rz0 ?? 0);
    if (o.s0) mesh.scale.setScalar(o.s0);
    tweens.push({ mesh, from: from.clone(), to: to.clone(), t: -(o.delay || 0), dur: o.dur || 0.7, arc: o.arc ?? 0.8, spin: o.spin || 0,
      rx0: o.rx0 ?? 0, rx1: o.rx1 ?? 0, ry0: o.ry0 ?? 0, ry1: o.ry1 ?? 0, rz0: o.rz0 ?? 0, rz1: o.rz1 ?? 0, s0: o.s0, s1: o.s1, onStart: o.onStart, onDone: o.onDone });
    kick();
  }
  function later(seconds, fn) { const id = setTimeout(() => { timers.delete(id); fn(); }, seconds * 1000); timers.add(id); return id; }

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
    dealing.flights.forEach((m) => { m.visible = false; m.removeFromParent(); });
    deck.forEach((m) => { m.visible = false; });
    dealing = null;
    drawHand();
    refresh();
  }

  function startDeal(dealerRel, dealOrder) {
    stopDeal(); clearRest();
    const target = [...state.counts];
    dealing = { shown: [0, 0, 0, 0, 0, 0], flights: [], shuffleTime: 0 };
    hand.incoming.clear(); hand.gone.clear(); drawHand();
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
      const card = rel === 0 ? hand.cards[ownIndex] : null;
      const slot = rel === 0 ? handSlot(ownIndex, target[0], false) : null;
      const mesh = card ? newFace(card, FLY_SCALE) : newBack(FLY_SCALE);
      flyGroup.add(mesh);
      dealing.flights.push(mesh);
      const s = spots[rel];
      fly(mesh, new THREE.Vector3(0, 0.22, 0), slot ? slot.p : seatSpot(rel), {
        delay: SHUFFLE_SECONDS + k * gap, dur: slot ? 1.1 : 0.8, arc: slot ? 1.15 : 0.9, spin: slot ? 0.35 : 1.4,
        rx1: slot?.rx || 0, ry0: 0.2, ry1: slot ? slot.ry : -s.angle + Math.PI / 2,
        rz0: card ? Math.PI : 0, rz1: slot?.rz || 0, s0: FLY_SCALE, s1: slot ? HAND_SCALE : FLY_SCALE,
        onDone: () => {
          mesh.visible = false;
          if (!dealing) return;
          dealing.shown[rel]++;
          if (rel === 0) drawHand();
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

  // Where a card leaves from: the player's own hand (where it was last held) or a seat's pile.
  function startOf(rel, card) {
    if (rel === 0) {
      const last = hand.last.get(keyOf(card));
      if (last) return { p: last.p.clone(), rx: last.rx, ry: last.ry, rz: last.rz || 0, s: HAND_SCALE };
      return { p: handEdge(), rx: HAND_LEAN, ry: 0, rz: 0, s: HAND_SCALE };
    }
    return { p: stackBase(spots[rel]).setY(0.04), rx: 0, ry: -spots[rel].angle + Math.PI / 2, rz: Math.PI, s: STACK_SCALE };
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
    // turns over into their pile.
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
      it.meshes.forEach((m, i) => fly(m, m.position.clone(), seatSpot(toRel), { delay: i * 0.05, dur: 0.5, arc: 0.3, ry0: m.rotation.y, ry1: m.rotation.y, rz0: 0, rz1: Math.PI, s0: FLY_SCALE, s1: STACK_SCALE, onDone: () => { flyGroup.remove(m); render(); } }));
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
      meshes.forEach((m, k) => fly(m, m.position.clone(), new THREE.Vector3(cx + (k - (n - 1) / 2) * 0.09, 0.02 + k * 0.002, cz),
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
  const hand = { cards: [], hover: null, selected: new Set(), last: new Map(), incoming: new Set(), gone: new Set(), drag: null };
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
    const available = dealing ? hand.cards.slice(0, dealing.shown[0]) : hand.cards;
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
      fly(m, old.p, m.position.clone(), { dur:0.13, arc:0, rx0:old.rx, rx1:m.rotation.x, ry0:old.ry, ry1:m.rotation.y, rz0:old.rz, rz1:m.rotation.z });
      tweens[tweens.length - 1].handHover = true;
    });
  }
  const raycaster = new THREE.Raycaster();
  // (the camera's view offset is part of its projection, so screen px map straight to rays)
  const aim = (sx, sy) => raycaster.setFromCamera(new THREE.Vector2((sx / size.w) * 2 - 1, 1 - (sy / size.h) * 2), camera);
  function pickHand(sx, sy) {
    const shown = [...handPool.values()].filter((m) => m.visible);
    if (!shown.length) return null;
    aim(sx, sy);
    // Keep the resting fan tappable after hover raises a card away from
    // the pointer; otherwise a drag can accidentally start rotating the table.
    const cards = hand.cards.filter(c => !hand.gone.has(keyOf(c)));
    const proxies = shown.map(m => {
      const card = m.userData.card, i = cards.findIndex(c => keyOf(c) === keyOf(card));
      const slot = handSlot(i, cards.length, hand.selected.has(keyOf(card)));
      const proxy = m.userData.pickProxy || (m.userData.pickProxy = new THREE.Mesh(cardGeo, edgeMat));
      proxy.position.copy(slot.p); proxy.rotation.order = 'XYZ'; proxy.rotation.set(slot.rx,slot.ry,slot.rz || 0);
      proxy.scale.copy(m.scale); proxy.userData.card = card; proxy.updateMatrixWorld(true);
      return proxy;
    });
    const hit = raycaster.intersectObjects(proxies, false)[0] || raycaster.intersectObjects(shown, false)[0];
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

  return {
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
      hand.cards = [...cards].sort(byHandOrder); hand.selected = new Set(selectedKeys); drawHand(); render();
    },
    getLayout: seatLayout,
    /** The hand's own layer: the page places it above the seats (same size as the container). */
    handLayer: handRenderer.domElement,
    pickHand, hoverHand, dragHand, endDragHand,
    /** contributors: [{ rel, cards }] */
    lay,
    startDeal, stopDeal, pass, clearRest,
    dispose() {
      alive = false; cancelAnimationFrame(raf); timers.forEach((id) => clearTimeout(id)); tweens.length = 0;
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
