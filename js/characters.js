// Procedural cartoon characters drawn on a 2D canvas.
// Origin is the character's feet (centre); S is the character's total height in pixels.
// `p` is the pose for this frame (see pose() in app.js).

export const CHARACTERS = {
  robot: { label: "Robot", color: "#4f8cff" },
  cat: { label: "Cat", color: "#f4a340" },
  girl: { label: "Girl", color: "#e85d9a" },
  boy: { label: "Boy", color: "#3fb37f" },
  alien: { label: "Alien", color: "#7ddc5a" },
};

const SKIN = "#f2c8a0";
const INK = "#2b2233";

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function limb(ctx, x, y, len, angle, width, color) {
  const ex = x + Math.sin(angle) * len;
  const ey = y + Math.cos(angle) * len;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  return [ex, ey];
}

function circle(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function eyes(ctx, dx, y, r, blink, S, big = false) {
  for (const sx of [-dx, dx]) {
    if (blink > 0.5) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.012 * S;
      ctx.beginPath();
      ctx.arc(sx, y, r * 0.8, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
      continue;
    }
    if (big) {
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.ellipse(sx, y, r, r * 1.35, sx < 0 ? 0.35 : -0.35, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, sx + r * 0.3, y - r * 0.45, r * 0.28, "#fff");
    } else {
      circle(ctx, sx, y, r, "#fff");
      circle(ctx, sx, y + r * 0.1, r * 0.55, INK);
      circle(ctx, sx + r * 0.2, y - r * 0.15, r * 0.2, "#fff");
    }
  }
}

function mouth(ctx, y, w, open, S) {
  if (open < 0.06) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.014 * S;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, y - w * 0.4, w * 0.6, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
    return;
  }
  const h = w * (0.15 + 0.75 * open);
  ctx.fillStyle = "#5a1622";
  ctx.beginPath();
  ctx.ellipse(0, y, w * 0.55, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.clip();
  circle(ctx, 0, y + h * 0.45, w * 0.35, "#e8657a");
  ctx.restore();
}

function head(ctx, type, color, p, S) {
  const r = 0.2 * S;
  const m = p.mouth;
  switch (type) {
    case "robot": {
      ctx.strokeStyle = shade(color, -50);
      ctx.lineWidth = 0.015 * S;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, -r * 1.45);
      ctx.stroke();
      circle(ctx, 0, -r * 1.5, 0.03 * S, Math.sin(p.t * 6) > 0 ? "#ff5a5a" : "#ffd25a");
      roundRect(ctx, -r * 1.05, -r, r * 2.1, r * 1.9, r * 0.35, shade(color, 30));
      roundRect(ctx, -r * 0.85, -r * 0.75, r * 1.7, r * 1.4, r * 0.25, "#1d2440");
      for (const sx of [-r * 0.4, r * 0.4]) {
        const eh = p.blink > 0.5 ? r * 0.06 : r * 0.32;
        roundRect(ctx, sx - r * 0.18, -r * 0.3 - eh / 2, r * 0.36, eh, r * 0.08, "#7ff3ff");
      }
      const mh = r * (0.06 + 0.3 * m);
      roundRect(ctx, -r * 0.4, r * 0.3 - mh / 2, r * 0.8, mh, r * 0.05, "#7ff3ff");
      break;
    }
    case "cat": {
      for (const sx of [-1, 1]) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(sx * r * 0.95, -r * 0.35);
        ctx.lineTo(sx * r * 0.75, -r * 1.35);
        ctx.lineTo(sx * r * 0.15, -r * 0.85);
        ctx.fill();
        ctx.fillStyle = "#ffb4c0";
        ctx.beginPath();
        ctx.moveTo(sx * r * 0.78, -r * 0.55);
        ctx.lineTo(sx * r * 0.7, -r * 1.1);
        ctx.lineTo(sx * r * 0.35, -r * 0.8);
        ctx.fill();
      }
      circle(ctx, 0, 0, r, color);
      circle(ctx, 0, r * 0.35, r * 0.5, shade(color, 60));
      eyes(ctx, r * 0.4, -r * 0.15, r * 0.2, p.blink, S);
      circle(ctx, 0, r * 0.15, r * 0.08, "#ff7f9a");
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.006 * S;
      for (const sx of [-1, 1]) for (const dy of [-0.05, 0.08]) {
        ctx.beginPath();
        ctx.moveTo(sx * r * 0.3, r * (0.25 + dy));
        ctx.lineTo(sx * r * 1.15, r * (0.18 + dy * 2));
        ctx.stroke();
      }
      mouth(ctx, r * 0.45, r * 0.4, m, S);
      break;
    }
    case "girl": {
      circle(ctx, 0, -r * 0.05, r * 1.15, "#6b3b22");
      roundRect(ctx, -r * 1.15, -r * 0.1, r * 2.3, r * 1.6, r * 0.4, "#6b3b22");
      circle(ctx, 0, 0, r, SKIN);
      ctx.fillStyle = "#6b3b22";
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.7, r * 0.95, r * 0.45, 0, Math.PI, 0);
      ctx.fill();
      circle(ctx, r * 0.75, -r * 0.85, r * 0.2, color);
      eyes(ctx, r * 0.38, -r * 0.05, r * 0.17, p.blink, S);
      circle(ctx, -r * 0.6, r * 0.3, r * 0.12, "rgba(255,120,140,0.35)");
      circle(ctx, r * 0.6, r * 0.3, r * 0.12, "rgba(255,120,140,0.35)");
      mouth(ctx, r * 0.45, r * 0.38, m, S);
      break;
    }
    case "boy": {
      circle(ctx, 0, 0, r, SKIN);
      ctx.fillStyle = "#2e2118";
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.45, r * 1.02, r * 0.65, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 0.45);
      ctx.lineTo(-r * 0.3, -r * 0.25);
      ctx.lineTo(r * 0.2, -r * 0.5);
      ctx.lineTo(r * 0.95, -r * 0.4);
      ctx.fill();
      circle(ctx, -r, r * 0.05, r * 0.15, SKIN);
      circle(ctx, r, r * 0.05, r * 0.15, SKIN);
      eyes(ctx, r * 0.38, -r * 0.02, r * 0.16, p.blink, S);
      mouth(ctx, r * 0.45, r * 0.38, m, S);
      break;
    }
    default: { // alien
      for (const sx of [-1, 1]) {
        ctx.strokeStyle = shade(color, -40);
        ctx.lineWidth = 0.012 * S;
        ctx.beginPath();
        ctx.moveTo(sx * r * 0.4, -r * 0.8);
        ctx.quadraticCurveTo(sx * r * 0.7, -r * 1.4, sx * r * (0.6 + 0.1 * Math.sin(p.t * 3)), -r * 1.6);
        ctx.stroke();
        circle(ctx, sx * r * (0.6 + 0.1 * Math.sin(p.t * 3)), -r * 1.6, 0.025 * S, "#ffe066");
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      eyes(ctx, r * 0.42, -r * 0.1, r * 0.26, p.blink, S, true);
      mouth(ctx, r * 0.55, r * 0.35, m, S);
    }
  }
}

export function drawCharacter(ctx, type, color, p, S) {
  const skin = type === "robot" ? shade(color, -20) : type === "cat" || type === "alien" ? color : SKIN;
  const top = type === "girl" ? color : type === "robot" ? color : type === "boy" ? color : shade(color, -15);
  ctx.save();
  ctx.translate(0, -p.jump * S);
  ctx.scale(1 + p.squash, 1 - p.squash);
  ctx.rotate(p.lean);

  const hipY = -0.2 * S;
  const legColor = type === "robot" ? shade(color, -50) : type === "girl" ? SKIN : type === "boy" ? "#34507a" : shade(color, -30);
  for (const [sx, a] of [[-0.06, p.leftLeg], [0.06, p.rightLeg]]) {
    const [fx, fy] = limb(ctx, sx * S, hipY, 0.19 * S, a, 0.065 * S, legColor);
    ctx.fillStyle = type === "robot" ? "#2a2f45" : "#3a2a2a";
    ctx.beginPath();
    ctx.ellipse(fx + Math.sign(sx) * 0.02 * S, fy, 0.055 * S, 0.03 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const shoulderY = -0.47 * S;
  const arms = [[-0.13, p.leftArm], [0.13, p.rightArm]];
  const drawArms = () => {
    for (const [sx, a] of arms) {
      const [hx, hy] = limb(ctx, sx * S, shoulderY, 0.2 * S, a, 0.055 * S, top);
      circle(ctx, hx, hy, 0.035 * S, type === "robot" ? "#c9d3ea" : skin);
    }
  };

  if (type === "girl") {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-0.11 * S, -0.52 * S);
    ctx.lineTo(0.11 * S, -0.52 * S);
    ctx.lineTo(0.2 * S, -0.17 * S);
    ctx.lineTo(-0.2 * S, -0.17 * S);
    ctx.closePath();
    ctx.fill();
  } else if (type === "robot") {
    roundRect(ctx, -0.16 * S, -0.54 * S, 0.32 * S, 0.36 * S, 0.05 * S, color);
    roundRect(ctx, -0.08 * S, -0.46 * S, 0.16 * S, 0.12 * S, 0.02 * S, "#1d2440");
    circle(ctx, -0.035 * S, -0.4 * S, 0.018 * S, Math.sin(p.t * 4) > 0 ? "#7ff3ff" : "#3b4a7a");
    circle(ctx, 0.035 * S, -0.4 * S, 0.018 * S, Math.sin(p.t * 4) > 0 ? "#3b4a7a" : "#ffd25a");
  } else {
    roundRect(ctx, -0.14 * S, -0.54 * S, 0.28 * S, 0.37 * S, 0.1 * S, top);
    if (type === "cat") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.04 * S;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0.12 * S, -0.22 * S);
      ctx.quadraticCurveTo(0.35 * S, -0.25 * S + Math.sin(p.t * 3) * 0.05 * S, 0.3 * S, -0.5 * S);
      ctx.stroke();
    }
  }
  drawArms();

  ctx.save();
  ctx.translate(0, -0.71 * S);
  ctx.rotate(p.tilt);
  head(ctx, type, color, p, S);
  ctx.restore();
  ctx.restore();
}
