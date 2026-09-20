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
    ].join("\\n");
  }

  function buildLabelPrompt() {
    const target = targetResolution();
    const sourceW = templateSize ? templateSize.width : "[REFERENCE WIDTH]";
    const sourceH = templateSize ? templateSize.height : "[REFERENCE HEIGHT]";

    return [
      "You are a Minecraft entity UV analyst.",
      "",
      "I will provide ONE reference image: the ORIGINAL vanilla/base Minecraft entity texture atlas.",
      "",
      "Your task is NOT to redesign the skin.",
      "Your task is to create a SEMANTICALLY ANNOTATED UV GUIDE that tells another AI exactly which body part and which face every UV region represents.",
      "",
      "This step is specifically for difficult entity atlases where many UV islands are visually identical or repeated.",
      "",
      "",
      "==================================================",
      "1. GEOMETRY MUST MATCH THE REFERENCE",
      "==================================================",
      "",
      "Reference atlas size:",
      sourceW + " × " + sourceH + " pixels",
      "",
      "Output the annotated guide at:",
      target.width + " × " + target.height + " pixels",
      "",
      "Use the exact same atlas aspect ratio, UV island positions, orientation and spacing as the supplied image.",
      "Scale all UV boundaries uniformly by exactly " + target.scale + "×.",
      "",
      "Do NOT repack, rotate, mirror, move, merge or invent UV islands.",
      "",
      "",
      "==================================================",
      "2. LABEL EVERY REPRESENTED PART",
      "==================================================",
      "",
      "Every identifiable UV face or plane MUST have a clear machine-readable name.",
      "",
      "Use uppercase ASCII labels with underscores only.",
      "",
      "Preferred naming format for cuboids:",
      "PART_INSTANCE_FACE",
      "",
      "Examples:",
      "HEAD_FRONT",
      "HEAD_BACK",
      "HEAD_LEFT",
      "HEAD_RIGHT",
      "HEAD_TOP",
      "HEAD_BOTTOM",
      "BODY_FRONT",
      "LEG_1_FRONT",
      "LEG_2_FRONT",
      "ARM_LEFT_TOP",
      "TENTACLE_1_LEFT",
      "TENTACLE_2_LEFT",
      "",
      "For flat planes or unusual geometry, use descriptive labels such as:",
      "WING_LEFT_PLANE_1",
      "FIN_RIGHT_PLANE_1",
      "MANE_PLANE_2",
      "",
      "CRITICAL RULE FOR REPEATED SHAPES:",
      "If two or more UV regions look identical, they MUST still receive different unique names.",
      "Never label repeated regions with the same generic name.",
      "Use anatomical position when known, otherwise use deterministic numbering: PART_1, PART_2, PART_3, etc.",
      "",
      "If the exact anatomical meaning is uncertain, do NOT omit the region.",
      "Give it a stable unique identifier such as UNKNOWN_PART_1_FRONT rather than leaving it unlabeled.",
      "",
      "",
      "==================================================",
      "3. MAKE LABELS EASY TO READ",
      "==================================================",
      "",
      "This is a GUIDE image, not the final game texture.",
      "",
      "Use high-contrast text.",
      "Place each name inside its matching UV face whenever there is enough room.",
      "If a region is too small, place the full label nearby in unused atlas space and connect it to the exact region with a thin leader line.",
      "",
      "Do not let a leader line point to multiple regions.",
      "Do not let one label describe multiple repeated regions.",
      "",
      "You may simplify the original artwork underneath the labels to improve readability, but NEVER alter the UV boundaries.",
      "",
      "",
      "==================================================",
      "4. OUTPUT",
      "==================================================",
      "",
      "Output exactly ONE annotated UV guide image.",
      target.width + " × " + target.height + " PNG",
      "",
      "No 3D character render.",
      "No perspective view.",
      "No presentation mockup.",
      "No extra legend outside the atlas.",
      "",
      "The single most important requirement is that every repeated or ambiguous UV region has its own explicit readable name."
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
      "IMAGE 2 = ANNOTATED SEMANTIC UV GUIDE",
      "",
      "The two images describe the same atlas geometry.",
      "",
      "IMAGE 1 is the ONLY authority for exact UV coordinates, island boundaries, transparency, orientation and topology.",
      "IMAGE 2 is the authority for the semantic identity of repeated or visually ambiguous regions: it tells you what each region represents.",
      "",
      "Never copy the labels, leader lines, guide colors or annotation styling from IMAGE 2 into the final texture.",
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
      "Do NOT guess the identity of those repeated regions.",
      "Use the explicit names shown in IMAGE 2.",
      "",
      "If multiple identical-looking regions have different labels, treat them as different model parts and paint each one according to its label.",
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
      "Before painting each region, read its corresponding label from IMAGE 2.",
      "Paint that region as the named body part / face.",
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
      "Where labels in IMAGE 2 identify neighboring faces of the same body part, continue material patterns naturally across their shared 3D edge without moving the faces.",
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
      "IMAGE 2 determines WHAT those regions represent.",
      "The design request determines HOW they should look."
    ].join("\n");
  }

  function rebuildPrompts() {
    $("directPromptOutput").value = buildDirectPrompt();
    $("labelPromptOutput").value = buildLabelPrompt();
    $("guidedPromptOutput").value = buildGuidedPrompt();
    updateResolutionSummary();
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
      } else {
        guideFile = file;
        guideUrl = url;
        guideImage = image;

        renderImage(guideCanvas, guideCtx, guideImage, "Guide annoté");
        $("scanGuide").disabled = false;
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

  function candidateLabelsFromText(text) {
    const faceWords = /(FRONT|BACK|LEFT|RIGHT|TOP|BOTTOM|SIDE|PLANE|UP|DOWN)/;
    const rawLines = String(text || "").split(/\r?\n/);
    const labels = [];

    for (const line of rawLines) {
      const normalized = normalizeLabel(line);
      if (!normalized || normalized.length < 4 || normalized.length > 80) continue;

      const parts = normalized.split("_").filter(Boolean);
      if (parts.length >= 2 && (faceWords.test(normalized) || /\d/.test(normalized))) {
        labels.push(normalized);
        continue;
      }

      const tokens = line.match(/[A-Za-z][A-Za-z0-9_-]{3,}/g) || [];
      for (const token of tokens) {
        const label = normalizeLabel(token);
        if (label.includes("_") && (faceWords.test(label) || /\d/.test(label))) labels.push(label);
      }
    }

    return Array.from(new Set(labels));
  }

  async function scanGuideLabels() {
    if (!guideImage) {
      $("ocrStatus").textContent = "Charge d’abord un guide annoté.";
      return;
    }
    if (!window.Tesseract) {
      $("ocrStatus").textContent = "Le module OCR n’a pas pu être chargé.";
      return;
    }

    $("scanGuide").disabled = true;
    $("guideOcrProgress").style.width = "3%";
    $("ocrStatus").textContent = "OCR en cours…";

    let worker = null;
    try {
      worker = await Tesseract.createWorker("eng", 1, {
        logger: (message) => {
          if (typeof message.progress === "number") {
            $("guideOcrProgress").style.width =
              Math.max(3, Math.round(message.progress * 100)) + "%";
          }
          if (message.status) $("ocrStatus").textContent = "OCR : " + message.status;
        }
      });

      const result = await worker.recognize(guideImage);
      const labels = candidateLabelsFromText(result.data && result.data.text);

      if (labels.length) {
        $("detectedLabels").value = labels.join("\n");
        $("ocrStatus").textContent =
          labels.length + " nom" + (labels.length > 1 ? "s" : "") +
          " détecté" + (labels.length > 1 ? "s" : "") +
          ". Corrige la liste si nécessaire.";
      } else {
        $("ocrStatus").textContent =
          "Aucun nom machine-readable détecté. Tu peux saisir/corriger les noms manuellement.";
      }

      $("guideOcrProgress").style.width = "100%";
      rebuildPrompts();
    } catch (error) {
      console.error(error);
      $("ocrStatus").textContent =
        "Échec OCR. La méthode guidée reste utilisable : saisis les noms manuellement.";
    } finally {
      if (worker) await worker.terminate();
      $("scanGuide").disabled = false;
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
  $("detectedLabels").addEventListener("input", rebuildPrompts);

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
    $("ocrStatus").textContent = "";
    $("guideOcrProgress").style.width = "0";
    rebuildPrompts();
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

  renderImage(templateCanvas, templateCtx, null, "Template UV");
  renderImage(guideCanvas, guideCtx, null, "Guide annoté");
  rebuildPrompts();
})();