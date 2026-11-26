// Real-time 3D cartoon scenes (Three.js): characters built from text descriptions, 3D worlds from scene text,
// animated (blink, talk, gesture, walk, wave, jump, float) with a cinematic camera that follows the speaker.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js";

// ---------------------------------------------------------------- helpers
const C = (hex) => new THREE.Color(hex);
function light(color, intensity, dist, x, y, z) {
  const l = new THREE.PointLight(color, intensity, dist);
  l.position.set(x, y, z);
  return l;
}
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...o });
function mesh(geo, m, parent, [x, y, z] = [0, 0, 0], shadow = true) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = shadow;
  me.receiveShadow = shadow;
  parent?.add(me);
  return me;
}
const sphere = (r, w = 24, h = 18) => new THREE.SphereGeometry(r, w, h);
const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 8, 16);
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const COLOR_WORDS = { red: "#d9433b", crimson: "#b8233a", pink: "#f07aa6", rose: "#e8668f", purple: "#8e5bd1", violet: "#7d4fd0",
  lavender: "#b49be6", blue: "#3d7ee0", navy: "#22346e", sky: "#69b7ff", teal: "#1fa5a0", turquoise: "#2fc2c0", green: "#3fae5a",
  mint: "#7fdcb0", yellow: "#f2c43d", gold: "#e0a92e", golden: "#e6b23a", orange: "#f08a2c", white: "#f2f2f2", black: "#25222a",
  grey: "#9a9aa3", gray: "#9a9aa3", brown: "#7a4a2a", beige: "#d9c4a0", silver: "#c6ccd6" };
const HAIR_WORDS = { blonde: "#e8c36a", blond: "#e8c36a", golden: "#e0b04a", black: "#1e1814", "dark-brown": "#3b2416",
  "dark brown": "#3b2416", chestnut: "#6b3a1f", brown: "#5a3520", red: "#b04420", ginger: "#c65a24", auburn: "#8a3a22",
  grey: "#cfcfcf", gray: "#cfcfcf", white: "#ededed", silver: "#d3d6da", pink: "#f39ac0", blue: "#4f7fe0", purple: "#8e5bd1" };

function colorNear(text, nouns) {
  const re = new RegExp(`((?:[a-z-]+\\s+){0,3})(?:${nouns})\\b`);
  const m = text.match(re);
  if (!m) return null;
  const words = m[1].trim().split(/\s+/).reverse();
  for (const w of words) if (COLOR_WORDS[w]) return COLOR_WORDS[w];
  return null;
}

/** Reads a character description ("a 6-year-old girl with long curly brown hair, teal dress...") into 3D traits. */
export function traits(look = "", name = "") {
  const t = ` ${look} ${name} `.toLowerCase();
  const has = (re) => re.test(t);
  const kind = has(/robot|android/) ? "robot" : has(/\bbee\b|honeybee|bumblebee/) ? "bee" : has(/\bstar\b/) ? "star"
    : has(/puppy|\bdog\b|doggy/) ? "dog" : has(/\bcat\b|kitten|kitty/) ? "cat" : has(/bunny|rabbit/) ? "bunny"
    : has(/\bbird\b|owl|parrot|chick/) ? "bird" : "human";
  const female = has(/\b(girl|woman|lady|grandma|grandmother|granny|mom|mother|mum|princess|queen|sister|aunt|she|her|daughter)\b/);
  const elder = has(/grandma|grandmother|granny|grandpa|grandfather|old|elderly/);
  const adult = elder || has(/\b(woman|man|mother|father|mom|dad|teacher|queen|king|doctor|farmer)\b/);
  const hairM = t.match(/((?:[a-z-]+[\s,]+){0,4})hair/);
  let hair = elder ? "#d6d6d6" : "#4a2c1a";
  if (hairM) {
    const words = hairM[1].replace(/,/g, " ").trim().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const two = words.slice(i, i + 2).join(" ");
      if (HAIR_WORDS[two]) hair = HAIR_WORDS[two];
      else if (HAIR_WORDS[words[i]]) hair = HAIR_WORDS[words[i]];
    }
  }
  const hairStyle = has(/\bbald\b/) ? "bald" : has(/\bbun\b/) ? "bun" : has(/curly|curls/) ? "curly" : has(/ponytail|pony tail/) ? "ponytail"
    : has(/braid|plait/) ? "braid" : has(/long|wavy/) ? "long" : female && !elder ? "long" : "short";
  const dress = has(/dress|skirt|gown|frock/);
  const outfit = colorNear(t, "dress|skirt|gown|frock|shirt|t-shirt|hoodie|jacket|sweater|top|coat|shawl|overalls|uniform|kurta")
    || Object.entries(COLOR_WORDS).find(([w]) => new RegExp(`\\b${w}\\b`).test(t.replace(hairM?.[0] || "", "")))?.[1] || (female ? "#f07aa6" : "#3d7ee0");
  const pants = colorNear(t, "jeans|pants|trousers|shorts") || (has(/jeans/) ? "#3a5ea8" : "#34507a");
  const eyeM = t.match(/(blue|green|brown|hazel|grey|gray|black)\s+eyes/);
  const eyes = { blue: "#3f86e0", green: "#3fae5a", hazel: "#8a6a2a", grey: "#8f99a6", gray: "#8f99a6", black: "#1e1814" }[eyeM?.[1]] || "#5b3a22";
  const skin = has(/dark[- ]skin|brown[- ]skin|dark complexion/) ? "#9c6b45" : has(/tan|olive/) ? "#d8a27a" : "#f1c19c";
  const body = colorNear(t, "fur|feathers|body|stripes") || (kind === "dog" ? "#d9a35b" : kind === "cat" ? "#f0a050"
    : kind === "bunny" ? "#f2eee8" : kind === "bird" ? "#6fc3ff" : kind === "robot" ? "#8fb4e8" : "#ffd23f");
  return { kind, female, elder, adult, hair, hairStyle, dress, outfit, pants, eyes, skin, body,
    glasses: has(/glasses|spectacles/), flower: has(/flower|blossom/), backpack: has(/backpack|school bag/),
    cap: has(/graduation cap|mortarboard/) ? "grad" : has(/\bcap\b|\bhat\b/) ? "hat" : has(/crown|tiara/) ? "crown" : null,
    collar: has(/collar/) ? colorNear(t, "collar") || "#d9433b" : null };
}

// ---------------------------------------------------------------- faces
function addEyes(head, tr, y, z, spread, r) {
  const eyes = new THREE.Group();
  head.add(eyes);
  const white = mat("#ffffff", { roughness: 0.25 });
  const iris = mat(tr.eyes, { roughness: 0.3 });
  const pupil = mat("#0d0b10", { roughness: 0.2 });
  const shine = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  const list = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * spread, y, z);
    mesh(sphere(r), white, e).scale.set(1, 1.1, 0.6);
    mesh(sphere(r * 0.62), iris, e, [0, -r * 0.05, r * 0.42]).scale.set(1, 1.1, 0.5);
    mesh(sphere(r * 0.33), pupil, e, [0, -r * 0.05, r * 0.56]).scale.set(1, 1.1, 0.4);
    mesh(sphere(r * 0.16, 10, 8), shine, e, [r * 0.22, r * 0.25, r * 0.62], false);
    eyes.add(e);
    list.push(e);
  }
  return list;
}

function addMouth(head, y, z, w) {
  const g = new THREE.Group();
  g.position.set(0, y, z);
  head.add(g);
  const inner = mesh(sphere(w, 20, 14), mat("#5a1622", { roughness: 0.7 }), g, [0, 0, 0], false);
  inner.scale.set(1, 0.15, 0.35);
  const tongue = mesh(sphere(w * 0.55, 14, 10), mat("#e8657a"), g, [0, -w * 0.25, w * 0.08], false);
  tongue.scale.set(1, 0.5, 0.4);
  const smile = mesh(new THREE.TorusGeometry(w * 0.9, w * 0.13, 8, 20, Math.PI), mat("#7a2b30"), g, [0, w * 0.45, 0], false);
  smile.rotation.z = Math.PI;
  return { g, inner, tongue, smile, w };
}

// ---------------------------------------------------------------- characters
function human(tr) {
  const root = new THREE.Group();
  const skin = mat(tr.skin, { roughness: 0.5 });
  const cloth = mat(tr.outfit, { roughness: 0.75 });
  const pantsM = mat(tr.pants, { roughness: 0.8 });
  const shoes = mat(tr.female ? "#f5f0f2" : "#3b2a22", { roughness: 0.5 });
  const hairM = mat(tr.hair, { roughness: 0.45 });
  const rig = {};
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.1, 0.46, 0);
    mesh(capsule(0.07, 0.28), tr.dress ? skin : pantsM, leg, [0, -0.2, 0]);
    mesh(sphere(0.09), shoes, leg, [0, -0.41, 0.04]).scale.set(1, 0.55, 1.4);
    root.add(leg);
    rig[sx < 0 ? "legL" : "legR"] = leg;
  }
  const body = new THREE.Group();
  root.add(body);
  rig.body = body;
  if (tr.dress) {
    const pts = [[0.0, 0.4], [0.33, 0.4], [0.3, 0.5], [0.2, 0.72], [0.17, 0.88], [0.0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
    mesh(new THREE.LatheGeometry(pts, 32), cloth, body);
  } else {
    mesh(capsule(0.19, 0.22), cloth, body, [0, 0.68, 0]).scale.set(1, 1, 0.85);
    mesh(sphere(0.19), pantsM, body, [0, 0.5, 0]).scale.set(1, 0.6, 0.85);
  }
  if (tr.backpack) mesh(new THREE.BoxGeometry(0.3, 0.32, 0.14), mat("#8e5bd1"), body, [0, 0.7, -0.2]);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.23, 0.84, 0);
    mesh(sphere(0.075), cloth, arm);
    mesh(capsule(0.05, 0.24), skin, arm, [0, -0.17, 0]);
    mesh(sphere(0.06), skin, arm, [0, -0.34, 0]);
    arm.rotation.z = sx * 0.12;
    root.add(arm);
    rig[sx < 0 ? "armL" : "armR"] = arm;
  }
  mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), skin, root, [0, 0.92, 0]);
  const head = new THREE.Group();
  head.position.set(0, 0.96, 0);
  root.add(head);
  rig.head = head;
  const R = 0.3;
  mesh(sphere(R, 32, 24), skin, head, [0, R * 0.85, 0]).scale.set(1, 0.95, 0.95);
  for (const sx of [-1, 1]) mesh(sphere(0.06), skin, head, [sx * R * 0.97, R * 0.8, 0]);
  rig.eyes = addEyes(head, tr, R * 0.9, R * 0.8, R * 0.36, R * 0.24);
  for (const sx of [-1, 1]) {
    const brow = mesh(capsule(0.012, 0.07), hairM, head, [sx * R * 0.36, R * 1.27, R * 0.82], false);
    brow.rotation.z = Math.PI / 2 + sx * 0.15;
  }
  mesh(sphere(0.035), skin, head, [0, R * 0.68, R * 0.95]);
  const blush = mat("#ff8f9a", { transparent: true, opacity: 0.45 });
  for (const sx of [-1, 1]) mesh(sphere(0.05), blush, head, [sx * R * 0.6, R * 0.55, R * 0.72], false).scale.set(1, 0.6, 0.3);
  rig.mouth = addMouth(head, R * 0.42, R * 0.9, 0.055);
  if (tr.hairStyle !== "bald") {
    const cap = mesh(new THREE.SphereGeometry(R * 1.06, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, head, [0, R * 0.9, -0.01]);
    cap.rotation.x = -0.25;
    mesh(sphere(R * 0.75), hairM, head, [0, R * 1.35, R * 0.35]).scale.set(1.15, 0.35, 0.6); // fringe
    if (tr.hairStyle === "long" || tr.hairStyle === "braid") {
      mesh(capsule(R * 0.8, R * 1.1), hairM, head, [0, R * 0.3, -R * 0.45]).scale.set(1.15, 1, 0.55);
    } else if (tr.hairStyle === "curly") {
      const r = rng(5);
      for (let i = 0; i < 30; i++) { // curls only on the sides, top and back, never over the face
        const a = Math.PI * 0.85 + r() * Math.PI * 1.3; // angles whose z is behind or beside the face
        const h = r();
        const rr = R * (1.02 + 0.12 * r());
        const z = Math.min(Math.sin(a) * rr * 0.9, R * 0.05) - R * 0.1;
        mesh(sphere(R * (0.19 + 0.09 * r()), 12, 10), hairM, head, [Math.cos(a) * rr, R * (0.15 + 1.55 * h), z]);
      }
      for (let i = 0; i < 7; i++) mesh(sphere(R * 0.2, 12, 10), hairM, head, [(i - 3) * R * 0.27, R * 1.72, -R * 0.15 + (i % 2) * R * 0.12]);
      mesh(capsule(R * 0.75, R * 0.6), hairM, head, [0, R * 0.4, -R * 0.45]).scale.set(1.25, 1, 0.6);
    } else if (tr.hairStyle === "bun") {
      mesh(sphere(R * 0.38), hairM, head, [0, R * 1.85, -R * 0.35]);
    } else if (tr.hairStyle === "ponytail") {
      mesh(capsule(R * 0.22, R * 0.9), hairM, head, [0, R * 0.7, -R * 1.05]).rotation.x = 0.5;
    }
  }
  if (tr.flower) {
    const fl = new THREE.Group();
    fl.position.set(R * 0.75, R * 1.45, R * 0.35);
    head.add(fl);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      mesh(sphere(0.035, 10, 8), mat("#fff176"), fl, [Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0]);
    }
    mesh(sphere(0.028, 10, 8), mat("#ff9f1c"), fl, [0, 0, 0.01]);
  }
  if (tr.glasses) {
    const gm = mat("#2b2233", { metalness: 0.3 });
    for (const sx of [-1, 1]) mesh(new THREE.TorusGeometry(R * 0.27, 0.01, 8, 24), gm, head, [sx * R * 0.36, R * 0.9, R * 0.97], false);
    mesh(capsule(0.008, R * 0.18), gm, head, [0, R * 0.95, R * 1.0], false).rotation.z = Math.PI / 2;
  }
  addHat(head, tr, R);
  root.scale.setScalar(tr.adult ? 1.3 : 1);
  return { root, rig, height: (tr.adult ? 1.3 : 1) * 1.55, headY: (tr.adult ? 1.3 : 1) * 1.25, fly: false };
}

function addHat(head, tr, R) {
  if (tr.cap === "grad") {
    mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.65, R * 0.3, 20), mat("#1e1b24"), head, [0, R * 1.75, 0]);
    const board = mesh(new THREE.BoxGeometry(R * 1.6, 0.03, R * 1.6), mat("#1e1b24"), head, [0, R * 1.92, 0]);
    board.rotation.y = Math.PI / 4;
    mesh(capsule(0.01, R * 0.6), mat("#f2c43d"), head, [R * 0.6, R * 1.6, R * 0.2]);
  } else if (tr.cap === "hat") {
    mesh(new THREE.SphereGeometry(R * 1.08, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(tr.outfit), head, [0, R * 1.0, 0]);
    mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.02, 24), mat(tr.outfit), head, [0, R * 1.05, R * 0.5]).scale.set(1, 1, 0.6);
  } else if (tr.cap === "crown") {
    mesh(new THREE.CylinderGeometry(R * 0.55, R * 0.6, R * 0.35, 8, 1, true), mat("#e6b23a", { metalness: 0.7, roughness: 0.3 }), head, [0, R * 1.85, 0]);
  }
}

function animal(tr) {
  const root = new THREE.Group();
  const fur = mat(tr.body, { roughness: 0.8 });
  const light = mat(new THREE.Color(tr.body).lerp(C("#ffffff"), 0.45), { roughness: 0.8 });
  const rig = {};
  const body = new THREE.Group();
  root.add(body);
  rig.body = body;
  mesh(capsule(0.2, 0.3), fur, body, [0, 0.38, -0.05]).rotation.x = Math.PI / 2;
  rig.legs = [];
  for (const [x, z] of [[-0.12, 0.15], [0.12, 0.15], [-0.12, -0.22], [0.12, -0.22]]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.3, z);
    mesh(capsule(0.055, 0.14), fur, leg, [0, -0.15, 0]);
    root.add(leg);
    rig.legs.push(leg);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.45, -0.38);
  mesh(capsule(0.04, tr.kind === "cat" ? 0.35 : 0.18), fur, tail, [0, 0.12, -0.04]).rotation.x = -0.6;
  root.add(tail);
  rig.tail = tail;
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.2);
  root.add(head);
  rig.head = head;
  const R = 0.24;
  mesh(sphere(R, 28, 20), fur, head, [0, R * 0.6, 0]);
  mesh(sphere(R * 0.5), light, head, [0, R * 0.25, R * 0.75]).scale.set(1.2, 0.8, 0.9);
  mesh(sphere(R * 0.14), mat("#1e1814", { roughness: 0.3 }), head, [0, R * 0.45, R * 1.15]);
  rig.eyes = addEyes(head, tr, R * 0.8, R * 0.72, R * 0.38, R * 0.24);
  rig.mouth = addMouth(head, R * 0.05, R * 1.02, 0.045);
  rig.ears = [];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(sx * R * 0.7, R * 1.2, 0);
    if (tr.kind === "cat") mesh(new THREE.ConeGeometry(R * 0.32, R * 0.6, 12), fur, ear, [0, R * 0.2, 0]);
    else if (tr.kind === "bunny") mesh(capsule(R * 0.15, R * 1.1), fur, ear, [0, R * 0.7, 0]).scale.set(1, 1, 0.5);
    else {
      const flop = mesh(sphere(R * 0.3), mat(new THREE.Color(tr.body).multiplyScalar(0.7)), ear, [sx * R * 0.15, -R * 0.35, 0]);
      flop.scale.set(0.6, 1.4, 0.35);
    }
    head.add(ear);
    rig.ears.push(ear);
  }
  if (tr.collar) mesh(new THREE.TorusGeometry(0.15, 0.025, 8, 24), mat(tr.collar), root, [0, 0.52, 0.17]).rotation.x = Math.PI / 2.4;
  addHat(head, tr, R * 0.9);
  return { root, rig, height: 0.95, headY: 0.75, fly: false };
}

function bee(tr) {
  const root = new THREE.Group();
  const rig = {};
  const body = new THREE.Group();
  body.position.y = 0.55;
  root.add(body);
  rig.body = body;
  const R = 0.28;
  mesh(sphere(R, 32, 24), mat("#ffd23f", { roughness: 0.6 }), body).scale.set(1, 1, 1.05);
  for (const y of [-0.12, 0.02]) {
    const s = mesh(new THREE.TorusGeometry(Math.sqrt(R * R - y * y) * 0.98, 0.035, 10, 32), mat("#26201c"), body, [0, y - 0.06, 0]);
    s.rotation.x = Math.PI / 2;
  }
  rig.head = body;
  rig.eyes = addEyes(body, tr, R * 0.35, R * 0.78, R * 0.38, R * 0.26);
  rig.mouth = addMouth(body, R * 0.02, R * 0.97, 0.05);
  rig.wings = [];
  const wingM = new THREE.MeshStandardMaterial({ color: "#dff4ff", transparent: true, opacity: 0.55, roughness: 0.1 });
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sx * R * 0.5, R * 0.75, -R * 0.4);
    mesh(sphere(R * 0.55), wingM, w, [sx * R * 0.5, R * 0.2, 0], false).scale.set(1, 0.6, 0.08);
    body.add(w);
    rig.wings.push(w);
  }
  for (const sx of [-1, 1]) {
    mesh(capsule(0.01, 0.16), mat("#26201c"), body, [sx * 0.08, R * 1.1, 0.05], false).rotation.z = -sx * 0.4;
    mesh(sphere(0.03), mat("#26201c"), body, [sx * 0.13, R * 1.38, 0.05], false);
  }
  addHat(body, { ...tr, outfit: "#26201c" }, R * 0.85);
  return { root, rig, height: 0.9, headY: 0.6, fly: true };
}

function star(tr) {
  const root = new THREE.Group();
  const rig = {};
  const body = new THREE.Group();
  body.position.y = 0.6;
  root.add(body);
  rig.body = rig.head = body;
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? 0.15 : 0.36;
    const [x, y] = [Math.cos(a) * r, Math.sin(a) * r];
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 4 });
  geo.center();
  mesh(geo, mat("#ffcf3a", { emissive: "#ffb200", emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2 }), body);
  const glow = new THREE.PointLight("#ffd76a", 2.5, 3);
  body.add(glow);
  rig.glow = glow;
  rig.eyes = addEyes(body, tr, 0.04, 0.12, 0.08, 0.055);
  rig.mouth = addMouth(body, -0.07, 0.12, 0.03);
  return { root, rig, height: 0.9, headY: 0.65, fly: true };
}

function bird(tr) {
  const c = bee({ ...tr, cap: tr.cap });
  c.root.traverse((o) => {
    if (o.isMesh && o.material.color?.getHexString() === "ffd23f") o.material = mat(tr.body);
    if (o.isMesh && o.material.color?.getHexString() === "26201c" && o.geometry.type === "TorusGeometry") o.visible = false;
  });
  mesh(new THREE.ConeGeometry(0.05, 0.12, 12), mat("#f39c12"), c.rig.body, [0, 0.02, 0.32]).rotation.x = Math.PI / 2;
  return c;
}

function robot(tr) {
  const root = new THREE.Group();
  const m = mat(tr.body, { metalness: 0.6, roughness: 0.35 });
  const dark = mat("#1d2440", { roughness: 0.3 });
  const rig = {};
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.11, 0.42, 0);
    mesh(new THREE.BoxGeometry(0.12, 0.4, 0.14), m, leg, [0, -0.2, 0]);
    root.add(leg);
    rig[sx < 0 ? "legL" : "legR"] = leg;
  }
  const body = new THREE.Group();
  root.add(body);
  rig.body = body;
  mesh(new THREE.BoxGeometry(0.46, 0.42, 0.32), m, body, [0, 0.65, 0]);
  mesh(new THREE.BoxGeometry(0.2, 0.12, 0.02), mat("#7ff3ff", { emissive: "#3fd0ff", emissiveIntensity: 1 }), body, [0, 0.68, 0.17]);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sx * 0.28, 0.82, 0);
    mesh(new THREE.BoxGeometry(0.09, 0.34, 0.09), m, arm, [0, -0.17, 0]);
    root.add(arm);
    rig[sx < 0 ? "armL" : "armR"] = arm;
  }
  const head = new THREE.Group();
  head.position.set(0, 0.9, 0);
  root.add(head);
  rig.head = head;
  mesh(new THREE.BoxGeometry(0.5, 0.42, 0.4), m, head, [0, 0.22, 0]);
  mesh(new THREE.BoxGeometry(0.42, 0.3, 0.02), dark, head, [0, 0.22, 0.2]);
  rig.eyes = [];
  for (const sx of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(sx * 0.1, 0.27, 0.215);
    mesh(new THREE.BoxGeometry(0.08, 0.08, 0.01), mat("#7ff3ff", { emissive: "#7ff3ff", emissiveIntensity: 1.5 }), e, [0, 0, 0], false);
    head.add(e);
    rig.eyes.push(e);
  }
  const mg = new THREE.Group();
  mg.position.set(0, 0.14, 0.215);
  head.add(mg);
  const inner = mesh(new THREE.BoxGeometry(0.16, 0.03, 0.01), mat("#7ff3ff", { emissive: "#7ff3ff", emissiveIntensity: 1.5 }), mg, [0, 0, 0], false);
  rig.mouth = { g: mg, inner, robot: true };
  mesh(capsule(0.01, 0.12), m, head, [0, 0.5, 0], false);
  rig.antenna = mesh(sphere(0.035), mat("#ff5a5a", { emissive: "#ff3030", emissiveIntensity: 1 }), head, [0, 0.6, 0], false);
  return { root, rig, height: 1.3, headY: 1.1, fly: false };
}

export function buildCharacter(look, name) {
  const tr = traits(look, name);
  const c = { dog: animal, cat: animal, bunny: animal, bee, star, bird, robot }[tr.kind]?.(tr) || human(tr);
  c.traits = tr;
  c.name = name;
  return c;
}

// ---------------------------------------------------------------- worlds
function skyDome(top, bottom) {
  const geo = new THREE.SphereGeometry(80, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: C(top) }, bottom: { value: C(bottom) } },
    vertexShader: "varying vec3 vP; void main(){ vP = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(normalize(vP).y*1.4+0.25,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); }",
  });
  return new THREE.Mesh(geo, m);
}

function stars(scene, n, r, spread = 1) {
  const pts = new Float32Array(n * 3);
  const rr = rng(11);
  for (let i = 0; i < n; i++) {
    const a = rr() * Math.PI * 2, e = rr() * 0.9 * spread + 0.05;
    pts.set([Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 0.35, sizeAttenuation: true }));
  scene.add(p);
  return p;
}

function tree(parent, x, z, s, r, night) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 10), mat("#7a4a2a", { roughness: 0.9 }), g, [0, 0.6, 0]);
  const leaf = mat(new THREE.Color().setHSL(0.27 + r() * 0.08, 0.55, night ? 0.22 : 0.38 + r() * 0.08), { roughness: 0.85 });
  if (r() < 0.35) for (let k = 0; k < 3; k++) mesh(new THREE.ConeGeometry(0.75 - k * 0.18, 0.9, 12), leaf, g, [0, 1.3 + k * 0.45, 0]);
  else for (const [dx, dy, rr] of [[0, 1.6, 0.7], [-0.4, 1.3, 0.5], [0.45, 1.35, 0.5], [0, 2.0, 0.5]]) mesh(sphere(rr, 16, 12), leaf, g, [dx, dy, 0]);
  parent.add(g);
}

function flowers(parent, n, r, area) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    g.position.set((r() - 0.5) * area, 0, -r() * area * 0.6 + 1.5);
    mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 5), mat("#2f7d33"), g, [0, 0.11, 0], false);
    const c = mat(new THREE.Color().setHSL(r(), 0.8, 0.65), { roughness: 0.6 });
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      mesh(sphere(0.035, 8, 6), c, g, [Math.cos(a) * 0.04, 0.24, Math.sin(a) * 0.04], false);
    }
    mesh(sphere(0.03, 8, 6), mat("#ffe14d"), g, [0, 0.25, 0], false);
    parent.add(g);
  }
}

function mushroom(parent, x, z, s, glow) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.25, 10), mat("#f3ead8"), g, [0, 0.12, 0]);
  const cap = mat(glow ? "#b06cff" : "#e0403a", glow ? { emissive: "#9b4dff", emissiveIntensity: 0.9 } : {});
  mesh(new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap, g, [0, 0.24, 0]);
  if (glow) g.add(light("#c58bff", 1.2, 2, 0, 0.4, 0));
  parent.add(g);
}

function rainbow(parent) {
  const cols = ["#ff4d4d", "#ff9f1c", "#ffe14d", "#4cd964", "#4d9fff", "#8e5bd1"];
  cols.forEach((c, i) => {
    const m = mesh(new THREE.TorusGeometry(7 - i * 0.28, 0.14, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75 }),
      parent, [0, -1, -14], false);
    m.rotation.z = 0;
  });
}

function sceneKind(text) {
  const t = text.toLowerCase();
  return {
    env: /\b(underwater|under the sea|coral|jellyfish|ocean floor|reef)\b/.test(t) ? "underwater"
      : /\b(outer space|planet|galaxy|rocket|astronaut|spaceship)\b/.test(t) ? "space"
      : /\b(forest|woods|jungle|trees?|mushrooms?)\b/.test(t) ? "forest"
      : /\b(beach|sand|shore|seaside)\b/.test(t) ? "beach"
      : /\b(room|bedroom|living room|house|home|kitchen|school|classroom|class|inside|indoors?)\b/.test(t) ? "room"
      : /\b(city|street|town|road|market)\b/.test(t) ? "city" : /\b(ocean|sea)\b/.test(t) ? "beach" : "meadow",
    time: /\b(night|starry|moon|moonlight|dark sky|millions of shining stars)\b/.test(t) ? "night"
      : /\b(twilight|sunset|evening|dusk)\b/.test(t) ? "twilight" : "day",
    rainbow: /rainbow/.test(t), mountain: /mountain|hill|peak/.test(t), magic: /magic|sparkl|glow|enchant|fairy|twinkl/.test(t),
  };
}

function buildWorld(scene, k, seed) {
  const r = rng(seed);
  const world = new THREE.Group();
  scene.add(world);
  const anim = [];
  const skies = {
    day: ["#4aa3ff", "#cdeaff"], twilight: ["#3b2a7a", "#ff9e6b"], night: ["#060b2a", "#2a2266"],
  };
  let [top, bottom] = skies[k.time];
  if (k.env === "underwater") [top, bottom] = ["#0a3d7a", "#1aa0c8"];
  if (k.env === "space") [top, bottom] = ["#02010a", "#140a33"];
  if (k.env !== "room") world.add(skyDome(top, bottom));
  scene.fog = new THREE.Fog(k.env === "underwater" ? "#1677a8" : bottom, k.env === "room" ? 30 : 14, 60);
  const groundCol = { meadow: "#6cbf5a", forest: "#4f9e47", beach: "#f0d59b", city: "#55576a", space: "#77788a", underwater: "#e3cf9a", room: "#b07a4f" }[k.env];
  const ground = mesh(new THREE.CircleGeometry(60, 48), mat(k.time === "night" ? new THREE.Color(groundCol).multiplyScalar(0.45) : groundCol, { roughness: 0.95 }), world);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;

  if (k.env === "forest" || k.env === "meadow") {
    const n = k.env === "forest" ? 26 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI - Math.PI + (r() - 0.5) * 0.3;
      const d = 4.5 + r() * 9;
      tree(world, Math.cos(a) * d * 1.4, Math.sin(a) * d - 1, 0.8 + r() * 0.9, r, k.time === "night");
    }
    flowers(world, k.env === "meadow" ? 60 : 30, r, 10);
    for (let i = 0; i < 5; i++) mushroom(world, (r() - 0.5) * 6, -1 - r() * 3, 0.8 + r() * 1.4, k.magic || k.time !== "day");
  }
  if (k.mountain) for (let i = 0; i < 5; i++) {
    const h = 6 + r() * 6;
    mesh(new THREE.ConeGeometry(4 + r() * 3, h, 6), mat(new THREE.Color().setHSL(0.7 + r() * 0.2, 0.35, 0.55)), world, [(i - 2) * 7 + r() * 2, h / 2 - 0.5, -22 - r() * 6], false);
  }
  if (k.rainbow) rainbow(world);
  if (k.env === "beach") {
    const sea = mesh(new THREE.PlaneGeometry(120, 40), mat("#2f8fd8", { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }), world, [0, 0.02, -24], false);
    sea.rotation.x = -Math.PI / 2;
    anim.push((t) => (sea.position.y = 0.02 + Math.sin(t * 1.2) * 0.03));
    for (const x of [-4, 4.5]) {
      const palm = new THREE.Group();
      palm.position.set(x, 0, -3);
      for (let s = 0; s < 6; s++) mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.5, 8), mat("#8a5a32"), palm, [Math.sin(s * 0.25) * 0.3, 0.25 + s * 0.45, 0]);
      for (let l = 0; l < 6; l++) {
        const leaf = mesh(sphere(0.6, 12, 8), mat("#3fa34d"), palm, [0.45, 2.8, 0]);
        leaf.scale.set(1.6, 0.12, 0.45);
        leaf.position.set(Math.cos((l / 6) * Math.PI * 2) * 0.8 + 0.4, 2.7, Math.sin((l / 6) * Math.PI * 2) * 0.8);
        leaf.rotation.y = -(l / 6) * Math.PI * 2;
      }
      world.add(palm);
    }
  }
  if (k.env === "underwater") {
    for (let i = 0; i < 30; i++) {
      const c = mesh(capsule(0.08 + r() * 0.1, 0.4 + r() * 0.9), mat(new THREE.Color().setHSL(r() * 0.15 + (r() < 0.5 ? 0.9 : 0.05), 0.8, 0.6)), world,
        [(r() - 0.5) * 14, 0.3, -1 - r() * 8]);
      c.rotation.z = (r() - 0.5) * 0.8;
    }
    for (let j = 0; j < 4; j++) {
      const jf = new THREE.Group();
      jf.position.set((r() - 0.5) * 8, 2.5 + r() * 2, -3 - r() * 5);
      mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: "#e7a0ff", emissive: "#c060ff", emissiveIntensity: 0.8, transparent: true, opacity: 0.75 }), jf, [0, 0, 0], false);
      for (let t = 0; t < 6; t++) mesh(capsule(0.02, 0.9), new THREE.MeshBasicMaterial({ color: "#f0c0ff", transparent: true, opacity: 0.6 }), jf,
        [Math.cos(t) * 0.25, -0.5, Math.sin(t) * 0.25], false);
      world.add(jf);
      const y0 = jf.position.y, ph = r() * 6;
      anim.push((t) => (jf.position.y = y0 + Math.sin(t * 0.8 + ph) * 0.4));
    }
  }
  if (k.env === "room") {
    const wall = mat("#f3dcc4", { roughness: 0.9 });
    mesh(new THREE.PlaneGeometry(20, 8), wall, world, [0, 4, -4]).castShadow = false;
    for (const sx of [-1, 1]) {
      const w = mesh(new THREE.PlaneGeometry(12, 8), wall, world, [sx * 7, 4, 2]);
      w.rotation.y = -sx * Math.PI / 2;
    }
    mesh(new THREE.PlaneGeometry(2.6, 1.8), new THREE.MeshBasicMaterial({ color: k.time === "night" ? "#1a2a66" : "#9fd8ff" }), world, [-2.5, 2.8, -3.98], false);
    mesh(new THREE.BoxGeometry(2.8, 0.12, 0.1), mat("#ffffff"), world, [-2.5, 1.85, -3.95]);
    const rug = mesh(new THREE.CircleGeometry(2.2, 40), mat("#c95d7a"), world, [0, 0.01, 0.5], false);
    rug.rotation.x = -Math.PI / 2;
    mesh(new THREE.BoxGeometry(1.8, 1.6, 0.6), mat("#9a6a42"), world, [3, 0.8, -3.6]);
    for (let b = 0; b < 6; b++) mesh(new THREE.BoxGeometry(0.18, 0.4, 0.35), mat(new THREE.Color().setHSL(r(), 0.6, 0.55)), world, [2.4 + b * 0.22, 1.3, -3.5]);
    scene.add(light("#ffd9a0", 6, 12, 0, 4, 1));
  }
  if (k.env === "city") {
    for (let i = 0; i < 18; i++) {
      const h = 3 + r() * 8;
      const b = mesh(new THREE.BoxGeometry(2 + r() * 1.5, h, 2), mat(new THREE.Color().setHSL(0.6 + r() * 0.1, 0.2, k.time === "night" ? 0.15 : 0.55)), world,
        [(i - 9) * 2.6, h / 2, -7 - r() * 6]);
      if (k.time !== "day") for (let w = 0; w < 6; w++) mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshBasicMaterial({ color: r() < 0.6 ? "#ffd86b" : "#2b2f4f" }), b,
        [(r() - 0.5) * 1.4, (r() - 0.5) * h * 0.8, 1.01], false);
    }
  }
  if (k.env === "space") {
    const planet = mesh(sphere(3, 40, 30), mat("#e08a4a", { roughness: 0.8 }), world, [7, 6, -20], false);
    const ring = mesh(new THREE.TorusGeometry(4.5, 0.18, 8, 64), mat("#f2d3a0"), planet, [0, 0, 0], false);
    ring.rotation.x = 1.2;
    anim.push((t) => (planet.rotation.y = t * 0.1));
  }
  if (k.time !== "day" || k.env === "space") {
    stars(world, 900, 70, 0.9);
    if (k.env !== "room") mesh(sphere(2, 24, 16), new THREE.MeshBasicMaterial({ color: "#fff6d8" }), world, [-12, 14, -40], false);
  }
  if (k.magic || k.time === "night") { // floating glowing particles (fireflies / magic dust)
    const n = 120;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 10, r() * 3.5, (r() - 0.5) * 8], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffe9a0", size: 0.07, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    world.add(dust);
    anim.push((t) => {
      dust.rotation.y = t * 0.05;
      dust.position.y = Math.sin(t * 0.6) * 0.15;
      dust.material.opacity = 0.6 + 0.4 * Math.sin(t * 3);
    });
  }
  if (k.env === "underwater") { // bubbles
    const n = 80;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * 10, r() * 6, (r() - 0.5) * 6], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const bub = new THREE.Points(g, new THREE.PointsMaterial({ color: "#e8fbff", size: 0.08, transparent: true, opacity: 0.7 }));
    world.add(bub);
    anim.push((t) => (bub.position.y = (t * 0.4) % 2));
  }

  // lights
  const night = k.time === "night" || k.env === "space";
  scene.add(new THREE.HemisphereLight(night ? "#6a78c8" : k.env === "underwater" ? "#7fd4ff" : "#ffffff", night ? "#20183a" : "#6a5a40", night ? 1.0 : 1.6));
  const sun = new THREE.DirectionalLight(k.time === "twilight" ? "#ffb07a" : night ? "#9fb4ff" : "#fff1d6", night ? 1.4 : 2.6);
  sun.position.set(-4, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(k.time === "twilight" ? "#ff8ad8" : "#b8d8ff", 1.2);
  rim.position.set(3, 3, -6);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(night ? "#c8d4ff" : "#fff4e8", night ? 1.3 : 0.6); // soft front light keeps faces readable
  fill.position.set(0, 2, 8);
  scene.add(fill);
  return anim;
}

// ---------------------------------------------------------------- actions
function actionFor(text, name, c) {
  const t = text.toLowerCase();
  if (c.fly) return /fl(y|ies|ying)|float|rise|soar/.test(t) ? "flyup" : "float";
  if (/danc|celebrat|party/.test(t)) return "dance";
  if (/jump|hop|leap/.test(t)) return "jump";
  if (/walk|travel|journey|run|stroll|go(es)? to/.test(t)) return "walk";
  if (/wav|hello|goodbye|bye|greet/.test(t)) return "wave";
  if (/kneel|crouch|bend|sit/.test(t)) return "kneel";
  if (/hug|holds?|embrace/.test(t)) return "hug";
  if (/looks? up|gazes? up|up at the sky|stargaz/.test(t)) return "lookup";
  if (/sad|cry|tear|lonely|weak/.test(t)) return "sad";
  if (/happy|smil|laugh|excit|joy/.test(t)) return "happy";
  return "idle";
}

function animate(c, t, s) {
  const { rig } = c;
  const ph = c.phase;
  const talk = s.open;
  const breathe = Math.sin(t * 2 + ph) * 0.012;
  if (rig.body) rig.body.scale.set(1 - breathe * 0.5, 1 + breathe, 1);
  const blink = ((t + ph) % 3.6) < 0.13;
  for (const e of rig.eyes || []) e.scale.y = blink ? 0.1 : 1;
  if (rig.mouth) {
    const m = rig.mouth;
    if (m.robot) m.inner.scale.y = 1 + talk * 4;
    else {
      m.inner.scale.y = 0.12 + talk * 0.75;
      m.tongue.visible = talk > 0.25;
      m.smile.visible = talk < 0.08;
    }
  }
  const head = rig.head;
  const act = s.action;
  let x = 0, y = 0, rotY = 0, lean = 0;
  if (head) {
    head.rotation.x = Math.sin(t * 1.3 + ph) * 0.04 - talk * 0.08 * Math.sin(t * 9);
    head.rotation.z = Math.sin(t * 0.9 + ph) * 0.05;
    head.rotation.y = s.lookAt * 0.35 + Math.sin(t * 0.7 + ph) * 0.06;
  }
  const arms = rig.armL && rig.armR;
  if (arms) {
    rig.armL.rotation.set(Math.sin(t * 1.6 + ph) * 0.05, 0, -0.12);
    rig.armR.rotation.set(Math.sin(t * 1.6 + ph + 1) * 0.05, 0, 0.12);
    if (talk > 0.05 || s.speaking) { // talking gestures
      rig.armR.rotation.x = -0.6 - Math.sin(t * 2.5) * 0.25;
      rig.armR.rotation.z = 0.35;
    }
  }
  const legs = rig.legL && rig.legR;
  if (legs) rig.legL.rotation.x = rig.legR.rotation.x = 0;
  switch (act) {
    case "walk": {
      const sw = Math.sin(t * 6 + ph);
      x = Math.sin(t * 0.25) * 0.8;
      rotY = Math.cos(t * 0.25) > 0 ? 0.5 : -0.5;
      y = Math.abs(Math.cos(t * 6 + ph)) * 0.03;
      if (legs) [rig.legL.rotation.x, rig.legR.rotation.x] = [sw * 0.5, -sw * 0.5];
      if (arms) [rig.armL.rotation.x, rig.armR.rotation.x] = [-sw * 0.5, sw * 0.5];
      for (const [i, l] of (rig.legs || []).entries()) l.rotation.x = Math.sin(t * 8 + i * Math.PI) * 0.5;
      break;
    }
    case "wave":
      if (arms) rig.armR.rotation.set(0, 0, 2.6 + Math.sin(t * 9) * 0.35);
      break;
    case "dance":
      y = Math.abs(Math.sin(t * 4)) * 0.08;
      lean = Math.sin(t * 2) * 0.15;
      if (arms) {
        rig.armL.rotation.z = -1.8 - Math.sin(t * 4) * 0.6;
        rig.armR.rotation.z = 1.8 - Math.sin(t * 4) * 0.6;
      }
      break;
    case "jump": {
      const p = (t % 1.4) / 1.4;
      y = p < 0.5 ? Math.sin((p / 0.5) * Math.PI) * 0.35 : 0;
      if (arms) [rig.armL.rotation.z, rig.armR.rotation.z] = [-0.3 - y * 6, 0.3 + y * 6];
      break;
    }
    case "kneel":
      y = -0.18;
      if (legs) [rig.legL.rotation.x, rig.legR.rotation.x] = [-1.2, 0.2];
      if (head) head.rotation.x = 0.35;
      break;
    case "hug":
      x = -c.slot * 0.35;
      if (arms) [rig.armL.rotation.x, rig.armR.rotation.x] = [-1.3, -1.3];
      break;
    case "lookup":
      if (head) head.rotation.x = -0.45;
      break;
    case "sad":
      if (head) head.rotation.x = 0.3;
      if (arms) [rig.armL.rotation.z, rig.armR.rotation.z] = [-0.05, 0.05];
      break;
    case "happy":
      y = Math.abs(Math.sin(t * 3)) * 0.03;
      break;
    case "float":
      y = 0.5 + Math.sin(t * 2 + ph) * 0.12;
      break;
    case "flyup":
      y = 0.5 + Math.min(4, s.local * 0.6) + Math.sin(t * 2) * 0.1;
      break;
  }
  if (c.fly && !["float", "flyup"].includes(act)) y = 0.5 + Math.sin(t * 2 + ph) * 0.12;
  for (const w of rig.wings || []) w.rotation.y = Math.sin(t * 40) * 0.6 * (w.position.x > 0 ? 1 : -1);
  if (rig.tail) rig.tail.rotation.y = Math.sin(t * 8) * 0.5;
  if (rig.glow) rig.glow.intensity = 2 + Math.sin(t * 3) * 0.8 + talk * 2;
  if (rig.antenna) rig.antenna.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 4));
  c.root.position.set(c.home.x + x, y, c.home.z);
  c.root.rotation.set(0, c.home.rotY + rotY, lean);
}

// ---------------------------------------------------------------- renderer + scene assembly
let renderer = null;

function getRenderer(W, H) {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(1);
  }
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x !== W || size.y !== H) renderer.setSize(W, H, false);
  return renderer;
}

/**
 * Builds one 3D scene. spec = { text, speakers:[names], index, count }, cast = [{name, look}].
 * Returns { render(ctx, t, local, prog, activeSpeaker, open), dispose() }.
 */
export function buildScene3D(spec, cast, W, H) {
  const scene = new THREE.Scene();
  const k = sceneKind(spec.text);
  const anim = buildWorld(scene, k, 7 + spec.index * 13);
  const lower = spec.text.toLowerCase();
  let present = cast.filter((c) => new RegExp(`\\b${c.name}\\b`, "i").test(spec.visual ?? spec.text) || spec.speakers.includes(c.name));
  if (!present.length && cast.length) present = [cast[0]];
  present = present.slice(0, 4);
  const actors = present.map((p, i) => {
    const c = buildCharacter(p.look, p.name);
    const n = present.length;
    const spacing = W > H ? 1.3 : 1.0;
    c.home = { x: (i - (n - 1) / 2) * spacing, z: c.fly ? 0.3 : 0, rotY: n > 1 ? (i < (n - 1) / 2 ? 0.35 : i > (n - 1) / 2 ? -0.35 : 0) : 0 };
    c.slot = i - (n - 1) / 2;
    c.phase = i * 1.7;
    const sentence = spec.text.split(/[.!?]/).find((s) => new RegExp(`\\b${p.name}\\b`, "i").test(s)) || spec.text;
    c.action = actionFor(sentence, p.name, c);
    scene.add(c.root);
    return c;
  });
  const camera = new THREE.PerspectiveCamera(W > H ? 35 : 45, W / H, 0.1, 200);
  const center = new THREE.Vector3(0, 0.8, 0);
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let first = true;
  const wideDist = Math.max(3.8, present.length * 1.6) * (W > H ? 1.2 : 1.5);

  function shot(t, local, prog, speaker) {
    const target = actors.find((a) => a.name === speaker);
    const orbit = (spec.index % 2 ? -1 : 1) * (0.25 - prog * 0.35);
    let dist = wideDist * (1.05 - prog * 0.15), look = center.clone(), height = 1.25;
    if (target) {
      const head = new THREE.Vector3(target.root.position.x, target.root.position.y + target.headY, target.root.position.z);
      look = head.clone().add(new THREE.Vector3(0, -0.2, 0));
      dist = (target.traits.adult ? 2.9 : 2.4) * (W > H ? 1 : 1.25);
      height = head.y;
    } else if (spec.index === 0 && local < 3) dist = wideDist * (1.35 - local * 0.08); // opening push-in
    const pos = new THREE.Vector3(look.x + Math.sin(orbit) * dist, height + (target ? 0 : 0.35), look.z + Math.cos(orbit) * dist);
    if (first) {
      camPos.copy(pos);
      camLook.copy(look);
      first = false;
    }
    camPos.lerp(pos, 0.045);
    camLook.lerp(look, 0.06);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  }

  return {
    render(ctx, t, local, prog, speaker, open) {
      for (const f of anim) f(t);
      const speakerActor = actors.find((a) => a.name === speaker);
      for (const a of actors) {
        a.home.lookAtX = speakerActor && speakerActor !== a ? Math.sign(speakerActor.home.x - a.home.x) : 0;
        animate(a, t, { open: a === speakerActor ? open : 0, speaking: a === speakerActor, action: a.action, local,
          lookAt: a.home.lookAtX });
      }
      shot(t, local, prog, speaker);
      const r = getRenderer(W, H);
      r.render(scene, camera);
      ctx.drawImage(r.domElement, 0, 0, W, H);
    },
    snapshot(at = 1.2) {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      for (let i = 0; i < 40; i++) this.render(c.getContext("2d"), at + i * 0.02, at, 0.3, null, 0);
      return c;
    },
    dispose() {
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) [].concat(o.material).forEach((m) => m.dispose());
      });
    },
    kind: k,
    lower,
  };
}
