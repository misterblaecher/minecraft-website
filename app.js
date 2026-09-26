(() => {
  const MAP_URL = "http://80.201.203.20:8100/#world:-48:0:-1140:1500:0:0:0:0:perspective";
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fitWorldFrame() {
    const scene = document.querySelector('.world-scene');
    const frame = document.querySelector('.world-frame');
    const image = document.querySelector('.world-scene__image');
    if (!scene || !frame || !image || !image.naturalWidth || !image.naturalHeight) return;

    const bounds = scene.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const scale = Math.min(
      bounds.width / image.naturalWidth,
      bounds.height / image.naturalHeight
    );

    frame.style.width = `${Math.max(1, image.naturalWidth * scale)}px`;
    frame.style.height = `${Math.max(1, image.naturalHeight * scale)}px`;
  }

  function bindFrameFit() {
    const scene = document.querySelector('.world-scene');
    const image = document.querySelector('.world-scene__image');
    if (!scene || !image) return;

    if (image.complete && image.naturalWidth) {
      fitWorldFrame();
    } else {
      image.addEventListener('load', fitWorldFrame, { once: true });
    }

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(fitWorldFrame);
      observer.observe(scene);
    } else {
      window.addEventListener('resize', fitWorldFrame, { passive: true });
    }

    window.addEventListener('orientationchange', fitWorldFrame, { passive: true });
  }

  function makeParticles() {
    const layer = document.querySelector('.world-particles');
    if (!layer || prefersReducedMotion) return;
    const count = window.innerWidth < 700 ? 12 : 24;
    for (let i = 0; i < count; i += 1) {
      const p = document.createElement('span');
      p.style.left = `${8 + Math.random() * 84}%`;
      p.style.top = `${22 + Math.random() * 64}%`;
      p.style.setProperty('--duration', `${5 + Math.random() * 7}s`);
      p.style.setProperty('--delay', `${-Math.random() * 8}s`);
      const size = 1.5 + Math.random() * 2.5;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      layer.appendChild(p);
    }
  }

  function bindParallax() {
    const scene = document.querySelector('.world-scene');
    if (!scene || prefersReducedMotion || !window.matchMedia('(pointer:fine)').matches) return;

    let raf = 0;
    scene.addEventListener('pointermove', (event) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = scene.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        scene.style.setProperty('--parallax-x', `${(-x * 7).toFixed(2)}px`);
        scene.style.setProperty('--parallax-y', `${(-y * 5).toFixed(2)}px`);
      });
    });

    scene.addEventListener('pointerleave', () => {
      scene.style.setProperty('--parallax-x', '0px');
      scene.style.setProperty('--parallax-y', '0px');
    });
  }

  function bindTravel() {
    document.querySelectorAll('[data-transition]').forEach((link) => {
      link.addEventListener('click', (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) return;

        const href = link.getAttribute('href');
        if (!href) return;

        event.preventDefault();

        if (prefersReducedMotion) {
          window.location.href = href;
          return;
        }

        const scene = document.querySelector('.world-scene');
        if (scene) {
          scene.style.setProperty('--zoom-x', link.dataset.x || '50%');
          scene.style.setProperty('--zoom-y', link.dataset.y || '50%');
          scene.style.setProperty('--zoom-scale', link.dataset.scale || '2');
          scene.style.setProperty('--parallax-x', '0px');
          scene.style.setProperty('--parallax-y', '0px');
        }

        document.body.classList.add('is-zooming');
        window.setTimeout(() => {
          window.location.href = href;
        }, 900);
      });
    });
  }

  function updateClock() {
    const clock = document.getElementById('worldClock');
    if (!clock) return;

    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-map-live]').forEach((link) => { link.href = MAP_URL; });
    bindFrameFit();
    makeParticles();
    bindParallax();
    bindTravel();
    updateClock();
    window.setInterval(updateClock, 30000);
    document.body.classList.add('is-loaded');
  });
})();
