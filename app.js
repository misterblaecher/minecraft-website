// ⚠️ Mets tes URL réelles ici
const MAP_URL      = "http://192.168.1.5:8100/#worldid=overworld:0:64:0:perspective"; // BlueMap
const MODPACK_URL  = "https://drive.google.com/file/d/1pBRd7FtJDDwK3YcZLo62jRoOJ4pqH0lB/view?usp=drive_link";
const DISCORD_URL  = "https://discord.gg/ton-invite"; // optionnel

function injectLinks() {
  document.querySelectorAll("[data-link='map']").forEach(a => a.href = MAP_URL);
  document.querySelectorAll("[data-link='modpack']").forEach(a => a.href = MODPACK_URL);
  document.querySelectorAll("[data-link='discord']").forEach(a => a.href = DISCORD_URL);
}

function scrollToHash(hash, withHighlight = true) {
  if (!hash) return;
  const id = hash.replace('#', '');
  const el = document.getElementById(id);
  if (!el) return;

  // plusieurs tentatives au cas où le layout se stabilise après rendu
  const go = () => {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (withHighlight) {
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1200);
    }
  };
  // tout de suite + un peu plus tard (fix GitHub Pages/caches)
  go();
  setTimeout(go, 80);
  setTimeout(go, 200);
}

function bindInternalAnchors() {
  // Intercepter TOUS les liens internes pour forcer le scroll
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const hash = a.getAttribute('href');
      history.pushState(null, "", hash); // met à jour l’URL
      scrollToHash(hash);
    });
  });

  // si la page charge déjà avec un hash
  if (location.hash) {
    // petit délai pour laisser le CSS/DOM se poser
    setTimeout(() => scrollToHash(location.hash), 60);
  }

  // navigation historique (retour/avant)
  window.addEventListener('hashchange', () => scrollToHash(location.hash));
}

document.addEventListener("DOMContentLoaded", () => {
  injectLinks();
  bindInternalAnchors();
});
