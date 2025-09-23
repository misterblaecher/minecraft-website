// ⚙️ mets tes URL
const MAP_URL     = "http://80.201.203.20:8100/#world:-48:0:-1140:1500:0:0:0:0:perspective"; 
const MODPACK_URL = "modpack.html";       
const DISCORD_URL = "https://discord.gg/8SBNM537uZ"; // ✅ ton vrai lien

function injectLinks(){
  document.querySelectorAll("[data-link='map']").forEach(a => a.href = MAP_URL);
  document.querySelectorAll("[data-link='modpack']").forEach(a => a.href = MODPACK_URL);
  document.querySelectorAll("[data-link='discord']").forEach(a => a.href = DISCORD_URL);
}

// petit helper glow
function glow(card){
  if(!card) return;
  card.classList.add('flash');
  setTimeout(()=>card.classList.remove('flash'), 900);
}

// ouverture/fermeture douce avec max-height dynamique
function openReveal(card, content){
  // pour laisser la zone s'ajuster après l'anim, on fige la hauteur pendant la transition
  content.classList.add('is-open');
  content.style.maxHeight = content.scrollHeight + 'px';
  glow(card);

  // à la fin de la transition, on met max-height:auto pour la réactivité
  const onEnd = (e)=>{
    if(e.propertyName === 'max-height'){
      content.style.maxHeight = 'none';
      content.removeEventListener('transitionend', onEnd);
    }
  };
  content.addEventListener('transitionend', onEnd);
}

function closeReveal(content){
  // repasser de auto -> hauteur fixe -> 0 pour une anim fluide
  content.style.maxHeight = content.scrollHeight + 'px';
  requestAnimationFrame(()=>{
    content.classList.remove('is-open');
    content.style.maxHeight = '0px';
  });
}

function toggleInfos(forceOpen=false){
  const card = document.getElementById('infos');               // la carte complète
  const content = document.querySelector('#infos .reveal');     // le bloc qui se déplie
  if(!card || !content) return;

  const isOpen = content.classList.contains('is-open');
  if(forceOpen || !isOpen){
    openReveal(card, content);
  }else{
    closeReveal(content);
  }
}

function bindButtons(){
  // bouton infos : soit un <a href="#infos"> soit un bouton avec data-toggle="infos"
  document.querySelectorAll('a[href$="#infos"], [data-toggle="infos"]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.preventDefault();
      history.replaceState(null,'', '#infos'); // met à jour l’URL
      toggleInfos(false);
      // scroll vers la carte
      document.getElementById('infos')?.scrollIntoView({behavior:'smooth', block:'start'});
    });
  });
}

function handleHashOnLoad(){
  if(location.hash === '#infos'){
    // ouvrir automatiquement et scroller
    setTimeout(()=>{
      toggleInfos(true);
      document.getElementById('infos')?.scrollIntoView({behavior:'smooth', block:'start'});
    }, 50);
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  injectLinks();
  bindButtons();
  handleHashOnLoad();
});

