(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const canvas = $("skinCanvas");
  const stage = $("viewerStage");
  let viewer = null;
  let currentObjectUrl = null;
  let currentFile = null;

  function setStatus(message, type = "") {
    const el = $("viewerStatus");
    el.textContent = message;
    el.className = "viewer-status" + (type ? ` is-${type}` : "");
  }

  function makeAnimation(name) {
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

  function applyAnimation() {
    if (!viewer) return;
    viewer.animation = makeAnimation($("animationType").value);
    if (viewer.animation) {
      viewer.animation.speed = Number($("animationSpeed").value) || 1;
      viewer.animation.paused = $("pauseAnimation").checked;
    }
  }

  function resizeViewer() {
    if (!viewer) return;
    const rect = stage.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width));
    const height = Math.max(420, Math.min(680, Math.floor(window.innerHeight * 0.68)));
    viewer.width = width;
    viewer.height = height;
  }

  function initViewer() {
    if (!window.skinview3d) {
      setStatus("Erreur de chargement du moteur 3D", "error");
      return;
    }

    viewer = new skinview3d.SkinViewer({
      canvas,
      width: 520,
      height: 620,
      fov: 50,
      zoom: Number($("zoom").value) || 0.85,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2)
    });

    viewer.background = 0x111722;
    viewer.globalLight.intensity = 0.55;
    viewer.cameraLight.intensity = 0.75;
    viewer.autoRotate = false;
    viewer.autoRotateSpeed = 0.7;

    if (viewer.controls) {
      viewer.controls.enableRotate = true;
      viewer.controls.enableZoom = true;
      viewer.controls.enablePan = false;
    }

    applyAnimation();
    resizeViewer();

    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(resizeViewer);
      observer.observe(stage);
    } else {
      window.addEventListener("resize", resizeViewer);
    }
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

  async function loadSkin(file) {
    if (!file || !viewer) return;

    if (file.type && file.type !== "image/png") {
      setStatus("Choisis un fichier PNG.", "error");
      return;
    }

    try {
      setStatus("Chargement…");
      const size = await inspectImage(file);
      currentFile = file;

      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = URL.createObjectURL(file);

      const model = $("modelType").value;
      await viewer.loadSkin(currentObjectUrl, { model });

      $("viewerEmpty").hidden = true;
      $("skinInfo").innerHTML =
        `<strong>${escapeHtml(file.name)}</strong><br>${size.width}×${size.height}px · ${formatBytes(file.size)}`;

      const unusual = !(
        (size.width === size.height && size.width % 64 === 0) ||
        (size.width === size.height * 2 && size.height % 32 === 0)
      );

      setStatus(unusual ? "Skin chargé · dimensions inhabituelles" : "Skin chargé", unusual ? "" : "success");
      applyAnimation();
    } catch (error) {
      console.error(error);
      setStatus("Impossible d’afficher ce skin.", "error");
    }
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

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  function reloadCurrentSkin() {
    if (currentFile) loadSkin(currentFile);
  }

  function setRotation(y) {
    if (!viewer?.playerObject) return;
    viewer.autoRotate = false;
    $("autoRotate").checked = false;
    viewer.playerObject.rotation.y = y;
  }

  function resetView() {
    if (!viewer) return;
    viewer.zoom = 0.85;
    $("zoom").value = "0.85";
    viewer.autoRotate = false;
    $("autoRotate").checked = false;
    if (viewer.playerObject) viewer.playerObject.rotation.y = 0;
    if (viewer.controls?.reset) viewer.controls.reset();
    applyAnimation();
  }

  $("skinInput").addEventListener("change", () => loadSkin($("skinInput").files?.[0]));

  $("modelType").addEventListener("change", reloadCurrentSkin);

  $("animationType").addEventListener("change", applyAnimation);
  $("animationSpeed").addEventListener("input", () => {
    if (viewer?.animation) viewer.animation.speed = Number($("animationSpeed").value) || 1;
  });
  $("pauseAnimation").addEventListener("change", () => {
    if (viewer?.animation) viewer.animation.paused = $("pauseAnimation").checked;
  });

  $("zoom").addEventListener("input", () => {
    if (viewer) viewer.zoom = Number($("zoom").value);
  });

  $("autoRotate").addEventListener("change", () => {
    if (viewer) viewer.autoRotate = $("autoRotate").checked;
  });

  $("frontView").addEventListener("click", () => setRotation(0));
  $("backView").addEventListener("click", () => setRotation(Math.PI));
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
    const file = event.dataTransfer?.files?.[0];
    if (file) loadSkin(file);
  });

  window.addEventListener("beforeunload", () => {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  });

  initViewer();
})();