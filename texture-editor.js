(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const SURFACES = ["top", "bottom", "front", "back", "left", "right"];
  const PROMPT_PARTS = ["head", "nose", "body", "arm", "arms_center", "leg", "hat"];
  const OUTPUT_PARTS = ["head", "nose", "body", "arm", "arms_center", "leg"];
  const CANONICAL = PROMPT_PARTS.flatMap((part) => SURFACES.map((face) => `${part}_${face}`));

  const PART_LABEL = {
    head: "HEAD",
    nose: "NOSE",
    body: "BODY",
    arm: "ARM",
    arms_center: "ARMS CENTER",
    leg: "LEG",
    hat: "HAT"
  };

  const FACE_LABEL = {
    top: "TOP",
    bottom: "BOTTOM",
    front: "FRONT",
    back: "BACK",
    left: "LEFT",
    right: "RIGHT"
  };

  // Box-UV coordinates derived from the standard 64×64 villager texture layout.
  const VILLAGER_UV = {
    head_top: { x: 8, y: 0, w: 8, h: 8 },
    head_bottom: { x: 16, y: 0, w: 8, h: 8 },
    head_right: { x: 0, y: 8, w: 8, h: 10 },
    head_front: { x: 8, y: 8, w: 8, h: 10 },
    head_left: { x: 16, y: 8, w: 8, h: 10 },
    head_back: { x: 24, y: 8, w: 8, h: 10 },

    nose_top: { x: 26, y: 0, w: 2, h: 2 },
    nose_bottom: { x: 28, y: 0, w: 2, h: 2 },
    nose_right: { x: 24, y: 2, w: 2, h: 4 },
    nose_front: { x: 26, y: 2, w: 2, h: 4 },
    nose_left: { x: 28, y: 2, w: 2, h: 4 },
    nose_back: { x: 30, y: 2, w: 2, h: 4 },

    body_top: { x: 22, y: 20, w: 8, h: 6 },
    body_bottom: { x: 30, y: 20, w: 8, h: 6 },
    body_right: { x: 16, y: 26, w: 6, h: 12 },
    body_front: { x: 22, y: 26, w: 8, h: 12 },
    body_left: { x: 30, y: 26, w: 6, h: 12 },
    body_back: { x: 36, y: 26, w: 8, h: 12 },

    leg_top: { x: 4, y: 22, w: 4, h: 4 },
    leg_bottom: { x: 8, y: 22, w: 4, h: 4 },
    leg_right: { x: 0, y: 26, w: 4, h: 12 },
    leg_front: { x: 4, y: 26, w: 4, h: 12 },
    leg_left: { x: 8, y: 26, w: 4, h: 12 },
    leg_back: { x: 12, y: 26, w: 4, h: 12 },

    arm_top: { x: 48, y: 22, w: 4, h: 4 },
    arm_bottom: { x: 52, y: 22, w: 4, h: 4 },
    arm_right: { x: 44, y: 26, w: 4, h: 8 },
    arm_front: { x: 48, y: 26, w: 4, h: 8 },
    arm_left: { x: 52, y: 26, w: 4, h: 8 },
    arm_back: { x: 56, y: 26, w: 4, h: 8 },

    arms_center_top: { x: 44, y: 38, w: 8, h: 4 },
    arms_center_bottom: { x: 52, y: 38, w: 8, h: 4 },
    arms_center_right: { x: 40, y: 42, w: 4, h: 4 },
    arms_center_front: { x: 44, y: 42, w: 8, h: 4 },
    arms_center_left: { x: 52, y: 42, w: 4, h: 4 },
    arms_center_back: { x: 56, y: 42, w: 8, h: 4 }
  };

  const LEGACY_ALIASES = {
    "right arm outer": "arm_front",
    "right arm inner": "arm_back",
    "left arm outer": "arm_left",
    "left arm inner": "arm_right",
    "right leg outer": "leg_front",
    "right leg inner": "leg_back",
    "left leg outer": "leg_left",
    "left leg inner": "leg_right",
    "hat side": "hat_left",
    "hat optional": "hat_front"
  };

  const EXPECTED_PHRASES = [];
  for (const part of PROMPT_PARTS) {
    for (const face of SURFACES) {
      EXPECTED_PHRASES.push({
        phrase: `${PART_LABEL[part]} ${FACE_LABEL[face]}`.toLowerCase(),
        canonical: `${part}_${face}`
      });
    }
  }
  Object.entries(LEGACY_ALIASES).forEach(([phrase, canonical]) => {
    EXPECTED_PHRASES.push({ phrase, canonical });
  });

  const promptOutput = $("promptOutput");
  const designBrief = $("designBrief");
  const sheetCanvas = $("sheetCanvas");
  const sheetCtx = sheetCanvas.getContext("2d", { willReadFrequently: true });
  const resultCanvas = $("resultCanvas");
  const resultCtx = resultCanvas.getContext("2d", { willReadFrequently: true });

  let imageCanvas = null;
  let imageData = null;
  let sourceFileName = "";
  let panels = [];
  let nextPanelId = 1;
  let selectedPanelId = null;
  let drawMode = false;
  let drawStart = null;
  let draftRect = null;
  let lastOcrLabels = [];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeText(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function canonicalDisplay(label) {
    if (!label) return "Non assigné";
    return label.replaceAll("_", " ").toUpperCase();
  }

  function buildPrompt() {
    const idea = designBrief.value.trim() || "[DESCRIBE YOUR CHARACTER DESIGN HERE]";
    const rows = PROMPT_PARTS.map((part) => {
      const labels = SURFACES.map((face) => `${PART_LABEL[part]} ${FACE_LABEL[face]}`);
      return `${PART_LABEL[part]} ROW: ${labels.join(" | ")}`;
    }).join("\n");

    promptOutput.value = `Create a FLAT Minecraft villager character DESIGN SHEET used as input for an automatic UV builder.

IMPORTANT:
- Do NOT create a final Minecraft skin or UV texture.
- Do NOT render a 3D character.
- Use a pure solid black background (#000000).
- Every surface must be a separate, flat, orthographic rectangular panel.
- No perspective, no tilt, no overlap and no decorative frames.
- Leave a large black gap between every panel.
- Put one clear uppercase label directly ABOVE each matching panel.
- Keep every label outside the artwork panel.
- Use exactly 6 columns in this order: TOP, BOTTOM, FRONT, BACK, LEFT, RIGHT.
- Use exactly the rows listed below, in this exact order.
- Keep each row horizontally aligned.
- All surfaces must depict the same character and the same outfit consistently.
- Pixel-art / Minecraft-friendly texture style.
- Do not add unrelated text anywhere else in the image.
- Avoid text printed on the character itself when possible; use simple logos/symbols instead.

EXACT GRID AND LABELS:
${rows}

The HAT row is optional design reference. Keep it if the character has a hat; otherwise still draw simple neutral hat panels so the grid remains stable.

CHARACTER DESIGN BRIEF:
${idea}

QUALITY / CONSISTENCY:
- HEAD FRONT must clearly show the face.
- HEAD LEFT / RIGHT / BACK must continue the same head design.
- NOSE panels describe the protruding villager nose as a separate cuboid.
- BODY panels must continue seamlessly at their edges.
- ARM panels describe the shared villager arm texture.
- ARMS CENTER panels describe the horizontal center section of the villager's folded arms.
- LEG panels describe the shared villager leg texture.
- Keep the palette consistent across all views.
- Prefer simple blocky shapes that survive downscaling to Minecraft resolution.
- The final sheet must be easy for computer vision to crop automatically.`;
  }

  function setStatus(el, message, type = "") {
    el.textContent = message;
    el.className = "texture-status" + (type ? ` is-${type}` : "");
  }

  function populatePartOptions() {
    const list = $("canonicalParts");
    list.innerHTML = "";
    CANONICAL.forEach((label) => {
      const option = document.createElement("option");
      option.value = label;
      list.appendChild(option);
    });
  }

  function placeholder() {
    sheetCanvas.width = 960;
    sheetCanvas.height = 540;
    sheetCtx.fillStyle = "#080a0f";
    sheetCtx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    sheetCtx.fillStyle = "#8e98a8";
    sheetCtx.font = "600 20px system-ui";
    sheetCtx.textAlign = "center";
    sheetCtx.textBaseline = "middle";
    sheetCtx.fillText("Charge une planche générée par IA", sheetCanvas.width / 2, sheetCanvas.height / 2);
  }

  function clearResult() {
    resultCtx.clearRect(0, 0, 64, 64);
    resultCanvas.width = 64;
    resultCanvas.height = 64;
    $("downloadTexture").disabled = true;
    $("mappedCount").textContent = "0 partie mappée";
  }

  async function loadImage(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const node = new Image();
        node.onload = () => resolve(node);
        node.onerror = reject;
        node.src = url;
      });

      const work = document.createElement("canvas");
      work.width = img.naturalWidth;
      work.height = img.naturalHeight;
      const ctx = work.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);

      imageCanvas = work;
      imageData = ctx.getImageData(0, 0, work.width, work.height);
      sourceFileName = file.name;
      panels = [];
      nextPanelId = 1;
      selectedPanelId = null;
      lastOcrLabels = [];
      sheetCanvas.width = work.width;
      sheetCanvas.height = work.height;
      $("sourceMeta").textContent = `${work.width}×${work.height}px`;
      renderSheet();
      renderPanelList();
      clearResult();
      setStatus($("analysisStatus"), `${file.name} chargé. Lance « Analyser automatiquement ».`, "success");
    } catch (error) {
      console.error(error);
      setStatus($("analysisStatus"), "Impossible de lire cette image.", "error");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function renderSheet() {
    if (!imageCanvas) return;
    sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);
    sheetCtx.imageSmoothingEnabled = false;
    sheetCtx.drawImage(imageCanvas, 0, 0);

    for (const panel of panels) {
      const selected = panel.id === selectedPanelId;
      const hue = (panel.id * 67) % 360;
      sheetCtx.save();
      sheetCtx.fillStyle = `hsl(${hue} 90% 60% / ${selected ? 0.22 : 0.10})`;
      sheetCtx.strokeStyle = `hsl(${hue} 95% 72%)`;
      sheetCtx.lineWidth = Math.max(2, Math.round(Math.min(sheetCanvas.width, sheetCanvas.height) / 500));
      sheetCtx.fillRect(panel.x, panel.y, panel.w, panel.h);
      sheetCtx.strokeRect(panel.x + 0.5, panel.y + 0.5, Math.max(1, panel.w - 1), Math.max(1, panel.h - 1));

      if (panel.label) {
        const fontSize = Math.max(13, Math.round(sheetCanvas.height / 55));
        sheetCtx.font = `700 ${fontSize}px system-ui`;
        const text = canonicalDisplay(panel.label);
        const width = Math.min(panel.w, sheetCtx.measureText(text).width + 10);
        sheetCtx.fillStyle = "rgba(0,0,0,.82)";
        sheetCtx.fillRect(panel.x, panel.y, width, fontSize + 7);
        sheetCtx.fillStyle = "#fff";
        sheetCtx.textAlign = "left";
        sheetCtx.textBaseline = "top";
        sheetCtx.fillText(text, panel.x + 4, panel.y + 3, Math.max(1, panel.w - 8));
      }
      sheetCtx.restore();
    }

    if (draftRect) {
      sheetCtx.save();
      sheetCtx.fillStyle = "rgba(138,99,255,.18)";
      sheetCtx.strokeStyle = "#cfbfff";
      sheetCtx.setLineDash([8, 5]);
      sheetCtx.lineWidth = 3;
      sheetCtx.fillRect(draftRect.x, draftRect.y, draftRect.w, draftRect.h);
      sheetCtx.strokeRect(draftRect.x, draftRect.y, draftRect.w, draftRect.h);
      sheetCtx.restore();
    }
  }

  function backgroundColor() {
    const { width, height, data } = imageData;
    const pts = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
      [Math.floor(width / 2), 0],
      [0, Math.floor(height / 2)]
    ];
    const sum = [0, 0, 0];
    for (const [x, y] of pts) {
      const i = (y * width + x) * 4;
      sum[0] += data[i];
      sum[1] += data[i + 1];
      sum[2] += data[i + 2];
    }
    return sum.map((v) => v / pts.length);
  }

  function detectPanelsFromBackground() {
    if (!imageData) {
      setStatus($("analysisStatus"), "Charge d’abord une planche.", "error");
      return [];
    }

    const { width, height, data } = imageData;
    const bg = backgroundColor();
    const tolerance = clamp(Number($("backgroundTolerance").value) || 34, 5, 150);
    const minPercent = clamp(Number($("minPanelPercent").value) || 0.45, 0.05, 10);
    const minBoxArea = width * height * (minPercent / 100);
    const total = width * height;
    const active = new Uint8Array(total);
    const visited = new Uint8Array(total);

    for (let i = 0; i < total; i++) {
      const p = i * 4;
      if (data[p + 3] < 15) continue;
      const dr = data[p] - bg[0];
      const dg = data[p + 1] - bg[1];
      const db = data[p + 2] - bg[2];
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      if (distance > tolerance) active[i] = 1;
    }

    const stack = new Int32Array(total);
    const components = [];

    for (let start = 0; start < total; start++) {
      if (!active[start] || visited[start]) continue;
      let sp = 0;
      stack[sp++] = start;
      visited[start] = 1;
      let count = 0;
      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;

      while (sp > 0) {
        const index = stack[--sp];
        const x = index % width;
        const y = (index / width) | 0;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const pushNeighbor = (next) => {
          if (next < 0 || next >= total || visited[next] || !active[next]) return;
          visited[next] = 1;
          stack[sp++] = next;
        };

        if (x > 0) pushNeighbor(index - 1);
        if (x + 1 < width) pushNeighbor(index + 1);
        if (y > 0) pushNeighbor(index - width);
        if (y + 1 < height) pushNeighbor(index + width);
        if (x > 0 && y > 0) pushNeighbor(index - width - 1);
        if (x + 1 < width && y > 0) pushNeighbor(index - width + 1);
        if (x > 0 && y + 1 < height) pushNeighbor(index + width - 1);
        if (x + 1 < width && y + 1 < height) pushNeighbor(index + width + 1);
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const area = w * h;
      const fill = count / Math.max(1, area);

      if (
        area >= minBoxArea &&
        w >= width * 0.018 &&
        h >= height * 0.055 &&
        fill >= 0.07
      ) {
        components.push({
          id: nextPanelId++,
          x: minX,
          y: minY,
          w,
          h,
          pixelCount: count,
          fill,
          label: "",
          source: "vision",
          confidence: 0
        });
      }
    }

    // Remove components almost fully contained inside a larger candidate.
    const filtered = components.filter((candidate, i) => {
      return !components.some((other, j) => {
        if (i === j || other.w * other.h <= candidate.w * candidate.h) return false;
        const inside =
          candidate.x >= other.x &&
          candidate.y >= other.y &&
          candidate.x + candidate.w <= other.x + other.w &&
          candidate.y + candidate.h <= other.y + other.h;
        return inside && candidate.w * candidate.h < other.w * other.h * 0.55;
      });
    });

    filtered.sort((a, b) => a.y - b.y || a.x - b.x);
    panels = filtered.slice(0, 80);
    selectedPanelId = panels[0]?.id ?? null;
    renderSheet();
    renderPanelList();

    const msg = panels.length
      ? `${panels.length} panneau(x) détecté(s). Lecture des labels recommandée.`
      : "Aucun panneau détecté. Ajuste la tolérance ou trace les panneaux manuellement.";
    setStatus($("analysisStatus"), msg, panels.length ? "success" : "error");
    return panels;
  }

  function createOcrCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = imageCanvas.width;
    canvas.height = imageCanvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const src = imageData.data;
    const out = ctx.createImageData(canvas.width, canvas.height);

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      const nearGrey = max - min < 48;
      const isTextLike = brightness > 105 && nearGrey;
      const v = isTextLike ? 0 : 255;
      out.data[i] = v;
      out.data[i + 1] = v;
      out.data[i + 2] = v;
      out.data[i + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const prev = new Array(b.length + 1);
    const curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (let j = 1; j <= b.length; j++) {
        curr[j] = Math.min(
          curr[j - 1] + 1,
          prev[j] + 1,
          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
      for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
  }

  function matchKnownLabel(text) {
    const normalized = normalizeText(text);
    if (!normalized) return null;

    let best = null;
    for (const item of EXPECTED_PHRASES) {
      if (normalized.includes(item.phrase)) {
        return { canonical: item.canonical, score: 1, phrase: item.phrase };
      }
      const dist = levenshtein(normalized, item.phrase);
      const score = 1 - dist / Math.max(normalized.length, item.phrase.length, 1);
      if (!best || score > best.score) best = { ...item, score };
    }
    return best && best.score >= 0.66 ? best : null;
  }

  function extractOcrLines(data) {
    const words = Array.isArray(data.words) ? data.words : [];
    if (!words.length) {
      return String(data.text || "")
        .split(/\n+/)
        .map((text) => ({ text, bbox: null, confidence: 40 }))
        .filter((line) => line.text.trim());
    }

    const sorted = words
      .filter((w) => String(w.text || "").trim())
      .map((w) => ({
        text: w.text,
        confidence: Number(w.confidence) || 0,
        bbox: w.bbox || {
          x0: w.x0 || 0,
          y0: w.y0 || 0,
          x1: w.x1 || 0,
          y1: w.y1 || 0
        }
      }))
      .sort((a, b) => ((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2) || a.bbox.x0 - b.bbox.x0);

    const tolerance = Math.max(8, imageCanvas.height * 0.015);
    const lines = [];

    for (const word of sorted) {
      const cy = (word.bbox.y0 + word.bbox.y1) / 2;
      let line = lines.find((entry) => Math.abs(entry.cy - cy) <= tolerance);
      if (!line) {
        line = { cy, words: [] };
        lines.push(line);
      }
      line.words.push(word);
      line.cy = line.words.reduce((sum, item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) / line.words.length;
    }

    return lines.map((line) => {
      line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      return {
        text: line.words.map((w) => w.text).join(" "),
        confidence: line.words.reduce((sum, w) => sum + w.confidence, 0) / line.words.length,
        bbox: {
          x0: Math.min(...line.words.map((w) => w.bbox.x0)),
          y0: Math.min(...line.words.map((w) => w.bbox.y0)),
          x1: Math.max(...line.words.map((w) => w.bbox.x1)),
          y1: Math.max(...line.words.map((w) => w.bbox.y1))
        }
      };
    });
  }

  function associateOcrLabels(labels) {
    for (const panel of panels) {
      if (panel.source === "ocr") {
        panel.label = "";
        panel.confidence = 0;
      }
    }

    const used = new Set();
    for (const label of labels) {
      if (!label.match || !label.bbox) continue;
      const lx = (label.bbox.x0 + label.bbox.x1) / 2;
      const labelBottom = label.bbox.y1;

      let best = null;
      for (const panel of panels) {
        if (used.has(panel.id)) continue;
        const px = panel.x + panel.w / 2;
        const gap = panel.y - labelBottom;
        const xDistance = Math.abs(px - lx);
        const xOverlap = Math.max(0, Math.min(panel.x + panel.w, label.bbox.x1) - Math.max(panel.x, label.bbox.x0));
        const acceptableY = gap >= -panel.h * 0.08 && gap <= imageCanvas.height * 0.14;
        if (!acceptableY) continue;
        const score = Math.max(0, gap) * 2 + xDistance - xOverlap * 0.6;
        if (!best || score < best.score) best = { panel, score };
      }

      if (best) {
        best.panel.label = label.match.canonical;
        best.panel.source = "ocr";
        best.panel.confidence = Math.round(Math.min(100, Math.max(0, label.match.score * 100 * (label.confidence / 100))));
        best.panel.ocrText = label.text;
        used.add(best.panel.id);
      }
    }

    applyGridFallback();
    renderPanelList();
    renderSheet();
  }

  function clusterRows(items) {
    const sorted = [...items].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
    const rows = [];
    const tolerance = imageCanvas ? Math.max(12, imageCanvas.height * 0.06) : 40;

    for (const panel of sorted) {
      const cy = panel.y + panel.h / 2;
      let row = rows.find((entry) => Math.abs(entry.cy - cy) < tolerance);
      if (!row) {
        row = { cy, items: [] };
        rows.push(row);
      }
      row.items.push(panel);
      row.cy = row.items.reduce((sum, p) => sum + p.y + p.h / 2, 0) / row.items.length;
    }

    rows.sort((a, b) => a.cy - b.cy);
    rows.forEach((row) => row.items.sort((a, b) => a.x - b.x));
    return rows;
  }

  function applyGridFallback() {
    if (panels.length < 28) return;
    const rows = clusterRows(panels);
    const goodRows = rows.filter((row) => row.items.length >= 4);
    if (goodRows.length < 5) return;

    const rowParts = goodRows.length >= 7
      ? PROMPT_PARTS
      : ["head", "nose", "body", "arm", "arms_center", "leg"];

    rowParts.forEach((part, rowIndex) => {
      const row = goodRows[rowIndex];
      if (!row) return;
      row.items.slice(0, 6).forEach((panel, faceIndex) => {
        if (panel.label) return;
        const face = SURFACES[faceIndex];
        if (!face) return;
        panel.label = `${part}_${face}`;
        panel.source = "grid";
        panel.confidence = 62;
      });
    });
  }

  async function runOcr() {
    if (!imageCanvas) {
      setStatus($("analysisStatus"), "Charge d’abord une planche.", "error");
      return [];
    }
    if (!window.Tesseract) {
      setStatus($("analysisStatus"), "Le module OCR n’a pas pu être chargé.", "error");
      return [];
    }

    $("ocrProgressBar").style.width = "3%";
    setStatus($("analysisStatus"), "OCR en cours… le premier lancement peut prendre quelques secondes.");

    let worker = null;
    try {
      worker = await Tesseract.createWorker("eng", 1, {
        logger: (m) => {
          if (typeof m.progress === "number") {
            $("ocrProgressBar").style.width = `${Math.max(3, Math.round(m.progress * 100))}%`;
          }
          if (m.status) setStatus($("analysisStatus"), `OCR : ${m.status}`);
        }
      });

      const ocrCanvas = createOcrCanvas();
      const result = await worker.recognize(ocrCanvas);
      const lines = extractOcrLines(result.data);
      const labels = lines
        .map((line) => ({ ...line, match: matchKnownLabel(line.text) }))
        .filter((line) => line.match);

      lastOcrLabels = labels;
      associateOcrLabels(labels);
      $("ocrProgressBar").style.width = "100%";

      setStatus(
        $("analysisStatus"),
        labels.length
          ? `${labels.length} label(s) utile(s) reconnu(s). Vérifie les associations ci-dessous.`
          : "Aucun label standard reconnu. L’ordre de grille sera utilisé si possible.",
        labels.length ? "success" : "error"
      );
      return labels;
    } catch (error) {
      console.error(error);
      setStatus($("analysisStatus"), "Échec OCR. Tu peux toujours assigner les panneaux manuellement.", "error");
      return [];
    } finally {
      if (worker) await worker.terminate();
    }
  }

  async function analyzeAutomatically() {
    const detected = detectPanelsFromBackground();
    if (!detected.length) return;
    await runOcr();
    applyGridFallback();
    renderPanelList();
    renderSheet();
  }

  function renderPanelList() {
    const root = $("panelList");
    root.innerHTML = "";
    $("panelCount").textContent = `${panels.length} panneau${panels.length > 1 ? "x" : ""}`;

    if (!panels.length) {
      root.className = "texture-panel-list texture-empty";
      root.textContent = "Charge une planche puis lance l’analyse.";
      return;
    }

    root.className = "texture-panel-list";

    panels.forEach((panel) => {
      const card = document.createElement("div");
      card.className = "texture-panel-item" + (panel.id === selectedPanelId ? " is-selected" : "");

      const thumb = document.createElement("canvas");
      thumb.width = 96;
      thumb.height = 96;
      const tctx = thumb.getContext("2d");
      tctx.imageSmoothingEnabled = false;
      tctx.fillStyle = "#090b10";
      tctx.fillRect(0, 0, 96, 96);
      if (imageCanvas) {
        const scale = Math.min(88 / panel.w, 88 / panel.h);
        const dw = panel.w * scale;
        const dh = panel.h * scale;
        tctx.drawImage(
          imageCanvas,
          panel.x,
          panel.y,
          panel.w,
          panel.h,
          (96 - dw) / 2,
          (96 - dh) / 2,
          dw,
          dh
        );
      }

      const main = document.createElement("div");
      main.className = "texture-panel-item__main";

      const select = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "— Non assigné —";
      select.appendChild(blank);
      CANONICAL.forEach((label) => {
        const option = document.createElement("option");
        option.value = label;
        option.textContent = canonicalDisplay(label);
        if (label === panel.label) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        panel.label = select.value;
        panel.source = "manual";
        panel.confidence = panel.label ? 100 : 0;
        renderSheet();
        updateMappedCount();
      });

      const meta = document.createElement("div");
      meta.className = "texture-panel-item__meta";
      const source = panel.source === "ocr" ? "OCR" : panel.source === "grid" ? "grille" : panel.source === "manual" ? "manuel" : "vision";
      meta.textContent = `x:${panel.x} y:${panel.y} · ${panel.w}×${panel.h} · ${source}${panel.confidence ? ` · ${panel.confidence}%` : ""}`;

      if (panel.ocrText) {
        const ocr = document.createElement("small");
        ocr.textContent = `Lu : “${panel.ocrText}”`;
        main.append(select, meta, ocr);
      } else {
        main.append(select, meta);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "texture-panel-remove";
      remove.textContent = "×";
      remove.title = "Supprimer ce panneau";
      remove.addEventListener("click", (e) => {
        e.stopPropagation();
        panels = panels.filter((p) => p.id !== panel.id);
        if (selectedPanelId === panel.id) selectedPanelId = null;
        renderPanelList();
        renderSheet();
        updateMappedCount();
      });

      card.append(thumb, main, remove);
      card.addEventListener("click", (e) => {
        if (e.target === select || e.target === remove) return;
        selectedPanelId = panel.id;
        renderPanelList();
        renderSheet();
      });

      root.appendChild(card);
    });

    updateMappedCount();
  }

  function updateMappedCount() {
    const direct = new Set(panels.map((p) => p.label).filter((label) => VILLAGER_UV[label]));
    $("mappedCount").textContent = `${direct.size} partie${direct.size > 1 ? "s" : ""} mappée${direct.size > 1 ? "s" : ""}`;
  }

  function eventPixel(event) {
    const rect = sheetCanvas.getBoundingClientRect();
    return {
      x: clamp(Math.floor((event.clientX - rect.left) * sheetCanvas.width / rect.width), 0, sheetCanvas.width - 1),
      y: clamp(Math.floor((event.clientY - rect.top) * sheetCanvas.height / rect.height), 0, sheetCanvas.height - 1)
    };
  }

  function normalizeDrag(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
  }

  function toggleDrawMode() {
    if (!imageCanvas) {
      setStatus($("analysisStatus"), "Charge d’abord une planche.", "error");
      return;
    }
    drawMode = !drawMode;
    drawStart = null;
    draftRect = null;
    $("drawPanel").textContent = drawMode ? "Annuler le tracé" : "Tracer un panneau";
    sheetCanvas.classList.toggle("texture-draw-active", drawMode);
    renderSheet();
  }

  sheetCanvas.addEventListener("pointerdown", (event) => {
    if (!imageCanvas) return;
    if (drawMode) {
      sheetCanvas.setPointerCapture?.(event.pointerId);
      drawStart = eventPixel(event);
      draftRect = { x: drawStart.x, y: drawStart.y, w: 1, h: 1 };
      renderSheet();
      return;
    }

    const p = eventPixel(event);
    const matches = panels
      .filter((panel) => p.x >= panel.x && p.x < panel.x + panel.w && p.y >= panel.y && p.y < panel.y + panel.h)
      .sort((a, b) => a.w * a.h - b.w * b.h);
    selectedPanelId = matches[0]?.id ?? null;
    renderPanelList();
    renderSheet();
  });

  sheetCanvas.addEventListener("pointermove", (event) => {
    if (!drawMode || !drawStart) return;
    draftRect = normalizeDrag(drawStart, eventPixel(event));
    renderSheet();
  });

  sheetCanvas.addEventListener("pointerup", (event) => {
    if (!drawMode || !drawStart) return;
    const rect = normalizeDrag(drawStart, eventPixel(event));
    if (rect.w >= 3 && rect.h >= 3) {
      const panel = {
        id: nextPanelId++,
        ...rect,
        label: "",
        source: "manual",
        confidence: 0
      };
      panels.push(panel);
      selectedPanelId = panel.id;
    }
    drawStart = null;
    draftRect = null;
    drawMode = false;
    $("drawPanel").textContent = "Tracer un panneau";
    sheetCanvas.classList.remove("texture-draw-active");
    renderPanelList();
    renderSheet();
  });

  function panelByLabel(label) {
    return panels.find((panel) => panel.label === label) || null;
  }

  function fallbackSource(label) {
    const [part, face] = label.startsWith("arms_center_")
      ? ["arms_center", label.replace("arms_center_", "")]
      : label.split(/_(?=[^_]+$)/);

    if (part === "nose") {
      return panelByLabel(`head_${face}`) || panelByLabel("head_front");
    }
    if (part === "arms_center") {
      return panelByLabel(`arm_${face}`) || panelByLabel("arm_front") || panelByLabel("body_front");
    }
    return panelByLabel(`${part}_front`) || panelByLabel(`${part}_back`) || null;
  }

  function sourceCropFor(label, panel) {
    const crop = { x: panel.x, y: panel.y, w: panel.w, h: panel.h };

    if (label.startsWith("nose_") && !panel.label.startsWith("nose_")) {
      const face = label.replace("nose_", "");
      if (face === "front") {
        crop.x = Math.round(panel.x + panel.w * 0.38);
        crop.y = Math.round(panel.y + panel.h * 0.42);
        crop.w = Math.max(2, Math.round(panel.w * 0.24));
        crop.h = Math.max(2, Math.round(panel.h * 0.40));
      } else {
        crop.x = Math.round(panel.x + panel.w * 0.35);
        crop.y = Math.round(panel.y + panel.h * 0.35);
        crop.w = Math.max(2, Math.round(panel.w * 0.30));
        crop.h = Math.max(2, Math.round(panel.h * 0.35));
      }
    }

    return crop;
  }

  function drawMappedFace(label, destination, synthesize) {
    let panel = panelByLabel(label);
    let synthetic = false;
    if (!panel && synthesize) {
      panel = fallbackSource(label);
      synthetic = !!panel;
    }
    if (!panel) return { drawn: false, synthetic: false };

    const crop = sourceCropFor(label, panel);
    resultCtx.drawImage(
      imageCanvas,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      destination.x,
      destination.y,
      destination.w,
      destination.h
    );
    return { drawn: true, synthetic };
  }

  function buildTexture() {
    if (!imageCanvas) {
      setStatus($("buildStatus"), "Charge et analyse d’abord une planche.", "error");
      return;
    }

    resultCanvas.width = 64;
    resultCanvas.height = 64;
    resultCtx.clearRect(0, 0, 64, 64);
    resultCtx.imageSmoothingEnabled = !$("pixelSnap").checked;

    const synthesize = $("synthesizeMissing").checked;
    let directCount = 0;
    let syntheticCount = 0;
    const missing = [];

    for (const [label, destination] of Object.entries(VILLAGER_UV)) {
      const direct = panelByLabel(label);
      const result = drawMappedFace(label, destination, synthesize);
      if (result.drawn) {
        if (direct) directCount++;
        else syntheticCount++;
      } else {
        missing.push(label);
      }
    }

    $("downloadTexture").disabled = directCount + syntheticCount === 0;
    $("mappedCount").textContent = `${directCount} directe(s) · ${syntheticCount} complétée(s)`;

    if (directCount + syntheticCount === 0) {
      setStatus($("buildStatus"), "Aucune partie assignée au preset Villager.", "error");
      return;
    }

    const suffix = missing.length ? ` · ${missing.length} face(s) encore vide(s)` : "";
    setStatus(
      $("buildStatus"),
      `Texture 64×64 construite : ${directCount} faces directes, ${syntheticCount} complétées${suffix}.`,
      missing.length ? "" : "success"
    );
  }

  function downloadTexture() {
    resultCanvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = "villager.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  }

  function downloadMapping() {
    const payload = {
      format: "ai-sheet-villager-mapping",
      version: 2,
      sourceFile: sourceFileName || null,
      sourceSize: imageCanvas ? [imageCanvas.width, imageCanvas.height] : null,
      panels: panels.map((panel) => ({
        label: panel.label || null,
        x: panel.x,
        y: panel.y,
        width: panel.w,
        height: panel.h,
        source: panel.source,
        confidence: panel.confidence || 0,
        ocrText: panel.ocrText || null
      }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "villager-sheet-mapping.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  designBrief.addEventListener("input", buildPrompt);
  $("resetPrompt").addEventListener("click", () => {
    designBrief.value = "";
    buildPrompt();
  });

  $("copyPrompt").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(promptOutput.value);
      $("copyPrompt").textContent = "Copié ✓";
      setTimeout(() => { $("copyPrompt").textContent = "Copier le prompt"; }, 1200);
    } catch {
      promptOutput.focus();
      promptOutput.select();
      document.execCommand("copy");
    }
  });

  $("sheetInput").addEventListener("change", () => loadImage($("sheetInput").files?.[0]));
  $("detectPanels").addEventListener("click", detectPanelsFromBackground);
  $("runOcr").addEventListener("click", runOcr);
  $("analyzeSheet").addEventListener("click", analyzeAutomatically);
  $("drawPanel").addEventListener("click", toggleDrawMode);
  $("clearPanels").addEventListener("click", () => {
    panels = [];
    selectedPanelId = null;
    renderPanelList();
    renderSheet();
    clearResult();
  });
  $("buildTexture").addEventListener("click", buildTexture);
  $("downloadTexture").addEventListener("click", downloadTexture);
  $("downloadMapping").addEventListener("click", downloadMapping);

  const drop = $("sheetDrop");
  ["dragenter", "dragover"].forEach((name) => {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add("is-dragging");
    });
  });
  ["dragleave", "drop"].forEach((name) => {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove("is-dragging");
    });
  });
  drop.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) loadImage(file);
  });

  populatePartOptions();
  buildPrompt();
  placeholder();
  clearResult();
  renderPanelList();
})();