/* Komponen antarmuka bersama untuk halaman admin dan akun: ikon, toast, dialog, helper format. */
const NS_SVG = "http://www.w3.org/2000/svg";
const ICO = {
  dash:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  orders:'<path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1zM8 6H6a1 1 0 00-1 1v13a1 1 0 001 1h12a1 1 0 001-1V7a1 1 0 00-1-1h-2M9 12h6M9 16h4"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.6a3.5 3.5 0 010 6.8M18 14.2A6.5 6.5 0 0121.5 20"/>',
  team:'<path d="M3 12l4-4 4 3 4-3 6 5-6 6-4-3-4 3-4-3zM7 8l-4 4"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  home:'<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
  logout:'<path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4M16 8l4 4-4 4M20 12H9"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  download:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  pin:'<path d="M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
  edit:'<path d="M4 20h4L19 9a2.1 2.1 0 00-3-3L5 17zM14 7l3 3"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>',
  refresh:'<path d="M20 11a8 8 0 00-14.5-4M4 4v4h4M4 13a8 8 0 0014.5 4M20 20v-4h-4"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  repeat:'<path d="M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  external:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  bell:'<path d="M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 004 0"/>',
  wallet:'<path d="M4 7a2 2 0 012-2h11v4M4 7v11a2 2 0 002 2h13a1 1 0 001-1v-9a1 1 0 00-1-1H6a2 2 0 01-2-2zM16 14h2"/>',
  tag:'<path d="M3 12V4h8l10 10-8 8zM7.5 8.5h.01"/>',
  chart:'<path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-8"/>',
};
function ico(name, cls){
  const s = document.createElementNS(NS_SVG, "svg");
  s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("class","ico"+(cls?" "+cls:"")); s.setAttribute("aria-hidden","true");
  s.innerHTML = ICO[name] || ""; return s;
}
function svcIcon(inner){
  const s = document.createElementNS(NS_SVG, "svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("class","ico"); s.setAttribute("aria-hidden","true");
  s.innerHTML = inner || ""; return s;
}
const debounce = (fn, ms=250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; };
const initial = n => (n||"?").trim().charAt(0).toUpperCase();
const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
function fmtJadwal(s){ // "2026-10-30 09:00" -> "30 Okt 2026, 09.00"
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s||""); if(!m) return s||"";
  return `${+m[3]} ${BULAN[+m[2]-1]} ${m[1]}, ${m[4]}.${m[5]}`;
}
function fmtTime(d){ return d.toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"}); }
function mapsUrl(lat,lng,alamat){
  return (lat!=null && lng!=null) ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
       : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alamat||"")}`;
}

function toast(msg, kind="ok"){
  let box = document.querySelector(".toasts");
  if(!box){ box = el("div",{class:"toasts",role:"status","aria-live":"polite"}); document.body.append(box); }
  const t = el("div",{class:"toast "+kind}, ico(kind==="bad"?"close":kind==="new"?"bell":"check"), el("span",{text:msg}));
  box.append(t); setTimeout(()=>t.remove(), kind==="bad"?6000:4200);
}

/* dialog: mode "modal" (tengah) atau "drawer" (panel kanan). body = Node. actions = [{label, cls, onClick, left}] */
function openDialog({title, body, actions=[], mode="modal", onClose}){
  const dlg = el("dialog",{class:mode});
  const close = ()=>{ if(dlg.open) dlg.close(); };
  const foot = actions.length ? el("div",{class:"dlg-foot"}, actions.map(a=>{
    const b = el("button",{type:"button",class:"btn "+(a.cls||""),text:a.label});
    if(a.left) b.classList.add("left");
    b.onclick = async ()=>{ b.disabled = true; try{ await a.onClick(close, b); } finally { b.disabled = false; } };
    return b; })) : null;
  dlg.append(el("div",{class:"dlg-head"}, el("h2",{text:title}), el("button",{type:"button",class:"btn ghost sm icon","aria-label":"Tutup",onclick:close}, ico("close"))),
             el("div",{class:"dlg-body"}, body), foot);
  dlg.addEventListener("click", e=>{ if(e.target===dlg) close(); });
  dlg.addEventListener("close", ()=>{ dlg.remove(); onClose && onClose(); });
  document.body.append(dlg); dlg.showModal();
  return {close, el:dlg, body:dlg.querySelector(".dlg-body")};
}
function confirmDialog(title, message, okLabel="Ya, lanjutkan", danger=true){
  return new Promise(res=>{
    let done=false; const fin = v=>{ if(!done){ done=true; res(v); } };
    openDialog({title, body:el("p",{text:message}), onClose:()=>fin(false), actions:[
      {label:"Batal", cls:"ghost", onClick:c=>{ fin(false); c(); }},
      {label:okLabel, cls:danger?"bad":"", onClick:c=>{ fin(true); c(); }}]});
  });
}
const field = (label, input, hint) => el("label",{}, label, input, hint ? el("span",{class:"small",text:hint}) : null);
function switchEl(id, checked, text){
  return el("label",{class:"switch"}, el("input",{type:"checkbox",id,checked:!!checked}), el("span",{text}));
}
function copyText(text, btn){
  const ok = ()=>{ toast("Tersalin."); };
  try{ navigator.clipboard.writeText(text).then(ok, ()=>toast("Salin manual: pilih teksnya lalu Ctrl+C.","bad")); }
  catch(e){ toast("Salin manual: pilih teksnya lalu Ctrl+C.","bad"); }
}
function setupShell(){
  const open = v => document.body.classList.toggle("nav-open", v);
  document.getElementById("menuBtn")?.addEventListener("click", ()=>open(!document.body.classList.contains("nav-open")));
  document.querySelector(".scrim")?.addEventListener("click", ()=>open(false));
  document.getElementById("sidebar")?.addEventListener("click", e=>{ if(e.target.closest("a")) open(false); });
}
