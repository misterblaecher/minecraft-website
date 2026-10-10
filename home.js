(() => {
  "use strict";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function setupMenu() {
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.getElementById("primary-nav");
    if (!toggle || !nav) return;
    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
    document.addEventListener("click", (event) => {
      if (!toggle.contains(event.target) && !nav.contains(event.target)) setOpen(false);
    });
    window.matchMedia("(min-width: 761px)").addEventListener("change", (event) => {
      if (event.matches) setOpen(false);
    });
  }


  // Crop BG-1 and its inline smoke in one SVG coordinate system.
  // On narrow screens keep the chimney and locomotive in view.
  function setupLandscapeFraming() {
    const art = document.querySelector(".hero__landscape-art");
    if (!art) return;
    const frame = () => {
      const width = art.clientWidth;
      const height = art.clientHeight;
      if (!width || !height) return;
      const sourceWidth = 1672;
      const sourceHeight = 941;
      const chimneyX = 1195;
      const visibleWidth = sourceHeight * (width / height);
      if (visibleWidth < sourceWidth) {
        const offsetX = Math.max(0, Math.min(sourceWidth - visibleWidth, chimneyX - visibleWidth * .22));
        art.setAttribute("viewBox", `${offsetX.toFixed(2)} 0 ${visibleWidth.toFixed(2)} ${sourceHeight}`);
        art.setAttribute("preserveAspectRatio", "xMidYMid meet");
      } else {
        art.setAttribute("viewBox", "0 0 1672 941");
        art.setAttribute("preserveAspectRatio", "xMidYMid slice");
      }
    };
    frame();
    if ("ResizeObserver" in window) new ResizeObserver(frame).observe(art);
    else window.addEventListener("resize", frame, { passive: true });
  }

  function setupAtmosphere() {
    const scene = document.querySelector(".hero");
    const container = document.querySelector("[data-particles]");
    if (!scene || !container || reducedMotion.matches) return;

    const count = Math.min(window.innerWidth < 760 ? 10 : 22, 22);
    const fragments = document.createDocumentFragment();
    for (let i = 0; i < count; i += 1) {
      const spark = document.createElement("span");
      spark.style.left = `${8 + Math.random() * 89}%`;
      spark.style.top = `${17 + Math.random() * 72}%`;
      spark.style.setProperty("--spark-duration", `${5 + Math.random() * 8}s`);
      spark.style.setProperty("--spark-delay", `${-Math.random() * 9}s`);
      fragments.appendChild(spark);
    }
    container.appendChild(fragments);


  }

  document.addEventListener("DOMContentLoaded", () => {
    setupMenu();
    setupLandscapeFraming();
    setupAtmosphere();
  });
})();
