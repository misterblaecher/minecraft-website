(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const side = (name) => ({
    name,
    canvas: $(name + 'Canvas'),
    ctx: $(name + 'Canvas').getContext('2d', { willReadFrequently: true }),
    input: $(name + 'Input'),
    alphaInput: $(name + 'Alpha'),
    minPixelsInput: $(name + 'MinPixels'),
    meta: $(name + 'Meta'),
    zoneList: $(name + 'Zones'),
    imageCanvas: null,
    imageData: null,
    fileName: '',
    zones: [],
    selectedId: null,
    drawMode: false,
    drawStart: null,
    draftRect: null,
    nextId: 1
  });

  const source = side('source');
  const target = side('target');
  const resultCanvas = $('resultCanvas');
  const resultCtx = resultCanvas.getContext('2d');
  const characterCanvas = $('characterCanvas');
  const characterCtx = characterCanvas.getContext('2d');
  let resultReady = false;

  function setStatus(message, type = '') {
    const el = $('editorStatus');
    el.textContent = message;
    el.className = 'texture-status' + (type ? ' is-' + type : '');
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  function rectColor(id, alpha = 1) {
    const hue = (Number(id) * 67) % 360;
    return alpha === 1 ? `hsl(${hue} 90% 68%)` : `hsl(${hue} 90% 68% / ${alpha})`;
  }

  function createPlaceholder(s, text) {
    s.canvas.width = 640;
    s.canvas.height = 360;
    s.ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    s.ctx.fillStyle = '#10141b';
    s.ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
    s.ctx.fillStyle = '#8d99aa';
    s.ctx.textAlign = 'center';
    s.ctx.textBaseline = 'middle';
    s.ctx.font = '600 18px system-ui';
    s.ctx.fillText(text, s.canvas.width / 2, s.canvas.height / 2);
  }

  createPlaceholder(source, 'Importe une image source');
  createPlaceholder(target, 'Importe un template cible');
  createResultPlaceholder();

  function createResultPlaceholder() {
    resultCanvas.width = 640;
    resultCanvas.height = 360;
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCtx.fillStyle = '#10141b';
    resultCtx.fillRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCtx.fillStyle = '#8d99aa';
    resultCtx.textAlign = 'center';
    resultCtx.textBaseline = 'middle';
    resultCtx.font = '600 18px system-ui';
    resultCtx.fillText('La texture finale apparaîtra ici', resultCanvas.width / 2, resultCanvas.height / 2);
    renderCharacterPreview();
  }

  async function loadImageFile(file, s) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });

      const work = document.createElement('canvas');
      work.width = img.naturalWidth;
      work.height = img.naturalHeight;
      const wctx = work.getContext('2d', { willReadFrequently: true });
      wctx.imageSmoothingEnabled = false;
      wctx.drawImage(img, 0, 0);

      s.imageCanvas = work;
      s.imageData = wctx.getImageData(0, 0, work.width, work.height);
      s.fileName = file.name;
      s.zones = [];
      s.nextId = 1;
      s.selectedId = null;
      s.drawMode = false;
      s.meta.textContent = `${work.width}×${work.height}px`;
      renderSide(s);
      renderZoneList(s);
      markResultDirty();
      setStatus(`${file.name} chargé (${work.width}×${work.height}).`, 'success');
    } catch (error) {
      console.error(error);
      setStatus('Impossible de lire cette image.', 'error');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function markResultDirty() {
    resultReady = false;
    $('downloadPng').disabled = true;
    updateMatchMeta();
  }

  function renderSide(s, draft = null) {
    if (!s.imageCanvas) return;
    if (s.canvas.width !== s.imageCanvas.width) s.canvas.width = s.imageCanvas.width;
    if (s.canvas.height !== s.imageCanvas.height) s.canvas.height = s.imageCanvas.height;

    s.ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
    s.ctx.imageSmoothingEnabled = false;
    s.ctx.drawImage(s.imageCanvas, 0, 0);

    for (const zone of s.zones) {
      const selected = zone.id === s.selectedId;
      s.ctx.save();
      s.ctx.fillStyle = rectColor(zone.id, selected ? 0.25 : 0.13);
      s.ctx.strokeStyle = rectColor(zone.id);
      s.ctx.lineWidth = Math.max(1, Math.round(Math.min(s.canvas.width, s.canvas.height) / 128));
      s.ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      s.ctx.strokeRect(zone.x + .5, zone.y + .5, Math.max(0, zone.w - 1), Math.max(0, zone.h - 1));
      if (zone.name) {
        const fontSize = Math.max(7, Math.min(14, Math.round(zone.h * 0.35)));
        s.ctx.font = `700 ${fontSize}px system-ui`;
        s.ctx.textBaseline = 'top';
        s.ctx.fillStyle = 'rgba(0,0,0,.72)';
        const labelWidth = Math.min(zone.w, s.ctx.measureText(zone.name).width + 4);
        s.ctx.fillRect(zone.x, zone.y, labelWidth, fontSize + 3);
        s.ctx.fillStyle = '#fff';
        s.ctx.fillText(zone.name, zone.x + 2, zone.y + 1, Math.max(1, zone.w - 4));
      }
      s.ctx.restore();
    }

    if (draft) {
      s.ctx.save();
      s.ctx.fillStyle = 'rgba(138,99,255,.22)';
      s.ctx.strokeStyle = '#bca8ff';
      s.ctx.lineWidth = Math.max(1, Math.round(Math.min(s.canvas.width, s.canvas.height) / 128));
      s.ctx.setLineDash([4, 3]);
      s.ctx.fillRect(draft.x, draft.y, draft.w, draft.h);
      s.ctx.strokeRect(draft.x + .5, draft.y + .5, Math.max(0, draft.w - 1), Math.max(0, draft.h - 1));
      s.ctx.restore();
    }
  }

  function eventPixel(event, s) {
    const rect = s.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * s.canvas.width / rect.width);
    const y = Math.floor((event.clientY - rect.top) * s.canvas.height / rect.height);
    return {
      x: clamp(x, 0, Math.max(0, s.canvas.width - 1)),
      y: clamp(y, 0, Math.max(0, s.canvas.height - 1))
    };
  }

  function normalizedDrag(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return {
      x,
      y,
      w: Math.abs(a.x - b.x) + 1,
      h: Math.abs(a.y - b.y) + 1
    };
  }

  function selectAt(event, s) {
    const p = eventPixel(event, s);
    const matches = s.zones
      .filter(z => p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h)
      .sort((a, b) => (a.w * a.h) - (b.w * b.h));
    s.selectedId = matches[0]?.id ?? null;
    renderSide(s);
    renderZoneList(s);
  }

  function bindCanvas(s) {
    s.canvas.addEventListener('pointerdown', (event) => {
      if (!s.imageCanvas) return;
      if (!s.drawMode) {
        selectAt(event, s);
        return;
      }
      s.canvas.setPointerCapture?.(event.pointerId);
      s.drawStart = eventPixel(event, s);
      s.draftRect = { x: s.drawStart.x, y: s.drawStart.y, w: 1, h: 1 };
      renderSide(s, s.draftRect);
    });

    s.canvas.addEventListener('pointermove', (event) => {
      if (!s.drawMode || !s.drawStart) return;
      s.draftRect = normalizedDrag(s.drawStart, eventPixel(event, s));
      renderSide(s, s.draftRect);
    });

    const finish = (event) => {
      if (!s.drawMode || !s.drawStart) return;
      const zoneRect = normalizedDrag(s.drawStart, eventPixel(event, s));
      const zone = {
        id: s.nextId++,
        name: '',
        rotation: 0,
        flipX: false,
        ...zoneRect
      };
      s.zones.push(zone);
      s.selectedId = zone.id;
      s.drawStart = null;
      s.draftRect = null;
      s.drawMode = false;
      s.canvas.classList.remove('texture-draw-active');
      syncDrawButton(s);
      renderSide(s);
      renderZoneList(s);
      markResultDirty();
      setStatus(`Zone créée : x=${zone.x}, y=${zone.y}, ${zone.w}×${zone.h}. Donne-lui maintenant un nom.`, 'success');
    };

    s.canvas.addEventListener('pointerup', finish);
    s.canvas.addEventListener('pointercancel', () => {
      s.drawStart = null;
      s.draftRect = null;
      renderSide(s);
    });
  }

  function syncDrawButton(s) {
    const button = $(s.name === 'source' ? 'drawSource' : 'drawTarget');
    if (!button) return;
    button.textContent = s.drawMode ? 'Annuler le tracé' : 'Tracer une zone';
  }

  function toggleDraw(s) {
    if (!s.imageCanvas) {
      setStatus('Importe d’abord une image.', 'error');
      return;
    }
    s.drawMode = !s.drawMode;
    s.drawStart = null;
    s.draftRect = null;
    s.canvas.classList.toggle('texture-draw-active', s.drawMode);
    syncDrawButton(s);
    renderSide(s);
    setStatus(s.drawMode ? 'Mode tracé actif : glisse sur l’image pour délimiter une pièce.' : 'Mode tracé désactivé.');
  }

  function detectOpaqueComponents(s) {
    if (!s.imageData) {
      setStatus('Importe d’abord une image.', 'error');
      return;
    }

    const { width, height, data } = s.imageData;
    const alphaThreshold = clamp(Number(s.alphaInput.value) || 1, 0, 255);
    const minPixels = Math.max(1, Number(s.minPixelsInput.value) || 1);
    const total = width * height;
    const visited = new Uint8Array(total);
    const stack = new Int32Array(total);
    const found = [];

    const isActive = (index) => data[index * 4 + 3] >= alphaThreshold;

    for (let start = 0; start < total; start++) {
      if (visited[start] || !isActive(start)) continue;

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

        if (x > 0) {
          const n = index - 1;
          if (!visited[n] && isActive(n)) { visited[n] = 1; stack[sp++] = n; }
        }
        if (x + 1 < width) {
          const n = index + 1;
          if (!visited[n] && isActive(n)) { visited[n] = 1; stack[sp++] = n; }
        }
        if (y > 0) {
          const n = index - width;
          if (!visited[n] && isActive(n)) { visited[n] = 1; stack[sp++] = n; }
        }
        if (y + 1 < height) {
          const n = index + width;
          if (!visited[n] && isActive(n)) { visited[n] = 1; stack[sp++] = n; }
        }
      }

      if (count >= minPixels) {
        found.push({
          id: s.nextId++,
          name: '',
          rotation: 0,
          flipX: false,
          x: minX,
          y: minY,
          w: maxX - minX + 1,
          h: maxY - minY + 1,
          pixelCount: count
        });
      }
    }

    found.sort((a, b) => (b.w * b.h) - (a.w * a.h));
    s.zones = found.slice(0, 200);
    s.selectedId = s.zones[0]?.id ?? null;
    renderSide(s);
    renderZoneList(s);
    markResultDirty();

    if (!s.zones.length) {
      setStatus('Aucun îlot opaque détecté. Baisse le seuil alpha ou trace les zones manuellement.', 'error');
    } else if (s.zones.length === 1 && s.zones[0].w === width && s.zones[0].h === height) {
      setStatus('Toute l’image est connectée : la transparence ne sépare pas les pièces. Utilise « Tracer une zone ».', 'error');
    } else {
      setStatus(`${s.zones.length} îlot(s) détecté(s). Nomme chaque pièce avant le remappage.`, 'success');
    }
  }

  function detectEmptyRuns(s) {
    if (!s.imageData) {
      setStatus('Importe d’abord une image.', 'error');
      return;
    }

    const { width, height, data } = s.imageData;
    const alphaThreshold = clamp(Number(s.alphaInput.value) || 1, 1, 255);
    const minPixels = Math.max(1, Number(s.minPixelsInput.value) || 1);
    let active = new Map();
    const rectangles = [];

    for (let y = 0; y < height; y++) {
      const runs = [];
      let x = 0;
      while (x < width) {
        while (x < width && data[(y * width + x) * 4 + 3] >= alphaThreshold) x++;
        if (x >= width) break;
        const start = x;
        while (x < width && data[(y * width + x) * 4 + 3] < alphaThreshold) x++;
        runs.push([start, x - 1]);
      }

      const next = new Map();
      for (const [x0, x1] of runs) {
        const key = x0 + ':' + x1;
        const previous = active.get(key);
        next.set(key, previous
          ? { ...previous, h: previous.h + 1 }
          : { x: x0, y, w: x1 - x0 + 1, h: 1 }
        );
      }

      for (const [key, rect] of active) {
        if (!next.has(key)) rectangles.push(rect);
      }
      active = next;
    }

    for (const rect of active.values()) rectangles.push(rect);

    const useful = rectangles
      .filter(r => r.w * r.h >= minPixels)
      .filter(r => !(r.x === 0 && r.w === width))
      .sort((a, b) => (b.w * b.h) - (a.w * a.h))
      .slice(0, 120)
      .map(r => ({
        id: s.nextId++,
        name: '',
        rotation: 0,
        flipX: false,
        ...r
      }));

    s.zones = useful;
    s.selectedId = useful[0]?.id ?? null;
    renderSide(s);
    renderZoneList(s);
    markResultDirty();

    setStatus(
      useful.length
        ? `${useful.length} zone(s) transparente(s) rectangulaire(s) détectée(s). Garde seulement celles qui servent réellement au modèle.`
        : 'Aucune zone transparente rectangulaire utile détectée.',
      useful.length ? 'success' : 'error'
    );
  }

  function renderZoneList(s) {
    const root = s.zoneList;
    root.innerHTML = '';
    if (!s.zones.length) {
      root.className = 'texture-zones texture-empty';
      root.textContent = 'Aucune zone.';
      return;
    }

    root.className = 'texture-zones';
    for (const zone of s.zones) {
      const row = document.createElement('div');
      row.className = 'texture-zone' + (zone.id === s.selectedId ? ' is-selected' : '');
      row.dataset.zoneId = String(zone.id);

      const name = document.createElement('input');
      name.type = 'text';
      name.placeholder = 'ex. head_front';
      name.setAttribute('list', 'partNames');
      name.value = zone.name || '';
      name.title = 'Nom de la partie';
      name.addEventListener('input', () => {
        zone.name = normalizeName(name.value);
        if (name.value !== zone.name && /\s|-/.test(name.value)) {
          name.value = zone.name;
        }
        renderSide(s);
        markResultDirty();
      });

      const makeNumber = (key, label) => {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = key === 'w' || key === 'h' ? '1' : '0';
        input.value = String(zone[key]);
        input.title = label;
        input.setAttribute('aria-label', label);
        input.addEventListener('change', () => {
          if (!s.imageCanvas) return;
          const max = key === 'x' || key === 'w' ? s.imageCanvas.width : s.imageCanvas.height;
          let value = Math.round(Number(input.value) || 0);
          if (key === 'w' || key === 'h') value = Math.max(1, value);
          else value = Math.max(0, value);
          zone[key] = value;

          zone.x = clamp(zone.x, 0, s.imageCanvas.width - 1);
          zone.y = clamp(zone.y, 0, s.imageCanvas.height - 1);
          zone.w = clamp(zone.w, 1, s.imageCanvas.width - zone.x);
          zone.h = clamp(zone.h, 1, s.imageCanvas.height - zone.y);

          renderZoneList(s);
          renderSide(s);
          markResultDirty();
        });
        return input;
      };

      const actions = document.createElement('div');
      actions.className = 'texture-zone__actions';

      const rotate = document.createElement('button');
      rotate.type = 'button';
      rotate.textContent = zone.rotation ? `↻${zone.rotation}°` : '↻';
      rotate.title = 'Tourner la source de 90° lors du transfert';
      rotate.addEventListener('click', () => {
        zone.rotation = ((zone.rotation || 0) + 90) % 360;
        renderZoneList(s);
        markResultDirty();
      });

      const flip = document.createElement('button');
      flip.type = 'button';
      flip.textContent = zone.flipX ? '⇋✓' : '⇋';
      flip.title = 'Retourner horizontalement lors du transfert';
      flip.addEventListener('click', () => {
        zone.flipX = !zone.flipX;
        renderZoneList(s);
        markResultDirty();
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.title = 'Supprimer la zone';
      remove.addEventListener('click', () => {
        s.zones = s.zones.filter(z => z.id !== zone.id);
        if (s.selectedId === zone.id) s.selectedId = null;
        renderZoneList(s);
        renderSide(s);
        markResultDirty();
      });

      actions.append(rotate, flip, remove);
      row.append(
        name,
        makeNumber('x', 'X'),
        makeNumber('y', 'Y'),
        makeNumber('w', 'Largeur'),
        makeNumber('h', 'Hauteur'),
        actions
      );

      row.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT') return;
        s.selectedId = zone.id;
        renderZoneList(s);
        renderSide(s);
      });

      root.appendChild(row);
    }
  }

  function transformedCrop(s, zone) {
    const crop = document.createElement('canvas');
    crop.width = zone.w;
    crop.height = zone.h;
    const cctx = crop.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    cctx.drawImage(s.imageCanvas, zone.x, zone.y, zone.w, zone.h, 0, 0, zone.w, zone.h);

    const rotation = ((zone.rotation || 0) % 360 + 360) % 360;
    const swap = rotation === 90 || rotation === 270;
    const out = document.createElement('canvas');
    out.width = swap ? zone.h : zone.w;
    out.height = swap ? zone.w : zone.h;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.translate(out.width / 2, out.height / 2);
    if (zone.flipX) octx.scale(-1, 1);
    octx.rotate(rotation * Math.PI / 180);
    octx.drawImage(crop, -zone.w / 2, -zone.h / 2);
    return out;
  }

  function buildResult(showStatus = true) {
    if (!source.imageCanvas || !target.imageCanvas) {
      if (showStatus) setStatus('Importe une image source et un template cible.', 'error');
      return;
    }

    resultCanvas.width = target.imageCanvas.width;
    resultCanvas.height = target.imageCanvas.height;
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    resultCtx.imageSmoothingEnabled = false;

    if ($('keepTarget').checked) {
      resultCtx.drawImage(target.imageCanvas, 0, 0);
    }

    const sourceByName = new Map();
    for (const zone of source.zones) {
      const key = normalizeName(zone.name);
      if (key && !sourceByName.has(key)) sourceByName.set(key, zone);
    }

    let matches = 0;
    for (const destination of target.zones) {
      const key = normalizeName(destination.name);
      const origin = sourceByName.get(key);
      if (!key || !origin) continue;
      const piece = transformedCrop(source, origin);
      if ($('fitMode').checked) {
        resultCtx.drawImage(piece, 0, 0, piece.width, piece.height, destination.x, destination.y, destination.w, destination.h);
      } else {
        resultCtx.save();
        resultCtx.beginPath();
        resultCtx.rect(destination.x, destination.y, destination.w, destination.h);
        resultCtx.clip();
        resultCtx.drawImage(piece, destination.x, destination.y);
        resultCtx.restore();
      }
      matches++;
    }

    resultReady = true;
    $('downloadPng').disabled = false;
    $('matchMeta').textContent = `${matches} correspondance${matches > 1 ? 's' : ''}`;
    renderCharacterPreview();

    if (showStatus) {
      if (matches) {
        setStatus(`Texture générée : ${matches} pièce(s) copiée(s) vers le template ${resultCanvas.width}×${resultCanvas.height}.`, 'success');
      } else {
        setStatus('Aucune correspondance. Donne exactement le même nom à une zone source et à sa zone cible.', 'error');
      }
    }
  }

  function updateMatchMeta() {
    const sourceNames = new Set(source.zones.map(z => normalizeName(z.name)).filter(Boolean));
    const count = target.zones.filter(z => sourceNames.has(normalizeName(z.name))).length;
    $('matchMeta').textContent = `${count} correspondance${count > 1 ? 's' : ''}`;
  }

  function targetZone(name) {
    return target.zones.find(z => normalizeName(z.name) === name);
  }

  function drawResultPart(zone, dx, dy, dw, dh, mirror = false) {
    if (!zone || !resultReady) {
      characterCtx.save();
      characterCtx.strokeStyle = 'rgba(255,255,255,.14)';
      characterCtx.strokeRect(dx + .5, dy + .5, dw - 1, dh - 1);
      characterCtx.restore();
      return;
    }
    characterCtx.save();
    characterCtx.imageSmoothingEnabled = false;
    if (mirror) {
      characterCtx.translate(dx + dw, dy);
      characterCtx.scale(-1, 1);
      characterCtx.drawImage(resultCanvas, zone.x, zone.y, zone.w, zone.h, 0, 0, dw, dh);
    } else {
      characterCtx.drawImage(resultCanvas, zone.x, zone.y, zone.w, zone.h, dx, dy, dw, dh);
    }
    characterCtx.restore();
  }

  function renderCharacterPreview() {
    characterCtx.clearRect(0, 0, characterCanvas.width, characterCanvas.height);
    const gradient = characterCtx.createLinearGradient(0, 0, 0, characterCanvas.height);
    gradient.addColorStop(0, '#151b25');
    gradient.addColorStop(1, '#0e1117');
    characterCtx.fillStyle = gradient;
    characterCtx.fillRect(0, 0, characterCanvas.width, characterCanvas.height);

    const head = targetZone('head_front');
    const body = targetZone('body_front') || targetZone('robe_front');
    const arm = targetZone('arm_front');
    const leg = targetZone('leg_front');
    const nose = targetZone('nose_front');
    const hat = targetZone('hat_front');

    drawResultPart(head, 95, 26, 90, 90);
    drawResultPart(hat, 91, 18, 98, 38);
    drawResultPart(body, 96, 120, 88, 116);
    drawResultPart(arm, 66, 126, 26, 108);
    drawResultPart(arm, 188, 126, 26, 108, true);
    drawResultPart(leg, 100, 240, 36, 104);
    drawResultPart(leg, 144, 240, 36, 104, true);
    drawResultPart(nose, 128, 74, 24, 38);

    characterCtx.fillStyle = 'rgba(255,255,255,.32)';
    characterCtx.font = '12px system-ui';
    characterCtx.textAlign = 'center';
    characterCtx.fillText('preview simplifiée', characterCanvas.width / 2, 354);
  }

  function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadPng() {
    if (!resultReady) {
      setStatus('Génère d’abord la texture.', 'error');
      return;
    }
    resultCanvas.toBlob((blob) => {
      if (!blob) return;
      const base = (target.fileName || 'minecraft-texture').replace(/\.[^.]+$/, '');
      downloadBlob(blob, base + '-remapped.png');
    }, 'image/png');
  }

  function zoneForJson(zone) {
    return {
      name: normalizeName(zone.name),
      x: zone.x,
      y: zone.y,
      w: zone.w,
      h: zone.h,
      rotation: zone.rotation || 0,
      flipX: !!zone.flipX
    };
  }

  function downloadJson() {
    const payload = {
      format: 'minecraft-uv-mapper',
      version: 1,
      source: {
        file: source.fileName || null,
        width: source.imageCanvas?.width || null,
        height: source.imageCanvas?.height || null,
        zones: source.zones.map(zoneForJson)
      },
      target: {
        file: target.fileName || null,
        width: target.imageCanvas?.width || null,
        height: target.imageCanvas?.height || null,
        zones: target.zones.map(zoneForJson)
      }
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      'minecraft-uv-zones.json'
    );
    setStatus('Configuration JSON téléchargée.', 'success');
  }

  async function importJson(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload.format !== 'minecraft-uv-mapper') throw new Error('Format inconnu');

      const apply = (s, value) => {
        if (!value?.zones) return;
        s.zones = value.zones.map((z) => ({
          id: s.nextId++,
          name: normalizeName(z.name),
          x: Math.max(0, Math.round(Number(z.x) || 0)),
          y: Math.max(0, Math.round(Number(z.y) || 0)),
          w: Math.max(1, Math.round(Number(z.w) || 1)),
          h: Math.max(1, Math.round(Number(z.h) || 1)),
          rotation: [0, 90, 180, 270].includes(Number(z.rotation)) ? Number(z.rotation) : 0,
          flipX: !!z.flipX
        }));
        s.selectedId = s.zones[0]?.id ?? null;
        if (s.imageCanvas) {
          s.zones.forEach(z => {
            z.x = clamp(z.x, 0, s.imageCanvas.width - 1);
            z.y = clamp(z.y, 0, s.imageCanvas.height - 1);
            z.w = clamp(z.w, 1, s.imageCanvas.width - z.x);
            z.h = clamp(z.h, 1, s.imageCanvas.height - z.y);
          });
          renderSide(s);
        }
        renderZoneList(s);
      };

      apply(source, payload.source);
      apply(target, payload.target);
      markResultDirty();
      setStatus('Configuration JSON importée. Les images doivent être chargées séparément.', 'success');
    } catch (error) {
      console.error(error);
      setStatus('Ce fichier JSON n’est pas une configuration UV valide.', 'error');
    } finally {
      $('jsonInput').value = '';
    }
  }

  function clearZones(s) {
    s.zones = [];
    s.selectedId = null;
    renderZoneList(s);
    renderSide(s);
    markResultDirty();
  }

  source.input.addEventListener('change', () => loadImageFile(source.input.files?.[0], source));
  target.input.addEventListener('change', () => loadImageFile(target.input.files?.[0], target));

  $('detectSource').addEventListener('click', () => detectOpaqueComponents(source));
  $('detectTarget').addEventListener('click', () => detectOpaqueComponents(target));
  $('detectSourceEmpty')?.addEventListener('click', () => detectEmptyRuns(source));
  $('detectTargetEmpty')?.addEventListener('click', () => detectEmptyRuns(target));

  $('drawSource').addEventListener('click', () => toggleDraw(source));
  $('drawTarget').addEventListener('click', () => toggleDraw(target));
  $('clearSourceZones').addEventListener('click', () => clearZones(source));
  $('clearTargetZones').addEventListener('click', () => clearZones(target));

  $('buildResult').addEventListener('click', () => buildResult(true));
  $('keepTarget').addEventListener('change', () => resultReady && buildResult(false));
  $('fitMode').addEventListener('change', () => resultReady && buildResult(false));
  $('downloadPng').addEventListener('click', downloadPng);
  $('downloadJson').addEventListener('click', downloadJson);
  $('loadJson').addEventListener('click', () => $('jsonInput').click());
  $('jsonInput').addEventListener('change', () => importJson($('jsonInput').files?.[0]));

  bindCanvas(source);
  bindCanvas(target);
  renderZoneList(source);
  renderZoneList(target);
})();
