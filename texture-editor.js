(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CHATGPT_IMAGES_URL = "https://chatgpt.com/images/";

  const templateCanvas = $("templateCanvas");
  const templateCtx = templateCanvas.getContext("2d");
  const guideCanvas = $("guideCanvas");
  const guideCtx = guideCanvas.getContext("2d");

  let templateFile = null;
  let templateUrl = null;
  let templateImage = null;
  let templateSize = null;

  let guideFile = null;
  let guideUrl = null;
  let guideImage = null;
  let pendingGuidedResult = null;
  let detectedRegions = [];
  let detectedPanels = [];
  let detectedOcrLabels = [];
  let guidedTextureReady = false;
  let guideMaskState = null;

  function autoScaleFor(width, height) {
    const maxDim = Math.max(width, height);
    const scales = [64, 32, 16, 8, 4, 2, 1];
    return scales.find((scale) => maxDim * scale <= 1024) || 1;
  }

  function selectedScale() {
    if (!templateSize) return 16;
    const raw = $("scaleMode").value;
    if (raw === "auto") return autoScaleFor(templateSize.width, templateSize.height);
    return Math.max(1, Number(raw) || 1);
  }

  function targetResolution() {
    if (!templateSize) return { width: 1024, height: 1024, scale: 16 };
    const scale = selectedScale();
    return {
      width: templateSize.width * scale,
      height: templateSize.height * scale,
      scale
    };
  }

  function designText() {
    return $("designBrief").value.trim() || "[DESCRIBE THE CHARACTER / SKIN HERE]";
  }



  function guideBackgroundMode() {
    return document.querySelector('input[name="guideBackgroundMode"]:checked')?.value || "background";
  }

  function selectedUvLayout() {
    return window.minecraftTextureStudio?.getUvLayout
      ? window.minecraftTextureStudio.getUvLayout()
      : null;
  }

  function expectedGuideLabels() {
    const layout = selectedUvLayout();
    if (!layout?.targets?.length) return [];
    return Array.from(new Set(layout.targets.map((target) => normalizeLabel(target.label)).filter(Boolean)));
  }

  function semanticAlias(label) {
    let value = normalizeLabel(label);

    value = value
      .replace(/^HAT_/, "HEADWEAR_")
      .replace(/^ARM_RIGHT_/, "RIGHT_ARM_")
      .replace(/^ARM_LEFT_/, "LEFT_ARM_")
      .replace(/^LEG_RIGHT_/, "RIGHT_LEG_")
      .replace(/^LEG_LEFT_/, "LEFT_LEG_");

    const directional = [
      [/^RIGHT_(ARM|LEG)_OUTER$/, "RIGHT_$1_RIGHT"],
      [/^RIGHT_(ARM|LEG)_INNER$/, "RIGHT_$1_LEFT"],
      [/^LEFT_(ARM|LEG)_OUTER$/, "LEFT_$1_LEFT"],
      [/^LEFT_(ARM|LEG)_INNER$/, "LEFT_$1_RIGHT"]
    ];
    directional.forEach(([pattern, replacement]) => {
      value = value.replace(pattern, replacement);
    });

    return value;
  }

  function levenshteinDistance(a, b) {
    const left = String(a || "");
    const right = String(b || "");
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;

    const previous = new Array(right.length + 1);
    const current = new Array(right.length + 1);
    for (let j = 0; j <= right.length; j++) previous[j] = j;

    for (let i = 1; i <= left.length; i++) {
      current[0] = i;
      for (let j = 1; j <= right.length; j++) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      }
      for (let j = 0; j <= right.length; j++) previous[j] = current[j];
    }
    return previous[right.length];
  }

  function matchTargetLabel(rawLabel) {
    const expected = expectedGuideLabels();
    if (!expected.length) return { label: semanticAlias(rawLabel), score: 0.5 };

    const normalized = semanticAlias(rawLabel);
    if (expected.includes(normalized)) return { label: normalized, score: 1 };

    let best = null;
    for (const target of expected) {
      const distance = levenshteinDistance(normalized, target);
      const score = 1 - distance / Math.max(normalized.length, target.length, 1);
      if (!best || score > best.score) best = { label: target, score };
    }

    return best && best.score >= 0.58 ? best : { label: normalized, score: 0 };
  }

  function imageDataFor(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    return { canvas, ctx, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  }

  function sampleBackgroundColor(imageData) {
    const { width, height, data } = imageData;
    const points = [
      [0,0], [width - 1,0], [0,height - 1], [width - 1,height - 1],
      [Math.floor(width / 2),0], [0,Math.floor(height / 2)]
    ];
    const sum = [0,0,0];
    let count = 0;

    points.forEach(([x,y]) => {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 16) return;
      sum[0] += data[index];
      sum[1] += data[index + 1];
      sum[2] += data[index + 2];
      count++;
    });

    if (!count) return [0,0,0];
    return sum.map((value) => value / count);
  }

  function detectGuidePanels() {
    if (!guideImage) return [];

    const prepared = imageDataFor(guideImage);
    const { width, height, data } = prepared.imageData;
    const mode = guideBackgroundMode();
    const tolerance = Number($("guideBackgroundTolerance")?.value || 34);
    const minPercent = Number($("guideMinPanelPercent")?.value || 0.18);
    const minArea = width * height * (minPercent / 100);
    const background = sampleBackgroundColor(prepared.imageData);
    const total = width * height;
    const active = new Uint8Array(total);
    const visited = new Uint8Array(total);

    for (let i = 0; i < total; i++) {
      const p = i * 4;
      const alpha = data[p + 3];

      if (mode === "transparent") {
        active[i] = alpha >= 24 ? 1 : 0;
      } else {
        if (alpha < 16) continue;
        const dr = data[p] - background[0];
        const dg = data[p + 1] - background[1];
        const db = data[p + 2] - background[2];
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);
        active[i] = distance >= tolerance ? 1 : 0;
      }
    }

    const stack = new Int32Array(total);
    const components = [];

    for (let start = 0; start < total; start++) {
      if (!active[start] || visited[start]) continue;

      let sp = 0;
      stack[sp++] = start;
      visited[start] = 1;
      let count = 0;
      let minX = width, minY = height, maxX = -1, maxY = -1;

      while (sp > 0) {
        const index = stack[--sp];
        const x = index % width;
        const y = (index / width) | 0;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        const push = (next) => {
          if (next < 0 || next >= total || visited[next] || !active[next]) return;
          visited[next] = 1;
          stack[sp++] = next;
        };

        if (x > 0) push(index - 1);
        if (x + 1 < width) push(index + 1);
        if (y > 0) push(index - width);
        if (y + 1 < height) push(index + width);
        if (x > 0 && y > 0) push(index - width - 1);
        if (x + 1 < width && y > 0) push(index - width + 1);
        if (x > 0 && y + 1 < height) push(index + width - 1);
        if (x + 1 < width && y + 1 < height) push(index + width + 1);
      }

      const w = maxX - minX + 1;
      const h = maxY - minY + 1;
      const boxArea = w * h;
      const fill = count / Math.max(1, boxArea);

      if (
        boxArea >= minArea &&
        w >= width * 0.012 &&
        h >= height * 0.04 &&
        fill >= 0.05
      ) {
        components.push({
          x:minX, y:minY, w, h,
          pixelCount:count,
          fill,
          area:boxArea
        });
      }
    }

    const filtered = components.filter((candidate, i) => {
      return !components.some((other, j) => {
        if (i === j || other.area <= candidate.area) return false;
        const contained =
          candidate.x >= other.x - 2 &&
          candidate.y >= other.y - 2 &&
          candidate.x + candidate.w <= other.x + other.w + 2 &&
          candidate.y + candidate.h <= other.y + other.h + 2;
        return contained && candidate.area < other.area * 0.45;
      });
    });

    filtered.sort((a,b) => a.y - b.y || a.x - b.x);
    detectedPanels = filtered.slice(0, 120);
    guideMaskState = { active, width, height };
    return detectedPanels;
  }

  function extractOcrLines(data) {
    let words = Array.isArray(data?.words) ? data.words : [];

    if (!words.length && Array.isArray(data?.blocks)) {
      words = data.blocks.flatMap((block) =>
        (block.paragraphs || []).flatMap((paragraph) =>
          (paragraph.lines || []).flatMap((line) => line.words || [])
        )
      );
    }

    if (!words.length) return [];

    const normalizedWords = words
      .filter((word) => String(word.text || "").trim())
      .map((word) => ({
        text:String(word.text || ""),
        confidence:Number(word.confidence) || 0,
        bbox:word.bbox || { x0:0,y0:0,x1:0,y1:0 }
      }))
      .sort((a,b) =>
        ((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2) ||
        a.bbox.x0 - b.bbox.x0
      );

    const lines = [];
    const tolerance = Math.max(7, guideImage.naturalHeight * 0.012);

    normalizedWords.forEach((word) => {
      const cy = (word.bbox.y0 + word.bbox.y1) / 2;
      let line = lines.find((entry) => Math.abs(entry.cy - cy) <= tolerance);
      if (!line) {
        line = { cy, words:[] };
        lines.push(line);
      }
      line.words.push(word);
      line.cy =
        line.words.reduce((sum,item) => sum + (item.bbox.y0 + item.bbox.y1) / 2, 0) /
        line.words.length;
    });

    return lines.map((line) => {
      line.words.sort((a,b) => a.bbox.x0 - b.bbox.x0);
      return {
        text:line.words.map((word) => word.text).join(" "),
        confidence:
          line.words.reduce((sum,word) => sum + word.confidence, 0) /
          Math.max(1,line.words.length),
        bbox:{
          x0:Math.min(...line.words.map((word) => word.bbox.x0)),
          y0:Math.min(...line.words.map((word) => word.bbox.y0)),
          x1:Math.max(...line.words.map((word) => word.bbox.x1)),
          y1:Math.max(...line.words.map((word) => word.bbox.y1))
        }
      };
    }).sort((a,b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  }

  function looksLikePartLabel(value) {
    const label = normalizeLabel(value);
    if (!label || label.length < 4 || label.length > 90) return false;

    const strongFace = /(FRONT|BACK|TOP|BOTTOM|INNER|OUTER|SIDE|PLANE|OPTIONAL|UP|DOWN)$/;
    if (strongFace.test(label)) return true;

    const lateralFace = /(HEAD|BODY|TORSO|ARM|LEG|WING|FIN|TAIL|NOSE|HAT|HEADWEAR|EAR|HORN|TENTACLE|TENDRIL|RIBCAGE|MANE).*_(LEFT|RIGHT)$/;
    return lateralFace.test(label);
  }

  function combineOcrLabelLines(lines) {
    const candidates = [];

    lines.forEach((line, index) => {
      if (looksLikePartLabel(line.text)) {
        candidates.push({ ...line, rawLabel:normalizeLabel(line.text), lineCount:1 });
      }

      const next = lines[index + 1];
      if (!next) return;

      const horizontalOverlap =
        Math.max(0, Math.min(line.bbox.x1, next.bbox.x1) - Math.max(line.bbox.x0, next.bbox.x0));
      const minWidth = Math.max(1, Math.min(line.bbox.x1 - line.bbox.x0, next.bbox.x1 - next.bbox.x0));
      const overlapRatio = horizontalOverlap / minWidth;
      const verticalGap = next.bbox.y0 - line.bbox.y1;
      const maxHeight = Math.max(line.bbox.y1 - line.bbox.y0, next.bbox.y1 - next.bbox.y0);

      if (overlapRatio >= 0.25 && verticalGap >= -4 && verticalGap <= maxHeight * 1.5) {
        const combinedText = line.text + " " + next.text;
        if (looksLikePartLabel(combinedText)) {
          candidates.push({
            text:combinedText,
            rawLabel:normalizeLabel(combinedText),
            confidence:(line.confidence + next.confidence) / 2,
            lineCount:2,
            bbox:{
              x0:Math.min(line.bbox.x0,next.bbox.x0),
              y0:Math.min(line.bbox.y0,next.bbox.y0),
              x1:Math.max(line.bbox.x1,next.bbox.x1),
              y1:Math.max(line.bbox.y1,next.bbox.y1)
            }
          });
        }
      }
    });

    candidates.sort((a,b) =>
      b.lineCount - a.lineCount ||
      b.confidence - a.confidence ||
      a.bbox.y0 - b.bbox.y0
    );

    const kept = [];
    candidates.forEach((candidate) => {
      const overlapsExisting = kept.some((other) => {
        const ix = Math.max(0, Math.min(candidate.bbox.x1,other.bbox.x1) - Math.max(candidate.bbox.x0,other.bbox.x0));
        const iy = Math.max(0, Math.min(candidate.bbox.y1,other.bbox.y1) - Math.max(candidate.bbox.y0,other.bbox.y0));
        const intersection = ix * iy;
        const area = Math.max(1,(candidate.bbox.x1-candidate.bbox.x0)*(candidate.bbox.y1-candidate.bbox.y0));
        return intersection / area > 0.45;
      });
      if (!overlapsExisting) kept.push(candidate);
    });

    kept.sort((a,b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    return kept;
  }

  function detectPanelInsideCell(label, allLabels) {
    if (!guideMaskState) return null;

    const { active, width, height } = guideMaskState;
    const labelCenterX = (label.bbox.x0 + label.bbox.x1) / 2;
    const labelCenterY = (label.bbox.y0 + label.bbox.y1) / 2;
    const rowTolerance = Math.max(16, height * 0.026);

    const sameRow = allLabels
      .filter((candidate) =>
        Math.abs(((candidate.bbox.y0 + candidate.bbox.y1) / 2) - labelCenterY) <= rowTolerance
      )
      .sort((a,b) =>
        ((a.bbox.x0 + a.bbox.x1) / 2) - ((b.bbox.x0 + b.bbox.x1) / 2)
      );

    const index = sameRow.indexOf(label);
    const previous = index > 0 ? sameRow[index - 1] : null;
    const next = index >= 0 && index + 1 < sameRow.length ? sameRow[index + 1] : null;

    let x0 = 0;
    let x1 = width;

    if (previous) {
      const previousCenter = (previous.bbox.x0 + previous.bbox.x1) / 2;
      x0 = Math.floor((previousCenter + labelCenterX) / 2);
    }
    if (next) {
      const nextCenter = (next.bbox.x0 + next.bbox.x1) / 2;
      x1 = Math.ceil((labelCenterX + nextCenter) / 2);
    }

    const labelHeight = Math.max(1, label.bbox.y1 - label.bbox.y0);
    const y0 = Math.max(0, Math.floor(label.bbox.y1 + 1));

    const belowLabels = allLabels
      .filter((candidate) => {
        if (candidate === label) return false;
        if (candidate.bbox.y0 <= label.bbox.y1 + labelHeight) return false;
        const cx = (candidate.bbox.x0 + candidate.bbox.x1) / 2;
        return cx >= x0 && cx <= x1;
      })
      .sort((a,b) => a.bbox.y0 - b.bbox.y0);

    let y1 = height;
    if (belowLabels.length) {
      y1 = Math.max(y0 + 1, Math.floor(belowLabels[0].bbox.y0 - 2));
    }

    x0 = Math.max(0, Math.min(width - 1, x0));
    x1 = Math.max(x0 + 1, Math.min(width, x1));
    y1 = Math.max(y0 + 1, Math.min(height, y1));

    const cellW = x1 - x0;
    const cellH = y1 - y0;
    const visited = new Uint8Array(cellW * cellH);
    const stack = new Int32Array(cellW * cellH);
    const candidates = [];
    const minPercent = Number($("guideMinPanelPercent")?.value || 0.18);
    const minArea = width * height * (minPercent / 100);

    for (let localStart = 0; localStart < cellW * cellH; localStart++) {
      if (visited[localStart]) continue;
      const localX = localStart % cellW;
      const localY = (localStart / cellW) | 0;
      const globalIndex = (y0 + localY) * width + (x0 + localX);

      if (!active[globalIndex]) {
        visited[localStart] = 1;
        continue;
      }

      let sp = 0;
      stack[sp++] = localStart;
      visited[localStart] = 1;
      let count = 0;
      let minX = cellW, minY = cellH, maxX = -1, maxY = -1;

      while (sp > 0) {
        const localIndex = stack[--sp];
        const lx = localIndex % cellW;
        const ly = (localIndex / cellW) | 0;
        const gx = x0 + lx;
        const gy = y0 + ly;
        count++;

        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;

        const visit = (nx,ny) => {
          if (nx < 0 || ny < 0 || nx >= cellW || ny >= cellH) return;
          const nLocal = ny * cellW + nx;
          if (visited[nLocal]) return;
          const nGlobal = (y0 + ny) * width + (x0 + nx);
          visited[nLocal] = 1;
          if (active[nGlobal]) stack[sp++] = nLocal;
        };

        visit(lx - 1,ly);
        visit(lx + 1,ly);
        visit(lx,ly - 1);
        visit(lx,ly + 1);
        visit(lx - 1,ly - 1);
        visit(lx + 1,ly - 1);
        visit(lx - 1,ly + 1);
        visit(lx + 1,ly + 1);
      }

      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      const area = boxW * boxH;
      const topGap = minY;

      if (
        area >= minArea * 0.65 &&
        boxW >= width * 0.01 &&
        boxH >= height * 0.035 &&
        topGap <= height * 0.16
      ) {
        candidates.push({
          x:x0 + minX,
          y:y0 + minY,
          w:boxW,
          h:boxH,
          area,
          topGap,
          count
        });
      }
    }

    if (!candidates.length) return null;
    candidates.sort((a,b) =>
      a.topGap - b.topGap ||
      b.area - a.area
    );
    return candidates[0];
  }

  function associateLabelsToPanels(labels, panels) {
    const usedFallbackPanels = new Set();
    const regions = [];

    labels.forEach((label) => {
      let panel = detectPanelInsideCell(label, labels);
      let geometryScore = 1;

      if (!panel) {
        const lx = (label.bbox.x0 + label.bbox.x1) / 2;
        const labelBottom = label.bbox.y1;
        let best = null;

        panels.forEach((candidate,index) => {
          if (usedFallbackPanels.has(index)) return;
          const center = candidate.x + candidate.w / 2;
          const gap = candidate.y - labelBottom;
          const distance = Math.abs(center - lx);
          if (gap < -4 || gap > guideImage.naturalHeight * 0.20) return;

          const score = Math.max(0,gap) * 2 + distance;
          if (!best || score < best.score) best = { candidate,index,score,gap,distance };
        });

        if (!best) return;
        usedFallbackPanels.add(best.index);
        panel = best.candidate;
        geometryScore = Math.max(
          0,
          1 - (
            Math.max(0,best.gap) / Math.max(1,guideImage.naturalHeight * 0.20) * 0.6 +
            best.distance / Math.max(1,guideImage.naturalWidth) * 0.4
          )
        );
      }

      const targetMatch = matchTargetLabel(label.rawLabel);

      regions.push({
        sourceLabel:label.rawLabel,
        targetLabel:targetMatch.label,
        ocrConfidence:label.confidence,
        targetScore:targetMatch.score,
        spatialConfidence:geometryScore,
        labelBox:{...label.bbox},
        panel:{...panel}
      });
    });

    detectedRegions = regions;
    return regions;
  }

  function renderGuideAnalysis() {
    renderImage(guideCanvas, guideCtx, guideImage, "Guide annoté");
    if (!guideImage || !detectedRegions.length) return;

    const scale = Math.min(
      guideCanvas.width / guideImage.naturalWidth,
      guideCanvas.height / guideImage.naturalHeight
    );
    const drawW = guideImage.naturalWidth * scale;
    const drawH = guideImage.naturalHeight * scale;
    const offsetX = (guideCanvas.width - drawW) / 2;
    const offsetY = (guideCanvas.height - drawH) / 2;
    const px = (x) => offsetX + x * scale;
    const py = (y) => offsetY + y * scale;

    detectedRegions.forEach((region,index) => {
      const hue = (index * 67) % 360;
      const color = "hsl(" + hue + " 90% 65%)";
      const panel = region.panel;
      const label = region.labelBox;

      guideCtx.save();
      guideCtx.strokeStyle = color;
      guideCtx.fillStyle = "hsla(" + hue + ",90%,65%,0.12)";
      guideCtx.lineWidth = 2;

      guideCtx.fillRect(px(panel.x),py(panel.y),panel.w*scale,panel.h*scale);
      guideCtx.strokeRect(px(panel.x),py(panel.y),panel.w*scale,panel.h*scale);
      guideCtx.strokeRect(
        px(label.x0),py(label.y0),
        (label.x1-label.x0)*scale,(label.y1-label.y0)*scale
      );

      const labelCenterX = px((label.x0+label.x1)/2);
      const labelBottomY = py(label.y1);
      const panelCenterX = px(panel.x+panel.w/2);
      const panelTopY = py(panel.y);
      guideCtx.beginPath();
      guideCtx.moveTo(labelCenterX,labelBottomY);
      guideCtx.lineTo(panelCenterX,panelTopY);
      guideCtx.stroke();

      const text = region.targetLabel || region.sourceLabel;
      guideCtx.font = "700 12px system-ui";
      const textWidth = Math.min(panel.w*scale,guideCtx.measureText(text).width+8);
      guideCtx.fillStyle = "rgba(0,0,0,.82)";
      guideCtx.fillRect(px(panel.x),py(panel.y),textWidth,18);
      guideCtx.fillStyle = "#fff";
      guideCtx.textAlign = "left";
      guideCtx.textBaseline = "top";
      guideCtx.fillText(text,px(panel.x)+4,py(panel.y)+2,Math.max(1,panel.w*scale-8));
      guideCtx.restore();
    });
  }

  function updateDetectedLabelsFromRegions() {
    $("detectedLabels").value = detectedRegions
      .map((region) => region.targetLabel || region.sourceLabel)
      .join("\n");
  }

  function renderSpatialMappings() {
    const root = $("spatialMappings");
    if (!root) return;

    root.innerHTML = "";
    if (!detectedRegions.length) {
      root.className = "texture-spatial-mappings texture-empty";
      root.textContent = "Les associations label → panneau apparaîtront ici.";
      return;
    }

    root.className = "texture-spatial-mappings";
    const targets = expectedGuideLabels();

    detectedRegions.forEach((region,index) => {
      const row = document.createElement("div");
      row.className = "texture-spatial-row";

      const title = document.createElement("div");
      title.className = "texture-spatial-row__title";
      title.innerHTML =
        "<strong>" + region.sourceLabel + "</strong>" +
        "<small>Panneau x:" + region.panel.x + " y:" + region.panel.y +
        " · " + region.panel.w + "×" + region.panel.h + "</small>";

      const select = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "— ne pas mapper —";
      select.appendChild(blank);

      targets.forEach((target) => {
        const option = document.createElement("option");
        option.value = target;
        option.textContent = target;
        if (target === region.targetLabel) option.selected = true;
        select.appendChild(option);
      });

      if (region.targetLabel && !targets.includes(region.targetLabel)) {
        const option = document.createElement("option");
        option.value = region.targetLabel;
        option.textContent = region.targetLabel + " (non trouvé dans le modèle)";
        option.selected = true;
        select.appendChild(option);
      }

      select.addEventListener("change", () => {
        region.targetLabel = select.value;
        updateDetectedLabelsFromRegions();
        updateDetectedPartsSummary();
        renderGuideAnalysis();
        guidedTextureReady = false;
        $("downloadGuidedTexture").disabled = true;
      });

      const confidence = document.createElement("div");
      confidence.className = "texture-spatial-confidence";
      const percent = Math.round(
        Math.max(0,Math.min(1,region.spatialConfidence * 0.55 + (region.targetScore || 0) * 0.45)) * 100
      );
      confidence.textContent = percent + "%";

      row.append(title,select,confidence);
      root.appendChild(row);
    });
  }

  function updateDetectedPartsSummary() {
    const root = $("detectedPartsSummary");
    if (!root) return;

    if (!detectedRegions.length) {
      root.innerHTML = "Aucune partie détectée pour le moment.";
      return;
    }

    const mapped = detectedRegions.filter((region) => region.targetLabel).length;
    const unmatched = detectedRegions.length - mapped;
    const chips = detectedRegions
      .slice(0,80)
      .map((region) => {
        const label = String(region.targetLabel || region.sourceLabel).replace(/[<>&"']/g,"");
        return "<span>" + label + "</span>";
      })
      .join("");

    root.innerHTML =
      "<strong>" + detectedRegions.length + " association" +
      (detectedRegions.length > 1 ? "s" : "") + "</strong>" +
      " · " + mapped + " mappée" + (mapped > 1 ? "s" : "") +
      (unmatched ? " · " + unmatched + " à corriger" : "") +
      "<div class=\"texture-detected-chips\">" + chips + "</div>";
  }

  function imageToPngFile(image, filename) {
    return new Promise((resolve, reject) => {
      if (!image) {
        reject(new Error("Image absente"));
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0);

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Conversion PNG impossible"));
          return;
        }
        resolve(new File([blob], filename, { type: "image/png" }));
      }, "image/png");
    });
  }

  async function previewReferenceIn3D(kind) {
    const isTemplate = kind === "template";
    const image = isTemplate ? templateImage : guideImage;
    const statusId = isTemplate ? "templatePreviewStatus" : "ocrStatus";

    if (!image) {
      $(statusId).textContent = isTemplate
        ? "Charge d'abord le template Minecraft."
        : "Charge d'abord le guide annoté.";
      return false;
    }

    if (!window.minecraftTextureStudio?.loadTextureFile) {
      $(statusId).textContent = "Le viewer 3D n'est pas prêt. Recharge la page.";
      return false;
    }

    try {
      const file = await imageToPngFile(
        image,
        isTemplate ? "minecraft-template-preview.png" : "annotated-uv-guide-preview.png"
      );

      const labels = detectedLabelList();
      $(statusId).textContent = isTemplate
        ? "Projection du template sur le modèle sélectionné…"
        : "Projection du guide annoté sur le modèle sélectionné…";

      await window.minecraftTextureStudio.loadTextureFile(file, { scroll: true });

      if (isTemplate) {
        $(statusId).textContent =
          "Template projeté en 3D. Vérifie que le modèle sélectionné correspond bien au pattern UV avant de générer.";
      } else {
        $(statusId).textContent =
          "Guide projeté en 3D avec " + labels.length +
          " nom(s) détecté(s). Les labels visibles sur le modèle permettent de vérifier quelle zone correspond à quelle partie.";
      }
      return true;
    } catch (error) {
      console.error(error);
      $(statusId).textContent = "Impossible d'afficher cette référence dans le viewer 3D.";
      return false;
    }
  }

  function detectedLabelList() {
    const values = String($("detectedLabels").value || "")
      .split(/\r?\n|,/)
      .map((value) => normalizeLabel(value))
      .filter(Boolean);
    return Array.from(new Set(values));
  }

  function normalizeLabel(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
  }

  function buildDirectPrompt() {
    const design = designText();
    const target = targetResolution();
    const sourceW = templateSize ? templateSize.width : "[REFERENCE WIDTH]";
    const sourceH = templateSize ? templateSize.height : "[REFERENCE HEIGHT]";
    const scale = target.scale;
    const exampleX = 20;
    const exampleY = 32;

    return [
      "You are a professional Minecraft HD entity texture artist.",
      "",
      "You are given a reference Minecraft entity texture / UV atlas.",
      "",
      "Your goal is to create a NEW, HIGH-RESOLUTION texture for the exact same Minecraft entity while preserving the exact UV topology and atlas organization of the supplied reference.",
      "",
      "DESIGN REQUEST:",
      design,
      "",
      "",
      "==================================================",
      "1. REFERENCE IMAGE = IMMUTABLE UV TEMPLATE",
      "==================================================",
      "",
      "The supplied image defines:",
      "",
      "- the entity type",
      "- the UV atlas organization",
      "- the location of every body part",
      "- the orientation of every cube face",
      "- transparent / unused regions",
      "- seams between adjoining faces",
      "",
      "Do NOT redesign or repack the UV layout.",
      "",
      "Do NOT convert it to a Steve/Alex player skin.",
      "",
      "Do NOT reposition body parts.",
      "",
      "Do NOT rotate or mirror UV islands.",
      "",
      "Do NOT crop the atlas.",
      "",
      "Do NOT create a character render.",
      "",
      "The output must remain a FLAT Minecraft entity texture atlas.",
      "",
      "",
      "==================================================",
      "2. CREATE A TRUE HIGH-RESOLUTION TEXTURE",
      "==================================================",
      "",
      "The reference texture is LOW RESOLUTION and is used ONLY",
      "to determine UV structure and placement.",
      "",
      "Reference atlas dimensions:",
      sourceW + " × " + sourceH + " pixels",
      "",
      "Generate the new texture at:",
      target.width + " × " + target.height + " pixels",
      "",
      "This represents a precise " + scale + "× UV scale.",
      "",
      "Every UV coordinate and UV boundary from the original",
      "must therefore be multiplied by exactly " + scale + ".",
      "",
      "Example:",
      "",
      "original UV boundary:",
      "x = " + exampleX,
      "y = " + exampleY,
      "",
      "high-resolution equivalent:",
      "x = " + (exampleX * scale),
      "y = " + (exampleY * scale),
      "",
      "Preserve these scaled boundaries with extremely high precision.",
      "",
      "",
      "IMPORTANT:",
      "",
      "DO NOT simply enlarge the original pixels.",
      "",
      "DO NOT make every original texel into one giant flat-colored",
      scale + " × " + scale + " square.",
      "",
      "Instead, use the extra resolution to CREATE NEW FINE DETAIL",
      "inside the corresponding UV regions.",
      "",
      "",
      "==================================================",
      "3. VISUAL QUALITY",
      "==================================================",
      "",
      "Create a premium high-resolution Minecraft resource-pack texture.",
      "",
      "The texture should contain:",
      "",
      "- fine material detail",
      "- subtle surface variation",
      "- small scratches",
      "- fabric weave",
      "- leather grain",
      "- tiny seams",
      "- stitching",
      "- controlled wear",
      "- subtle dirt",
      "- material-specific highlights",
      "- small color variations",
      "- detailed shading",
      "- carefully painted edges",
      "- local ambient occlusion",
      "- subtle highlights",
      "- coherent light direction",
      "- believable surface depth",
      "",
      "Materials must be visually distinguishable.",
      "",
      "For example:",
      "",
      "cloth should look like cloth,",
      "leather should look like leather,",
      "metal should look metallic,",
      "skin should retain natural variation,",
      "wood should have subtle grain.",
      "",
      "BUT:",
      "",
      "Do not make it photorealistic.",
      "",
      "It must still look appropriate inside Minecraft.",
      "",
      "Think:",
      "",
      "\"premium HD Minecraft resource-pack texture\"",
      "",
      "rather than:",
      "",
      "\"photograph pasted onto a Minecraft model.\"",
      "",
      "",
      "==================================================",
      "4. CONTROL PIXELATION",
      "==================================================",
      "",
      "AVOID:",
      "",
      "- giant blocky pixels",
      "- obvious 8-bit pixel clusters",
      "- crude checkerboard shading",
      "- noisy random pixels",
      "- jagged accidental edges",
      "- low-resolution pixel art",
      "- nearest-neighbor enlargement artifacts",
      "",
      "The image should appear detailed and clean when inspected",
      "at its native " + target.width + " × " + target.height + " resolution.",
      "",
      "Small-scale texture detail is encouraged.",
      "",
      "",
      "==================================================",
      "5. UV SAFETY",
      "==================================================",
      "",
      "The texture must remain compatible with the original model.",
      "",
      "Preserve:",
      "",
      "- exact UV island proportions",
      "- exact relative UV coordinates",
      "- exact face orientations",
      "- exact atlas aspect ratio",
      "- exact transparent regions",
      "- exact separation between unrelated body parts",
      "",
      "Never allow visual information from one UV island",
      "to bleed into another UV island.",
      "",
      "Treat UV island boundaries like hard masks.",
      "",
      "",
      "==================================================",
      "6. SEAM CONTINUITY",
      "==================================================",
      "",
      "Where two UV faces represent neighboring sides of the",
      "same 3D body part, make the material visually continuous.",
      "",
      "Patterns, fabric, clothing, skin coloration and shading",
      "should transition naturally across cube edges.",
      "",
      "Do NOT move the faces to achieve this.",
      "",
      "Paint continuity INSIDE the existing UV mapping.",
      "",
      "",
      "==================================================",
      "7. TRANSPARENCY",
      "==================================================",
      "",
      "Preserve transparent regions exactly where required.",
      "",
      "Unused atlas space must remain transparent.",
      "",
      "Do not add:",
      "",
      "- backgrounds",
      "- shadows behind the atlas",
      "- decorative graphics",
      "- labels",
      "- text",
      "- UV guides",
      "- outlines around UV islands",
      "",
      "",
      "==================================================",
      "8. OUTPUT FORMAT",
      "==================================================",
      "",
      "Output exactly ONE image.",
      "",
      target.width + " × " + target.height + " PNG",
      "RGBA",
      "transparent background where appropriate",
      "",
      "FLAT UV TEXTURE ATLAS ONLY.",
      "",
      "No Minecraft character render.",
      "No 3D preview.",
      "No mockup.",
      "No comparison image.",
      "No grid.",
      "No labels.",
      "No presentation sheet.",
      "",
      "",
      "==================================================",
      "FINAL VALIDATION",
      "==================================================",
      "",
      "Before producing the result, conceptually overlay the output",
      "onto the reference texture.",
      "",
      "The atlas organization must be identical.",
      "",
      "Only two things are allowed to change:",
      "",
      "1. the artistic appearance",
      "2. the resolution",
      "",
      "The UV layout itself must not change.",
      "",
      "The resulting texture must be suitable for application to the",
      "same Minecraft entity model using the same UV organization."
    ].join("\n");
  }

  function buildLabelPrompt() {
    const mode = guideBackgroundMode();
    const labels = expectedGuideLabels();
    const labelBlock = labels.length
      ? labels.map((label) => "- " + label)
      : ["- Use semantic labels such as HEAD_FRONT, BODY_LEFT, LEG_1_FRONT, etc."];

    const backgroundRules = mode === "transparent"
      ? [
          "BACKGROUND MODE: NO BACKGROUND / TRANSPARENT.",
          "The PNG background outside labels and artwork panels must have alpha 0.",
          "Do not draw a colored canvas behind the sheet."
        ]
      : [
          "BACKGROUND MODE: SOLID BACKGROUND.",
          "Use one perfectly uniform pure black background (#000000).",
          "Do not use gradients, texture, noise or shadows in the background."
        ];

    return [
      "You are creating a MACHINE-READABLE Minecraft entity design sheet.",
      "",
      "I will provide the ORIGINAL Minecraft entity texture / UV atlas as the reference image.",
      "Use it to understand which model parts and UV faces exist.",
      "",
      "DESIGN REQUEST:",
      designText(),
      "",
      "",
      "==================================================",
      "1. OUTPUT IS A LABELED DESIGN SHEET, NOT A FINAL UV ATLAS",
      "==================================================",
      "",
      "Do NOT output the final Minecraft texture atlas.",
      "Instead, draw every requested UV face as its own isolated flat rectangular artwork panel.",
      "No perspective. No 3D render. No overlapping panels.",
      "",
      ...backgroundRules,
      "",
      "",
      "==================================================",
      "2. ABSOLUTE LABEL → PANEL RULE",
      "==================================================",
      "",
      "EVERY artwork panel must have exactly one machine-readable label.",
      "The label MUST be directly ABOVE the panel it describes.",
      "The panel directly underneath a label is ALWAYS the part named by that label.",
      "",
      "Do not put labels inside artwork panels.",
      "Do not put a label beside its panel.",
      "Do not use leader lines.",
      "Do not put unrelated text anywhere on the sheet.",
      "",
      "Center each label horizontally over its own panel.",
      "Leave a small clear gap between the label and the top edge of its panel.",
      "Leave a much larger gap between neighboring panels so computer vision can separate them.",
      "",
      "If a label is long, it may use TWO centered lines, but both lines must remain directly above the same panel.",
      "",
      "",
      "==================================================",
      "3. EXACT LABELS TO USE FOR THE CURRENT SELECTED MODEL",
      "==================================================",
      "",
      ...labelBlock,
      "",
      "Use these labels exactly whenever possible.",
      "Do not replace them with synonyms.",
      "Do not duplicate a label for two different panels.",
      "",
      "",
      "==================================================",
      "4. PANEL CONTENT",
      "==================================================",
      "",
      "Each panel is a flat orthographic view of that named face.",
      "Keep the same character design, palette and materials across all panels.",
      "Continue patterns logically across neighboring faces.",
      "Keep important details away from panel edges when possible.",
      "",
      "The panel itself must be easy to crop:",
      "- rectangular",
      "- no shadow outside the panel",
      "- no decorative frame",
      "- no overlap with another panel",
      "- no text inside except text that is intentionally part of the character design",
      "",
      "",
      "==================================================",
      "5. LAYOUT",
      "==================================================",
      "",
      "Arrange panels in clean horizontal rows.",
      "Labels are always above their matching panels.",
      "Prefer left-to-right grouping by body part.",
      "Keep at least 24 pixels of clear empty space between unrelated panels at 1536×1024 scale.",
      "",
      "",
      "==================================================",
      "6. OUTPUT",
      "==================================================",
      "",
      "Output exactly ONE labeled design-sheet image.",
      "Recommended size: 1536 × 1024 PNG.",
      mode === "transparent" ? "RGBA with transparent unused space." : "RGB/RGBA with a pure black unused background.",
      "",
      "No character turnaround render.",
      "No 3D scene.",
      "No comparison image.",
      "",
      "FINAL MACHINE-READABILITY CHECK:",
      "For every label, the first valid rectangular artwork panel immediately BELOW that label must be the part named by the label."
    ].join("\n");
  }

  function buildGuidedPrompt() {
    const target = targetResolution();
    const sourceW = templateSize ? templateSize.width : "[REFERENCE WIDTH]";
    const sourceH = templateSize ? templateSize.height : "[REFERENCE HEIGHT]";
    const labels = detectedLabelList();

    const labelSection = labels.length
      ? [
          "",
          "OCR / MANUAL LABEL LIST DETECTED FROM IMAGE 2:",
          ...labels.map((label) => "- " + label),
          "",
          "Use this list only as a semantic cross-check. The visual location of each label in IMAGE 2 is authoritative for which region it names."
        ]
      : [
          "",
          "No OCR label list is supplied in text. Read the labels directly from IMAGE 2."
        ];

    return [
      "You are a professional Minecraft HD entity texture artist.",
      "",
      "I will provide TWO reference images.",
      "",
      "IMAGE 1 = ORIGINAL MINECRAFT UV TEMPLATE",
      "IMAGE 2 = LABELED DESIGN SHEET WITH SEPARATE ARTWORK PANELS",
      "",
      "IMAGE 1 is the ONLY authority for exact UV coordinates, island boundaries, transparency, orientation and topology.",
      "IMAGE 2 is NOT an atlas. It is a source-art sheet.",
      "In IMAGE 2, each machine-readable label is directly ABOVE the artwork panel it names.",
      "The panel immediately below a label is the visual source for that named UV face.",
      "",
      "Never copy labels, sheet background, spacing or presentation layout from IMAGE 2 into the final texture.",
      "",
      "DESIGN REQUEST:",
      designText(),
      "",
      "",
      "==================================================",
      "1. WHY IMAGE 2 EXISTS",
      "==================================================",
      "",
      "Some Minecraft entity atlases contain repeated generic shapes that are difficult to identify from appearance alone.",
      "Do NOT guess which artwork belongs to which UV face.",
      "Use the explicit label above each panel in IMAGE 2.",
      "",
      "Spatial rule: LABEL ABOVE = PANEL DIRECTLY BELOW.",
      "If several panels look identical, their labels still define which model part they belong to.",
      "",
      ...labelSection,
      "",
      "",
      "==================================================",
      "2. UV TEMPLATE IS IMMUTABLE",
      "==================================================",
      "",
      "IMAGE 1 dimensions:",
      sourceW + " × " + sourceH + " pixels",
      "",
      "Generate the final texture at:",
      target.width + " × " + target.height + " pixels",
      "",
      "This is a precise " + target.scale + "× scale of IMAGE 1.",
      "",
      "Every coordinate and boundary from IMAGE 1 must be multiplied by exactly " + target.scale + ".",
      "",
      "Do NOT redesign or repack the UV layout.",
      "Do NOT convert it to a Steve/Alex player skin.",
      "Do NOT reposition body parts.",
      "Do NOT rotate or mirror UV islands.",
      "Do NOT crop the atlas.",
      "Do NOT change the atlas aspect ratio.",
      "",
      "",
      "==================================================",
      "3. SEMANTIC PAINTING RULE",
      "==================================================",
      "",
      "For each UV region in IMAGE 1, find the panel in IMAGE 2 with the matching label.",
      "Copy/adapt the artwork from that panel into the corresponding UV region.",
      "",
      "Examples:",
      "- HEAD_FRONT receives the face design.",
      "- HEAD_BACK receives the back of the head.",
      "- LEG_1_FRONT and LEG_2_FRONT remain distinct if they are separately labeled.",
      "- TENTACLE_1 and TENTACLE_2 may use coordinated but independently positioned detail.",
      "",
      "When a label includes FRONT, BACK, LEFT, RIGHT, TOP or BOTTOM, respect that orientation exactly.",
      "",
      "",
      "==================================================",
      "4. HD QUALITY",
      "==================================================",
      "",
      "Create a premium high-resolution Minecraft resource-pack texture with fine material detail, subtle surface variation, stitching, scratches, fabric weave, leather grain, controlled wear, subtle dirt, highlights, ambient occlusion and coherent material depth.",
      "",
      "Do not make it photorealistic.",
      "Do not simply upscale the original texels.",
      "Use the extra resolution to create new detail inside the same UV masks.",
      "",
      "",
      "==================================================",
      "5. UV SAFETY AND SEAMS",
      "==================================================",
      "",
      "Treat every UV boundary from IMAGE 1 as a hard mask.",
      "No bleeding between unrelated islands.",
      "Preserve transparent / unused areas exactly.",
      "",
      "Where labels in IMAGE 2 identify neighboring faces of the same body part, continue material patterns naturally across their shared 3D edge without moving the UV faces.",
      "",
      "",
      "==================================================",
      "6. FINAL OUTPUT",
      "==================================================",
      "",
      "Output exactly ONE image.",
      target.width + " × " + target.height + " PNG",
      "RGBA",
      "transparent background where appropriate",
      "",
      "FLAT UV TEXTURE ATLAS ONLY.",
      "",
      "No labels.",
      "No text.",
      "No leader lines.",
      "No UV guides.",
      "No character render.",
      "No 3D preview.",
      "No mockup.",
      "",
      "FINAL CHECK:",
      "IMAGE 1 determines WHERE pixels belong.",
      "IMAGE 2 provides the artwork for each named face using the rule LABEL ABOVE = PANEL BELOW.",
      "The design request determines the intended appearance."
    ].join("\n");
  }

  function rebuildPrompts() {
    $("directPromptOutput").value = buildDirectPrompt();
    $("labelPromptOutput").value = buildLabelPrompt();
    $("guidedPromptOutput").value = buildGuidedPrompt();
    updateResolutionSummary();
    updateDetectedPartsSummary();
  }

  function updateResolutionSummary() {
    const el = $("resolutionSummary");
    if (!templateSize) {
      el.textContent = "Charge un template pour calculer la résolution cible.";
      return;
    }

    const target = targetResolution();
    const auto = $("scaleMode").value === "auto" ? " · auto" : "";
    const oversize = Math.max(target.width, target.height) > 1024;

    el.innerHTML =
      "<strong>" + templateSize.width + "×" + templateSize.height + "</strong>" +
      " → <strong>" + target.width + "×" + target.height + "</strong>" +
      " · échelle UV <strong>" + target.scale + "×</strong>" + auto +
      (oversize ? "<br><span class=\"texture-warning\">La cible dépasse 1024 px sur un axe.</span>" : "");
  }

  function renderImage(canvas, ctx, image, placeholder) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#10141b";
    ctx.fillRect(0, 0, width, height);

    if (!image) {
      ctx.fillStyle = "#8d99aa";
      ctx.font = "600 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(placeholder, width / 2, height / 2);
      return;
    }

    ctx.imageSmoothingEnabled = false;
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    ctx.drawImage(image, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  }

  async function loadImageFile(file, kind) {
    if (!file) return;

    const oldUrl = kind === "template" ? templateUrl : guideUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);

    const url = URL.createObjectURL(file);

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });

      if (kind === "template") {
        templateFile = file;
        templateUrl = url;
        templateImage = image;
        templateSize = { width: image.naturalWidth, height: image.naturalHeight };

        $("templateMeta").textContent =
          templateSize.width + "×" + templateSize.height + "px · " + (file.name || "template");

        renderImage(templateCanvas, templateCtx, templateImage, "Template UV");
        $("openDirectImages").disabled = false;
        $("openLabelImages").disabled = false;
        $("openGuidedImages").disabled = !guideFile;
        $("directStatus").textContent = "Template prêt";
        $("previewTemplate3D") && ($("previewTemplate3D").disabled = false);
      } else {
        guideFile = file;
        guideUrl = url;
        guideImage = image;
        detectedRegions = [];
        detectedPanels = [];
        detectedOcrLabels = [];
        guidedTextureReady = false;

        renderImage(guideCanvas, guideCtx, guideImage, "Guide annoté");
        $("scanGuide").disabled = false;
        $("previewDetectedGuide3D") && ($("previewDetectedGuide3D").disabled = false);
        $("openGuidedImages").disabled = !templateFile;
        $("ocrStatus").textContent =
          "Guide chargé : " + image.naturalWidth + "×" + image.naturalHeight + "px. Lance la détection des noms.";
      }

      rebuildPrompts();
    } catch (error) {
      URL.revokeObjectURL(url);
      console.error(error);
      if (kind === "template") $("directStatus").textContent = "Image invalide";
      else $("ocrStatus").textContent = "Impossible de lire ce guide.";
    }
  }

  async function copyText(textareaId, statusId, message) {
    const text = $(textareaId).value;
    try {
      await navigator.clipboard.writeText(text);
      $(statusId).textContent = message || "Copié ✓";
      return true;
    } catch (error) {
      try {
        const textarea = $(textareaId);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        $(statusId).textContent = message || "Copié ✓";
        return true;
      } catch {
        $(statusId).textContent = "Copie automatique impossible";
        return false;
      }
    }
  }

  async function copyAndOpen(textareaId, statusId, requireTemplate, requireGuide) {
    if (requireTemplate && !templateFile) {
      $(statusId).textContent = "Charge d’abord le template UV";
      return;
    }
    if (requireGuide && !guideFile) {
      $(statusId).textContent = "Charge d’abord le guide annoté";
      return;
    }

    const popup = window.open("about:blank", "_blank");
    await copyText(textareaId, statusId, "Prompt copié ✓");

    if (popup) {
      popup.opener = null;
      popup.location.href = CHATGPT_IMAGES_URL;
    } else {
      $(statusId).textContent = "Prompt copié · autorise les pop-ups pour ouvrir ChatGPT Images";
    }
  }

  async function scanGuideLabels() {
    if (!guideImage) {
      $("ocrStatus").textContent = "Charge d'abord une planche guidée.";
      return;
    }
    if (!window.Tesseract) {
      $("ocrStatus").textContent = "Le module OCR n'a pas pu être chargé.";
      return;
    }

    $("scanGuide").disabled = true;
    $("guideOcrProgress").style.width = "3%";
    $("ocrStatus").textContent = "Détection des panneaux puis OCR des labels…";
    guidedTextureReady = false;
    $("downloadGuidedTexture").disabled = true;

    detectGuidePanels();

    let worker = null;
    try {
      worker = await Tesseract.createWorker("eng", 1, {
        logger:(message) => {
          if (typeof message.progress === "number") {
            $("guideOcrProgress").style.width =
              Math.max(3,Math.round(message.progress * 100)) + "%";
          }
          if (message.status) $("ocrStatus").textContent = "OCR : " + message.status;
        }
      });

      const result = await worker.recognize(guideImage, {}, { text:true, blocks:true });
      const lines = extractOcrLines(result.data || {});
      detectedOcrLabels = combineOcrLabelLines(lines);
      associateLabelsToPanels(detectedOcrLabels,detectedPanels);

      updateDetectedLabelsFromRegions();
      updateDetectedPartsSummary();
      renderSpatialMappings();
      renderGuideAnalysis();
      rebuildPrompts();

      $("guideOcrProgress").style.width = "100%";
      $("previewDetectedGuide3D").disabled = !detectedRegions.length;
      $("buildGuidedTexture").disabled = !detectedRegions.length;

      if (detectedRegions.length) {
        $("ocrStatus").textContent =
          detectedRegions.length + " label(s) associé(s) spatialement à un panneau. " +
          detectedPanels.length + " panneau(x) candidat(s) détecté(s). Vérifie les traits label → panneau.";
      } else {
        $("ocrStatus").textContent =
          "Aucune association label → panneau fiable. Essaie l'autre mode de fond ou ajuste les seuils.";
      }
    } catch (error) {
      console.error(error);
      $("ocrStatus").textContent =
        "Échec OCR. Essaie l'autre mode de fond ou une planche avec des labels plus grands.";
    } finally {
      if (worker) await worker.terminate();
      $("scanGuide").disabled = false;
    }
  }

  function findTargetForLabel(layout,label) {
    const wanted = normalizeLabel(label);
    if (!wanted || !layout?.targets?.length) return null;

    let target = layout.targets.find((item) => normalizeLabel(item.label) === wanted);
    if (target) return target;

    target = layout.targets.find((item) =>
      Array.isArray(item.aliases) &&
      item.aliases.some((alias) => normalizeLabel(alias) === wanted)
    );
    if (target) return target;

    const matched = matchTargetLabel(wanted);
    return layout.targets.find((item) => normalizeLabel(item.label) === normalizeLabel(matched.label)) || null;
  }

  function canvasToPngFile(canvas,filename) {
    return new Promise((resolve,reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Impossible de créer le PNG"));
          return;
        }
        resolve(new File([blob],filename,{type:"image/png"}));
      },"image/png");
    });
  }

  async function buildGuidedTexture(preview3d = true) {
    if (!guideImage || !detectedRegions.length) {
      $("guidedBuildStatus").textContent = "Analyse d'abord la planche guidée.";
      return false;
    }

    const layout = selectedUvLayout();
    if (!layout?.targets?.length) {
      $("guidedBuildStatus").textContent =
        "Le modèle 3D sélectionné ne fournit pas de layout UV exploitable.";
      return false;
    }

    const target = targetResolution();
    const canvas = $("guidedTextureCanvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled = false;

    if (templateImage) {
      ctx.drawImage(templateImage,0,0,templateImage.naturalWidth,templateImage.naturalHeight,0,0,canvas.width,canvas.height);
    }

    const sx = canvas.width / layout.textureWidth;
    const sy = canvas.height / layout.textureHeight;
    const usedUvRects = new Set();
    let mapped = 0;
    let missing = 0;
    let sharedSkipped = 0;

    for (const region of detectedRegions) {
      if (!region.targetLabel) {
        missing++;
        continue;
      }

      const uvTarget = findTargetForLabel(layout,region.targetLabel);
      if (!uvTarget) {
        missing++;
        continue;
      }

      const rect = uvTarget.rect;
      const destination = {
        x:Math.round(rect.x * sx),
        y:Math.round(rect.y * sy),
        w:Math.max(1,Math.round(rect.w * sx)),
        h:Math.max(1,Math.round(rect.h * sy))
      };

      const key = [
        destination.x,destination.y,destination.w,destination.h
      ].join(":");

      if (usedUvRects.has(key)) {
        sharedSkipped++;
        continue;
      }
      usedUvRects.add(key);

      ctx.drawImage(
        guideImage,
        region.panel.x,region.panel.y,region.panel.w,region.panel.h,
        destination.x,destination.y,destination.w,destination.h
      );
      mapped++;
    }

    guidedTextureReady = mapped > 0;
    $("downloadGuidedTexture").disabled = !guidedTextureReady;

    $("guidedBuildStatus").textContent =
      mapped + " face(s) copiée(s) dans l'atlas " +
      canvas.width + "×" + canvas.height +
      (missing ? " · " + missing + " non mappée(s)" : "") +
      (sharedSkipped ? " · " + sharedSkipped + " UV partagé(s) conservé(s) une seule fois" : "") + ".";

    if (preview3d && guidedTextureReady && window.minecraftTextureStudio?.loadTextureFile) {
      const file = await canvasToPngFile(canvas,"guided-generated-texture.png");
      await window.minecraftTextureStudio.loadTextureFile(file,{scroll:true});
      $("guidedBuildStatus").textContent += " Preview 3D chargée.";
    }

    return guidedTextureReady;
  }

  async function previewGeneratedTexture(file, statusId, scroll = true) {
    const status = $(statusId);
    if (!file) {
      status.textContent = "Choisis d'abord un PNG final.";
      return false;
    }
    if (file.type && file.type !== "image/png") {
      status.textContent = "Le viewer 3D attend un fichier PNG.";
      return false;
    }
    if (!window.minecraftTextureStudio || !window.minecraftTextureStudio.loadTextureFile) {
      status.textContent = "Le viewer 3D n'est pas encore prêt. Recharge la page puis réessaie.";
      return false;
    }

    try {
      const model = window.minecraftTextureStudio.getSelectedModel
        ? window.minecraftTextureStudio.getSelectedModel()
        : "modèle sélectionné";
      status.textContent = "Chargement dans le viewer 3D…";
      await window.minecraftTextureStudio.loadTextureFile(file, { scroll });
      status.textContent =
        "PNG chargé dans le viewer 3D avec le modèle « " + model +
        " ». Si la géométrie est incorrecte, change le modèle en haut de la page.";
      return true;
    } catch (error) {
      console.error(error);
      status.textContent = "Impossible d'envoyer ce PNG au viewer 3D.";
      return false;
    }
  }

  function setupDropZone(id, kind) {
    const drop = $(id);
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
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) loadImageFile(file, kind);
    });
  }


  document.querySelectorAll('input[name="guideBackgroundMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      detectedRegions = [];
      detectedPanels = [];
      detectedOcrLabels = [];
      guidedTextureReady = false;
      $("downloadGuidedTexture").disabled = true;
      $("buildGuidedTexture").disabled = true;
      $("previewDetectedGuide3D").disabled = true;
      renderSpatialMappings();
      updateDetectedPartsSummary();
      if (guideImage) renderImage(guideCanvas,guideCtx,guideImage,"Guide annoté");
      rebuildPrompts();
    });
  });

  $("guideBackgroundTolerance")?.addEventListener("input", () => {
    if (guideImage && detectedRegions.length) {
      $("ocrStatus").textContent = "Seuil modifié : relance l'analyse.";
    }
  });

  $("guideMinPanelPercent")?.addEventListener("input", () => {
    if (guideImage && detectedRegions.length) {
      $("ocrStatus").textContent = "Seuil modifié : relance l'analyse.";
    }
  });

  $("buildGuidedTexture")?.addEventListener("click", () => buildGuidedTexture(true));

  $("downloadGuidedTexture")?.addEventListener("click", () => {
    if (!guidedTextureReady) return;
    const canvas = $("guidedTextureCanvas");
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "guided-minecraft-texture.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    },"image/png");
  });

  $("directResultInput")?.addEventListener("change", async () => {
    const file = $("directResultInput").files && $("directResultInput").files[0];
    if (file) await previewGeneratedTexture(file, "directPreviewStatus", true);
  });

  $("guidedResultInput")?.addEventListener("change", async () => {
    pendingGuidedResult =
      $("guidedResultInput").files && $("guidedResultInput").files[0]
        ? $("guidedResultInput").files[0]
        : null;

    $("previewGuidedResult").disabled = !pendingGuidedResult;
    if (pendingGuidedResult) {
      await previewGeneratedTexture(pendingGuidedResult, "guidedPreviewStatus", true);
    }
  });

  $("previewGuidedResult")?.addEventListener("click", async () => {
    await previewGeneratedTexture(pendingGuidedResult, "guidedPreviewStatus", true);
  });


  $("previewTemplate3D")?.addEventListener("click", () => {
    previewReferenceIn3D("template");
  });

  $("previewDetectedGuide3D")?.addEventListener("click", () => {
    buildGuidedTexture(true);
  });


  window.addEventListener("minecraft-model-change", () => {
    detectedRegions.forEach((region) => {
      const match = matchTargetLabel(region.sourceLabel);
      region.targetLabel = match.label;
      region.targetScore = match.score;
    });
    renderSpatialMappings();
    updateDetectedLabelsFromRegions();
    updateDetectedPartsSummary();
    renderGuideAnalysis();
    guidedTextureReady = false;
    $("downloadGuidedTexture").disabled = true;
    rebuildPrompts();
  });

  $("templateInput").addEventListener("change", () => {
    const file = $("templateInput").files && $("templateInput").files[0];
    if (file) loadImageFile(file, "template");
  });

  $("guideInput").addEventListener("change", () => {
    const file = $("guideInput").files && $("guideInput").files[0];
    if (file) loadImageFile(file, "guide");
  });

  $("scaleMode").addEventListener("change", rebuildPrompts);
  $("designBrief").addEventListener("input", rebuildPrompts);
  $("detectedLabels").addEventListener("input", () => {
    rebuildPrompts();
    updateDetectedPartsSummary();
  });

  $("copyDirectPrompt").addEventListener("click", () =>
    copyText("directPromptOutput", "directStatus", "Prompt direct copié ✓"));
  $("openDirectImages").addEventListener("click", () =>
    copyAndOpen("directPromptOutput", "directStatus", true, false));

  $("copyLabelPrompt").addEventListener("click", () =>
    copyText("labelPromptOutput", "guideStatus", "Prompt d’annotation copié ✓"));
  $("openLabelImages").addEventListener("click", () =>
    copyAndOpen("labelPromptOutput", "guideStatus", true, false));

  $("copyGuidedPrompt").addEventListener("click", () =>
    copyText("guidedPromptOutput", "guideStatus", "Prompt guidé copié ✓"));
  $("openGuidedImages").addEventListener("click", () =>
    copyAndOpen("guidedPromptOutput", "guideStatus", true, true));

  $("scanGuide").addEventListener("click", scanGuideLabels);

  $("clearDetectedLabels").addEventListener("click", () => {
    $("detectedLabels").value = "";
    detectedRegions = [];
    detectedPanels = [];
    detectedOcrLabels = [];
    guidedTextureReady = false;
    $("ocrStatus").textContent = "";
    $("guideOcrProgress").style.width = "0";
    $("buildGuidedTexture").disabled = true;
    $("downloadGuidedTexture").disabled = true;
    $("previewDetectedGuide3D").disabled = true;
    renderSpatialMappings();
    if (guideImage) renderImage(guideCanvas,guideCtx,guideImage,"Guide annoté");
    rebuildPrompts();
    updateDetectedPartsSummary();
  });

  setupDropZone("templateDrop", "template");
  setupDropZone("guideDrop", "guide");

  window.addEventListener("beforeunload", () => {
    if (templateUrl) URL.revokeObjectURL(templateUrl);
    if (guideUrl) URL.revokeObjectURL(guideUrl);
  });

  $("openDirectImages").disabled = true;
  $("openLabelImages").disabled = true;
  $("openGuidedImages").disabled = true;
  $("scanGuide").disabled = true;
  $("buildGuidedTexture").disabled = true;
  $("downloadGuidedTexture").disabled = true;
  $("previewDetectedGuide3D").disabled = true;

  renderSpatialMappings();
  renderImage(templateCanvas, templateCtx, null, "Template UV");
  renderImage(guideCanvas, guideCtx, null, "Guide annoté");
  rebuildPrompts();
})();