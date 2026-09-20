(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const CEM_CATALOG_URLS = [
    "data/cem_template_models.json?v=5.0.1",
    "https://raw.githubusercontent.com/ewanhowell5195/wynem/main/src/assets/json/cem_template_models.json",
    "https://cdn.jsdelivr.net/gh/ewanhowell5195/wynem@main/src/assets/json/cem_template_models.json",
    "https://wynem.com/assets/json/cem_template_models.json"
  ];

  const stage = $("viewerStage");
  const canvas = $("entityCanvas");

  let catalog = null;
  let catalogEntries = [];
  let currentFile = null;
  let currentImage = null;
  let currentImageCanvas = null;
  let currentImageSize = null;

  let renderer = null;
  let scene = null;
  let camera = null;
  let viewRoot = null;
  let modelRoot = null;
  let currentTexture = null;
  let playerRig = null;

  let viewRotationX = -0.08;
  let viewRotationY = 0;
  let baseScale = 1;
  let dragging = false;
  let pointer = { x: 0, y: 0 };
  let lastFrame = performance.now();
  let animationTime = 0;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setStatus(message, type = "") {
    const el = $("viewerStatus");
    el.textContent = message;
    el.className = "viewer-status" + (type ? " is-" + type : "");
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

  function humanize(id) {
    return String(id || "")
      .replace(/_\d+(?:\.\d+)?$/g, "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " o";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
    return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
  }

  function initRenderer() {
    if (!window.THREE) {
      setStatus("Three.js n'a pas pu être chargé.", "error");
      return false;
    }

    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x111722, 1);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    camera.position.set(0, 4, 54);
    camera.lookAt(0, 12, 0);

    viewRoot = new THREE.Group();
    scene.add(viewRoot);

    scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(20, 30, 35);
    scene.add(key);

    resizeRenderer();
    return true;
  }

  function resizeRenderer() {
    if (!renderer || !camera || !stage) return;
    const rect = stage.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width));
    const height = Math.max(440, Math.min(720, Math.floor(window.innerHeight * 0.70)));

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function disposeModel() {
    if (modelRoot && viewRoot) {
      viewRoot.remove(modelRoot);
      modelRoot.traverse((object) => {
        if (object.geometry && object.geometry.dispose) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose && material.dispose());
          } else if (object.material.dispose) {
            object.material.dispose();
          }
        }
      });
    }
    modelRoot = null;
    playerRig = null;

    if (currentTexture) {
      currentTexture.dispose && currentTexture.dispose();
      currentTexture = null;
    }
  }

  async function readLocalImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });

      const work = document.createElement("canvas");
      work.width = image.naturalWidth;
      work.height = image.naturalHeight;
      const ctx = work.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0);

      return {
        image,
        canvas: work,
        width: image.naturalWidth,
        height: image.naturalHeight
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function makeTextureFromCanvas(sourceCanvas) {
    const texture = new THREE.CanvasTexture(sourceCanvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    if ("colorSpace" in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
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

    if (mirrorU) [u1, u2] = [u2, u1];
    if (mirrorV) [v1, v2] = [v2, v1];

    return [
      [u1 / texW, 1 - v2 / texH],
      [u2 / texW, 1 - v2 / texH],
      [u2 / texW, 1 - v1 / texH],
      [u1 / texW, 1 - v1 / texH]
    ];
  }

  function makeBoxGeometry(width, height, depth, box, textureSize, mirrorTexture = "") {
    const inflate = Number(box.sizeAdd) || 0;
    const inflateXYZ = Array.isArray(box.sizesAdd)
      ? box.sizesAdd.map((value) => Number(value) || 0)
      : [inflate, inflate, inflate];

    const w = Math.max(0.001, Math.abs(width) + inflateXYZ[0] * 2);
    const h = Math.max(0.001, Math.abs(height) + inflateXYZ[1] * 2);
    const d = Math.max(0.001, Math.abs(depth) + inflateXYZ[2] * 2);

    const x0 = -w / 2, x1 = w / 2;
    const y0 = -h / 2, y1 = h / 2;
    const z0 = -d / 2, z1 = d / 2;

    const faceVertices = {
      east:  [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]],
      west:  [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]],
      up:    [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]],
      down:  [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],
      south: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],
      north: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]]
    };

    const rects = getBoxFaceUvs(box);
    const positions = [];
    const uvs = [];
    const indices = [];
    let vertex = 0;

    const texW = Number(textureSize[0]) || 64;
    const texH = Number(textureSize[1]) || 64;
    const mirrorU = String(mirrorTexture || "").includes("u");
    const mirrorV = String(mirrorTexture || "").includes("v");

    for (const face of ["east", "west", "up", "down", "south", "north"]) {
      const uv = uvCorners(rects[face], texW, texH, mirrorU, mirrorV);
      if (!uv) continue;

      const verts = faceVertices[face];
      for (let i = 0; i < 4; i++) {
        positions.push(verts[i][0], verts[i][1], verts[i][2]);
        uvs.push(uv[i][0], uv[i][1]);
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

  function makeMaterial(texture) {
    return new THREE.MeshLambertMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.01,
      side: THREE.DoubleSide
    });
  }

  function makeCuboidMesh(width, height, depth, uvOffset, textureSize, material, options = {}) {
    const box = {
      coordinates: [0, 0, 0, width, height, depth],
      textureOffset: uvOffset,
      sizeAdd: options.inflate || 0
    };
    const geometry = makeBoxGeometry(
      width,
      height,
      depth,
      box,
      textureSize,
      options.mirrorU ? "u" : ""
    );
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  function makePivotPart(name, pivot, meshCenter, meshes) {
    const group = new THREE.Group();
    group.name = name;
    group.position.set(pivot[0], pivot[1], pivot[2]);

    for (const mesh of meshes) {
      mesh.position.set(meshCenter[0], meshCenter[1], meshCenter[2]);
      group.add(mesh);
    }
    return group;
  }

  function detectSlimModel() {
    const forced = $("modelType").value;
    if (forced === "slim" || forced === "default") return forced;

    if (!currentImageCanvas || currentImageCanvas.height < currentImageCanvas.width) return "default";

    try {
      const ctx = currentImageCanvas.getContext("2d", { willReadFrequently: true });
      const scale = currentImageCanvas.width / 64;
      if (!Number.isInteger(scale) || scale < 1) return "default";

      const samplePoints = [
        [54, 20], [55, 20], [54, 31], [55, 31],
        [46, 52], [47, 52], [54, 52], [55, 52]
      ];

      let transparent = 0;
      let checked = 0;
      for (const [x, y] of samplePoints) {
        const px = Math.min(currentImageCanvas.width - 1, Math.floor(x * scale));
        const py = Math.min(currentImageCanvas.height - 1, Math.floor(y * scale));
        const alpha = ctx.getImageData(px, py, 1, 1).data[3];
        checked++;
        if (alpha < 16) transparent++;
      }
      return transparent >= Math.ceil(checked * 0.6) ? "slim" : "default";
    } catch {
      return "default";
    }
  }

  function buildPlayerModel(texture) {
    const root = new THREE.Group();
    const material = makeMaterial(texture);

    const legacy = currentImageSize && currentImageSize.width === currentImageSize.height * 2;
    const model = detectSlimModel();
    const armW = model === "slim" ? 3 : 4;
    const armX = 4 + armW / 2;

    const body = makeCuboidMesh(8, 12, 4, [16, 16], [64, legacy ? 32 : 64], material);
    body.position.set(0, 18, 0);
    root.add(body);

    const headBase = makeCuboidMesh(8, 8, 8, [0, 0], [64, legacy ? 32 : 64], material);
    const headOuter = !legacy
      ? makeCuboidMesh(8, 8, 8, [32, 0], [64, 64], material, { inflate: 0.5 })
      : null;
    const headMeshes = headOuter ? [headBase, headOuter] : [headBase];
    const head = makePivotPart("head", [0, 24, 0], [0, 4, 0], headMeshes);
    root.add(head);

    if (!legacy) {
      const bodyOuter = makeCuboidMesh(8, 12, 4, [16, 32], [64, 64], material, { inflate: 0.25 });
      bodyOuter.position.set(0, 18, 0);
      root.add(bodyOuter);
    }

    const rightArmBase = makeCuboidMesh(armW, 12, 4, [40, 16], [64, legacy ? 32 : 64], material);
    const rightArmOuter = !legacy
      ? makeCuboidMesh(armW, 12, 4, [40, 32], [64, 64], material, { inflate: 0.25 })
      : null;
    const rightArm = makePivotPart(
      "rightArm",
      [-armX, 24, 0],
      [0, -6, 0],
      rightArmOuter ? [rightArmBase, rightArmOuter] : [rightArmBase]
    );
    root.add(rightArm);

    const leftArmBase = legacy
      ? makeCuboidMesh(armW, 12, 4, [40, 16], [64, 32], material, { mirrorU: true })
      : makeCuboidMesh(armW, 12, 4, [32, 48], [64, 64], material);
    const leftArmOuter = !legacy
      ? makeCuboidMesh(armW, 12, 4, [48, 48], [64, 64], material, { inflate: 0.25 })
      : null;
    const leftArm = makePivotPart(
      "leftArm",
      [armX, 24, 0],
      [0, -6, 0],
      leftArmOuter ? [leftArmBase, leftArmOuter] : [leftArmBase]
    );
    root.add(leftArm);

    const rightLegBase = makeCuboidMesh(4, 12, 4, [0, 16], [64, legacy ? 32 : 64], material);
    const rightLegOuter = !legacy
      ? makeCuboidMesh(4, 12, 4, [0, 32], [64, 64], material, { inflate: 0.25 })
      : null;
    const rightLeg = makePivotPart(
      "rightLeg",
      [-2, 12, 0],
      [0, -6, 0],
      rightLegOuter ? [rightLegBase, rightLegOuter] : [rightLegBase]
    );
    root.add(rightLeg);

    const leftLegBase = legacy
      ? makeCuboidMesh(4, 12, 4, [0, 16], [64, 32], material, { mirrorU: true })
      : makeCuboidMesh(4, 12, 4, [16, 48], [64, 64], material);
    const leftLegOuter = !legacy
      ? makeCuboidMesh(4, 12, 4, [0, 48], [64, 64], material, { inflate: 0.25 })
      : null;
    const leftLeg = makePivotPart(
      "leftLeg",
      [2, 12, 0],
      [0, -6, 0],
      leftLegOuter ? [leftLegBase, leftLegOuter] : [leftLegBase]
    );
    root.add(leftLeg);

    playerRig = {
      root,
      head,
      rightArm,
      leftArm,
      rightLeg,
      leftLeg,
      body
    };

    return root;
  }

  function applyRotation(group, rotate) {
    if (!group || !Array.isArray(rotate)) return;
    group.rotation.set(
      THREE.MathUtils.degToRad(Number(rotate[0]) || 0),
      THREE.MathUtils.degToRad(Number(rotate[1]) || 0),
      THREE.MathUtils.degToRad(Number(rotate[2]) || 0),
      "XYZ"
    );
  }

  function boxMeshFromCem(box, textureSize, mirrorTexture, material, localOffset) {
    if (!Array.isArray(box.coordinates) || box.coordinates.length < 6) return null;

    const values = box.coordinates.map(Number);
    const [x, y, z, w, h, d] = values;
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

  function buildCemSubmodel(node, parentGroup, parentOrigin, depth, textureSize, material) {
    if (!node) return;

    const ownTextureSize = Array.isArray(node.textureSize) ? node.textureSize.map(Number) : textureSize;
    const translate = Array.isArray(node.translate) ? node.translate.map(Number) : [0, 0, 0];

    const originAbs = depth === 1
      ? translate
      : [
          parentOrigin[0] + translate[0],
          parentOrigin[1] + translate[1],
          parentOrigin[2] + translate[2]
        ];

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
      const mesh = boxMeshFromCem(box, ownTextureSize, mirror, material, [0, 0, 0]);
      if (mesh) group.add(mesh);
    }

    const children = [];
    if (node.submodel) children.push(node.submodel);
    if (Array.isArray(node.submodels)) children.push(...node.submodels);
    children.forEach((child) => {
      buildCemSubmodel(child, group, originAbs, depth + 1, ownTextureSize, material);
    });
  }

  function buildCemModel(model, texture) {
    const root = new THREE.Group();
    const textureSize = Array.isArray(model.textureSize) ? model.textureSize.map(Number) : [64, 64];
    const material = makeMaterial(texture);

    for (const part of model.models || []) {
      if (!part || typeof part !== "object") continue;

      const translate = Array.isArray(part.translate) ? part.translate.map(Number) : [0, 0, 0];
      const origin = [-translate[0], -translate[1], -translate[2]];
      const partTextureSize = Array.isArray(part.textureSize)
        ? part.textureSize.map(Number)
        : textureSize;

      const group = new THREE.Group();
      group.position.set(origin[0], origin[1], origin[2]);
      applyRotation(group, part.rotate);
      if (Number(part.scale)) group.scale.setScalar(Number(part.scale));
      root.add(group);

      const mirror = part.mirrorTexture || "";
      for (const box of part.boxes || []) {
        const mesh = boxMeshFromCem(
          box,
          partTextureSize,
          mirror,
          material,
          [-origin[0], -origin[1], -origin[2]]
        );
        if (mesh) group.add(mesh);
      }

      const children = [];
      if (part.submodel) children.push(part.submodel);
      if (Array.isArray(part.submodels)) children.push(...part.submodels);
      children.forEach((child) => {
        buildCemSubmodel(child, group, origin, 1, partTextureSize, material);
      });
    }

    return root;
  }

  function fitModel() {
    if (!modelRoot) return;

    modelRoot.position.set(0, 0, 0);
    modelRoot.scale.setScalar(1);
    modelRoot.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    modelRoot.position.sub(center);

    const maxDimension = Math.max(size.x, size.y, size.z, 1);
    baseScale = 29 / maxDimension;
    applyZoom();
  }

  function applyZoom() {
    if (!modelRoot) return;
    const zoom = Number($("zoom").value) || 0.85;
    modelRoot.scale.setScalar(baseScale * (zoom / 0.85));
  }

  async function fetchCatalog() {
    let lastError = null;

    for (const url of CEM_CATALOG_URLS) {
      try {
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const data = await response.json();
        if (!data || !data.models || !Array.isArray(data.categories)) {
          throw new Error("Catalogue invalide");
        }
        return data;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("Catalogue CEM indisponible");
  }

  function flattenCatalog(data) {
    const entries = [];
    const seen = new Set();

    function add(raw, category, section, parent) {
      if (!raw || raw.type === "heading" || !raw.id || raw.textureless) return;

      const modelKey = raw.model || raw.id;
      const record = data.models && data.models[modelKey];

      if (record && record.model && !seen.has(raw.id)) {
        entries.push({
          id: raw.id,
          name: raw.name || humanize(raw.id),
          modelKey,
          category: category || "Minecraft",
          section: section || "",
          texture: raw.texture || (parent && parent.texture) || null
        });
        seen.add(raw.id);
      }

      if (Array.isArray(raw.variants)) {
        raw.variants.forEach((variant) => add(variant, category, section, raw));
      }
    }

    for (const category of data.categories || []) {
      if (!category || !Array.isArray(category.entities)) continue;

      let section = "";
      for (const raw of category.entities) {
        if (raw && raw.type === "heading") {
          section = raw.text || "";
          continue;
        }
        add(raw, category.name, section, null);
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
      rebuildEntityOptions("");

      $("catalogStatus").textContent =
        catalogEntries.length + " modèles/variantes disponibles · CEM " + (catalog.version || "");
      $("catalogStatus").className = "viewer-catalog-status is-success";
    } catch (error) {
      console.error(error);
      $("catalogStatus").textContent =
        "Catalogue d'entités indisponible : le Player reste entièrement fonctionnel.";
      $("catalogStatus").className = "viewer-catalog-status is-error";
      catalog = null;
      catalogEntries = [];
      rebuildEntityOptions("");
    }
  }

  function rebuildEntityOptions(query) {
    const select = $("entityType");
    const previous = select.value || "player";
    const filter = String(query || "").trim().toLowerCase();

    select.innerHTML = "";

    const playerOption = document.createElement("option");
    playerOption.value = "player";
    playerOption.textContent = "Player (Steve / Alex)";
    select.appendChild(playerOption);

    const groups = new Map();

    for (const entry of catalogEntries) {
      const searchable =
        (entry.name + " " + entry.id + " " + entry.category + " " + entry.section).toLowerCase();
      if (filter && !searchable.includes(filter)) continue;

      const groupName = entry.section
        ? entry.category + " · " + entry.section
        : entry.category;

      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(entry);
    }

    for (const [groupName, entries] of groups) {
      const group = document.createElement("optgroup");
      group.label = groupName;

      for (const entry of entries) {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.name;
        group.appendChild(option);
      }

      select.appendChild(group);
    }

    const exists = Array.from(select.options).some((option) => option.value === previous);
    select.value = exists ? previous : "player";

    if (!exists && previous !== "player") {
      onModelChanged();
    }
  }

  function selectedCemModel() {
    if (!catalog || $("entityType").value === "player") return null;

    const entry = catalogEntries.find((item) => item.id === $("entityType").value);
    if (!entry) return null;

    const record = catalog.models && catalog.models[entry.modelKey];
    if (!record || !record.model) return null;

    try {
      return {
        entry,
        model: typeof record.model === "string" ? JSON.parse(record.model) : record.model
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function expectedTextureSize() {
    if ($("entityType").value === "player") return [64, 64];
    const selected = selectedCemModel();
    const size = selected && selected.model && selected.model.textureSize;
    return Array.isArray(size) && size.length >= 2
      ? [Number(size[0]), Number(size[1])]
      : [64, 64];
  }

  function updateModelMeta() {
    if ($("entityType").value === "player") {
      $("entityMeta").innerHTML =
        "<strong>Player</strong><span>UV : 64×64 moderne ou 64×32 legacy</span>";
      $("previewTitle").textContent = "Player 3D";
      $("playerOptions").hidden = false;
      $("playerAnimationControls").hidden = false;
      return;
    }

    const selected = selectedCemModel();
    if (!selected) {
      $("entityMeta").innerHTML =
        "<strong>Entité</strong><span>Définition indisponible</span>";
      $("previewTitle").textContent = "Entity 3D";
      $("playerOptions").hidden = true;
      $("playerAnimationControls").hidden = true;
      return;
    }

    const size = selected.model.textureSize || [64, 64];
    $("entityMeta").innerHTML =
      "<strong>" + escapeHtml(selected.entry.name) + "</strong>" +
      "<span>UV natif : " + size[0] + "×" + size[1] + "</span>";
    $("previewTitle").textContent = selected.entry.name + " 3D";
    $("playerOptions").hidden = true;
    $("playerAnimationControls").hidden = true;
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
      const modern = width === height && width % 64 === 0;
      const legacy = width === height * 2 && width % 64 === 0;

      if (modern) {
        el.textContent =
          "Player 64×64 · échelle UV " + (width / 64).toFixed(2).replace(".00", "") + "×";
        el.className = "viewer-scale-info is-good";
      } else if (legacy) {
        el.textContent =
          "Player legacy 64×32 · échelle UV " + (width / 64).toFixed(2).replace(".00", "") + "×";
        el.className = "viewer-scale-info is-good";
      } else {
        el.textContent =
          "Format Player inhabituel. Attendu : carré 64×64 proportionnel ou legacy 64×32 proportionnel.";
        el.className = "viewer-scale-info is-warning";
      }
      return;
    }

    const [baseW, baseH] = expectedTextureSize();
    const sx = currentImageSize.width / baseW;
    const sy = currentImageSize.height / baseH;

    if (Math.abs(sx - sy) < 0.001) {
      el.textContent =
        "UV natif " + baseW + "×" + baseH +
        " → image " + currentImageSize.width + "×" + currentImageSize.height +
        " · " + (Number.isInteger(sx) ? sx : sx.toFixed(3)) + "×";
      el.className = "viewer-scale-info is-good";
    } else {
      el.textContent =
        "Ratio incompatible : modèle " + baseW + "×" + baseH +
        ", image " + currentImageSize.width + "×" + currentImageSize.height +
        " (X " + sx.toFixed(2) + "× / Y " + sy.toFixed(2) + "×).";
      el.className = "viewer-scale-info is-warning";
    }
  }

  function rebuildModel() {
    if (!currentImageCanvas || !renderer) return;

    disposeModel();
    currentTexture = makeTextureFromCanvas(currentImageCanvas);

    if ($("entityType").value === "player") {
      modelRoot = buildPlayerModel(currentTexture);
      setStatus(
        "Player chargé · " + (detectSlimModel() === "slim" ? "bras fins" : "bras classiques"),
        "success"
      );
    } else {
      const selected = selectedCemModel();
      if (!selected) {
        setStatus("Modèle d'entité indisponible.", "error");
        return;
      }

      modelRoot = buildCemModel(selected.model, currentTexture);
      const multiTexture = Array.isArray(selected.entry.texture);
      setStatus(
        multiTexture
          ? "Entité chargée · ce modèle peut utiliser plusieurs textures : preview partielle possible"
          : "Entité chargée",
        multiTexture ? "" : "success"
      );
    }

    viewRoot.add(modelRoot);
    fitModel();
    viewRotationX = -0.08;
    viewRotationY = 0;
    viewRoot.rotation.set(viewRotationX, viewRotationY, 0);
    $("viewerEmpty").hidden = true;
  }

  async function loadTexture(file) {
    if (!file) return;

    if (file.type && file.type !== "image/png") {
      setStatus("Le viewer attend un PNG.", "error");
      return;
    }

    try {
      setStatus("Lecture du PNG…");
      const loaded = await readLocalImage(file);

      currentFile = file;
      currentImage = loaded.image;
      currentImageCanvas = loaded.canvas;
      currentImageSize = { width: loaded.width, height: loaded.height };

      $("skinInfo").innerHTML =
        "<strong>" + escapeHtml(file.name) + "</strong><br>" +
        loaded.width + "×" + loaded.height + "px · " + formatBytes(file.size);

      updateUvScaleInfo();
      rebuildModel();
    } catch (error) {
      console.error(error);
      setStatus("Impossible de lire ce PNG.", "error");
    }
  }

  function resetPlayerPose() {
    if (!playerRig) return;

    playerRig.root.position.set(0, 0, 0);
    playerRig.root.rotation.set(0, 0, 0);
    playerRig.head.rotation.set(0, 0, 0);
    playerRig.rightArm.rotation.set(0, 0, 0);
    playerRig.leftArm.rotation.set(0, 0, 0);
    playerRig.rightLeg.rotation.set(0, 0, 0);
    playerRig.leftLeg.rotation.set(0, 0, 0);
  }

  function animatePlayer(delta) {
    if (!playerRig || $("entityType").value !== "player") return;
    if ($("pauseAnimation").checked) return;

    const speed = Number($("animationSpeed").value) || 1;
    animationTime += delta * speed;

    resetPlayerPose();

    const mode = $("animationType").value;
    if (mode === "idle") {
      playerRig.head.rotation.y = Math.sin(animationTime * 0.7) * 0.08;
      playerRig.rightArm.rotation.z = 0.025;
      playerRig.leftArm.rotation.z = -0.025;
      return;
    }

    if (mode === "walk" || mode === "run") {
      const amplitude = mode === "run" ? 0.95 : 0.55;
      const frequency = mode === "run" ? 7 : 4;
      const swing = Math.sin(animationTime * frequency) * amplitude;

      playerRig.rightArm.rotation.x = swing;
      playerRig.leftArm.rotation.x = -swing;
      playerRig.rightLeg.rotation.x = -swing;
      playerRig.leftLeg.rotation.x = swing;

      if (mode === "run") {
        playerRig.root.rotation.x = -0.10;
        playerRig.root.position.y = Math.abs(Math.sin(animationTime * frequency)) * 0.5;
      }
      return;
    }

    if (mode === "wave") {
      playerRig.rightArm.rotation.z = -2.2;
      playerRig.rightArm.rotation.x = Math.sin(animationTime * 7) * 0.25;
      return;
    }

    if (mode === "crouch") {
      playerRig.root.position.y = -2.2;
      playerRig.root.rotation.x = -0.18;
      playerRig.rightLeg.rotation.x = 0.30;
      playerRig.leftLeg.rotation.x = 0.30;
      playerRig.rightArm.rotation.x = -0.16;
      playerRig.leftArm.rotation.x = -0.16;
    }
  }

  function setView(back) {
    $("autoRotate").checked = false;
    viewRotationY = back ? Math.PI : 0;
    viewRotationX = -0.08;
    if (viewRoot) viewRoot.rotation.set(viewRotationX, viewRotationY, 0);
  }

  function resetView() {
    $("zoom").value = "0.85";
    $("autoRotate").checked = false;
    viewRotationX = -0.08;
    viewRotationY = 0;

    if (viewRoot) viewRoot.rotation.set(viewRotationX, viewRotationY, 0);
    applyZoom();
    resetPlayerPose();
  }

  function animate(now) {
    requestAnimationFrame(animate);

    if (!renderer || !scene || !camera) return;

    const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;

    if ($("autoRotate").checked && !dragging) {
      viewRotationY += delta * 0.65;
      viewRoot.rotation.y = viewRotationY;
    }

    animatePlayer(delta);
    renderer.render(scene, camera);
  }

  function bindPointerControls() {
    canvas.addEventListener("pointerdown", (event) => {
      dragging = true;
      pointer = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!dragging || !viewRoot) return;

      const dx = event.clientX - pointer.x;
      const dy = event.clientY - pointer.y;
      pointer = { x: event.clientX, y: event.clientY };

      viewRotationY += dx * 0.01;
      viewRotationX = clamp(viewRotationX + dy * 0.008, -1.2, 1.2);
      viewRoot.rotation.set(viewRotationX, viewRotationY, 0);
    });

    const stop = () => { dragging = false; };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("pointerleave", (event) => {
      if (event.buttons === 0) stop();
    });

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();

      const slider = $("zoom");
      const next = clamp(
        Number(slider.value) - Math.sign(event.deltaY) * 0.06,
        Number(slider.min),
        Number(slider.max)
      );

      slider.value = String(next);
      applyZoom();
    }, { passive: false });
  }

  function onModelChanged() {
    updateModelMeta();
    updateUvScaleInfo();
    if (currentImageCanvas) rebuildModel();
  }



  function canonicalPartName(value) {
    return String(value || "part")
      .replace(/([A-Za-z])(\d+)/g, "$1_$2")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase();
  }

  function uvRectObject(rect) {
    if (!Array.isArray(rect) || rect.length < 4) return null;
    const x1 = Number(rect[0]) || 0;
    const y1 = Number(rect[1]) || 0;
    const x2 = Number(rect[2]) || 0;
    const y2 = Number(rect[3]) || 0;
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1)
    };
  }

  function boxSemanticPrefix(partId, box, boxIndex, boxCount, path) {
    const base = canonicalPartName(partId);
    const coords = Array.isArray(box.coordinates) ? box.coordinates.map(Number) : [0,0,0,0,0,0];
    const w = Math.abs(coords[3] || 0);
    const h = Math.abs(coords[4] || 0);
    const mirrored = String(path || "").toUpperCase().includes("MIRRORED");

    if (base === "ARMS") {
      if (w >= 7 && h <= 5) return "ARMS_CENTER";
      if (w <= 5 && h >= 7) return mirrored ? "LEFT_ARM" : "RIGHT_ARM";
    }

    if (boxCount > 1) return base + "_" + (boxIndex + 1);
    return base;
  }

  function collectNodeUvTargets(node, rootPartId, textureSize, out, path = "", depth = 0) {
    if (!node) return;
    const ownTextureSize = Array.isArray(node.textureSize) ? node.textureSize.map(Number) : textureSize;
    const boxes = Array.isArray(node.boxes) ? node.boxes : [];
    const faceNames = {
      north: "FRONT",
      south: "BACK",
      west: "RIGHT",
      east: "LEFT",
      up: "TOP",
      down: "BOTTOM"
    };

    boxes.forEach((box, boxIndex) => {
      const prefix = boxSemanticPrefix(rootPartId, box, boxIndex, boxes.length, path);
      const rects = getBoxFaceUvs(box);

      Object.entries(faceNames).forEach(([faceKey, faceLabel]) => {
        const rect = uvRectObject(rects[faceKey]);
        if (!rect || rect.w <= 0 || rect.h <= 0) return;

        const label = prefix + "_" + faceLabel;
        const aliases = [label];

        if (prefix.startsWith("RIGHT_ARM_")) {
          aliases.push(prefix.replace(/_RIGHT$|_LEFT$/, "") + "_" + faceLabel);
        }

        out.push({
          label,
          aliases: Array.from(new Set(aliases)),
          part: prefix,
          face: faceLabel,
          rect,
          textureWidth: Number(ownTextureSize[0]) || 64,
          textureHeight: Number(ownTextureSize[1]) || 64,
          path: path || canonicalPartName(rootPartId)
        });
      });
    });

    const children = [];
    if (node.submodel) children.push(node.submodel);
    if (Array.isArray(node.submodels)) children.push(...node.submodels);

    children.forEach((child, childIndex) => {
      const childId = canonicalPartName(child.id || ("SUBMODEL_" + (childIndex + 1)));
      collectNodeUvTargets(
        child,
        rootPartId,
        ownTextureSize,
        out,
        (path ? path + "/" : "") + childId,
        depth + 1
      );
    });
  }

  function playerUvLayout() {
    const slim = detectSlimModel() === "slim";
    const armW = slim ? 3 : 4;
    const targets = [];
    const definitions = [
      ["HEAD", [0,0], [8,8,8]],
      ["HEADWEAR", [32,0], [8,8,8]],
      ["BODY", [16,16], [8,12,4]],
      ["BODYWEAR", [16,32], [8,12,4]],
      ["RIGHT_ARM", [40,16], [armW,12,4]],
      ["RIGHT_ARMWEAR", [40,32], [armW,12,4]],
      ["LEFT_ARM", [32,48], [armW,12,4]],
      ["LEFT_ARMWEAR", [48,48], [armW,12,4]],
      ["RIGHT_LEG", [0,16], [4,12,4]],
      ["RIGHT_LEGWEAR", [0,32], [4,12,4]],
      ["LEFT_LEG", [16,48], [4,12,4]],
      ["LEFT_LEGWEAR", [0,48], [4,12,4]]
    ];
    const faceNames = {
      north: "FRONT",
      south: "BACK",
      west: "RIGHT",
      east: "LEFT",
      up: "TOP",
      down: "BOTTOM"
    };

    definitions.forEach(([part, offset, dims]) => {
      const box = {
        coordinates: [0,0,0,dims[0],dims[1],dims[2]],
        textureOffset: offset
      };
      const rects = getBoxFaceUvs(box);
      Object.entries(faceNames).forEach(([faceKey, faceLabel]) => {
        const rect = uvRectObject(rects[faceKey]);
        if (!rect) return;
        targets.push({
          label: part + "_" + faceLabel,
          aliases: [part + "_" + faceLabel],
          part,
          face: faceLabel,
          rect,
          textureWidth: 64,
          textureHeight: 64,
          path: part
        });
      });
    });

    return {
      modelId: "player",
      textureWidth: 64,
      textureHeight: 64,
      targets
    };
  }

  function selectedUvLayout() {
    if ($("entityType").value === "player") return playerUvLayout();

    const selected = selectedCemModel();
    if (!selected) return null;

    const textureSize = Array.isArray(selected.model.textureSize)
      ? selected.model.textureSize.map(Number)
      : [64,64];

    const targets = [];
    for (const part of selected.model.models || []) {
      if (!part || typeof part !== "object") continue;
      const partId = part.id || part.part || "part";
      collectNodeUvTargets(
        part,
        partId,
        Array.isArray(part.textureSize) ? part.textureSize.map(Number) : textureSize,
        targets,
        canonicalPartName(partId)
      );
    }

    return {
      modelId: selected.entry.id,
      modelName: selected.entry.name,
      textureWidth: Number(textureSize[0]) || 64,
      textureHeight: Number(textureSize[1]) || 64,
      targets
    };
  }

  window.minecraftTextureStudio = {
    async loadTextureFile(file, options = {}) {
      await loadTexture(file);
      if (options.scroll !== false) {
        document.getElementById("viewer")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return true;
    },
    getSelectedModel() {
      return $("entityType").value;
    },
    setSelectedModel(id) {
      const select = $("entityType");
      if (Array.from(select.options).some((option) => option.value === id)) {
        select.value = id;
        onModelChanged();
        return true;
      }
      return false;
    },
    refresh() {
      if (currentImageCanvas) rebuildModel();
    },
    getUvLayout() {
      return selectedUvLayout();
    }
  };

  $("entitySearch").addEventListener("input", () => {
    rebuildEntityOptions($("entitySearch").value);
  });

  $("entityType").addEventListener("change", onModelChanged);
  $("modelType").addEventListener("change", () => {
    if ($("entityType").value === "player" && currentImageCanvas) rebuildModel();
  });

  $("skinInput").addEventListener("change", () => {
    const file = $("skinInput").files && $("skinInput").files[0];
    if (file) loadTexture(file);
  });

  $("zoom").addEventListener("input", applyZoom);
  $("frontView").addEventListener("click", () => setView(false));
  $("backView").addEventListener("click", () => setView(true));
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

  if (initRenderer()) {
    bindPointerControls();
    updateModelMeta();
    resizeRenderer();

    if ("ResizeObserver" in window) {
      new ResizeObserver(resizeRenderer).observe(stage);
    } else {
      window.addEventListener("resize", resizeRenderer);
    }

    requestAnimationFrame(animate);
    loadCatalog();
  }
})();