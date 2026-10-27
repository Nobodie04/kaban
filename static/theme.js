/* Tema tampilan: terang atau gelap. Bila belum memilih, mengikuti perangkat. Pilihan disimpan di browser pengguna.
   Dimuat di <head> agar tema terpasang sebelum halaman tampil (tanpa kedip). */
(function(){
  var K = "kaban-tema", root = document.documentElement, mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function saved(){ try{ var v = localStorage.getItem(K); return v==="light"||v==="dark" ? v : null; }catch(e){ return null; } }
  function current(){ return saved() || (mq && mq.matches ? "dark" : "light"); }
  function apply(m){ if(m) root.setAttribute("data-theme", m); else root.removeAttribute("data-theme"); }
  function set(m){ try{ localStorage.setItem(K, m); }catch(e){} apply(m); paint(); }
  var NS = "http://www.w3.org/2000/svg", btn = null;
  var PATH = {
    light:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    dark:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>' };
  function icon(k){ var s = document.createElementNS(NS,"svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor");
    s.setAttribute("stroke-width","2"); s.setAttribute("stroke-linecap","round"); s.setAttribute("stroke-linejoin","round"); s.setAttribute("aria-hidden","true"); s.innerHTML = PATH[k]; return s; }
  function paint(){            // ikon menunjukkan mode tujuan: bulan saat terang, matahari saat gelap
    if(!btn) return; var next = current()==="dark" ? "light" : "dark";
    btn.replaceChildren(icon(next==="dark" ? "dark" : "light"));
    var label = next==="dark" ? "Ganti ke mode gelap" : "Ganti ke mode terang"; btn.title = label; btn.setAttribute("aria-label", label); }
  function build(){
    var host = document.querySelector(".topbar"), floatMode = !host && document.body.hasAttribute("data-theme-toggle");
    if(!host && !floatMode) return;
    btn = document.createElement("button"); btn.type = "button"; btn.className = "theme-btn" + (floatMode ? " float" : "");
    btn.onclick = function(){ set(current()==="dark" ? "light" : "dark"); };
    (floatMode ? document.body : host).appendChild(btn); paint();
  }
  apply(saved());
  if(mq && mq.addEventListener) mq.addEventListener("change", paint);
  window.KabanTema = {get:current, set:set};
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
