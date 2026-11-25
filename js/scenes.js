// Animated procedural backgrounds. Random layout is generated once per scene + size and cached.

export const SCENES = {
  sky: "Sunny sky",
  city: "City at night",
  garden: "Flower garden",
  room: "Cozy room",
  space: "Outer space",
  beach: "Beach",
  plain: "Plain colour",
};

let cache = { key: "", data: null };

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function layout(type, W, H) {
  const key = `${type}-${W}-${H}`;
  if (cache.key === key) return cache.data;
  const r = rng(42);
  const data = {
    stars: Array.from({ length: 160 }, () => [r() * W, r() * H * 0.75, r() * 1.8 + 0.4, r() * 6]),
    clouds: Array.from({ length: 6 }, () => [r() * W, r() * H * 0.35 + H * 0.05, r() * 0.5 + 0.6, r() * 0.5 + 0.3]),
    buildings: [],
    flowers: Array.from({ length: 40 }, () => [r() * W, H * 0.72 + r() * H * 0.28, r() * 360, r() * 0.5 + 0.6, r() * 6]),
  };
  for (let x = -20; x < W + 40;) {
    const w = 50 + r() * 110;
    const h = H * (0.25 + r() * 0.45);
    const windows = [];
    for (let wy = H * 0.8 - h + 14; wy < H * 0.8 - 14; wy += 22)
      for (let wx = x + 10; wx < x + w - 14; wx += 18) if (r() > 0.45) windows.push([wx, wy, r() * 8]);
    data.buildings.push([x, w, h, windows, `hsl(${230 + r() * 30},25%,${12 + r() * 10}%)`]);
    x += w + 4;
  }
  cache = { key, data };
  return data;
}

function grad(ctx, H, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function cloud(ctx, x, y, s) {
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const [dx, dy, rr] of [[0, 0, 40], [35, -15, 35], [70, 0, 38], [35, 10, 35]]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawScene(ctx, type, W, H, t, opts = {}) {
  const L = layout(type, W, H);
  const ground = H * 0.8;
  switch (type) {
    case "city": {
      ctx.fillStyle = grad(ctx, H, [[0, "#0b0f2a"], [0.7, "#2a1f4f"], [1, "#3c2a5c"]]);
      ctx.fillRect(0, 0, W, H);
      for (const [x, y, s, ph] of L.stars) {
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.5 + ph));
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y * 0.6, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fdf3c6";
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.15, Math.min(W, H) * 0.06, 0, Math.PI * 2);
      ctx.fill();
      for (const [x, w, h, windows, color] of L.buildings) {
        ctx.fillStyle = color;
        ctx.fillRect(x, ground - h, w, h);
        for (const [wx, wy, ph] of windows) {
          ctx.fillStyle = Math.sin(t * 0.3 + ph) > -0.7 ? "#ffd86b" : "#2b2f4f";
          ctx.fillRect(wx, wy, 8, 11);
        }
      }
      ctx.fillStyle = "#1b1830";
      ctx.fillRect(0, ground, W, H - ground);
      ctx.fillStyle = "rgba(255,90,200,0.15)";
      ctx.fillRect(0, ground, W, 6);
      break;
    }
    case "garden":
    case "beach":
    case "sky": {
      ctx.fillStyle = grad(ctx, H, [[0, "#5bb8ff"], [0.75, "#bfe6ff"], [1, "#e9f7ff"]]);
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#ffe46b";
      ctx.beginPath();
      ctx.arc(W * 0.85, H * 0.13, Math.min(W, H) * 0.07, 0, Math.PI * 2);
      ctx.fill();
      for (const [x, y, s, sp] of L.clouds) cloud(ctx, ((x + t * 12 * sp) % (W + 300)) - 150, y, s);
      if (type === "beach") {
        ctx.fillStyle = "#2f8fd8";
        ctx.fillRect(0, H * 0.6, W, H * 0.2);
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        for (let x = 0; x < W; x += 6) ctx.fillRect(x, H * 0.6 + 4 * Math.sin(x / 40 + t * 2), 6, 3);
        ctx.fillStyle = "#f2d59b";
        ctx.beginPath();
        ctx.moveTo(0, ground - 10);
        for (let x = 0; x <= W; x += 10) ctx.lineTo(x, ground - 10 + 6 * Math.sin(x / 70 + t * 1.5));
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.fill();
      } else if (type === "garden") {
        ctx.fillStyle = "#58b85c";
        ctx.fillRect(0, H * 0.72, W, H * 0.28);
        for (const [x, y, hue, s, ph] of L.flowers) {
          const sway = Math.sin(t * 2 + ph) * 4;
          ctx.strokeStyle = "#2f7d33";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + sway, y - 22 * s);
          ctx.stroke();
          ctx.fillStyle = `hsl(${hue},85%,65%)`;
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(x + sway + Math.cos(a) * 7 * s, y - 22 * s + Math.sin(a) * 7 * s, 6 * s, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "#ffe14d";
          ctx.beginPath();
          ctx.arc(x + sway, y - 22 * s, 4 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "#7cc77f";
        ctx.fillRect(0, ground, W, H - ground);
      }
      break;
    }
    case "room": {
      ctx.fillStyle = "#f3e3cf";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#e6d2b8";
      for (let x = 0; x < W; x += 60) ctx.fillRect(x, 0, 30, ground);
      ctx.fillStyle = "#9b6b43";
      ctx.fillRect(0, ground, W, H - ground);
      ctx.fillStyle = "#8a5d39";
      for (let x = 0; x < W; x += 120) ctx.fillRect(x, ground, 4, H - ground);
      const ww = W * 0.22, wh = H * 0.28, wx = W * 0.1, wy = H * 0.15;
      ctx.fillStyle = "#8fd3ff";
      ctx.fillRect(wx, wy, ww, wh);
      cloud(ctx, wx + ((t * 10) % ww), wy + wh * 0.4, 0.35);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 8;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.stroke();
      ctx.fillStyle = "#c0504d";
      ctx.fillRect(W * 0.72, H * 0.2, W * 0.14, H * 0.18);
      ctx.fillStyle = "#ffd86b";
      ctx.beginPath();
      ctx.arc(W * 0.79, H * 0.29, H * 0.05, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "space": {
      ctx.fillStyle = grad(ctx, H, [[0, "#02010a"], [1, "#160b33"]]);
      ctx.fillRect(0, 0, W, H);
      for (const [x, y, s, ph] of L.stars) {
        ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t + ph));
        ctx.fillStyle = "#fff";
        ctx.fillRect(x, y / 0.75, s, s);
      }
      ctx.globalAlpha = 1;
      const px = W * 0.78, py = H * 0.25, pr = Math.min(W, H) * 0.13;
      const g = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      g.addColorStop(0, "#ffb86b");
      g.addColorStop(1, "#a8432a");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,220,180,0.6)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.6, pr * 0.35, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#4a4a5e";
      ctx.beginPath();
      ctx.ellipse(W / 2, H * 1.25, W * 0.9, H * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "image":
      if (opts.image) {
        const s = Math.max(W / opts.image.width, H / opts.image.height);
        ctx.drawImage(opts.image, (W - opts.image.width * s) / 2, (H - opts.image.height * s) / 2,
          opts.image.width * s, opts.image.height * s);
        break;
      }
    // falls through to plain colour when no image was uploaded
    default:
      ctx.fillStyle = opts.color || "#20243a";
      ctx.fillRect(0, 0, W, H);
  }
}
