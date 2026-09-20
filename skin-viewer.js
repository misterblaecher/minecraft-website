(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CEM_DATA_ROOTS = [
    "https://wynem.com/assets/json/cem_template_models.json",
    "https://raw.githubusercontent.com/ewanhowell5195/wynem/main/src/assets/json/cem_template_models.json",
    "https://cdn.jsdelivr.net/gh/ewanhowell5195/wynem/src/assets/json/cem_template_models.json"
  ];

  const playerCanvas = $("skinCanvas");
  const entityCanvas = $("entityCanvas");
  const stage = $("viewerStage");

  let playerViewer = null;
  let catalog = null;
  let catalogEntries = [];
  let selectedEntry = null;
  let currentFile = null;
  let currentObjectUrl = null;
  let currentImageSize = null;

  let entityRenderer = null;
  let entityScene = null;
  let entityCamera = null;
  let entityViewRoot = null;
  let entityModelRoot = null;
  let entityTexture = null;
  let entityBaseScale = 1;
  let entityRotationX = -0.08;
  let entityRotationY = 0;
  let entityDragging = false;
  let entityPointer = { x: 0, y: 0 };
  let lastFrame = performance.now();

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setStatus(message, type) {
    const el = $("viewerStatus");
    el.textContent = message;
    el.className = "viewer-status" + (type ? " is-" + type : "");
  }

  function humanize(id) {
    return String(id || "")
      .replace(/_\d+(?:\.\d+)?$/g, "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " o";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
    return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  async function fetchCatalog() {
    let lastError = null;
    for (const url of CEM_DATA_ROOTS) {
      try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.json();
        if (!data || !data.models || !Array.isArray(data.categories)) throw new Error("Catalogue invalide");
        return data;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Catalogue indisponible");
  }

  function flattenCatalog(data) {
    const entries = [];
    const seen = new Set();

    function addEntry(raw, categoryName, sectionName, parent) {
      if (!raw || raw.type === "heading" || !raw.id || raw.textureless) return;
      const modelKey = raw.model || raw.id;
      const record = data.models && data.models[modelKey];
      if (record && record.model && !seen.has(raw.id)) {
        entries.push({
          id: raw.id,
          name: raw.name || humanize(raw.id),
          modelKey,
          category: categoryName || "Minecraft",
          section: sectionName || "",
          texture: raw.texture || (parent && parent.texture) || null,
          vanillaTextures: raw.vanilla_textures || null
        });
        seen.add(raw.id);
      }
      if (Array.isArray(raw.variants)) {
        raw.variants.forEach((variant) => addEntry(variant, categoryName, sectionName, raw));
      }
    }

    for (const category of data.categories || []) {
      if (!category || !Array.isArray(category.entities)) continue;
      let section = "";
      for (const entity of category.entities) {
        if (entity && entity.type === "heading") {
          section = entity.text || "";
          continue;
        }
        addEntry(entity, category.name, section, null);
      }
    }

    entries.sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.section !== b.section) return a.section.localeCompare(b.section);
      return a.name.localeCompare(b.name);
    });
    return entries;
  }

  async function loadCatalog() {
    try {
      catalog = await fetchCatalog();
      catalogEntries = flattenCatalog(catalog);
      buildEntityOptions("");
      $("catalogStatus").textContent =
        catalogEntries.length + " modèles/variantes disponibles · catalogue CEM v" + (catalog.version || "?");
      $("catalogStatus").classList.add("is-success");
    } catch (error) {
      console.error(error);
      $("catalogStatus").textContent = "Catalogue CEM indisponible. Le mode Player reste utilisable.";
      $("catalogStatus").classList.add("is-error");
      catalogEntries = [];
      buildEntityOptions("");
    }
  }

  function buildEntityOptions(query) {
    const select = $("entityType");
    const previous = select.value || "player";
    const normalized = String(query || "").trim().toLowerCase();
    select.innerHTML = "";

    const player = document.createElement("option");
    player.value = "player";
    player.textContent = "Player (Steve / Alex)";
    select.appendChild(player);

    const grouped = new Map();
    for (const entry of catalogEntries) {
      const haystack = (entry.name + " " + entry.id + " " + entry.category + " " + entry.section).toLowerCase();
      if (normalized && !haystack.includes(normalized)) continue;
      const groupName = entry.section ? entry.category + " · " + entry.section : entry.category;
      if (!grouped.has(groupName)) grouped.set(groupName, []);
      grouped.get(groupName).push(entry);
    }

    for (const pair of grouped) {
      const groupName = pair[0];
      const entries = pair[1];
      const group = document.createElement("optgroup");
      group.label = groupName;
      for (const entry of entries) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.name;
        option.dataset.modelKey = entry.modelKey;
        group.appendChild(option);
      }
      select.appendChild(group);
    }

    const exists = Array.from(select.options).some((option) => option.value === previous);
    select.value = exists ? previous : "player";
    if (!exists && previous !== "player") onEntitySelectionChanged();
  }

  function parseSelectedModel() {
    if ($("entityType").value === "player" || !catalog) return null;
    const entry = catalogEntries.find((item) => item.id === $("entityType").value);
    if (!entry) return null;
    const raw = catalog.models && catalog.models[entry.modelKey] && catalog.models[entry.modelKey].model;
    if (!raw) return null;
    try {
      return {
        entry,
        model: typeof raw === "string" ? JSON.parse(raw) : raw
      };
    } catch (error) {
      console.error("Invalid CEM model", error);
      return null;
    }
  }

  function expectedTextureSize() {
    if ($("entityType").value === "player") return [64, 64];
    const selected = parseSelectedModel();
    const size = selected && selected.model && selected.model.textureSize;
    return Array.isArray(size) && size.length >= 2 ? [Number(size[0]), Number(size[1])] : [64, 64];
  }

  function updateEntityMeta() {
    const meta = $("entityMeta");
    const playerMode = $("entityType").value === "player";

    if (playerMode) {
      selectedEntry = null;
      meta.innerHTML = "<strong>Player</strong><span>UV natif : 64×64 (64×32 legacy accepté)</span>";
      $("previewTitle").textContent = "Player 3D";
      $("playerOptions").hidden = false;
      $("playerAnimationControls").hidden = false;
    } else {
      const selected = parseSelectedModel();
      selectedEntry = selected && selected.entry;
      const size = (selected && selected.model && selected.model.textureSize) || [64, 64];
      const textureInfo = selectedEntry && selectedEntry.texture
        ? " · texture: " + (Array.isArray(selectedEntry.texture) ? "multiple" : selectedEntry.texture)
        : "";
      meta.innerHTML =
        "<strong>" + escapeHtml((selectedEntry && selectedEntry.name) || $("entityType").value) + "</strong>" +
        "<span>UV natif : " + size[0] + "×" + size[1] + escapeHtml(textureInfo) + "</span>";
      $("previewTitle").textContent = ((selectedEntry && selectedEntry.name) || "Entity") + " 3D";
      $("playerOptions").hidden = true;
      $("playerAnimationControls").hidden = true;
    }

    updateUvScaleInfo();
  }

  function inspectImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const result = { width: image.naturalWidth, height: image.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(result);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Image invalide"));
      };
      image.src = url;
    });
  }

  function updateUvScaleInfo() {
    const el = $("uvScaleInfo");
    if (!currentImageSize) {
      el.textContent = "";
      el.className = "viewer-scale-info";
      return;
    }

    if ($("entityType").value === "player") {
      const width = currentImageSize.width;
      const height = currentImageSize.height;
      const modern = width === height;
      const legacy = width === height * 2;
      if (modern && width % 64 === 0) {
        const scale = (width / 64).toFixed(2).replace(".00", "");
        el.textContent = "Pattern Player 64×64 · échelle UV " + scale + "×";
        el.className = "viewer-scale-info is-good";
      } else if (legacy && width % 64 === 0) {
        const scale = (width / 64).toFixed(2).replace(".00", "");
        el.textContent = "Pattern Player legacy 64×32 · échelle UV " + scale + "×";
        el.className = "viewer-scale-info is-good";
      } else {
        el.textContent = "Attention : le ratio de l’image ne correspond pas à un skin Player 64×64 / 64×32.";
        el.className = "viewer-scale-info is-warning";
      }
      return;
    }

    const expected = expectedTextureSize();
    const baseW = expected[0];
    const baseH = expected[1];
    const scaleX = currentImageSize.width / baseW;
    const scaleY = currentImageSize.height / baseH;
    const sameScale = Math.abs(scaleX - scaleY) < 0.001;

    if (sameScale) {
      const exact = Number.isInteger(scaleX) ? scaleX + "×" : scaleX.toFixed(3) + "×";
      el.textContent =
        "Pattern natif " + baseW + "×" + baseH + " → image " +
        currentImageSize.width + "×" + currentImageSize.height + " · UV " + exact;
      el.className = "viewer-scale-info is-good";
    } else {
      el.textContent =
        "Ratio incompatible : modèle " + baseW + "×" + baseH + ", image " +
        currentImageSize.width + "×" + currentImageSize.height +
        ". Échelles X=" + scaleX.toFixed(2) + "× / Y=" + scaleY.toFixed(2) + "×.";
      el.className = "viewer-scale-info is-warning";
    }
  }

  function makePlayerAnimation(name) {
    if (!window.skinview3d) return null;
    const classes = {
      idle: skinview3d.IdleAnimation,
      walk: skinview3d.WalkingAnimation,
      run: skinview3d.RunningAnimation,
      wave: skinview3d.WaveAnimation,
      crouch: skinview3d.CrouchAnimation
    };
    const AnimationClass = classes[name] || classes.idle;
    return AnimationClass ? new AnimationClass() : null;
  }

  function applyPlayerAnimation() {
    if (!playerViewer) return;
    playerViewer.animation = makePlayerAnimation($("animationType").value);
    if (playerViewer.animation) {
      playerViewer.animation.speed = Number($("animationSpeed").value) || 1;
      playerViewer.animation.paused = $("pauseAnimation").checked;
    }
  }

  function initPlayerViewer() {
    if (!window.skinview3d) {
      setStatus("Erreur de chargement du moteur Player 3D", "error");
      return;
    }
    playerViewer = new skinview3d.SkinViewer({
      canvas: playerCanvas,
      width: 520,
      height: 620,
      fov: 50,
      zoom: Number($("zoom").value) || 0.85,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
    });
    playerViewer.background = 0x111722;
    playerViewer.globalLight.intensity = 0.55;
    playerViewer.cameraLight.intensity = 0.75;
    playerViewer.autoRotate = false;
    playerViewer.autoRotateSpeed = 0.7;
    if (playerViewer.controls) {
      playerViewer.controls.enableRotate = true;
      playerViewer.controls.enableZoom = true;
      playerViewer.controls.enablePan = false;
    }
    applyPlayerAnimation();
  }

  function initEntityViewer() {
    if (!window.THREE) {
      setStatus("Erreur de chargement du moteur Entity 3D", "error");
      return;
    }

    entityRenderer = new THREE.WebGLRenderer({
      canvas: entityCanvas,
      alpha: false,
      antialias: true
    });
    entityRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    entityRenderer.setClearColor(0x111722, 1);

    entityScene = new THREE.Scene();
    entityCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    entityCamera.position.set(0, 2, -54);
    entityCamera.lookAt(0, 0, 0);

    entityViewRoot = new THREE.Group();
    entityScene.add(entityViewRoot);
    entityScene.add(new THREE.AmbientLight(0xffffff, 1.7));
  }

  function resizeViewers() {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width));
    const height = Math.max(420, Math.min(720, Math.floor(window.innerHeight * 0.7)));

    if (playerViewer) {
      playerViewer.width = width;
      playerViewer.height = height;
    }

    if (entityRenderer && entityCamera) {
      entityRenderer.setSize(width, height, false);
      entityCamera.aspect = width / height;
      entityCamera.updateProjectionMatrix();
    }
  }

  function disposeEntityModel() {
    if (entityModelRoot) {
      entityViewRoot.remove(entityModelRoot);
      entityModelRoot.traverse((object) => {
        if (object.geometry) object.geometry.dispose && object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose && material.dispose());
          } else if (object.material.dispose) {
            object.material.dispose();
          }
        }
      });
      entityModelRoot = null;
    }
    if (entityTexture) {
      entityTexture.dispose && entityTexture.dispose();
      entityTexture = null;
    }
  }

  function getBoxFaceUvs(box) {
    const coords = box.coordinates || [0, 0, 0, 1, 1, 1];
    const w = Math.abs(Number(coords[3]) || 0);
    const h = Math.abs(Number(coords[4]) || 0);
    const d = Math.abs(Number(coords[5]) || 0);

    if (Array.isArray(box.textureOffset)) {
      const u = Number(box.textureOffset[0]) || 0;
      const v = Number(box.textureOffset[1]) || 0;
      return {
        west: [u, v + d, u + d, v + d + h],
        north: [u + d, v + d, u + d + w, v + d + h],
        east: [u + d + w, v + d, u + d + w + d, v + d + h],
        south: [u + d + w + d, v + d, u + d + w + d + w, v + d + h],
        up: [u + d, v, u + d + w, v + d],
        down: [u + d + w, v, u + d + w + w, v + d]
      };
    }

    return {
      north: box.uvNorth || null,
      east: box.uvEast || null,
      south: box.uvSouth || null,
      west: box.uvWest || null,
      up: box.uvUp || null,
      down: box.uvDown || null
    };
  }

  function uvCorners(rect, texW, texH, mirrorU, mirrorV) {
    if (!rect) return null;
    let u1 = Number(rect[0]);
    let v1 = Number(rect[1]);
    let u2 = Number(rect[2]);
    let v2 = Number(rect[3]);
    if (mirrorU) {
      const tmp = u1; u1 = u2; u2 = tmp;
    }
    if (mirrorV) {
      const tmp = v1; v1 = v2; v2 = tmp;
    }
    return [
      [u1 / texW, 1 - v1 / texH],
      [u2 / texW, 1 - v1 / texH],
      [u2 / texW, 1 - v2 / texH],
      [u1 / texW, 1 - v2 / texH]
    ];
  }

  function makeBoxGeometry(rawW, rawH, rawD, box, textureSize, mirrorTexture) {
    const add = Number(box.sizeAdd) || 0;
    const adds = Array.isArray(box.sizesAdd)
      ? box.sizesAdd.map((value) => Number(value) || 0)
      : [add, add, add];

    const w = Math.max(0.001, Math.abs(rawW) + adds[0] * 2);
    const h = Math.max(0.001, Math.abs(rawH) + adds[1] * 2);
    const d = Math.max(0.001, Math.abs(rawD) + adds[2] * 2);

    const x0 = -w / 2, x1 = w / 2;
    const y0 = -h / 2, y1 = h / 2;
    const z0 = -d / 2, z1 = d / 2;

    const faces = {
      east:  [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],
      west:  [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],
      up:    [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],
      down:  [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],
      south: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
      north: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]]
    };

    const uvRects = getBoxFaceUvs(box);
    const positions = [];
    const uvs = [];
    const indices = [];
    let vertex = 0;
    const mirrorU = String(mirrorTexture || "").includes("u");
    const mirrorV = String(mirrorTexture || "").includes("v");
    const texW = Number(textureSize[0]) || 64;
    const texH = Number(textureSize[1]) || 64;

    for (const faceName of ["east", "west", "up", "down", "south", "north"]) {
      const corners = uvCorners(uvRects[faceName], texW, texH, mirrorU, mirrorV);
      if (!corners) continue;
      const verts = faces[faceName];
      for (let i = 0; i < 4; i++) {
        positions.push(verts[i][0], verts[i][1], verts[i][2]);
        uvs.push(corners[i][0], corners[i][1]);
      }
      indices.push(vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3);
      vertex += 4;
    }

    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  function applyRotation(group, rotate) {
    if (!Array.isArray(rotate)) return;
    group.rotation.set(
      THREE.MathUtils.degToRad(Number(rotate[0]) || 0),
      THREE.MathUtils.degToRad(Number(rotate[1]) || 0),
      THREE.MathUtils.degToRad(Number(rotate[2]) || 0),
      "XYZ"
    );
  }

  function boxMesh(box, textureSize, mirrorTexture, material, localOffset) {
    if (!Array.isArray(box.coordinates) || box.coordinates.length < 6) return null;
    const values = box.coordinates.map(Number);
    const x = values[0], y = values[1], z = values[2];
    const w = values[3], h = values[4], d = values[5];
    const geometry = makeBoxGeometry(w, h, d, box, textureSize, mirrorTexture);
    if (!geometry) return null;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      x + w / 2 + localOffset[0],
      y + h / 2 + localOffset[1],
      z + d / 2 + localOffset[2]
    );
    return mesh;
  }

  function buildSubmodel(node, parentGroup, parentOrigin, depth, textureSize, material) {
    if (!node) return;

    const ownTextureSize = Array.isArray(node.textureSize) ? node.textureSize.map(Number) : textureSize;
    const translate = Array.isArray(node.translate) ? node.translate.map(Number) : [0, 0, 0];
    let originAbs;

    if (depth === 1) {
      originAbs = translate;
    } else {
      originAbs = [
        parentOrigin[0] + translate[0],
        parentOrigin[1] + translate[1],
        parentOrigin[2] + translate[2]
      ];
    }

    const group = new THREE.Group();
    group.position.set(
      originAbs[0] - parentOrigin[0],
      originAbs[1] - parentOrigin[1],
      originAbs[2] - parentOrigin[2]
    );
    applyRotation(group, node.rotate);
    if (Number(node.scale)) group.scale.setScalar(Number(node.scale));
    parentGroup.add(group);

    const mirror = node.mirrorTexture || "";
    for (const box of node.boxes || []) {
      const mesh = boxMesh(box, ownTextureSize, mirror, material, [0, 0, 0]);
      if (mesh) group.add(mesh);
    }

    const children = [];
    if (node.submodel) children.push(node.submodel);
    if (Array.isArray(node.submodels)) children.push.apply(children, node.submodels);
    children.forEach((child) => buildSubmodel(child, group, originAbs, depth + 1, ownTextureSize, material));
  }

  function buildCemModel(model, texture) {
    const root = new THREE.Group();
    const textureSize = Array.isArray(model.textureSize) ? model.textureSize.map(Number) : [64, 64];
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide
    });

    for (const part of model.models || []) {
      if (!part || typeof part !== "object") continue;

      const translate = Array.isArray(part.translate) ? part.translate.map(Number) : [0, 0, 0];
      const origin = [-translate[0], -translate[1], -translate[2]];
      const partTextureSize = Array.isArray(part.textureSize) ? part.textureSize.map(Number) : textureSize;

      const group = new THREE.Group();
      group.position.set(origin[0], origin[1], origin[2]);
      applyRotation(group, part.rotate);
      if (Number(part.scale)) group.scale.setScalar(Number(part.scale));
      root.add(group);

      const mirror = part.mirrorTexture || "";
      for (const box of part.boxes || []) {
        const mesh = boxMesh(box, partTextureSize, mirror, material, [-origin[0], -origin[1], -origin[2]]);
        if (mesh) group.add(mesh);
      }

      const children = [];
      if (part.submodel) children.push(part.submodel);
      if (Array.isArray(part.submodels)) children.push.apply(children, part.submodels);
      children.forEach((child) => buildSubmodel(child, group, origin, 1, partTextureSize, material));
    }

    return root;
  }

  function fitEntityModel() {
    if (!entityModelRoot) return;

    entityModelRoot.position.set(0, 0, 0);
    entityModelRoot.scale.setScalar(1);
    entityModelRoot.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(entityModelRoot);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    entityModelRoot.position.sub(center);

    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    entityBaseScale = 27 / maxDimension;
    applyEntityZoom();
  }

  function applyEntityZoom() {
    if (!entityModelRoot) return;
    const zoom = Number($("zoom").value) || 0.85;
    entityModelRoot.scale.setScalar(entityBaseScale * (zoom / 0.85));
  }

  async function renderSelectedEntity() {
    if (!currentObjectUrl) return;

    const selected = parseSelectedModel();
    if (!selected) {
      setStatus("Ce modèle n’a pas de définition 3D exploitable.", "error");
      return;
    }

    disposeEntityModel();
    setStatus("Construction du modèle…");

    try {
      entityTexture = await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(currentObjectUrl, resolve, undefined, reject);
      });

      if ("colorSpace" in entityTexture && THREE.SRGBColorSpace) {
        entityTexture.colorSpace = THREE.SRGBColorSpace;
      }
      entityTexture.magFilter = THREE.NearestFilter;
      entityTexture.minFilter = THREE.NearestFilter;
      entityTexture.generateMipmaps = false;
      entityTexture.needsUpdate = true;

      entityModelRoot = buildCemModel(selected.model, entityTexture);
      entityViewRoot.add(entityModelRoot);
      fitEntityModel();

      entityRotationX = -0.08;
      entityRotationY = 0;
      entityViewRoot.rotation.set(entityRotationX, entityRotationY, 0);
      $("viewerEmpty").hidden = true;

      const multi = Array.isArray(selected.entry.texture);
      setStatus(
        multi ? "Texture chargée · modèle multi-textures : preview simplifiée" : "Texture chargée",
        multi ? "" : "success"
      );
    } catch (error) {
      console.error(error);
      setStatus("Impossible de construire cette preview d’entité.", "error");
    }
  }

  async function renderPlayer() {
    if (!currentObjectUrl || !playerViewer) return;
    try {
      await playerViewer.loadSkin(currentObjectUrl, { model: $("modelType").value });
      $("viewerEmpty").hidden = true;
      applyPlayerAnimation();
      setStatus("Skin chargé", "success");
    } catch (error) {
      console.error(error);
      setStatus("Impossible d’afficher ce skin Player.", "error");
    }
  }

  function updateModeVisibility() {
    const playerMode = $("entityType").value === "player";
    playerCanvas.hidden = !playerMode;
    entityCanvas.hidden = playerMode;

    if (playerViewer) {
      playerViewer.autoRotate = playerMode && $("autoRotate").checked;
    }

    updateEntityMeta();
    resizeViewers();
  }

  async function onEntitySelectionChanged() {
    updateModeVisibility();
    if (!currentFile) return;
    updateUvScaleInfo();
    if ($("entityType").value === "player") await renderPlayer();
    else await renderSelectedEntity();
  }

  async function loadTexture(file) {
    if (!file) return;
    if (file.type && file.type !== "image/png") {
      setStatus("Choisis un fichier PNG.", "error");
      return;
    }

    try {
      setStatus("Chargement…");
      currentImageSize = await inspectImage(file);
      currentFile = file;

      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(file);

      $("skinInfo").innerHTML =
        "<strong>" + escapeHtml(file.name) + "</strong><br>" +
        currentImageSize.width + "×" + currentImageSize.height + "px · " + formatBytes(file.size);

      updateUvScaleInfo();

      if ($("entityType").value === "player") await renderPlayer();
      else await renderSelectedEntity();
    } catch (error) {
      console.error(error);
      setStatus("Impossible de lire cette texture.", "error");
    }
  }

  function setViewRotation(back) {
    const playerMode = $("entityType").value === "player";
    $("autoRotate").checked = false;

    if (playerMode) {
      if (!playerViewer || !playerViewer.playerObject) return;
      playerViewer.autoRotate = false;
      playerViewer.playerObject.rotation.y = back ? Math.PI : 0;
    } else {
      entityRotationY = back ? Math.PI : 0;
      entityRotationX = -0.08;
      if (entityViewRoot) entityViewRoot.rotation.set(entityRotationX, entityRotationY, 0);
    }
  }

  function resetView() {
    $("zoom").value = "0.85";
    $("autoRotate").checked = false;

    if (playerViewer) {
      playerViewer.zoom = 0.85;
      playerViewer.autoRotate = false;
      if (playerViewer.playerObject) playerViewer.playerObject.rotation.y = 0;
      if (playerViewer.controls && playerViewer.controls.reset) playerViewer.controls.reset();
      applyPlayerAnimation();
    }

    entityRotationX = -0.08;
    entityRotationY = 0;
    if (entityViewRoot) entityViewRoot.rotation.set(entityRotationX, entityRotationY, 0);
    applyEntityZoom();
  }

  function animate(now) {
    requestAnimationFrame(animate);
    const delta = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if ($("entityType").value !== "player" && entityRenderer && entityScene && entityCamera) {
      if ($("autoRotate").checked && entityViewRoot && !entityDragging) {
        entityRotationY += delta * 0.65;
        entityViewRoot.rotation.y = entityRotationY;
      }
      entityRenderer.render(entityScene, entityCamera);
    }
  }

  function bindEntityPointerControls() {
    entityCanvas.addEventListener("pointerdown", (event) => {
      entityDragging = true;
      entityPointer = { x: event.clientX, y: event.clientY };
      if (entityCanvas.setPointerCapture) entityCanvas.setPointerCapture(event.pointerId);
    });

    entityCanvas.addEventListener("pointermove", (event) => {
      if (!entityDragging || !entityViewRoot) return;

      const dx = event.clientX - entityPointer.x;
      const dy = event.clientY - entityPointer.y;
      entityPointer = { x: event.clientX, y: event.clientY };

      entityRotationY += dx * 0.01;
      entityRotationX = clamp(entityRotationX + dy * 0.008, -1.2, 1.2);
      entityViewRoot.rotation.set(entityRotationX, entityRotationY, 0);
    });

    const stop = () => { entityDragging = false; };
    entityCanvas.addEventListener("pointerup", stop);
    entityCanvas.addEventListener("pointercancel", stop);
    entityCanvas.addEventListener("pointerleave", (event) => {
      if (event.buttons === 0) stop();
    });

    entityCanvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const slider = $("zoom");
      const next = clamp(
        Number(slider.value) - Math.sign(event.deltaY) * 0.06,
        Number(slider.min),
        Number(slider.max)
      );
      slider.value = String(next);
      applyEntityZoom();
    }, { passive: false });
  }

  $("entitySearch").addEventListener("input", () => buildEntityOptions($("entitySearch").value));
  $("entityType").addEventListener("change", onEntitySelectionChanged);
  $("skinInput").addEventListener("change", () => loadTexture($("skinInput").files && $("skinInput").files[0]));
  $("modelType").addEventListener("change", () => currentFile && renderPlayer());

  $("animationType").addEventListener("change", applyPlayerAnimation);
  $("animationSpeed").addEventListener("input", () => {
    if (playerViewer && playerViewer.animation) {
      playerViewer.animation.speed = Number($("animationSpeed").value) || 1;
    }
  });
  $("pauseAnimation").addEventListener("change", () => {
    if (playerViewer && playerViewer.animation) {
      playerViewer.animation.paused = $("pauseAnimation").checked;
    }
  });

  $("zoom").addEventListener("input", () => {
    if ($("entityType").value === "player") {
      if (playerViewer) playerViewer.zoom = Number($("zoom").value);
    } else {
      applyEntityZoom();
    }
  });

  $("autoRotate").addEventListener("change", () => {
    if ($("entityType").value === "player" && playerViewer) {
      playerViewer.autoRotate = $("autoRotate").checked;
    }
  });

  $("frontView").addEventListener("click", () => setViewRotation(false));
  $("backView").addEventListener("click", () => setViewRotation(true));
  $("resetView").addEventListener("click", resetView);

  const drop = $("skinDrop");
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
    if (file) loadTexture(file);
  });

  window.addEventListener("beforeunload", () => {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
    disposeEntityModel();
  });

  initPlayerViewer();
  initEntityViewer();
  bindEntityPointerControls();
  updateModeVisibility();
  resizeViewers();

  if ("ResizeObserver" in window) {
    new ResizeObserver(resizeViewers).observe(stage);
  } else {
    window.addEventListener("resize", resizeViewers);
  }

  loadCatalog();
  requestAnimationFrame(animate);
})();