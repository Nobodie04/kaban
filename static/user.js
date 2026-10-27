/* Halaman akun pelanggan: ringkasan, riwayat pesanan, pesan baru, lokasi tersimpan (dengan peta), profil. */
const $ = id => document.getElementById(id);
const U = {me:null, cfg:{}, services:[], addresses:[], view:"ringkasan", ord:{q:"",status:"",offset:0}, prefill:null};
const NAV = [["ringkasan","Ringkasan","dash"],["pesanan","Pesanan saya","orders"],["baru","Pesan baru","plus"],["lokasi","Lokasi saya","pin"],["profil","Profil","user"]];
const TITLES = {ringkasan:"Ringkasan", pesanan:"Pesanan saya", baru:"Pesan baru", lokasi:"Lokasi saya", profil:"Profil"};

function buildNav(){
  $("nav").replaceChildren(...NAV.map(([id,label,ic])=>el("a",{href:"#"+id,"data-v":id}, ico(ic), el("span",{text:label}))));
  $("menuBtn").append(ico("menu")); $("logout").append(ico("logout"),"Keluar"); $("siteLink").append(ico("home"),"Beranda");
  $("topNew").append(ico("plus"),"Pesan baru");
}
$("logout").onclick = async()=>{ await api("POST","/api/logout",{}); location.href="/"; };
const VIEWS = {ringkasan:viewRingkasan, pesanan:viewPesanan, baru:viewBaru, lokasi:viewLokasi, profil:viewProfil};
function route(){
  const id = (location.hash||"#ringkasan").slice(1); U.view = VIEWS[id] ? id : "ringkasan";
  document.querySelectorAll("#nav a").forEach(a=>{ if(a.dataset.v===U.view) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  $("pageTitle").textContent = TITLES[U.view]; $("topNew").hidden = U.view==="baru";
  $("view").replaceChildren(el("div",{class:"skel"}));
  Promise.resolve(VIEWS[U.view]($("view"))).catch(e=>{ if(e.status===401){ location.href="/masuk?next=/akun"; return; } $("view").replaceChildren(el("div",{class:"msg err",text:e.message})); });
  window.scrollTo(0,0);
}
window.addEventListener("hashchange", route);
const svcOf = kode => U.services.find(s=>s.kode===kode);
const waAdmin = () => U.cfg.wa_admin ? "https://wa.me/"+U.cfg.wa_admin : null;
async function loadAddresses(){ U.addresses = await api("GET","/api/my/addresses"); }

/* ---------- kartu pesanan ---------- */
function reorder(o){ U.prefill = {service:o.layanan_kode, alamat:o.alamat, lat:o.lat, lng:o.lng, detail:o.detail||""}; location.hash = "#baru"; }
const STEPS = [["baru","Diterima"],["dikonfirmasi","Dikonfirmasi"],["dikerjakan","Dikerjakan"],["selesai","Selesai"]];
const stars = n => el("span",{class:"stars",role:"img","aria-label":n+" dari 5 bintang"}, "★".repeat(n)+"☆".repeat(5-n));
function greeting(){ const h = new Date().getHours(); return h<11 ? "Selamat pagi" : h<15 ? "Selamat siang" : h<18 ? "Selamat sore" : "Selamat malam"; }

function stepper(o){
  if(o.status==="dibatalkan"){
    const ev = (o.events||[]).filter(e=>e.status==="dibatalkan").pop();
    return el("div",{class:"cancelled",role:"status"}, ico("close"), "Pesanan dibatalkan"+(ev ? " · "+utcLocal(ev.created_at) : ""));
  }
  const idx = STEPS.findIndex(s=>s[0]===o.status), fin = o.status==="selesai";
  const at = k => { const e = (o.events||[]).find(x=>x.status===k); return e ? utcLocal(e.created_at) : ""; };
  return el("ol",{class:"stepper","aria-label":"Tahap pesanan"}, STEPS.map(([k,l],i)=>
    el("li",{class: i<idx||fin ? "done" : i===idx ? "now" : "", "aria-current": i===idx ? "step" : null},
      el("span",{class:"pt"}, i<idx||fin ? ico("check") : null), el("b",{text:l}), el("small",{text:at(k)}))));
}

function reviewDialog(o, refresh){
  let val = 0; const msg = el("div",{class:"msg err",hidden:true});
  const btns = [1,2,3,4,5].map(n=>el("button",{type:"button",class:"star","aria-label":n+" bintang","aria-pressed":"false",onclick:()=>{ val = n; paint(); }}, "★"));
  const paint = ()=>btns.forEach((b,i)=>b.setAttribute("aria-pressed", String(i<val)));
  const txt = el("textarea",{id:"rv-txt",maxlength:"500",placeholder:"Ceritakan pengalaman Anda (opsional)"});
  openDialog({title:"Nilai pesanan "+o.kode, body:el("div",{style:"display:grid;gap:14px"},
      el("p",{class:"small",text:o.layanan+(o.mitra ? " oleh "+o.mitra : "")}), el("div",{class:"star-row",role:"group","aria-label":"Pilih jumlah bintang"}, btns), field("Ulasan",txt), msg),
    actions:[{label:"Batal",cls:"ghost",onClick:c=>c()},{label:"Kirim penilaian",onClick:async close=>{
      note(msg,""); if(!val){ note(msg,"Pilih jumlah bintang dulu."); return; }
      try{ await api("POST","/api/my/orders/"+o.id+"/review",{rating:val,ulasan:txt.value}); toast("Terima kasih atas penilaian Anda."); close(); refresh(); }catch(x){ note(msg,x.message); } }}]});
}

function orderCard(o, refresh){
  const canCancel = ["baru","dikonfirmasi"].includes(o.status);
  const ic = (U.cfg.icons||{})[o.ikon];
  const actions = el("div",{class:"row"},
    el("button",{class:"btn ghost sm",onclick:()=>reorder(o)}, ico("repeat"), "Pesan lagi"),
    el("a",{class:"btn ghost sm",href:mapsUrl(o.lat,o.lng,o.alamat),target:"_blank",rel:"noopener"}, ico("pin"), "Lihat di peta"),
    waAdmin() ? el("a",{class:"btn ghost sm",href:waAdmin()+"?text="+encodeURIComponent("Halo Kaban, soal pesanan "+o.kode),target:"_blank",rel:"noopener"}, ico("phone"), "Hubungi admin") : null,
    canCancel ? el("button",{class:"btn bad sm",onclick:async()=>{
      if(!await confirmDialog("Batalkan pesanan?","Pesanan "+o.kode+" ("+o.layanan+") akan dibatalkan.","Ya, batalkan")) return;
      try{ await api("POST","/api/my/orders/"+o.id+"/cancel",{}); toast("Pesanan dibatalkan."); refresh(); }catch(x){ toast(x.message,"bad"); } }}, ico("close"), "Batalkan") : null);
  const rating = o.status!=="selesai" ? null : o.rating
    ? el("div",{class:"rating-row"}, stars(o.rating), o.ulasan ? el("span",{class:"small",text:"“"+o.ulasan+"”"}) : el("span",{class:"small",text:"Terima kasih atas penilaian Anda."}))
    : el("div",{class:"rating-row"}, el("span",{class:"small",text:"Bagaimana hasil pekerjaannya?"}), el("button",{class:"btn accent sm",onclick:()=>reviewDialog(o,refresh)}, "Beri penilaian"));
  return el("article",{class:"order-card"},
    el("header",{}, el("span",{class:"svc-ico"}, ic ? svcIcon(ic) : ico("orders")), el("div",{class:"grow"}, el("h3",{text:o.layanan}), el("span",{class:"sub",text:o.kode+" · dibuat "+utcLocal(o.created_at)})), chip(o.status)),
    stepper(o),
    el("dl",{class:"meta2"},
      el("div",{}, el("dt",{text:"Jadwal"}), el("dd",{text:fmtJadwal(o.jadwal)})),
      el("div",{}, el("dt",{text:"Mitra"}), el("dd",{text:o.mitra||"Sedang dicarikan"})),
      el("div",{class:"wide"}, el("dt",{text:"Lokasi"}), el("dd",{text:o.alamat})),
      o.detail ? el("div",{class:"wide"}, el("dt",{text:"Detail"}), el("dd",{text:o.detail})) : null,
      el("div",{}, el("dt",{text:"Biaya"}), el("dd",{}, o.harga!=null ? el("span",{class:"price",text:rp(o.harga)}) : el("span",{class:"muted",text:"Akan dikabari admin"})))),
    rating,
    o.events ? el("details",{class:"data"}, el("summary",{text:"Riwayat status ("+o.events.length+")"}), el("ul",{class:"tl"}, o.events.map(v=>el("li",{}, el("b",{text:STATUS_LABEL[v.status]||v.status}), " · "+utcLocal(v.created_at)+(v.catatan?" · "+v.catatan:""))))) : null,
    actions);
}

/* ---------- ringkasan ---------- */
async function viewRingkasan(c){
  const s = await api("GET","/api/my/summary");
  const tile = (lbl, v, sub, ic, go)=>el(go?"button":"div",{class:"tile",type:go?"button":null,onclick:go||null}, el("span",{class:"lbl"},ico(ic),lbl), el("b",{text:v}), el("span",{class:"sub",text:sub}));
  const panel = (title, sub, ...kids)=>el("section",{class:"panel"}, el("div",{class:"panel-head"}, el("h3",{text:title}), sub ? el("span",{class:"sub",text:sub}) : null), el("div",{class:"panel-body"}, ...kids));
  const first = U.me.nama.split(" ")[0];
  const feed = s.aktivitas.length
    ? el("ul",{class:"feed"}, s.aktivitas.map(a=>el("li",{}, el("i",{class:"dot "+a.status}), el("div",{}, el("b",{text:a.layanan}), el("small",{text:" "+a.kode+" · "+(STATUS_LABEL[a.status]||a.status)+(a.catatan ? " · "+a.catatan : "")})), el("small",{text:utcLocal(a.created_at)}))))
    : el("p",{class:"small",text:"Belum ada aktivitas. Riwayat status pesanan Anda akan tampil di sini."});
  const maxFav = Math.max(1, ...s.favorit.map(f=>f.n));
  const side = [
    panel("Lokasi utama", null, s.lokasi_utama
      ? el("div",{class:"loc-line"}, el("span",{class:"svc-ico sm"}, ico("pin")), el("div",{}, el("b",{text:s.lokasi_utama.label}), el("p",{class:"small",text:s.lokasi_utama.alamat})), el("a",{class:"btn ghost sm",href:"#lokasi"},"Kelola"))
      : el("div",{class:"loc-line"}, el("div",{}, el("b",{text:"Belum ada lokasi tersimpan"}), el("p",{class:"small",text:"Simpan rumah atau kantor agar pesanan berikutnya cukup sekali pilih."})), el("a",{class:"btn sm",href:"#lokasi"},"Tambah"))),
    panel("Aktivitas terbaru", null, feed),
    s.favorit.length ? panel("Layanan yang sering dipakai", null, el("div",{class:"hbars"}, s.favorit.map(f=>el("div",{class:"hb"}, el("span",{class:"nm",text:f.nama}), el("span",{class:"track"}, el("span",{class:"fill",style:`width:${Math.round(f.n/maxFav*100)}%;display:block`})), el("span",{class:"v",text:f.n}))))) : null,
    panel("Butuh bantuan?", null, el("p",{class:"small",text:"Tanyakan status, ubah jadwal, atau sampaikan keluhan. Sebutkan kode pesanan agar lebih cepat."}),
      waAdmin() ? el("a",{class:"btn ghost",style:"margin-top:12px",href:waAdmin(),target:"_blank",rel:"noopener"}, ico("phone"), "Chat admin di WhatsApp") : el("p",{class:"small",text:"Kontak admin akan tampil di sini setelah diatur."}))
  ].filter(Boolean);
  c.replaceChildren(...[
    el("div",{class:"hero-card"}, el("div",{}, el("h2",{text:greeting()+", "+first+"."}), el("p",{text:s.berjalan ? s.berjalan+" pesanan sedang diproses." : "Ada urusan yang belum sempat Anda kerjakan?"})),
      el("div",{class:"row"}, el("a",{class:"btn accent",href:"#baru"}, ico("plus"), "Titip pekerjaan"), s.terakhir ? el("button",{class:"btn ghost",onclick:()=>reorder(s.terakhir)}, ico("repeat"), "Ulangi: "+s.terakhir.layanan) : null)),
    el("div",{class:"tiles"},
      tile("Total pesanan", s.total, "sejak bergabung", "orders", ()=>{ U.ord.status=""; location.hash="#pesanan"; }),
      tile("Sedang berjalan", s.berjalan, "baru, dikonfirmasi, dikerjakan", "refresh", ()=>{ U.ord.status="aktif"; location.hash="#pesanan"; }),
      tile("Selesai", s.selesai, "pekerjaan tuntas", "check", ()=>{ U.ord.status="selesai"; location.hash="#pesanan"; }),
      tile("Total biaya", rp(s.belanja), "dari pesanan selesai", "wallet")),
    s.belum_dinilai ? el("div",{class:"notice"}, el("span",{text:s.belum_dinilai+" pesanan selesai belum Anda nilai. Penilaian membantu kami menjaga mutu mitra."}), el("button",{class:"btn sm",onclick:()=>{ U.ord.status="selesai"; location.hash="#pesanan"; }},"Nilai sekarang")) : null,
    el("div",{class:"dash-grid"},
      el("div",{class:"sec"}, el("div",{class:"row between"}, el("h3",{text:"Pesanan aktif"}), s.aktif.length ? el("a",{href:"#pesanan",class:"small",text:"Lihat semua"}) : null),
        s.aktif.length ? el("div",{class:"stack"}, s.aktif.map(o=>orderCard(o, route)))
          : el("div",{class:"empty"}, el("b",{text:"Tidak ada pesanan aktif"}), el("p",{class:"small",text:"Pekerjaan yang Anda titipkan akan tampil di sini lengkap dengan tahapnya."}), el("a",{class:"btn",href:"#baru"}, ico("plus"), "Buat pesanan baru"))),
      el("div",{class:"side-col"}, ...side))
  ].filter(Boolean));
}

/* ---------- riwayat pesanan ---------- */
const TABS = [["","Semua",null],["aktif","Berjalan","aktif"],["selesai","Selesai","selesai"],["dibatalkan","Dibatalkan","dibatalkan"]];
async function viewPesanan(c){
  let sum = null; try{ sum = await api("GET","/api/my/summary"); }catch(e){}
  const count = k => !sum ? null : k==="" ? sum.total : k==="aktif" ? sum.berjalan : (sum.status[k]||0);
  const q = el("input",{id:"p-q",type:"search",placeholder:"Cari kode, layanan, alamat",value:U.ord.q,"aria-label":"Cari pesanan"});
  q.oninput = debounce(()=>{ U.ord.q = q.value.trim(); load(true); });
  const seg = el("div",{class:"seg",role:"group","aria-label":"Filter status"});
  const paintSeg = ()=>seg.replaceChildren(...TABS.map(([v,l])=>el("button",{type:"button","aria-pressed":String(v===U.ord.status),onclick:()=>{ U.ord.status = v; paintSeg(); load(true); }}, l, count(v)!=null ? el("span",{class:"n",text:count(v)}) : null)));
  paintSeg();
  const list = el("div",{class:"stack"}), more = el("div",{class:"row",style:"justify-content:center"}), info = el("p",{class:"small"});
  const qs = off => { const p = new URLSearchParams({offset:off}); if(U.ord.status) p.set("status",U.ord.status); if(U.ord.q) p.set("q",U.ord.q); return p; };
  let shown = 0;
  async function load(reset){
    if(reset){ shown = 0; list.replaceChildren(); more.replaceChildren(); }
    try{
      const r = await api("GET","/api/my/orders?"+qs(shown));
      if(reset && !r.items.length){ list.replaceChildren(el("div",{class:"empty"}, el("b",{text: U.ord.q||U.ord.status ? "Tidak ada pesanan yang cocok" : "Belum ada pesanan"}), el("p",{class:"small",text: U.ord.q||U.ord.status ? "Coba kata kunci atau filter lain." : "Pesanan Anda akan muncul di sini."}))); info.textContent=""; return; }
      r.items.forEach(o=>list.append(orderCard(o, ()=>load(true)))); shown += r.items.length;
      info.textContent = `Menampilkan ${shown} dari ${r.total} pesanan`;
      more.replaceChildren(shown < r.total ? el("button",{class:"btn ghost",text:"Muat lebih banyak",onclick:()=>load(false)}) : "");
    }catch(e){ list.replaceChildren(el("div",{class:"msg err",text:e.message})); }
  }
  c.replaceChildren(
    el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Riwayat pesanan"}), el("p",{text:"Semua titipan Anda, lengkap dengan tahap, biaya, dan penilaian."}))),
    el("div",{class:"toolbar"}, seg, el("div",{class:"search"}, ico("search"), q), el("a",{class:"btn ghost sm",href:"/api/my/orders.csv"}, ico("download"), "Unduh CSV")),
    info, list, more);
  return load(true);
}

/* ---------- pesan baru ---------- */
async function viewBaru(c){
  await loadAddresses();
  const pf = U.prefill; U.prefill = null;
  const svc = el("select",{id:"b-svc"}, U.services.map(s=>el("option",{value:s.kode,text:s.nama,selected:pf?s.kode===pf.service:false})));
  const price = el("p",{class:"small"}), upd = ()=>{ const s = svcOf(svc.value); price.textContent = s ? (s.harga_mulai||"") : ""; }; svc.onchange = upd; upd();
  const opts = U.addresses.map(a=>el("option",{value:a.id,text:a.label+" · "+a.alamat.slice(0,48),selected:!pf && a.utama}))
    .concat([el("option",{value:"lain",text:"Alamat lain...",selected:!!pf || !U.addresses.length})]);
  const loc = el("select",{id:"b-loc"}, opts);
  const alamat = el("input",{id:"b-alamat",maxlength:"200",placeholder:"Jalan, nomor, kelurahan",value:pf?pf.alamat:""});
  const alamatBox = field("Alamat lokasi pekerjaan", alamat);
  const sync = ()=>{ alamatBox.hidden = loc.value!=="lain"; }; loc.onchange = sync; sync();
  const t = new Date(), iso = t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0");
  const tgl = el("input",{id:"b-tgl",type:"date",min:iso,value:iso}), jam = el("input",{id:"b-jam",type:"time"});
  const det = el("textarea",{id:"b-det",maxlength:"1000",placeholder:"mis. nama sekolah dan jam masuk, ukuran tandon, daftar barang, alamat tujuan antar"}, pf?pf.detail:"");
  const msg = el("div",{class:"msg err",hidden:true}), btn = el("button",{class:"btn",type:"submit",text:"Kirim pesanan"});
  const form = el("form",{class:"card",novalidate:true,style:"max-width:680px"},
    el("h2",{text:"Titip pekerjaan baru"}), field("Layanan",svc), price,
    field("Lokasi", loc, U.addresses.length ? null : "Belum ada lokasi tersimpan. Anda bisa menambahkannya di menu Lokasi saya."), alamatBox,
    el("div",{class:"row2"}, field("Tanggal",tgl), field("Jam",jam)), field("Detail pekerjaan",det), msg, btn);
  form.onsubmit = async e=>{
    e.preventDefault(); note(msg,"");
    if(loc.value==="lain"){ if(!alamat.value.trim()){ note(msg,"Alamat belum diisi."); return; }
      if(!await confirmAddress(alamat.value.trim(), "", pf && pf.lat!=null && alamat.value===pf.alamat ? {lat:pf.lat,lng:pf.lng} : null)) return; }
    btn.disabled = true;
    const body = {service:svc.value, tanggal:tgl.value, jam:jam.value, detail:det.value};
    if(loc.value==="lain"){ body.alamat = alamat.value; if(pf && pf.lat!=null && alamat.value===pf.alamat){ body.lat = pf.lat; body.lng = pf.lng; } } else body.address_id = Number(loc.value);
    try{ const r = await api("POST","/api/orders",body); toast("Pesanan "+r.kode+" diterima."); U.ord = {q:"",status:"",offset:0}; location.hash = "#pesanan"; }
    catch(x){ note(msg,x.message); } btn.disabled = false;
  };
  c.replaceChildren(el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Pesan baru"}), el("p",{text:"Admin akan mengonfirmasi harga dan mitra lewat WhatsApp."}))), form);
}

/* ---------- lokasi tersimpan ---------- */
async function viewLokasi(c){
  await loadAddresses();
  c.replaceChildren(el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Lokasi saya"}), el("p",{text:"Simpan rumah, kantor, atau sekolah anak. Dipakai otomatis saat memesan, dan mitra mendapat titik petanya."})),
    el("button",{class:"btn",onclick:()=>editAddress(null)}, ico("plus"), "Tambah lokasi")), el("p",{class:"small",id:"a-count"}), el("div",{class:"cards",id:"a-cards"}));
  renderAddresses();
}
function renderAddresses(){
  const box = $("a-cards"); if(!box) return;
  $("a-count").textContent = U.addresses.length ? U.addresses.length+" dari 10 lokasi tersimpan" : "";
  if(!U.addresses.length){ box.replaceChildren(el("div",{class:"empty",style:"grid-column:1/-1"}, el("b",{text:"Belum ada lokasi tersimpan"}), el("p",{class:"small",text:"Tambahkan rumah atau kantor agar memesan cukup sekali pilih."}), el("button",{class:"btn",onclick:()=>editAddress(null)}, ico("plus"), "Tambah lokasi pertama"))); return; }
  box.replaceChildren(...U.addresses.map(a=>el("article",{class:"addr-card"+(a.utama?" utama":"")},
    el("header",{}, el("span",{class:"svc-ico sm"}, ico(/rumah/i.test(a.label) ? "home" : "pin")), el("div",{class:"grow"}, el("h3",{text:a.label}), el("span",{class:"sub",text:a.lat!=null ? "Titik peta tersimpan" : "Belum ada titik peta"})), a.utama ? el("span",{class:"tag",text:"Utama"}) : null),
    el("p",{text:a.alamat}), a.catatan ? el("p",{class:"small",text:"Patokan: "+a.catatan}) : null,
    el("div",{class:"row"},
      !a.utama ? el("button",{class:"btn ghost sm",text:"Jadikan utama",onclick:async()=>{ try{ await api("PATCH","/api/my/addresses/"+a.id,{utama:true}); await loadAddresses(); renderAddresses(); toast("Lokasi utama diganti."); }catch(x){ toast(x.message,"bad"); } }}) : null,
      el("button",{class:"btn ghost sm",onclick:()=>editAddress(a)}, ico("edit"), "Ubah"),
      el("a",{class:"btn ghost sm",href:mapsUrl(a.lat,a.lng,a.alamat),target:"_blank",rel:"noopener"}, ico("external"), "Peta"),
      el("button",{class:"btn bad sm","aria-label":"Hapus "+a.label,onclick:async()=>{ if(!await confirmDialog("Hapus lokasi?","\""+a.label+"\" akan dihapus. Pesanan lama tidak terpengaruh.","Hapus")) return;
        try{ await api("DELETE","/api/my/addresses/"+a.id); await loadAddresses(); renderAddresses(); toast("Lokasi dihapus."); }catch(x){ toast(x.message,"bad"); } }}, ico("trash"))))));
}
function confirmAddress(alamat, catatan, pt){
  return new Promise(res=>{
    let done = false; const fin = v=>{ if(!done){ done = true; res(v); } };
    const warn = pt ? null : el("p",{class:"notice",text:"Titik di peta belum dipilih. Mitra bisa kesulitan menemukan lokasi."});
    openDialog({title:"Alamat sudah benar?", onClose:()=>fin(false), body:el("div",{style:"display:grid;gap:10px"},
        el("p",{class:"small",text:"Periksa sekali lagi. Mitra akan datang ke alamat ini."}),
        el("div",{class:"loc-line"}, el("span",{class:"svc-ico sm"}, ico("pin")), el("div",{}, el("b",{text:alamat}), catatan ? el("p",{class:"small",text:"Patokan: "+catatan}) : null,
          el("p",{class:"small",text:pt ? "Titik peta: "+pt.lat+", "+pt.lng : "Tanpa titik peta"}))), warn),
      actions:[{label:"Periksa lagi",cls:"ghost",onClick:c=>{ fin(false); c(); }},{label:"Ya, alamat sudah benar",onClick:c=>{ fin(true); c(); }}]});
  });
}
function editAddress(a){
  let pt = a && a.lat!=null ? {lat:a.lat, lng:a.lng} : null;
  const label = el("input",{id:"ad-label",value:a?a.label:"Rumah",maxlength:"30",list:"ad-labels"}), dl = el("datalist",{id:"ad-labels"}, ["Rumah","Kantor","Sekolah","Toko","Rumah orang tua"].map(v=>el("option",{value:v})));
  const alamat = el("input",{id:"ad-alamat",value:a?a.alamat:"",maxlength:"200",placeholder:"Jalan, nomor, kelurahan"});
  const cat = el("input",{id:"ad-cat",value:a?a.catatan||"":"",maxlength:"150",placeholder:"mis. pagar hijau, depan masjid"});
  const status = el("p",{class:"small",text:pt?"Titik peta dipilih.":"Ketuk peta untuk menandai titik, atau pakai lokasi Anda saat ini."});
  const mapBox = el("div",{class:"map",id:"ad-map"});
  const gps = el("button",{type:"button",class:"btn ghost sm"}, ico("target"), "Pakai lokasi saya");
  const cari = el("button",{type:"button",class:"btn ghost sm"}, ico("search"), "Cari di peta");
  const sug = el("div",{class:"geo-sug",hidden:true}), hint = el("div",{class:"geo-hint",hidden:true});
  let dirty = !!(a && a.alamat), reqId = 0;                       // dirty = alamat sudah diketik/diedit orang, jangan ditimpa diam-diam
  alamat.addEventListener("input",()=>{ dirty = alamat.value.trim()!==""; hint.hidden = true; });
  const utama = switchEl("ad-utama", a?a.utama:!U.addresses.length, "Jadikan lokasi utama");
  const msg = el("div",{class:"msg err",hidden:true});
  const dlg = openDialog({title:a?"Ubah lokasi":"Tambah lokasi", body:el("div",{style:"display:grid;gap:14px"}, field("Nama lokasi",label), dl, field("Alamat",alamat), el("div",{class:"row between"}, el("span",{class:"small",text:"Ketik nama jalan lalu tekan Enter, atau ketuk peta."}), cari), sug, hint, field("Patokan (opsional)",cat), el("div",{class:"row between"}, el("b",{text:"Titik di peta"}), gps), mapBox, status, utama, msg),
    actions:[{label:"Batal",cls:"ghost",onClick:c=>c()},{label:"Simpan lokasi",onClick:async close=>{
      note(msg,"");
      if(!alamat.value.trim()){ note(msg,"Alamat belum diisi."); return; }
      if(!await confirmAddress(alamat.value.trim(), cat.value.trim(), pt)) return;
      const body = {label:label.value, alamat:alamat.value, catatan:cat.value, lat:pt?pt.lat:null, lng:pt?pt.lng:null, utama:utama.querySelector("input").checked};
      try{ a ? await api("PATCH","/api/my/addresses/"+a.id,body) : await api("POST","/api/my/addresses",body); toast("Lokasi tersimpan."); close(); await loadAddresses(); if(U.view==="lokasi") renderAddresses(); }catch(x){ note(msg,x.message); } }}]});
  if(!window.L){ mapBox.replaceChildren(el("div",{class:"empty",text:"Peta belum bisa dimuat (perlu internet). Alamat tetap bisa disimpan tanpa titik."})); gps.hidden = cari.hidden = true; return; }
  const c0 = pt || {lat:parseFloat(U.cfg.peta_lat)||-5.1477, lng:parseFloat(U.cfg.peta_lng)||119.4327};
  const map = L.map(mapBox,{scrollWheelZoom:false}).setView([c0.lat,c0.lng], pt?17:13); let mk = null;
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(map);
  const place = (lat,lng,fly,fill)=>{ pt = {lat:+lat.toFixed(6), lng:+lng.toFixed(6)};
    if(!mk){ mk = L.marker([lat,lng],{draggable:true}).addTo(map); mk.on("dragend",()=>{ const p = mk.getLatLng(); place(p.lat,p.lng,false,true); }); } else mk.setLatLng([lat,lng]);
    status.textContent = `Titik dipilih: ${pt.lat}, ${pt.lng}. Geser pin untuk menyesuaikan.`; if(fly) map.setView([lat,lng],17); if(fill) fillFromPoint(); };
  const fillFromPoint = async ()=>{ const my = ++reqId; hint.hidden = true;
    try{ const r = await api("GET",`/api/geo/balik?lat=${pt.lat}&lng=${pt.lng}`); if(my!==reqId || !r.alamat) return;
      if(!dirty){ alamat.value = r.alamat; }                       // kolom kosong atau hasil otomatis sebelumnya: isi langsung
      else if(r.alamat!==alamat.value){ hint.replaceChildren(el("span",{text:"Alamat di titik ini: "+r.alamat+" "}), el("button",{type:"button",class:"btn ghost sm",text:"Pakai alamat ini",onclick:()=>{ alamat.value = r.alamat; dirty = false; hint.hidden = true; }})); hint.hidden = false; }
    }catch(x){ if(my===reqId) status.textContent += " (Alamat tidak bisa diisi otomatis: "+x.message+")"; } };
  const cariAlamat = async ()=>{ const q = alamat.value.trim(); sug.hidden = true; hint.hidden = true;
    if(q.length<4){ toast("Ketik minimal 4 huruf alamat dulu.","bad"); return; }
    cari.disabled = true; status.textContent = "Mencari alamat…";
    try{ const rs = await api("GET","/api/geo/cari?q="+encodeURIComponent(q));
      if(!rs.length){ status.textContent = "Alamat tidak ditemukan. Coba tulis nama jalan dan kota, atau ketuk peta."; }
      else if(rs.length===1){ place(rs[0].lat,rs[0].lng,true,false); status.textContent = "Titik ditemukan: "+rs[0].alamat+". Geser pin jika kurang tepat."; }
      else { status.textContent = "Ada beberapa hasil, pilih yang sesuai:";
        sug.replaceChildren(...rs.map(r=>el("button",{type:"button",class:"geo-item",text:r.alamat,onclick:()=>{ place(r.lat,r.lng,true,false); sug.hidden = true; status.textContent = "Titik dipilih: "+r.alamat+". Geser pin jika kurang tepat."; }}))); sug.hidden = false; }
    }catch(x){ status.textContent = x.message; } cari.disabled = false; };
  cari.onclick = cariAlamat;
  alamat.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); cariAlamat(); } });
  if(pt) place(pt.lat,pt.lng,false);
  map.on("click",e=>place(e.latlng.lat,e.latlng.lng,false,true));
  gps.onclick = ()=>{ if(!navigator.geolocation){ toast("Browser ini tidak mendukung lokasi.","bad"); return; }
    navigator.geolocation.getCurrentPosition(p=>place(p.coords.latitude,p.coords.longitude,true,true), ()=>toast("Lokasi tidak terbaca. Izinkan akses lokasi di browser, atau ketuk peta.","bad"), {enableHighAccuracy:true,timeout:12000}); };
  setTimeout(()=>map.invalidateSize(),120); dlg.el.addEventListener("close",()=>map.remove());
}

/* ---------- profil ---------- */
const BULAN_PANJANG = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const utcDate = s => { const d = new Date((s||"").replace(" ","T")+"Z"); return isNaN(d) ? null : d; };
async function viewProfil(c){
  const [prof, sum] = await Promise.all([api("GET","/api/my/profile"), api("GET","/api/my/summary").catch(()=>null)]);
  const since = utcDate(prof.created_at), last = utcDate(prof.last_login);
  const head = el("section",{class:"profile-head"},
    el("div",{class:"avatar xl","aria-hidden":"true",text:initial(U.me.nama)}),
    el("div",{class:"who-info"}, el("h2",{text:U.me.nama}), el("p",{class:"small",text:"+"+U.me.wa}),
      el("div",{class:"tags"}, since ? el("span",{class:"tag",text:"Anggota sejak "+BULAN_PANJANG[since.getMonth()]+" "+since.getFullYear()}) : null, last ? el("span",{class:"tag",text:"Login terakhir "+utcLocal(prof.last_login)}) : null)),
    sum ? el("dl",{class:"mini-stats"}, el("div",{}, el("dt",{text:"Pesanan"}), el("dd",{text:sum.total})), el("div",{}, el("dt",{text:"Selesai"}), el("dd",{text:sum.selesai})), el("div",{}, el("dt",{text:"Total biaya"}), el("dd",{text:rp(sum.belanja)}))) : null);

  const nama = el("input",{id:"pr-nama",value:U.me.nama,maxlength:"80",autocomplete:"name"}), wa = el("input",{id:"pr-wa",type:"tel",value:"0"+U.me.wa.slice(2),autocomplete:"tel"});
  const m1 = el("div",{class:"msg err",hidden:true}), b1 = el("button",{class:"btn",type:"submit",text:"Simpan perubahan"});
  const f1 = el("form",{class:"card form",novalidate:true}, el("div",{}, el("h3",{text:"Data diri"}), el("p",{class:"small",text:"Nama dan nomor yang dipakai admin dan mitra untuk menghubungi Anda."})),
    field("Nama lengkap",nama), field("Nomor WhatsApp",wa,"Dipakai untuk masuk. Mengganti nomor tidak memutus sesi ini."), m1, el("div",{class:"form-foot"}, b1));
  f1.onsubmit = async e=>{ e.preventDefault(); note(m1,""); b1.disabled = true;
    try{ const r = await api("PATCH","/api/my/profile",{nama:nama.value,wa:wa.value}); U.me.nama = r.nama; U.me.wa = r.wa; paintMe(); head.querySelector(".avatar").textContent = initial(r.nama); head.querySelector("h2").textContent = r.nama; head.querySelector(".who-info .small").textContent = "+"+r.wa; toast("Profil diperbarui."); }catch(x){ note(m1,x.message); } b1.disabled = false; };

  const lama = el("input",{id:"pw-lama",type:"password",autocomplete:"current-password"}), baru = el("input",{id:"pw-baru",type:"password",autocomplete:"new-password",minlength:"8"}), ulang = el("input",{id:"pw-ulang",type:"password",autocomplete:"new-password"});
  const m2 = el("div",{class:"msg err",hidden:true}), b2 = el("button",{class:"btn",type:"submit",text:"Ganti password"});
  const f2 = el("form",{class:"card form",novalidate:true}, el("div",{}, el("h3",{text:"Password"}), el("p",{class:"small",text:"Gunakan minimal 8 karakter. Perangkat lain akan otomatis keluar setelah password diganti."})),
    field("Password saat ini",lama), el("div",{class:"row2"}, field("Password baru",baru), field("Ulangi password baru",ulang)), m2, el("div",{class:"form-foot"}, b2));
  f2.onsubmit = async e=>{ e.preventDefault(); note(m2,""); if(baru.value!==ulang.value){ note(m2,"Password baru dan pengulangannya berbeda."); return; } b2.disabled = true;
    try{ await api("POST","/api/my/password",{lama:lama.value,baru:baru.value}); f2.reset(); toast("Password diganti."); }catch(x){ note(m2,x.message); } b2.disabled = false; };

  const f3 = el("section",{class:"card form"}, el("div",{}, el("h3",{text:"Sesi dan data"}), el("p",{class:"small",text:"Kendalikan akses ke akun Anda dan simpan salinan riwayat."})),
    el("div",{class:"setting-row"}, el("div",{}, el("b",{text:"Keluar dari perangkat lain"}), el("p",{class:"small",text:"Berguna jika Anda masuk di perangkat bersama atau perangkat yang hilang."})),
      el("button",{class:"btn ghost sm",type:"button",onclick:async()=>{ if(!await confirmDialog("Keluar dari perangkat lain?","Semua perangkat lain harus masuk lagi. Perangkat ini tetap masuk.","Ya, keluarkan")) return;
        try{ await api("POST","/api/my/logout-all",{}); toast("Perangkat lain sudah keluar."); }catch(x){ toast(x.message,"bad"); } }}, ico("logout"), "Keluarkan")),
    el("div",{class:"setting-row"}, el("div",{}, el("b",{text:"Unduh riwayat pesanan"}), el("p",{class:"small",text:"Semua pesanan Anda dalam format CSV, bisa dibuka di Excel."})),
      el("a",{class:"btn ghost sm",href:"/api/my/orders.csv"}, ico("download"), "Unduh CSV")));

  c.replaceChildren(el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Profil"}), el("p",{text:"Kelola data diri, keamanan, dan sesi akun Anda."}))), head, el("div",{class:"grid2 align-start"}, f1, f2), f3);
}

function paintMe(){ $("whoName").textContent = U.me.nama; $("whoWa").textContent = "+"+U.me.wa; $("avatar").textContent = initial(U.me.nama); }
(async function(){
  buildNav(); setupShell();
  try{ U.me = (await api("GET","/api/me")).user; }catch(e){}
  if(!U.me){ location.href="/masuk?next=/akun"; return; }
  if(U.me.role==="admin"){ location.href="/admin"; return; }
  paintMe();
  if(U.me.mitra) $("nav").append(el("a",{href:"/mitra",class:"nav-ext"}, ico("team"), el("span",{text:"Halaman mitra"})));
  try{ const [cfg, svcs] = await Promise.all([api("GET","/api/config"), api("GET","/api/services")]); U.cfg = cfg; U.services = svcs; }catch(e){}
  route();
})();
