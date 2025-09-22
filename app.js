// ⚠️ Mets tes URL réelles ici
const MAP_URL      = "http://192.168.1.5:8100/#worldid=overworld:0:64:0:perspective";
const MODPACK_URL  = "https://drive.google.com/file/d/1pBRd7FtJDDwK3YcZLo62jRoOJ4pqH0lB/view?usp=drive_link";
const DISCORD_URL  = "https://discord.gg/ton-invite";

function injectLinks() {
  document.querySelectorAll("[data-link='map']").forEach(a => a.href = MAP_URL);
  document.querySelectorAll("[data-link='modpack']").forEach(a => a.href = MODPACK_URL);
  document.querySelectorAll("[data-link='discord']").forEach(a => a.href = DISCORD_URL);
}

/* Glow utilitaire */
function glow(el){
  if(!el) return;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 900);
}

/* Collapsible logiques */
function bindCollapsibles(){
  const panel = document.getElementById('infos');
  const triggers = document.querySelectorAll('[data-toggle="infos"]');

  const open = () => {
    panel.classList.add('is-open');
    glow(panel);
  };
  const close = () => panel.classList.remove('is-open');
  const toggle = () => panel.classList.toggle('is-open');

  triggers.forEach(t => {
    t.addEventListener('click', (e) => {
      e.preventDefault();
      toggle();
      if(panel.classList.contains('is-open')) glow(panel);
    });
  });

  if (location.hash === '#infos') {
    setTimeout(() => {
      open();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  window.addEventListener('hashchange', () => {
    if (location.hash === '#infos') {
      open();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectLinks();
  bindCollapsibles();
});
