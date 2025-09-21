// ⚠️ Mets ici tes URL réelles
const MAP_URL      = "http://192.168.1.5:8100/#worldid=overworld:0:64:0:perspective"; // BlueMap
const MODPACK_URL  = "https://drive.google.com/file/d/1pBRd7FtJDDwK3YcZLo62jRoOJ4pqH0lB/view?usp=drive_link"; // Google Drive
const DISCORD_URL  = "https://discord.gg/ton-invite"; // optionnel

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-link='map']").forEach(a => a.href = MAP_URL);
  document.querySelectorAll("[data-link='modpack']").forEach(a => a.href = MODPACK_URL);
  document.querySelectorAll("[data-link='discord']").forEach(a => a.href = DISCORD_URL);
});
