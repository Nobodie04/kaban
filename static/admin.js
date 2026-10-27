/* Halaman admin: dasbor langsung, pesanan, pengguna, mitra, layanan, pengaturan situs. */
const $ = id => document.getElementById(id);
const S = {me:null, live:null, lastId:null, mitra:[], services:[], icons:{}, view:"dasbor",
           ord:{q:"", status:"", offset:0}, usr:{q:"", role:""}, mitraFilter:"semua"};
const STATUS_ORDER = ["baru","dikonfirmasi","dikerjakan","selesai","dibatalkan"];
const NAV = [["dasbor","Dasbor","dash"],["pesanan","Pesanan","orders"],["pengguna","Pengguna","users"],["mitra","Mitra","team"],["layanan","Layanan","tag"],["pengaturan","Pengaturan","gear"]];
const rpShort = n => "Rp " + compactNum(n);
const INTL = "id-ID";
const tglPendek = iso => { const [y,m,d] = iso.split("-"); return `${+d}/${+m}`; };
const tglPanjang = iso => { const [y,m,d] = iso.split("-"); return `${+d} ${BULAN[+m-1]}`; };

/* ---------- kerangka ---------- */
function buildNav(){
  $("nav").replaceChildren(...NAV.map(([id,label,ic])=>el("a",{href:"#"+id,"data-v":id}, ico(ic), el("span",{text:label}), el("span",{class:"count",id:"cnt-"+id,hidden:true}))));
  $("menuBtn").append(ico("menu")); $("logout").append(ico("logout"), "Keluar");
  $("siteLink").append(ico("external"), "Lihat situs");
}
function setCount(id, n){ const c = $("cnt-"+id); if(!c) return; c.textContent = n; c.hidden = !n; }
function setLive(ok, t){ $("live").classList.toggle("off", !ok); $("liveText").textContent = ok ? "Langsung · "+fmtTime(t||new Date()) : "Terputus, mencoba lagi..."; }
$("logout").onclick = async()=>{ await api("POST","/api/logout",{}); location.href="/masuk"; };

/* ---------- penyuntingan data bersama ---------- */
async function loadRefs(){
  const [m, s] = await Promise.all([api("GET","/api/admin/mitra"), api("GET","/api/admin/services")]);
  S.mitra = m; S.services = s.items; S.icons = s.icons;
}
const activeMitra = () => S.mitra.filter(m=>m.status==="aktif");

/* ---------- polling langsung ---------- */
async function poll(){
  try{
    const d = await api("GET","/api/admin/live");
    if(S.lastId!==null && d.last_order_id > S.lastId){ toast("Pesanan baru masuk.","new"); if(S.view==="pesanan") loadOrders(); }
    S.lastId = d.last_order_id; S.live = d;
    setCount("pesanan", d.tiles.pesanan_baru); setCount("mitra", d.tiles.pendaftar_mitra);
    document.title = (d.tiles.pesanan_baru ? `(${d.tiles.pesanan_baru}) ` : "") + "Admin Kaban";
    setLive(true);
    if(S.view==="dasbor") renderDasbor();
  }catch(e){ if(e.status===401||e.status===403){ location.href="/masuk?next=/admin"; return; } setLive(false); }
}
setInterval(()=>{ if(!document.hidden) poll(); }, 8000);
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) poll(); });

/* ---------- router ---------- */
const VIEWS = {dasbor:viewDasbor, pesanan:viewPesanan, pengguna:viewPengguna, mitra:viewMitra, layanan:viewLayanan, pengaturan:viewPengaturan};
function route(){
  const id = (location.hash||"#dasbor").slice(1); S.view = VIEWS[id] ? id : "dasbor";
  document.querySelectorAll("#nav a").forEach(a=>{ if(a.dataset.v===S.view) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  $("pageTitle").textContent = NAV.find(n=>n[0]===S.view)[1];
  $("view").replaceChildren(el("div",{class:"skel"}));
  Promise.resolve(VIEWS[S.view]($("view"))).catch(e=>$("view").replaceChildren(el("div",{class:"msg err",text:e.message})));
  window.scrollTo(0,0);
}
window.addEventListener("hashchange", route);
function go(view, extra){ if(extra) Object.assign(S.ord, extra); location.hash = "#"+view; }

/* ---------- dasbor ---------- */
function viewDasbor(c){ c.replaceChildren(el("div",{id:"dash"})); if(S.live) renderDasbor(); else return poll(); }
function renderDasbor(){
  const box = $("dash"); if(!box || !S.live) return; const d = S.live, t = d.tiles;
  const delta = t.kemarin===0 ? (t.hari_ini ? "naik dari 0 kemarin" : "sama dengan kemarin")
    : (()=>{ const p = Math.round((t.hari_ini-t.kemarin)/t.kemarin*100); return (p>=0?"+":"")+p+"% dibanding kemarin"; })();
  const tile = (lbl, val, sub, icn, fn, alert) => el(fn?"button":"div",{class:"tile"+(alert?" alert":""),onclick:fn||null,type:fn?"button":null},
    el("span",{class:"lbl"}, ico(icn), lbl), el("b",{text:val}), el("span",{class:"sub",text:sub}));
  const tiles = el("div",{class:"tiles"},
    tile("Pesanan hari ini", t.hari_ini, delta, "orders"),
    tile("Perlu tindakan", t.pesanan_baru, t.pesanan_baru ? "pesanan baru belum diproses" : "semua sudah diproses", "bell", ()=>go("pesanan",{status:"baru",offset:0,q:""}), t.pesanan_baru>0),
    tile("Sedang berjalan", t.berjalan, "dikonfirmasi atau dikerjakan", "refresh", ()=>go("pesanan",{status:"aktif",offset:0,q:""})),
    tile("Nilai bulan ini", rpShort(t.omzet_bulan_ini), t.selesai_bulan_ini+" pesanan selesai", "wallet"),
    tile("Mitra aktif", t.mitra_aktif, t.pendaftar_mitra ? t.pendaftar_mitra+" menunggu persetujuan" : "tidak ada antrean", "team", ()=>go("mitra")),
    tile("Pelanggan", t.pengguna, "akun terdaftar", "users", ()=>go("pengguna")));
  const hr = d.harian, sum = k => hr.reduce((a,x)=>a+x[k],0);
  const mk = (it,k)=>({label:tglPendek(it.tanggal), tip:tglPanjang(it.tanggal), value:it[k]});
  const chartOrders = timeChart(hr.map(i=>mk(i,"pesanan")), {kind:"bar", fmt:v=>v+" pesanan", unit:"Pesanan", aria:"Pesanan per hari, 14 hari terakhir"});
  const chartRev = timeChart(hr.map(i=>mk(i,"pendapatan")), {kind:"area", fmt:v=>rp(v), unit:"Pendapatan", aria:"Pendapatan per hari, 14 hari terakhir"});
  const st = STATUS_ORDER.map(s=>({nama:STATUS_LABEL[s], n:d.status[s]||0}));
  const feed = d.aktivitas.length ? el("ul",{class:"feed"}, d.aktivitas.map(a=>el("li",{},
      el("span",{class:"dot "+a.status}),
      el("span",{}, el("b",{text:a.kode}), " · "+a.layanan+" · "+a.nama, el("br"), el("small",{text:(STATUS_LABEL[a.status]||a.status)+(a.catatan?" · "+a.catatan:"")})),
      el("small",{text:utcLocal(a.created_at)})))) : el("div",{class:"empty",text:"Belum ada aktivitas."});
  const panel = (title, sub, body, cls) => el("section",{class:"panel "+(cls||"")}, el("div",{class:"panel-head"}, el("h3",{text:title}), sub?el("span",{class:"sub",text:sub}):null), el("div",{class:"panel-body"}, body));
  box.replaceChildren(
    el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Ringkasan operasional"}), el("p",{text:"Diperbarui otomatis setiap 8 detik selama halaman ini terbuka."}))),
    tiles,
    el("div",{class:"grid2",style:"margin-top:20px"},
      panel("Pesanan per hari","Total 14 hari: "+sum("pesanan"), chartOrders),
      panel("Pendapatan per hari","Total 14 hari: "+rp(sum("pendapatan")), chartRev)),
    el("div",{class:"grid3",style:"margin-top:16px"},
      panel("Aktivitas terbaru","", feed),
      el("div",{style:"display:grid;gap:16px;align-content:start"},
        panel("Layanan terlaris","30 hari terakhir", hBars(d.layanan.map(l=>({nama:l.nama,n:l.n})),"Belum ada pesanan.")),
        panel("Status pesanan","semua waktu", hBars(st)))));
}

/* ---------- pesanan ---------- */
const STATUS_FILTERS = [["","Semua status"],["baru","Perlu tindakan (baru)"],["aktif","Sedang berjalan"],["dikonfirmasi","Dikonfirmasi"],["dikerjakan","Dikerjakan"],["selesai","Selesai"],["dibatalkan","Dibatalkan"]];
function viewPesanan(c){
  const q = el("input",{id:"o-q",type:"search",placeholder:"Cari kode, nama, nomor, alamat, mitra",value:S.ord.q,"aria-label":"Cari pesanan"});
  q.oninput = debounce(()=>{ S.ord.q = q.value.trim(); S.ord.offset = 0; loadOrders(); });
  const sel = el("select",{id:"o-st","aria-label":"Filter status"}, STATUS_FILTERS.map(([v,l])=>el("option",{value:v,text:l,selected:v===S.ord.status})));
  sel.onchange = ()=>{ S.ord.status = sel.value; S.ord.offset = 0; loadOrders(); };
  const exp = el("a",{class:"btn ghost sm",id:"o-exp",href:"#"}, ico("download"), "Ekspor CSV");
  c.replaceChildren(
    el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Pesanan"}), el("p",{text:"Klik baris untuk membuka detail, memilih mitra, mengisi harga, dan mengubah status."}))),
    el("div",{class:"toolbar"}, el("div",{class:"search"}, ico("search"), q), sel, exp),
    el("div",{id:"o-table"}), el("div",{class:"pager",id:"o-pager"}));
  return loadOrders();
}
function orderQuery(extra){ const p = new URLSearchParams(); if(S.ord.status) p.set("status",S.ord.status); if(S.ord.q) p.set("q",S.ord.q); if(extra) for(const k in extra) p.set(k,extra[k]); return p.toString(); }
async function loadOrders(){
  const box = $("o-table"); if(!box) return;
  $("o-exp").href = "/api/admin/orders.csv?"+orderQuery();
  try{
    const r = await api("GET","/api/admin/orders?"+orderQuery({offset:S.ord.offset}));
    if(!r.items.length){ box.replaceChildren(el("div",{class:"empty",text:"Tidak ada pesanan yang cocok dengan filter ini."})); $("o-pager").replaceChildren(); return; }
    const rows = r.items.map(o=>{ const tr = el("tr",{"data-id":o.id,tabindex:"0"},
      el("td",{}, el("b",{text:o.kode}), el("span",{class:"sub",text:utcLocal(o.created_at)})),
      el("td",{}, o.nama, el("span",{class:"sub",text:"+"+o.wa})),
      el("td",{text:o.layanan}), el("td",{text:fmtJadwal(o.jadwal)}), el("td",{text:o.mitra||"-"}),
      el("td",{class:"num",text:o.harga!=null?rp(o.harga):"-"}), el("td",{}, chip(o.status)));
      tr.onclick = ()=>openOrder(o.id); tr.onkeydown = e=>{ if(e.key==="Enter") openOrder(o.id); }; return tr; });
    box.replaceChildren(el("div",{class:"tablewrap"}, el("table",{}, el("thead",{}, el("tr",{}, ...["Kode","Pelanggan","Layanan","Jadwal","Mitra"].map(h=>el("th",{text:h})), el("th",{class:"num",text:"Harga"}), el("th",{text:"Status"}))), el("tbody",{}, rows))));
    const from = S.ord.offset+1, to = S.ord.offset+r.items.length;
    const prev = el("button",{class:"btn ghost sm",text:"Sebelumnya",disabled:S.ord.offset===0,onclick:()=>{ S.ord.offset = Math.max(0,S.ord.offset-r.limit); loadOrders(); }});
    const next = el("button",{class:"btn ghost sm",text:"Berikutnya",disabled:to>=r.total,onclick:()=>{ S.ord.offset += r.limit; loadOrders(); }});
    $("o-pager").replaceChildren(el("span",{text:`Menampilkan ${from}-${to} dari ${r.total} pesanan`}), el("span",{class:"row"}, prev, next));
  }catch(e){ box.replaceChildren(el("div",{class:"msg err",text:e.message})); }
}
async function openOrder(id){
  let o; try{ o = await api("GET","/api/admin/orders/"+id); }catch(e){ toast(e.message,"bad"); return; }
  const st = el("select",{id:"d-st"}, STATUS_ORDER.map(s=>el("option",{value:s,text:STATUS_LABEL[s],selected:s===o.status})));
  const ms = [...activeMitra()].sort((a,b)=>(b.layanan.includes(o.layanan_kode)) - (a.layanan.includes(o.layanan_kode)));
  const mt = el("select",{id:"d-mt"}, el("option",{value:"",text:"- belum dipilih -"}), ms.map(m=>el("option",{value:m.id,selected:m.id===o.mitra_id,
    text:m.nama+" · "+m.kelurahan+(m.layanan.includes(o.layanan_kode)?"":" (bukan layanan ini)")+(m.tersedia===0||m.tersedia===false?" (libur)":"")+(m.akun?"":" (belum punya akun)")})));
  const hg = el("input",{id:"d-hg",type:"number",min:"0",step:"1000",inputmode:"numeric",placeholder:"Rupiah",value:o.harga??""});
  const cat = el("input",{id:"d-cat",maxlength:"200",placeholder:"Dikirim ke pelanggan di riwayat, mis. mitra berangkat"});
  const ci = el("textarea",{id:"d-ci",maxlength:"500",placeholder:"Hanya terlihat oleh admin"}, o.catatan_admin||"");
  const msg = el("div",{class:"msg err",hidden:true});
  const body = el("div",{style:"display:grid;gap:20px"},
    el("div",{class:"row between"}, chip(o.status), el("span",{class:"small",text:"Dibuat "+utcLocal(o.created_at)})),
    el("div",{class:"sec"}, el("h3",{text:"Pelanggan"}), el("dl",{class:"kv"},
      el("dt",{text:"Nama"}), el("dd",{text:o.nama}),
      el("dt",{text:"WhatsApp"}), el("dd",{}, "+"+o.wa+" ", el("a",{href:"https://wa.me/"+o.wa,target:"_blank",rel:"noopener",text:"Chat"})),
      el("dt",{text:"Akun"}), el("dd",{text:o.akun ? o.akun.nama : "Tamu (belum punya akun)"}))),
    el("div",{class:"sec"}, el("h3",{text:"Pekerjaan"}), el("dl",{class:"kv"},
      el("dt",{text:"Layanan"}), el("dd",{text:o.layanan}), el("dt",{text:"Jadwal"}), el("dd",{text:fmtJadwal(o.jadwal)}),
      el("dt",{text:"Alamat"}), el("dd",{}, o.alamat+" ", el("a",{href:mapsUrl(o.lat,o.lng,o.alamat),target:"_blank",rel:"noopener",text:o.lat!=null?"Buka peta (titik pasti)":"Cari di peta"})),
      o.detail ? [el("dt",{text:"Detail"}), el("dd",{text:o.detail})] : null,
      o.rating ? [el("dt",{text:"Penilaian"}), el("dd",{text:"★".repeat(o.rating)+"☆".repeat(5-o.rating)+(o.ulasan?" · "+o.ulasan:"")})] : null)),
    el("div",{class:"sec"}, el("h3",{text:"Penanganan"}),
      field("Status", st), field("Mitra", mt), field("Harga (Rp)", hg), field("Catatan untuk pelanggan (opsional)", cat), field("Catatan internal", ci), msg),
    el("div",{class:"sec"}, el("h3",{text:"Riwayat"}), el("ul",{class:"tl"}, o.events.map(v=>el("li",{}, el("b",{text:STATUS_LABEL[v.status]||v.status}), " · "+utcLocal(v.created_at)+(v.catatan?" · "+v.catatan:""))))));
  openDialog({title:o.kode+" · "+o.layanan, mode:"drawer", body, actions:[
    {label:"Tutup", cls:"ghost", onClick:c=>c()},
    {label:"Simpan perubahan", onClick: async (close)=>{
      note(msg,"");
      try{
        await api("PATCH","/api/admin/orders/"+id,{status:st.value, mitra_id:mt.value?Number(mt.value):null, harga:hg.value===""?null:Number(hg.value), catatan:cat.value, catatan_admin:ci.value});
        toast("Pesanan "+o.kode+" tersimpan."); close(); loadOrders(); poll();
      }catch(x){ note(msg,x.message); }
    }}]});
}

/* ---------- pengguna ---------- */
function viewPengguna(c){
  const q = el("input",{id:"u-q",type:"search",placeholder:"Cari nama atau nomor",value:S.usr.q,"aria-label":"Cari pengguna"});
  q.oninput = debounce(()=>{ S.usr.q = q.value.trim(); loadUsers(); });
  const seg = el("div",{class:"seg",role:"group","aria-label":"Peran"}, [["","Semua"],["user","Pelanggan"],["mitra","Mitra"],["admin","Admin"]].map(([v,l])=>{
    const b = el("button",{type:"button","aria-pressed":String(S.usr.role===v),text:l}); b.onclick = ()=>{ S.usr.role = v; seg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); loadUsers(); }; return b; }));
  c.replaceChildren(
    el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Pengguna"}), el("p",{text:"Kelola akun pelanggan dan admin: ubah data, nonaktifkan, atau reset password."})),
      el("button",{class:"btn",onclick:newUser}, ico("plus"), "Tambah pengguna")),
    el("div",{class:"toolbar"}, el("div",{class:"search"}, ico("search"), q), seg), el("div",{id:"u-table"}));
  return loadUsers();
}
async function loadUsers(){
  const box = $("u-table"); if(!box) return;
  try{
    const p = new URLSearchParams(); if(S.usr.q) p.set("q",S.usr.q); if(S.usr.role) p.set("role",S.usr.role);
    const rows = await api("GET","/api/admin/users?"+p);
    if(!rows.length){ box.replaceChildren(el("div",{class:"empty",text:"Tidak ada pengguna yang cocok."})); return; }
    const trs = rows.map(u=>{ const tr = el("tr",{"data-id":u.id,tabindex:"0"},
      el("td",{}, el("div",{class:"row",style:"flex-wrap:nowrap"}, el("span",{class:"avatar",style:"width:32px;height:32px;font-size:.9rem",text:initial(u.nama)}), el("b",{text:u.nama}))),
      el("td",{text:"+"+u.wa}), el("td",{}, el("span",{class:"tag"+(u.is_mitra&&u.role!=="admin"?" ok":""),text:u.role==="admin"?"Admin":u.is_mitra?"Mitra":"Pelanggan"})),
      el("td",{class:"num",text:u.pesanan}),
      el("td",{}, el("span",{class:"pill"+(u.aktif?"":" off")}, el("i"), u.aktif?"Aktif":"Nonaktif")),
      el("td",{text:u.last_login?utcLocal(u.last_login):"belum pernah"}), el("td",{text:utcLocal(u.created_at)}));
      tr.onclick = ()=>openUser(u.id); tr.onkeydown = e=>{ if(e.key==="Enter") openUser(u.id); }; return tr; });
    box.replaceChildren(el("div",{class:"tablewrap"}, el("table",{}, el("thead",{}, el("tr",{}, el("th",{text:"Nama"}), el("th",{text:"WhatsApp"}), el("th",{text:"Peran"}), el("th",{class:"num",text:"Pesanan"}), el("th",{text:"Status"}), el("th",{text:"Login terakhir"}), el("th",{text:"Daftar"}))), el("tbody",{}, trs))));
  }catch(e){ box.replaceChildren(el("div",{class:"msg err",text:e.message})); }
}
function showSecret(title, text, pw){
  const code = el("div",{class:"secret",text:pw});
  openDialog({title, body:el("div",{style:"display:grid;gap:12px"}, el("p",{text:text}), code, el("p",{class:"small",text:"Password hanya ditampilkan sekarang. Sampaikan ke pengguna lewat WhatsApp, lalu minta mereka menggantinya di menu Profil."})),
    actions:[{label:"Salin password",cls:"ghost",onClick:()=>copyText(pw)},{label:"Selesai",onClick:c=>c()}]});
}
async function openUser(id){
  let u; try{ u = await api("GET","/api/admin/users/"+id); }catch(e){ toast(e.message,"bad"); return; }
  const self = u.id === S.me.id;
  const nama = el("input",{id:"x-nama",value:u.nama,maxlength:"80"}), wa = el("input",{id:"x-wa",type:"tel",value:"0"+u.wa.slice(2)});
  const role = el("select",{id:"x-role",disabled:self}, [["user","Pelanggan"],["admin","Admin"]].map(([v,l])=>el("option",{value:v,text:l,selected:v===u.role})));
  const aktif = switchEl("x-aktif", u.aktif, "Akun aktif (bisa masuk)"); if(self) aktif.querySelector("input").disabled = true;
  const msg = el("div",{class:"msg err",hidden:true});
  const body = el("div",{style:"display:grid;gap:20px"},
    el("dl",{class:"kv"}, el("dt",{text:"Terdaftar"}), el("dd",{text:utcLocal(u.created_at)}), el("dt",{text:"Login terakhir"}), el("dd",{text:u.last_login?utcLocal(u.last_login):"belum pernah"}),
      el("dt",{text:"Total belanja"}), el("dd",{text:rp(u.belanja)})),
    el("div",{class:"sec"}, el("h3",{text:"Data akun"}), field("Nama",nama), field("Nomor WhatsApp",wa), field("Peran",role, self?"Anda tidak bisa mengubah peran akun sendiri.":u.mitra?"Akun ini terhubung ke mitra "+u.mitra.nama+" ("+u.mitra.status+"). Kelola di menu Mitra.":null), aktif, msg),
    el("div",{class:"sec"}, el("h3",{text:"Pesanan terakhir"}), u.pesanan.length ? el("ul",{class:"feed"}, u.pesanan.map(o=>el("li",{},
      el("span",{class:"dot "+o.status}), el("span",{}, el("b",{text:o.kode}), " · "+o.layanan, el("br"), el("small",{text:fmtJadwal(o.jadwal)})), chip(o.status)))) : el("div",{class:"empty",text:"Belum ada pesanan."})),
    el("div",{class:"sec"}, el("h3",{text:"Lokasi tersimpan ("+u.lokasi.length+")"}), u.lokasi.length ? el("ul",{class:"feed"}, u.lokasi.map(l=>el("li",{},
      ico("pin"), el("span",{}, el("b",{text:l.label+(l.utama?" (utama)":"")}), el("br"), el("small",{text:l.alamat})), el("a",{href:mapsUrl(l.lat,l.lng,l.alamat),target:"_blank",rel:"noopener",text:"Peta"})))) : el("div",{class:"empty",text:"Belum menyimpan lokasi."})));
  openDialog({title:u.nama, mode:"drawer", body, actions:[
    {label:"Reset password", cls:"ghost left", onClick: async ()=>{
      if(!await confirmDialog("Reset password?", "Password lama tidak berlaku lagi dan pengguna akan keluar dari semua perangkat.", "Reset", true)) return;
      try{ const r = await api("POST","/api/admin/users/"+id+"/reset-password",{}); showSecret("Password baru", "Password sementara untuk "+u.nama+":", r.password); }catch(x){ toast(x.message,"bad"); } }},
    {label:"Simpan", onClick: async close=>{
      note(msg,"");
      try{ await api("PATCH","/api/admin/users/"+id,{nama:nama.value, wa:wa.value, role:role.value, aktif:aktif.querySelector("input").checked}); toast("Akun diperbarui."); close(); loadUsers(); poll(); }
      catch(x){ note(msg,x.message); } }}]});
}
function newUser(){
  const nama = el("input",{id:"n-nama",maxlength:"80"}), wa = el("input",{id:"n-wa",type:"tel",placeholder:"081234567890"});
  const role = el("select",{id:"n-role"}, el("option",{value:"user",text:"Pelanggan"}), el("option",{value:"admin",text:"Admin"}));
  const pw = el("input",{id:"n-pw",type:"text",placeholder:"Kosongkan untuk dibuat otomatis",autocomplete:"off"});
  const msg = el("div",{class:"msg err",hidden:true});
  openDialog({title:"Tambah pengguna", body:el("div",{style:"display:grid;gap:14px"}, field("Nama",nama), field("Nomor WhatsApp",wa), field("Peran",role), field("Password awal",pw,"Minimal 8 karakter."), msg),
    actions:[{label:"Batal",cls:"ghost",onClick:c=>c()},{label:"Buat akun",onClick:async close=>{
      note(msg,"");
      try{ const r = await api("POST","/api/admin/users",{nama:nama.value,wa:wa.value,role:role.value,password:pw.value}); close(); loadUsers(); poll(); showSecret("Akun dibuat","Password awal untuk "+nama.value+":",r.password); }
      catch(x){ note(msg,x.message); } }}]});
}

/* ---------- mitra ---------- */
function viewMitra(c){
  const F = [["semua","Semua"],["pendaftar","Pendaftar"],["aktif","Aktif"],["lain","Nonaktif/ditolak"]];
  const seg = el("div",{class:"seg",role:"group","aria-label":"Filter mitra"}, F.map(([v,l])=>{
    const b = el("button",{type:"button","aria-pressed":String(S.mitraFilter===v),text:l}); b.onclick = ()=>{ S.mitraFilter = v; seg.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); renderMitra(); }; return b; }));
  c.replaceChildren(el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Mitra"}), el("p",{text:"Terima pendaftar, ubah data, atau tambah mitra secara manual."})),
    el("button",{class:"btn",onclick:()=>editMitra(null)}, ico("plus"), "Tambah mitra")), el("div",{class:"toolbar"}, seg), el("div",{class:"cards",id:"m-cards"}));
  return loadRefs().then(renderMitra);
}
function renderMitra(){
  const box = $("m-cards"); if(!box) return;
  const f = S.mitraFilter, list = S.mitra.filter(m=> f==="semua" || (f==="lain" ? (m.status==="nonaktif"||m.status==="ditolak") : m.status===f));
  setCount("mitra", S.mitra.filter(m=>m.status==="pendaftar").length);
  if(!list.length){ box.replaceChildren(el("div",{class:"empty",style:"grid-column:1/-1",text:"Tidak ada mitra di kategori ini."})); return; }
  const nameOf = k => (S.services.find(s=>s.kode===k)||{}).nama || k;
  const setSt = async (m, s) => { try{ await api("PATCH","/api/admin/mitra/"+m.id,{status:s}); toast(m.nama+": "+STATUS_LABEL[s]); await loadRefs(); renderMitra(); poll(); }catch(x){ toast(x.message,"bad"); } };
  box.replaceChildren(...list.map(m=>el("article",{class:"mcard"},
    el("header",{}, el("div",{class:"row",style:"flex-wrap:nowrap"}, el("span",{class:"avatar",text:initial(m.nama)}), el("div",{}, el("h3",{text:m.nama}), el("span",{class:"small",text:m.kelurahan}))), chip(m.status)),
    el("div",{class:"meta"}, m.status==="aktif" ? el("span",{class:"tag "+(m.akun?"ok":"warn"),text:m.akun ? (m.tersedia ? "Akun aktif · tersedia" : "Akun aktif · libur") : "Belum punya akun login"}) : null, el("span",{text:"+"+m.wa}), el("span",{text:"Kendaraan: "+(m.kendaraan||"-")}), el("span",{text:m.pesanan+" pesanan · "+m.selesai+" selesai"})),
    el("div",{class:"tags"}, m.layanan.map(k=>el("span",{class:"tag",text:nameOf(k)}))),
    m.catatan ? el("p",{class:"small",text:m.catatan}) : null,
    el("div",{class:"row"},
      m.status==="pendaftar" ? [el("button",{class:"btn sm",text:"Terima",onclick:()=>setSt(m,"aktif")}), el("button",{class:"btn bad sm",text:"Tolak",onclick:()=>setSt(m,"ditolak")})]
        : m.status==="aktif" ? el("button",{class:"btn bad sm",text:"Nonaktifkan",onclick:()=>setSt(m,"nonaktif")}) : el("button",{class:"btn sm",text:"Aktifkan",onclick:()=>setSt(m,"aktif")}),
      m.status==="aktif" ? el("button",{class:"btn ghost sm",onclick:()=>mitraAkun(m)}, ico("key"), m.akun ? "Reset password" : "Buat akun login") : null,
      el("button",{class:"btn ghost sm",onclick:()=>editMitra(m)}, ico("edit"), "Ubah"),
      el("a",{class:"btn ghost sm",href:"https://wa.me/"+m.wa,target:"_blank",rel:"noopener"}, ico("phone"), "Chat")))));
}
async function mitraAkun(m){
  const msg = m.akun ? "Password mitra ini akan diganti dan perangkatnya dikeluarkan. Lanjutkan?" : "Buat akun login untuk "+m.nama+"? Password sementara akan ditampilkan sekali untuk Anda sampaikan lewat WhatsApp.";
  if(!await confirmDialog(m.akun ? "Reset password mitra?" : "Buat akun login mitra?", msg, m.akun ? "Ya, reset" : "Ya, buat akun", !!m.akun)) return;
  try{ const r = await api("POST","/api/admin/mitra/"+m.id+"/akun",{});
    showSecret(r.baru ? "Akun mitra dibuat" : "Password mitra diganti", "Masuk di halaman Masuk dengan nomor 0"+r.wa.slice(2)+" dan password sementara ini:", r.password);
    await loadRefs(); renderMitra(); }catch(x){ toast(x.message,"bad"); } }
function editMitra(m){
  const nama = el("input",{id:"mm-nama",value:m?m.nama:"",maxlength:"80"}), wa = el("input",{id:"mm-wa",type:"tel",value:m?"0"+m.wa.slice(2):"",placeholder:"081234567890"});
  const kel = el("input",{id:"mm-kel",value:m?m.kelurahan:"",maxlength:"80"}), kend = el("input",{id:"mm-kend",value:m?m.kendaraan||"":"",maxlength:"40"});
  const cat = el("textarea",{id:"mm-cat",maxlength:"500"}, m?m.catatan||"":"");
  const st = el("select",{id:"mm-st"}, MITRA_ST.map(s=>el("option",{value:s,text:STATUS_LABEL[s],selected:s===(m?m.status:"aktif")})));
  const checks = S.services.filter(s=>s.aktif).map(s=>el("label",{class:"switch"}, el("input",{type:"checkbox",name:"mm-svc",value:s.kode,checked:m?m.layanan.includes(s.kode):false}), el("span",{text:s.nama})));
  const msg = el("div",{class:"msg err",hidden:true});
  openDialog({title:m?"Ubah mitra":"Tambah mitra", body:el("div",{style:"display:grid;gap:14px"},
    el("div",{class:"row2"}, field("Nama",nama), field("Nomor WhatsApp",wa)), el("div",{class:"row2"}, field("Kelurahan / area",kel), field("Kendaraan",kend)),
    field("Status",st), el("div",{class:"sec"}, el("h3",{text:"Layanan yang dikerjakan"}), el("div",{style:"display:grid;gap:8px"}, checks)), field("Catatan",cat), msg),
    actions:[{label:"Batal",cls:"ghost",onClick:c=>c()},{label:"Simpan",onClick:async close=>{
      note(msg,"");
      const body = {nama:nama.value,wa:wa.value,kelurahan:kel.value,kendaraan:kend.value,catatan:cat.value,status:st.value,
        layanan:[...document.querySelectorAll('input[name="mm-svc"]:checked')].map(x=>x.value)};
      try{ m ? await api("PATCH","/api/admin/mitra/"+m.id,body) : await api("POST","/api/admin/mitra",body);
        toast("Mitra tersimpan."); close(); await loadRefs(); renderMitra(); poll(); }catch(x){ note(msg,x.message); } }}]});
}
const MITRA_ST = ["pendaftar","aktif","ditolak","nonaktif"];

/* ---------- layanan (tampil di beranda dan form) ---------- */
function viewLayanan(c){
  c.replaceChildren(el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Layanan"}), el("p",{text:"Daftar ini tampil di beranda dan di semua form pesanan. Ubah, tambah, atau sembunyikan kapan saja."})),
    el("div",{class:"row"}, el("a",{class:"btn ghost",href:"/",target:"_blank",rel:"noopener"}, ico("external"), "Lihat beranda"), el("button",{class:"btn",onclick:()=>editService(null)}, ico("plus"), "Tambah layanan"))),
    el("div",{class:"cards",id:"s-cards"}));
  return loadRefs().then(renderServices);
}
function renderServices(){
  const box = $("s-cards"); if(!box) return;
  box.replaceChildren(...S.services.map(s=>{
    const sw = switchEl("sw"+s.id, s.aktif, "Tampil di beranda");
    sw.querySelector("input").onchange = async e=>{ try{ await api("PATCH","/api/admin/services/"+s.id,{aktif:e.target.checked}); s.aktif = e.target.checked?1:0; toast(s.nama+(e.target.checked?" ditampilkan.":" disembunyikan.")); }catch(x){ e.target.checked = !e.target.checked; toast(x.message,"bad"); } };
    return el("article",{class:"mcard"},
      el("header",{}, el("div",{class:"row",style:"flex-wrap:nowrap"}, el("span",{class:"svc-ico"}, svcIcon(S.icons[s.ikon])), el("div",{}, el("h3",{text:s.nama}), el("span",{class:"small",text:s.harga_mulai||"Harga belum diisi"}))), el("span",{class:"tag",text:"#"+s.urutan})),
      el("p",{class:"small",text:s.deskripsi||"Tanpa deskripsi."}), el("div",{class:"small",text:s.pesanan+" pesanan"}), sw,
      el("div",{class:"row"}, el("button",{class:"btn ghost sm",onclick:()=>editService(s)}, ico("edit"), "Ubah"),
        el("button",{class:"btn bad sm",onclick:async()=>{ if(!await confirmDialog("Hapus layanan?", "Layanan \""+s.nama+"\" dihapus permanen. Jika sudah punya pesanan, sistem akan menolak dan Anda bisa menyembunyikannya saja.", "Hapus")) return;
          try{ await api("DELETE","/api/admin/services/"+s.id); toast("Layanan dihapus."); await loadRefs(); renderServices(); }catch(x){ toast(x.message,"bad"); } }}, ico("trash"), "Hapus")));
  }));
}
function editService(s){
  let ikon = s ? s.ikon : "lain";
  const nama = el("input",{id:"sv-nama",value:s?s.nama:"",maxlength:"60"}), harga = el("input",{id:"sv-harga",value:s?s.harga_mulai||"":"",maxlength:"80",placeholder:"mis. Mulai Rp 25.000"});
  const des = el("textarea",{id:"sv-des",maxlength:"300"}, s?s.deskripsi||"":""), urut = el("input",{id:"sv-urut",type:"number",min:"0",max:"999",value:s?s.urutan:50});
  const aktif = switchEl("sv-aktif", s?s.aktif:true, "Tampil di beranda");
  const pick = el("div",{class:"iconpick",role:"group","aria-label":"Pilih ikon"}, Object.keys(S.icons).map(k=>{
    const b = el("button",{type:"button","aria-pressed":String(k===ikon),"aria-label":k,title:k}, svcIcon(S.icons[k]));
    b.onclick = ()=>{ ikon = k; pick.querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); }; return b; }));
  const msg = el("div",{class:"msg err",hidden:true});
  openDialog({title:s?"Ubah layanan":"Tambah layanan", body:el("div",{style:"display:grid;gap:14px"}, field("Nama layanan",nama), field("Deskripsi singkat",des), field("Keterangan harga",harga), el("div",{class:"sec"}, el("h3",{text:"Ikon"}), pick), field("Urutan di beranda",urut,"Angka kecil tampil lebih dulu."), aktif, msg),
    actions:[{label:"Batal",cls:"ghost",onClick:c=>c()},{label:"Simpan",onClick:async close=>{
      note(msg,""); const body = {nama:nama.value,deskripsi:des.value,harga_mulai:harga.value,ikon,urutan:urut.value,aktif:aktif.querySelector("input").checked};
      try{ s ? await api("PATCH","/api/admin/services/"+s.id,body) : await api("POST","/api/admin/services",body); toast("Layanan tersimpan. Beranda ikut berubah."); close(); await loadRefs(); renderServices(); }catch(x){ note(msg,x.message); } }}]});
}

/* ---------- pengaturan situs ---------- */
async function viewPengaturan(c){
  const s = await api("GET","/api/admin/settings");
  const inp = (k,label,hint,type)=>field(label, el("input",{id:"st-"+k,type:type||"text",value:s[k]}), hint);
  const area = (k,label,hint)=>field(label, el("textarea",{id:"st-"+k}, s[k]), hint);
  const msg = el("div",{class:"msg err",hidden:true}), keys = Object.keys(s);
  const save = el("button",{class:"btn",text:"Simpan pengaturan"});
  save.onclick = async ()=>{
    note(msg,""); save.disabled = true; const body = {}; keys.forEach(k=>{ const e = $("st-"+k); if(e) body[k] = e.value; });
    try{ await api("PATCH","/api/admin/settings",body); toast("Pengaturan tersimpan. Beranda sudah diperbarui."); poll(); }catch(x){ note(msg,x.message); } save.disabled = false; };
  const card = (title, sub, ...kids)=>el("section",{class:"panel"}, el("div",{class:"panel-head"}, el("h3",{text:title}), el("span",{class:"sub",text:sub})), el("div",{class:"panel-body",style:"display:grid;gap:14px"}, ...kids));
  c.replaceChildren(
    el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Pengaturan situs"}), el("p",{text:"Teks dan kontak di beranda. Perubahan langsung terlihat tanpa edit file."})),
      el("a",{class:"btn ghost",href:"/",target:"_blank",rel:"noopener"}, ico("external"), "Lihat beranda")),
    el("div",{class:"grid2"},
      card("Teks beranda","Bagian paling atas halaman", inp("hero_judul","Judul"), inp("hero_sorot","Kalimat sorot (diberi warna)"), area("hero_lead","Paragraf pengantar"), inp("banner","Pengumuman di atas beranda","Kosongkan bila tidak ada.")),
      el("div",{style:"display:grid;gap:16px;align-content:start"},
        card("Kontak dan operasional","Tampil di beranda dan footer", inp("wa_admin","WhatsApp admin","Format 081234567890. Dipakai tombol WhatsApp di beranda.","tel"), inp("jam_operasional","Jam operasional"), inp("kota","Kota layanan")),
        card("Mitra","Dipakai halaman mitra", inp("bagi_hasil_mitra","Bagi hasil mitra (%)","Persentase harga pekerjaan yang menjadi penghasilan mitra, 0 sampai 100.","number")),
        card("Peta dan waktu","Pusat peta lokasi pelanggan", el("div",{class:"row2"}, inp("peta_lat","Latitude pusat peta"), inp("peta_lng","Longitude pusat peta")),
          inp("tz_offset","Selisih zona waktu dari UTC (jam)","WIB = 7, WITA = 8, WIT = 9. Memengaruhi pengelompokan grafik harian.","number")))),
    msg, el("div",{},save));
}

/* ---------- mulai ---------- */
(async function(){
  buildNav(); setupShell();
  try{ S.me = (await api("GET","/api/me")).user; }catch(e){}
  if(!S.me){ location.href="/masuk?next=/admin"; return; }
  if(S.me.role!=="admin"){ location.href="/akun"; return; }
  $("whoName").textContent = S.me.nama; $("avatar").textContent = initial(S.me.nama);
  try{ await loadRefs(); }catch(e){}
  route(); poll();
})();
