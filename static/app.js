async function api(method, url, body){
  const o = {method, headers:{"X-Requested-With":"kaban"}, credentials:"same-origin"};
  if(body !== undefined){ o.headers["Content-Type"]="application/json"; o.body=JSON.stringify(body); }
  let r; try{ r = await fetch(url,o); }catch(e){ throw new Error("Tidak bisa terhubung ke server. Periksa koneksi Anda."); }
  let d = {}; try{ d = await r.json(); }catch(e){}
  if(!r.ok){ const er = new Error(d.error || "Terjadi kesalahan."); er.status = r.status; throw er; }
  return d;
}
function el(tag, attrs, ...kids){
  const e = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==="class") e.className=v; else if(k==="text") e.textContent=v;
    else if(k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if(v!==false && v!=null) e.setAttribute(k, v===true?"":v);
  }
  kids.flat().forEach(c=>{ if(c!=null) e.append(c.nodeType?c:document.createTextNode(c)); });
  return e;
}
const rp = n => n==null ? "-" : "Rp " + Number(n).toLocaleString("id-ID");
function tgl(s){ // "YYYY-MM-DD HH:MM[:SS]" (UTC dari server untuk created_at; jadwal sudah waktu lokal)
  return (s||"").slice(0,16).replace("T"," ");
}
function utcLocal(s){
  if(!s) return ""; const d = new Date(s.replace(" ","T")+"Z");
  return isNaN(d) ? s : d.toLocaleString("id-ID",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
}
const STATUS_LABEL = {baru:"Baru",dikonfirmasi:"Dikonfirmasi",dikerjakan:"Dikerjakan",selesai:"Selesai",dibatalkan:"Dibatalkan",pendaftar:"Pendaftar",aktif:"Aktif",ditolak:"Ditolak",nonaktif:"Nonaktif"};
const chip = s => el("span",{class:"chip "+s,text:STATUS_LABEL[s]||s});
function note(box, text, kind){ box.textContent = text||""; box.className = "msg "+(kind||"err"); box.hidden = !text; }
