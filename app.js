// ⚠️ Mets ici tes URL réelles
const MAP_URL      = "http://192.168.1.5:8100/#worldid=overworld:0:64:0:perspective"; // BlueMap
const MODPACK_URL  = "https://drive.google.com/file/d/1pBRd7FtJDDwK3YcZLo62jRoOJ4pqH0lB/view?usp=drive_link"; // Google Drive
const DISCORD_URL  = "https://discord.gg/ton-invite"; // optionnel

document.addEventListener("DOMContentLoaded", () => {
  // injecte les liens
  document.querySelectorAll("[data-link='map']").forEach(a => a.href = MAP_URL);
  document.querySelectorAll("[data-link='modpack']").forEach(a => a.href = MODPACK_URL);
  document.querySelectorAll("[data-link='discord']").forEach(a => a.href = DISCORD_URL);

  // scroll forcé vers les ancres (GitHub Pages peut ignorer le jump natif selon le cache)
  const hashScroll = () => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // clic sur liens internes "#..."
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (el) {
        history.pushState(null, "", `#${id}`);
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // si la page charge déjà avec un hash
  hashScroll();

  // si on revient en arrière/avant avec un hash différent
  window.addEventListener('hashchange', hashScroll);
});
