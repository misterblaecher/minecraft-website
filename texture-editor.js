(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const CHATGPT_IMAGES_URL = "https://chatgpt.com/images/";

  const canvas = $("templateCanvas");
  const ctx = canvas.getContext("2d");

  let templateFile = null;
  let templateUrl = null;
  let templateImage = null;
  let templateSize = null;

  function setPromptStatus(message) {
    $("promptStatus").textContent = message;
  }

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
    if (!templateSize) {
      return { width: 1024, height: 1024, scale: 16 };
    }
    const scale = selectedScale();
    return {
      width: templateSize.width * scale,
      height: templateSize.height * scale,
      scale
    };
  }

  function buildPrompt() {
    const design = $("designBrief").value.trim() || "[DESCRIBE THE CHARACTER / SKIN HERE]";
    const target = targetResolution();
    const sourceW = templateSize ? templateSize.width : "[REFERENCE WIDTH]";
    const sourceH = templateSize ? templateSize.height : "[REFERENCE HEIGHT]";
    const scale = target.scale;

    const exampleX = 20;
    const exampleY = 32;
    const scaledX = exampleX * scale;
    const scaledY = exampleY * scale;

    const prompt = [
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
      "x = " + scaledX,
      "y = " + scaledY,
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

    $("promptOutput").value = prompt;
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

  function renderTemplatePreview() {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    if (!templateImage) {
      ctx.fillStyle = "#10141b";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#8d99aa";
      ctx.font = "600 16px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Template UV", width / 2, height / 2);
      return;
    }

    const scale = Math.min(width / templateImage.naturalWidth, height / templateImage.naturalHeight);
    const drawW = templateImage.naturalWidth * scale;
    const drawH = templateImage.naturalHeight * scale;
    ctx.drawImage(
      templateImage,
      (width - drawW) / 2,
      (height - drawH) / 2,
      drawW,
      drawH
    );
  }

  async function loadTemplate(file) {
    if (!file) return;

    if (templateUrl) URL.revokeObjectURL(templateUrl);
    templateUrl = URL.createObjectURL(file);

    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = templateUrl;
      });

      templateFile = file;
      templateImage = image;
      templateSize = {
        width: image.naturalWidth,
        height: image.naturalHeight
      };

      $("templateMeta").textContent =
        templateSize.width + "×" + templateSize.height + "px · " +
        (file.name || "template");

      renderTemplatePreview();
      buildPrompt();
      $("copyPrompt").disabled = false;
      $("openImages").disabled = false;
      setPromptStatus("Template prêt");
    } catch (error) {
      console.error(error);
      setPromptStatus("Image invalide");
    }
  }

  async function copyPromptToClipboard() {
    const text = $("promptOutput").value;

    try {
      await navigator.clipboard.writeText(text);
      setPromptStatus("Prompt copié ✓");
      return true;
    } catch (error) {
      try {
        const textarea = $("promptOutput");
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        setPromptStatus("Prompt copié ✓");
        return true;
      } catch {
        setPromptStatus("Copie automatique impossible");
        return false;
      }
    }
  }

  async function copyAndOpenImages() {
    if (!templateFile) {
      setPromptStatus("Charge d’abord le template UV");
      return;
    }

    const popup = window.open("about:blank", "_blank");
    const copied = await copyPromptToClipboard();

    if (popup) {
      popup.opener = null;
      popup.location.href = CHATGPT_IMAGES_URL;
    } else if (copied) {
      setPromptStatus("Prompt copié · autorise les pop-ups pour ouvrir ChatGPT Images");
    }
  }

  $("templateInput").addEventListener("change", () => {
    const file = $("templateInput").files && $("templateInput").files[0];
    if (file) loadTemplate(file);
  });

  $("scaleMode").addEventListener("change", buildPrompt);
  $("designBrief").addEventListener("input", buildPrompt);
  $("copyPrompt").addEventListener("click", copyPromptToClipboard);
  $("openImages").addEventListener("click", copyAndOpenImages);

  const drop = $("templateDrop");
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
    if (file) loadTemplate(file);
  });

  window.addEventListener("beforeunload", () => {
    if (templateUrl) URL.revokeObjectURL(templateUrl);
  });

  $("copyPrompt").disabled = false;
  $("openImages").disabled = true;
  renderTemplatePreview();
  buildPrompt();
})();