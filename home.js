(() => {
  "use strict";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");

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

    if (finePointer.matches) {
      let raf = 0;
      scene.addEventListener("pointermove", (event) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const bounds = scene.getBoundingClientRect();
          const x = (event.clientX - bounds.left) / bounds.width - .5;
          const y = (event.clientY - bounds.top) / bounds.height - .5;
          scene.style.setProperty("--hero-x", `${(-x * 15).toFixed(2)}px`);
          scene.style.setProperty("--hero-y", `${(-y * 10).toFixed(2)}px`);
        });
      }, { passive: true });
      scene.addEventListener("pointerleave", () => {
        scene.style.setProperty("--hero-x", "0px");
        scene.style.setProperty("--hero-y", "0px");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupMenu();
    setupAtmosphere();
  });
})();
