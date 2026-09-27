(() => {
  const RAW_BASE = "https://raw.githubusercontent.com/misterblaecher/GabCon-BuildAI/main/";
  const INDEX_URL = RAW_BASE + "generated/index.json";

  const grid = document.getElementById("buildGrid");
  const state = document.getElementById("buildState");
  const search = document.getElementById("buildSearch");
  const summary = document.getElementById("buildSummary");
  const source = document.getElementById("buildSource");
  const template = document.getElementById("buildCardTemplate");

  let builds = [];

  const formatNumber = (value) =>
    Number.isFinite(Number(value)) ? Number(value).toLocaleString("fr-BE") : "—";

  const assetUrl = (path) => (path ? RAW_BASE + path.replace(/^\/+/, "") : "#");

  function compatibilityLabel(compatibility) {
    if (compatibility?.valid === true) return ["Compatible serveur", "is-valid"];
    if (compatibility?.valid === false) return ["Incompatible", "is-invalid"];
    return ["Non vérifié", "is-unknown"];
  }

  function searchableText(build) {
    return [
      build.id,
      build.name,
      ...(Object.keys(build.namespaces || {})),
      ...((build.top_materials || []).map(([name]) => name)),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  async function downloadSchematic(build, button) {
    const url = assetUrl(build.schem);
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Préparation…";

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("download failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${build.id}.schem`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      button.textContent = "Téléchargé";
    } catch {
      window.open(url, "_blank", "noopener");
      button.textContent = "Ouvert";
    } finally {
      window.setTimeout(() => {
        button.disabled = false;
        button.textContent = original;
      }, 1400);
    }
  }

  async function copyWorldEdit(build, button) {
    const commands = `//schem load ${build.id}\n//paste -a`;
    try {
      await navigator.clipboard.writeText(commands);
      const original = button.textContent;
      button.textContent = "Commandes copiées";
      button.classList.add("is-copied");
      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("is-copied");
      }, 1600);
    } catch {
      window.prompt("Copie ces commandes WorldEdit :", commands);
    }
  }

  function makeCard(build) {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".build-card");

    const image = card.querySelector(".build-card__image");
    image.src = assetUrl(build.render);
    image.alt = `Prévisualisation de ${build.name || build.id}`;

    const [compatText, compatClass] = compatibilityLabel(build.compatibility);
    const compat = card.querySelector(".build-card__compat");
    compat.textContent = compatText;
    compat.classList.add(compatClass);

    card.querySelector(".build-card__id").textContent = build.id;
    card.querySelector(".build-card__name").textContent = build.name || build.id;

    const profile = build.server_profile || {};
    card.querySelector(".build-card__version").textContent =
      profile.minecraft_version ? `MC ${profile.minecraft_version}` : "Version inconnue";

    const dims = Array.isArray(build.dims) ? build.dims.join(" × ") : "—";
    card.querySelector('[data-stat="dims"]').textContent = dims;
    card.querySelector('[data-stat="blocks"]').textContent = formatNumber(build.block_count);
    card.querySelector('[data-stat="data-version"]').textContent =
      profile.data_version ?? "—";

    const namespaceWrap = card.querySelector('[data-role="namespaces"]');
    const namespaceEntries = Object.entries(build.namespaces || {});
    if (!namespaceEntries.length) {
      const chip = document.createElement("span");
      chip.className = "build-chip";
      chip.textContent = "non renseigné";
      namespaceWrap.appendChild(chip);
    } else {
      namespaceEntries.forEach(([namespace, count]) => {
        const chip = document.createElement("span");
        chip.className = "build-chip";
        chip.textContent = `${namespace} · ${formatNumber(count)}`;
        namespaceWrap.appendChild(chip);
      });
    }

    const materialsWrap = card.querySelector('[data-role="materials"]');
    const materials = (build.top_materials || []).slice(0, 6);
    if (!materials.length) {
      materialsWrap.textContent = "Non renseigné";
    } else {
      materials.forEach(([name, count]) => {
        const row = document.createElement("div");
        row.className = "build-material";

        const code = document.createElement("code");
        code.textContent = name;

        const value = document.createElement("span");
        value.textContent = formatNumber(count);

        row.append(code, value);
        materialsWrap.appendChild(row);
      });
    }

    const downloadButton = card.querySelector('[data-action="download"]');
    downloadButton.addEventListener("click", () => downloadSchematic(build, downloadButton));

    const worldEditButton = card.querySelector('[data-action="worldedit"]');
    worldEditButton.addEventListener("click", () => copyWorldEdit(build, worldEditButton));

    const statsLink = card.querySelector('[data-action="stats"]');
    statsLink.href = assetUrl(build.stats);

    return fragment;
  }

  function render() {
    const query = (search?.value || "").trim().toLowerCase();
    const filtered = query
      ? builds.filter((build) => searchableText(build).includes(query))
      : builds;

    grid.replaceChildren();

    if (!filtered.length) {
      state.hidden = false;
      state.textContent = query
        ? "Aucun build ne correspond à cette recherche."
        : "Aucun build publié pour le moment.";
      return;
    }

    state.hidden = true;
    filtered.forEach((build) => grid.appendChild(makeCard(build)));
  }

  async function load() {
    try {
      const response = await fetch(INDEX_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();

      builds = Array.isArray(manifest.builds) ? manifest.builds : [];
      summary.textContent = `${builds.length} construction${builds.length > 1 ? "s" : ""} publiée${builds.length > 1 ? "s" : ""}`;
      source.textContent = `Source : ${manifest.repository || "GabCon-BuildAI"}`;
      render();
    } catch (error) {
      console.error(error);
      summary.textContent = "Bibliothèque indisponible";
      state.hidden = false;
      state.textContent =
        "Impossible de charger generated/index.json depuis GabCon-BuildAI. Réessaie après la publication de la branche BuildAI.";
    }
  }

  search?.addEventListener("input", render);
  load();
})();
