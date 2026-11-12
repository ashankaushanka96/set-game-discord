// The game room drawn in 3D (three.js): floor, table, chairs, each opponent's face-down
// cards, the laid-down sets in the middle of the felt, and the cards that fly when the
// round is dealt or a card changes hands. It follows the real game state.
// Players, bubbles, arrows, the player's own hand and every button stay ordinary page
// elements on top; this module tells the page where each seat sits on screen.
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
const faceTexture = (rank, suit) => canvasTexture(200, 284, (g) => {
  const [sym, color] = SUIT[suit] || ['?', '#222'];
  g.fillStyle = '#fbf6e6'; g.beginPath(); g.roundRect(0, 0, 200, 284, 18); g.fill();
  g.strokeStyle = '#b9a879'; g.lineWidth = 3; g.stroke();
  g.fillStyle = color; g.textAlign = 'center';
  g.font = '700 58px Georgia, serif'; g.fillText(rank, 44, 62);
  g.font = '52px serif'; g.fillText(sym, 44, 114);
  g.font = '130px serif'; g.fillText(sym, 112, 226);
});

export function createGameTable3D(container, { portrait }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  container.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1512);
  scene.fog = new THREE.Fog(0x0d1512, 16, 42);
  const camera = new THREE.PerspectiveCamera(portrait ? 50 : 40, 1, 0.1, 100);
  scene.add(new THREE.AmbientLight(0xfff1d6, 0.6));
  const lamp = new THREE.SpotLight(0xffe2b0, 170, 34, 0.8, 0.5, 1.6);
  lamp.position.set(0.5, 8.5, 1.5); lamp.castShadow = true; lamp.shadow.mapSize.set(1024, 1024); lamp.shadow.bias = -0.0005;
  scene.add(lamp, lamp.target);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.35); fill.position.set(-4, 5, 6); scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.6; floor.receiveShadow = true; scene.add(floor);

  // A wide table on wide screens; on a tall phone screen the table runs away from the player.
  const RX = portrait ? 2.15 : 3.3, RZ = portrait ? 3.0 : 2.25;
  const wood = new THREE.MeshStandardMaterial({ color: 0x4d3020, roughness: 0.55, metalness: 0.05 });
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
    const pos = new THREE.Vector3(dir.x * RX * 1.2, 0, dir.z * RZ * 1.24);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.7 });
    const chair = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.5, 40), chairMat);
    chair.position.set(pos.x, -0.45, pos.z); chair.castShadow = true; chair.receiveShadow = true; scene.add(chair);
    return { rel, angle: a, dir, pos, chair, chairMat, tangent: new THREE.Vector3(-dir.z, 0, dir.x) };
  });

  // ---- cards ----
  const cardGeo = new THREE.BoxGeometry(CW, CT, CH);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d2, roughness: 0.8 });
  const backMat = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.6 });
  const newBack = (scale) => { const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, backMat, backMat, edgeMat, edgeMat]); m.castShadow = true; m.receiveShadow = true; m.visible = false; m.scale.setScalar(scale); scene.add(m); return m; };
  const backs = Array.from({ length: 54 }, () => newBack(STACK_SCALE));
  const deck = Array.from({ length: 16 }, () => newBack(FLY_SCALE));       // the pile being dealt from
  const faceMats = new Map();
  const faceMat = (rank, suit) => {
    const key = `${rank}|${suit}`;
    if (!faceMats.has(key)) faceMats.set(key, new THREE.MeshStandardMaterial({ map: faceTexture(rank, suit), roughness: 0.55 }));
    return faceMats.get(key);
  };
  const newFace = (card, scale) => { const m = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, faceMat(card.rank, card.suit), backMat, edgeMat, edgeMat]); m.castShadow = true; m.scale.setScalar(scale); return m; };
  const setGroup = new THREE.Group(); scene.add(setGroup);
  const flyGroup = new THREE.Group(); scene.add(flyGroup);
  const plateGeo = new THREE.BoxGeometry(1, 0.012, 1);

  const stackBase = (s) => new THREE.Vector3(s.dir.x * RX * 0.7, 0, s.dir.z * RZ * 0.68);
  const handEdge = () => new THREE.Vector3(0, 0.5, RZ * 1.5);              // towards the player's own hand
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

  function drawSets(sets) {
    setGroup.clear();
    const n = sets.length;
    if (!n) return;
    const cols = portrait ? 2 : Math.min(4, n), rows = Math.ceil(n / cols);
    const cellW = portrait ? 1.55 : 1.42, cellH = 0.62;
    sets.forEach((set, k) => {
      const col = k % cols, row = Math.floor(k / cols);
      const inRow = Math.min(cols, n - row * cols);
      const cx = (col - (inRow - 1) / 2) * cellW, cz = (row - (rows - 1) / 2) * cellH;
      const cards = [...(set.cards || [])].sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank));
      const step = 0.155, width = (cards.length - 1) * step + CW * SET_SCALE;
      const plate = new THREE.Mesh(plateGeo, new THREE.MeshStandardMaterial({ color: TEAM_COLOR[set.owner_team] || 0x888888, roughness: 0.6, transparent: true, opacity: 0.85 }));
      plate.scale.set(width + 0.12, 1, CH * SET_SCALE + 0.12); plate.position.set(cx, 0.006, cz); plate.receiveShadow = true; setGroup.add(plate);
      cards.forEach((card, i) => {
        const m = newFace(card, SET_SCALE);
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
  function render() { renderer.render(scene, camera); }
  function tick(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05); lastT = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t += dt;
      if (tw.t < 0) continue;
      if (!tw.started) { tw.started = true; tw.mesh.visible = true; tw.onStart?.(); }
      const raw = Math.min(1, tw.t / tw.dur), k = ease(raw);
      tw.mesh.position.lerpVectors(tw.from, tw.to, k);
      tw.mesh.position.y += Math.sin(Math.PI * k) * tw.arc;
      tw.mesh.rotation.y = tw.ry0 + (tw.ry1 - tw.ry0) * k + Math.sin(Math.PI * k) * tw.spin;
      tw.mesh.rotation.z = tw.rz0 + (tw.rz1 - tw.rz0) * k;
      if (raw >= 1) { tweens.splice(i, 1); tw.onDone?.(); }
    }
    render();
    raf = tweens.length ? requestAnimationFrame(tick) : 0;
  }
  function kick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(tick); } }
  function fly(mesh, from, to, o = {}) {
    mesh.position.copy(from); mesh.rotation.set(0, o.ry0 ?? 0, o.rz0 ?? 0);
    tweens.push({ mesh, from: from.clone(), to: to.clone(), t: -(o.delay || 0), dur: o.dur || 0.7, arc: o.arc ?? 0.8, spin: o.spin || 0,
      ry0: o.ry0 ?? 0, ry1: o.ry1 ?? 0, rz0: o.rz0 ?? 0, rz1: o.rz1 ?? 0, onStart: o.onStart, onDone: o.onDone });
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
    dealing.flights.forEach((m) => { m.visible = false; scene.remove(m); });
    deck.forEach((m) => { m.visible = false; });
    dealing = null;
    refresh();
  }

  function startDeal(dealerRel) {
    stopDeal(); clearRest();
    const target = [...state.counts];
    dealing = { shown: [0, 0, 0, 0, 0, 0], flights: [] };
    deck.forEach((m, i) => { m.visible = true; m.position.set(0, CT + i * 0.012, 0); m.rotation.set(0, 0.2 + (i % 3) * 0.03, 0); });
    // who gets each card, in turn, starting to the dealer's left
    const order = []; const given = [0, 0, 0, 0, 0, 0];
    for (let k = 0; order.length < target.reduce((a, b) => a + b, 0) && k < 400; k++) {
      const rel = (dealerRel + 1 + k) % 6;
      if (given[rel] < target[rel]) { given[rel]++; order.push(rel); }
    }
    const total = order.length || 1, gap = (DEAL_SECONDS - 0.9) / total;
    order.forEach((rel, k) => {
      const mesh = newBack(FLY_SCALE); dealing.flights.push(mesh);
      const s = spots[rel];
      fly(mesh, new THREE.Vector3(0, 0.22, 0), seatSpot(rel), {
        delay: SHUFFLE_SECONDS + k * gap, dur: 0.8, arc: 0.9, spin: 1.4, ry0: 0.2, ry1: -s.angle + Math.PI / 2,
        onDone: () => {
          mesh.visible = false;
          if (!dealing) return;
          dealing.shown[rel]++;
          const left = total - (k + 1);
          deck.forEach((m, i) => { m.visible = i < Math.ceil((left / total) * deck.length); });
          drawStacks(dealing.shown);
        },
      });
      tweens[tweens.length - 1].deal = true;
    });
    refresh();   // seats start empty; their cards arrive one by one
  }

  function pass(fromRel, toRel, cards) {
    if (!cards?.length || fromRel === toRel) return;
    clearRest(toRel);
    const shown = cards.slice(0, 4);
    const meshes = shown.map((card) => { const m = newFace(card, FLY_SCALE); flyGroup.add(m); return m; });
    const from = seatSpot(fromRel), rest = restSpot(toRel), s = spots[toRel];
    meshes.forEach((m, i) => {
      const off = (i - (shown.length - 1) / 2) * 0.34;
      const to = rest.clone().addScaledVector(s.tangent, off).setY(0.03 + i * 0.004);
      fly(m, from, to, { delay: i * 0.08, dur: 0.9, arc: 1.5, spin: 3.0, rz0: Math.PI, rz1: 0, ry1: toRel === 0 ? 0 : -s.angle + Math.PI / 2 });
    });
    const timer = later(REST_SECONDS, () => {
      const it = resting.get(toRel); if (!it) return;
      resting.delete(toRel);
      // tuck the cards into the receiver's hand
      it.meshes.forEach((m, i) => fly(m, m.position.clone(), seatSpot(toRel), { delay: i * 0.05, dur: 0.5, arc: 0.3, ry0: m.rotation.y, ry1: m.rotation.y, rz0: 0, rz1: toRel === 0 ? 0 : Math.PI, onDone: () => { flyGroup.remove(m); render(); } }));
    });
    resting.set(toRel, { meshes, timer });
  }

  // ---- camera: looks down the table from the player's seat, as close as the seats allow ----
  const target = new THREE.Vector3(0, 0, portrait ? 0.15 : 0.25);
  const viewDir = (portrait ? new THREE.Vector3(0, 0.83, 0.56) : new THREE.Vector3(0, 0.78, 0.63)).normalize();
  const anchors = spots.map((s) => new THREE.Vector3(s.pos.x, 0.2, s.pos.z));
  let size = { w: 1, h: 1 };
  function project(v) {
    const p = v.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * size.w, y: (-p.y * 0.5 + 0.5) * size.h };
  }
  /** `area` is where the seats must fit, in px inside the container (the canvas fills the container). */
  function fit(area) {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h || !area?.width || !area?.height) return false;
    size = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const padX = Math.min(38, area.width * 0.1), padTop = 38, padBottom = 34;
    const cx = area.left + area.width / 2, cy = area.top + area.height / 2;
    const place = (d) => {
      camera.position.copy(target).addScaledVector(viewDir, d);
      camera.lookAt(target);
      camera.clearViewOffset(); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      // slide the picture so the table's middle sits in the middle of the area
      const c = project(target);
      camera.setViewOffset(w, h, c.x - cx, c.y - cy, w, h);
      camera.updateProjectionMatrix();
    };
    let lo = 4, hi = 44;
    for (let i = 0; i < 18; i++) {
      const d = (lo + hi) / 2; place(d);
      const ok = anchors.every((a) => { const p = project(a); return p.x >= area.left + padX && p.x <= area.left + area.width - padX && p.y >= area.top + padTop && p.y <= area.top + area.height - padBottom; });
      if (ok) hi = d; else lo = d;
    }
    place(hi);
    return true;
  }

  return {
    /** counts/teams are indexed by position relative to the player (0 = the player). */
    update({ counts, teams, sets }) {
      state = { counts, teams, sets };
      spots.forEach((s) => s.chairMat.color.set(teams[s.rel] === 'A' ? 0x24404f : teams[s.rel] === 'B' ? 0x4a2c29 : 0x3a2c22));
      drawSets(sets);
      refresh();
    },
    /** Refits the camera; returns each seat's screen position (px, relative to `area`) and the table centre. */
    layout(area) {
      if (!fit(area)) return null;
      render();
      const rel = (p) => ({ x: p.x - area.left, y: p.y - area.top });
      return { seats: spots.map((s, i) => ({ rel: i, ...rel(project(anchors[i])) })), center: rel(project(new THREE.Vector3(0, 0, 0))), width: area.width, height: area.height };
    },
    startDeal, stopDeal, pass, clearRest,
    dispose() {
      cancelAnimationFrame(raf); timers.forEach((id) => clearTimeout(id)); tweens.length = 0;
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
      faceMats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
