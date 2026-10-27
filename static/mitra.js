/* Halaman mitra: ringkasan, tugas (masuk dan berjalan), riwayat dan pendapatan, profil. */
const $ = id => document.getElementById(id);
const M = {me:null, cfg:{}, sum:null, tab:"masuk", bulan:null, masukSeen:null};
const NAV = [["ringkasan","Ringkasan","dash"],["tugas","Tugas","list"],["riwayat","Pendapatan","wallet"],["profil","Profil","user"]];
const TITLES = {ringkasan:"Ringkasan", tugas:"Tugas", riwayat:"Pendapatan", profil:"Profil"};
const VIEWS = {ringkasan:viewRingkasan, tugas:viewTugas, riwayat:viewRiwayat, profil:viewProfil};

function buildNav(){
  $("nav").replaceChildren(...NAV.map(([id,label,ic])=>el("a",{href:"#"+id,"data-v":id}, ico(ic), el("span",{text:label}), el("span",{class:"count",id:"cnt-"+id,hidden:true}))));
  $("menuBtn").append(ico("menu")); $("logout").append(ico("logout"),"Keluar"); $("siteLink").append(ico("home"),"Beranda"); $("custLink").append(ico("user"),"Akun pelanggan");
}
const setCount = (id,n)=>{ const c = $("cnt-"+id); if(c){ c.textContent = n; c.hidden = !n; } };
$("logout").onclick = async()=>{ await api("POST","/api/logout",{}); location.href="/"; };

function route(){
  const id = (location.hash||"#ringkasan").slice(1), v = VIEWS[id] ? id : "ringkasan";
  document.querySelectorAll("#nav a").forEach(a=>{ if(a.dataset.v===v) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current"); });
  $("pageTitle").textContent = TITLES[v];
  $("view").replaceChildren(el("div",{class:"skel"}));
  Promise.resolve(VIEWS[v]($("view"))).catch(e=>{
    if(e.status===401){ location.href="/masuk?next=/mitra"; return; }
    if(e.status===403){ location.href="/akun"; return; }
    $("view").replaceChildren(el("div",{class:"msg err",text:e.message})); });
  window.scrollTo(0,0);
}
window.addEventListener("hashchange", route);

const greeting = ()=>{ const h = new Date().getHours(); return h<11 ? "Selamat pagi" : h<15 ? "Selamat siang" : h<18 ? "Selamat sore" : "Selamat malam"; };
const stars = n => el("span",{class:"stars",role:"img","aria-label":n+" dari 5 bintang"}, "★".repeat(n)+"☆".repeat(5-n));
const waAdmin = () => M.cfg.wa_admin ? "https://wa.me/"+M.cfg.wa_admin : null;
const tile = (lbl,v,sub,ic,go,alert)=>el(go?"button":"div",{class:"tile"+(alert?" alert":""),type:go?"button":null,onclick:go||null}, el("span",{class:"lbl"},ico(ic),lbl), el("b",{text:v}), el("span",{class:"sub",text:sub}));
const panel = (title,sub,...kids)=>el("section",{class:"panel"}, el("div",{class:"panel-head"}, el("h3",{text:title}), sub ? el("span",{class:"sub",text:sub}) : null), el("div",{class:"panel-body"}, ...kids));
const rpShort = n => n>=1e6 ? "Rp "+(n/1e6).toLocaleString("id-ID",{maximumFractionDigits:1})+" jt" : rp(n);
const BULAN_PANJANG = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

/* jadwal: "Hari ini", "Besok", "Terlambat" dari string jadwal waktu setempat */
function dayTag(j, status){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(j||""); if(!m) return null;
  const d = new Date(+m[1], +m[2]-1, +m[3]), t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((d-t)/864e5);
  if(diff<0 && status!=="dikerjakan") return ["Terlambat","late"]; if(diff===0) return ["Hari ini","today"]; if(diff===1) return ["Besok","soon"]; return null;
}

/* ---------- kartu tugas ---------- */
const isOffer = o => o.respon!=="diterima" && o.status!=="dikerjakan";
const MITRA_CHIP = o => isOffer(o) ? el("span",{class:"chip offer",text:"Menunggu respons"}) : chip(o.status);

function releaseDialog(o, done){
  const why = el("select",{id:"rl-why"}, ["Jadwal bentrok","Lokasi terlalu jauh","Sedang kurang sehat","Bukan layanan yang saya tangani","Alasan lain"].map(t=>el("option",{value:t,text:t})));
  const more = el("input",{id:"rl-more",maxlength:"100",placeholder:"Keterangan tambahan (opsional)"}), msg = el("div",{class:"msg err",hidden:true});
  openDialog({title:"Lepas tugas "+o.kode+"?", body:el("div",{style:"display:grid;gap:14px"},
      el("p",{class:"small",text:"Tugas dikembalikan ke admin untuk dicarikan mitra lain. Alasan Anda dicatat agar admin tahu."}), field("Alasan",why), field("Keterangan",more), msg),
    actions:[{label:"Batal",cls:"ghost",onClick:c=>c()},{label:"Ya, lepas tugas",cls:"bad",onClick:async close=>{
      try{ await api("POST","/api/mitra/tugas/"+o.id+"/tolak",{alasan:why.value+(more.value.trim()?" - "+more.value.trim():"")}); close(); toast("Tugas dilepas."); done(); }catch(x){ note(msg,x.message); } }}]});
}
function finishDialog(o, done){
  const cat = el("textarea",{id:"fn-cat",maxlength:"200",placeholder:"mis. Anak sudah diserahkan ke guru piket, atau tandon bersih dan terisi penuh"}), msg = el("div",{class:"msg err",hidden:true});
  openDialog({title:"Selesaikan tugas?", body:el("div",{style:"display:grid;gap:14px"},
      el("div",{class:"loc-line"}, el("span",{class:"svc-ico sm"}, ico("check")), el("div",{}, el("b",{text:o.layanan+" · "+o.kode}), el("p",{class:"small",text:"Penghasilan Anda "+rp(o.penghasilan)}))),
      field("Catatan hasil (opsional, terlihat oleh pelanggan)",cat), msg),
    actions:[{label:"Belum",cls:"ghost",onClick:c=>c()},{label:"Ya, tugas selesai",onClick:async close=>{
      try{ await api("POST","/api/mitra/tugas/"+o.id+"/selesai",{catatan:cat.value}); close(); toast("Tugas selesai. Terima kasih!"); done(); }catch(x){ note(msg,x.message); } }}]});
}
async function act(o, path, okMsg, done){
  try{ await api("POST","/api/mitra/tugas/"+o.id+"/"+path,{}); toast(okMsg); done(); }catch(x){ toast(x.message,"bad"); }
}

function jobCard(o, done){
  const ic = (M.cfg.icons||{})[o.ikon], offer = isOffer(o), tag = dayTag(o.jadwal, o.status);
  const wa = o.wa ? "https://wa.me/"+o.wa+"?text="+encodeURIComponent("Halo "+o.nama+", saya mitra Kaban untuk pesanan "+o.kode+" ("+o.layanan+").") : null;
  const link = (href,icn,text,ext)=>el("a",{class:"btn ghost sm",href,target:ext?"_blank":null,rel:ext?"noopener":null}, ico(icn), text);
  const actions = el("div",{class:"row"},
    offer ? el("button",{class:"btn",onclick:async()=>{ if(await confirmDialog("Terima tugas ini?", o.layanan+" · "+fmtJadwal(o.jadwal)+". Setelah diterima, Anda bisa melihat kontak pelanggan.","Ya, saya terima",false)) act(o,"terima","Tugas diterima. Nomor pelanggan sudah terbuka.",done); }}, ico("check"), "Terima tugas")
    : o.status==="dikonfirmasi" ? el("button",{class:"btn accent",onclick:()=>act(o,"mulai","Selamat bekerja!",done)}, ico("refresh"), "Mulai mengerjakan")
    : el("button",{class:"btn",disabled:o.harga==null,title:o.harga==null?"Admin perlu menetapkan harga dulu":null,onclick:()=>finishDialog(o,done)}, ico("check"), "Selesaikan tugas"),
    wa ? link(wa,"phone","WhatsApp pelanggan",true) : null,
    link(mapsUrl(o.lat,o.lng,o.alamat),"pin","Buka peta",true),
    o.status!=="dikerjakan" ? el("button",{class:"btn ghost sm bad-text",onclick:()=>releaseDialog(o,done)}, ico("close"), "Lepas tugas") : null);
  return el("article",{class:"order-card job"+(offer?" offer":"")},
    el("header",{}, el("span",{class:"svc-ico"}, ic ? svcIcon(ic) : ico("orders")), el("div",{class:"grow"}, el("h3",{text:o.layanan}), el("span",{class:"sub",text:o.kode+" · "+o.nama})), MITRA_CHIP(o)),
    offer ? el("div",{class:"offer-note"}, ico("bell"), el("span",{text:"Tugas baru dari admin. Terima jika Anda sanggup di jadwal ini, atau lepas supaya dicarikan mitra lain."})) : null,
    el("dl",{class:"meta2"},
      el("div",{}, el("dt",{text:"Jadwal"}), el("dd",{}, fmtJadwal(o.jadwal), tag ? el("span",{class:"daytag "+tag[1],text:tag[0]}) : null)),
      el("div",{}, el("dt",{text:"Penghasilan Anda"}), el("dd",{}, o.penghasilan!=null ? el("span",{class:"price",text:rp(o.penghasilan)}) : el("span",{class:"muted",text:"Menunggu harga dari admin"}))),
      el("div",{class:"wide"}, el("dt",{text:"Lokasi"}), el("dd",{text:o.alamat})),
      o.detail ? el("div",{class:"wide"}, el("dt",{text:"Detail pekerjaan"}), el("dd",{text:o.detail})) : null,
      !offer ? el("div",{}, el("dt",{text:"Pelanggan"}), el("dd",{text:o.nama+(o.wa ? " · 0"+o.wa.slice(2) : "")})) : null),
    o.events && o.events.length>1 ? el("details",{class:"data"}, el("summary",{text:"Riwayat status ("+o.events.length+")"}), el("ul",{class:"tl"}, o.events.map(v=>el("li",{}, el("b",{text:STATUS_LABEL[v.status]||v.status}), " · "+utcLocal(v.created_at)+(v.catatan?" · "+v.catatan:""))))) : null,
    o.status==="dikerjakan" && o.harga==null ? el("p",{class:"small hint-warn"}, "Harga belum ditetapkan. Hubungi admin agar tugas ini bisa diselesaikan.") : null,
    actions);
}

/* ---------- ringkasan ---------- */
async function viewRingkasan(c){
  const s = M.sum = await api("GET","/api/mitra/ringkasan"); setCount("tugas", s.masuk); syncAvail(s.tersedia);
  const first = s.nama.split(" ")[0];
  const chart = timeChart(s.harian.map(h=>{ const d = new Date(h.tanggal+"T00:00"); return {label:d.getDate()+" "+BULAN_SHORT(d), value:h.pendapatan, tip:h.tugas+" tugas selesai"}; }),
    {kind:"bar", fmt:v=>rp(v), unit:"Penghasilan", aria:"Penghasilan per hari, 14 hari terakhir"});
  const side = [
    panel("Ulasan pelanggan", s.rating_n ? s.rating_n+" penilaian" : null, s.ulasan.length
      ? el("ul",{class:"feed"}, s.ulasan.map(u=>el("li",{}, el("div",{}, stars(u.rating), el("p",{class:"small",text:"“"+u.ulasan+"”"}), el("small",{text:u.layanan+" · "+u.kode})))))
      : el("p",{class:"small",text:s.rating_n ? "Belum ada ulasan tertulis." : "Penilaian akan tampil di sini setelah pelanggan menilai pekerjaan Anda."})),
    panel("Sejak bergabung", null, el("dl",{class:"kv"},
      el("div",{}, el("dt",{text:"Tugas selesai"}), el("dd",{text:s.selesai_total})), el("div",{}, el("dt",{text:"Total penghasilan"}), el("dd",{text:rp(s.pendapatan_total)})))),
    panel("Butuh bantuan?", null, el("p",{class:"small",text:"Ada kendala di lapangan, harga belum diisi, atau pelanggan sulit dihubungi? Sebutkan kode tugasnya."}),
      waAdmin() ? el("a",{class:"btn ghost",style:"margin-top:12px",href:waAdmin(),target:"_blank",rel:"noopener"}, ico("phone"), "Chat admin di WhatsApp") : el("p",{class:"small",text:"Kontak admin akan tampil di sini setelah diatur."}))];
  c.replaceChildren(
    el("div",{class:"hero-card"}, el("div",{}, el("h2",{text:greeting()+", "+first+"."}),
        el("p",{text: s.masuk ? "Ada "+s.masuk+" tugas baru menunggu jawaban Anda." : s.aktif ? s.aktif+" tugas sedang Anda tangani"+(s.hari_ini ? ", "+s.hari_ini+" di antaranya hari ini." : ".") : s.tersedia ? "Belum ada tugas baru. Anda tersedia untuk menerima tugas." : "Status Anda libur, admin tidak akan mengirim tugas baru."})),
      el("div",{class:"row"}, s.masuk ? el("a",{class:"btn accent",href:"#tugas"}, ico("bell"), "Lihat tugas masuk") : el("a",{class:"btn ghost",href:"#tugas"}, ico("list"), "Lihat tugas"))),
    el("div",{class:"tiles"},
      tile("Tugas masuk", s.masuk, s.masuk ? "menunggu jawaban Anda" : "tidak ada yang menunggu", "bell", ()=>{ M.tab="masuk"; location.hash="#tugas"; }, s.masuk>0),
      tile("Sedang ditangani", s.aktif, s.hari_ini ? s.hari_ini+" dijadwalkan hari ini" : "diterima atau dikerjakan", "refresh", ()=>{ M.tab="aktif"; location.hash="#tugas"; }),
      tile("Selesai bulan ini", s.selesai_bulan, BULAN_PANJANG[new Date().getMonth()], "check", ()=>location.hash="#riwayat"),
      tile("Penghasilan bulan ini", rpShort(s.pendapatan_bulan), s.bagi_hasil+"% dari harga pekerjaan", "wallet", ()=>location.hash="#riwayat"),
      tile("Rating", s.rating ? s.rating.toFixed(1)+" ★" : "-", s.rating_n ? "dari "+s.rating_n+" penilaian" : "belum ada penilaian", "tag")),
    el("div",{class:"dash-grid"},
      el("div",{class:"sec"},
        el("div",{class:"row between"}, el("h3",{text:"Tugas berikutnya"}), s.aktif>1 ? el("a",{href:"#tugas",class:"small",text:"Lihat semua ("+s.aktif+")"}) : null),
        s.berikutnya ? jobCard(s.berikutnya, route)
          : el("div",{class:"empty"}, el("b",{text:"Belum ada tugas yang sedang ditangani"}), el("p",{class:"small",text:"Tugas yang Anda terima akan muncul di sini lengkap dengan lokasi dan kontak pelanggan."})),
        panel("Penghasilan 14 hari terakhir", "Dihitung "+s.bagi_hasil+"% dari harga", chart)),
      el("div",{class:"side-col"}, ...side)));
}
const BULAN_SHORT = d => ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][d.getMonth()];

/* ---------- tugas ---------- */
async function viewTugas(c){
  const [s, list] = await Promise.all([api("GET","/api/mitra/ringkasan"), api("GET","/api/mitra/tugas?tab="+M.tab)]);
  M.sum = s; setCount("tugas", s.masuk); syncAvail(s.tersedia);
  const TABS = [["masuk","Masuk",s.masuk],["aktif","Berjalan",s.aktif]];
  const seg = el("div",{class:"seg",role:"group","aria-label":"Jenis tugas"}, TABS.map(([v,l,n])=>{
    const b = el("button",{type:"button","aria-pressed":String(M.tab===v)}, l, el("span",{class:"n",text:n})); b.onclick = ()=>{ M.tab = v; route(); }; return b; }));
  const empty = M.tab==="masuk"
    ? el("div",{class:"empty"}, el("b",{text:"Belum ada tugas masuk"}), el("p",{class:"small",text:s.tersedia ? "Admin akan menugaskan pekerjaan sesuai layanan dan wilayah Anda. Halaman ini diperbarui otomatis." : "Status Anda sedang libur. Aktifkan “Tersedia” di pojok atas agar admin bisa mengirim tugas."}))
    : el("div",{class:"empty"}, el("b",{text:"Tidak ada tugas berjalan"}), el("p",{class:"small",text:"Tugas yang sudah Anda terima akan tampil di sini sampai selesai."}), s.masuk ? el("button",{class:"btn",onclick:()=>{ M.tab="masuk"; route(); }},"Lihat tugas masuk") : null);
  c.replaceChildren(el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Tugas"}), el("p",{text:"Terima tugas baru, kerjakan, lalu tandai selesai. Nomor pelanggan terbuka setelah tugas diterima."}))),
    el("div",{class:"toolbar"}, seg), list.length ? el("div",{class:"stack"}, list.map(o=>jobCard(o, route))) : empty);
}

/* ---------- riwayat dan pendapatan ---------- */
async function viewRiwayat(c){
  const now = new Date(), cur = now.getFullYear()+"-"+String(now.getMonth()+1).padStart(2,"0"); M.bulan = M.bulan || cur;
  const r = await api("GET","/api/mitra/riwayat?bulan="+M.bulan);
  const [y,m] = r.bulan.split("-").map(Number);
  const pick = el("input",{type:"month",id:"rw-bulan",value:r.bulan,max:cur,"aria-label":"Pilih bulan"}); pick.onchange = ()=>{ if(pick.value){ M.bulan = pick.value; route(); } };
  const rows = r.items.map(j=>el("tr",{}, el("td",{text:fmtJadwal(j.selesai_lokal)}), el("td",{}, el("b",{text:j.kode})), el("td",{text:j.layanan}), el("td",{text:j.nama}),
    el("td",{class:"num",text:rp(j.harga)}), el("td",{class:"num"}, el("b",{text:rp(j.penghasilan)})), el("td",{}, j.rating ? stars(j.rating) : el("span",{class:"muted",text:"-"}))));
  c.replaceChildren(
    el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Pendapatan"}), el("p",{text:"Penghasilan Anda adalah "+r.bagi_hasil+"% dari harga setiap pekerjaan selesai."})),
      el("div",{class:"row"}, pick, el("a",{class:"btn ghost sm",href:"/api/mitra/riwayat.csv?bulan="+r.bulan}, ico("download"), "Unduh CSV"))),
    el("div",{class:"tiles"},
      tile("Penghasilan "+BULAN_PANJANG[m-1]+" "+y, rp(r.penghasilan), r.bagi_hasil+"% dari nilai pekerjaan", "wallet"),
      tile("Tugas selesai", r.selesai, "pada bulan ini", "check"),
      tile("Nilai pekerjaan", rp(r.kotor), "total harga dari pelanggan", "orders"),
      tile("Rata-rata per tugas", r.selesai ? rp(Math.round(r.penghasilan/r.selesai)) : "-", "penghasilan Anda", "chart")),
    r.items.length ? el("div",{class:"tablewrap"}, el("table",{class:"tbl"}, el("thead",{}, el("tr",{}, ["Selesai","Kode","Layanan","Pelanggan","Harga","Penghasilan","Rating"].map((h,i)=>el("th",{class:i===4||i===5?"num":"",text:h})))), el("tbody",{}, rows),
        el("tfoot",{}, el("tr",{}, el("td",{colspan:"4",text:"Total "+r.selesai+" tugas"}), el("td",{class:"num",text:rp(r.kotor)}), el("td",{class:"num"}, el("b",{text:rp(r.penghasilan)})), el("td",{})))))
      : el("div",{class:"empty"}, el("b",{text:"Belum ada tugas selesai di bulan ini"}), el("p",{class:"small",text:"Pilih bulan lain di atas, atau selesaikan tugas yang sedang berjalan."})));
}

/* ---------- profil ---------- */
const utcDate = s => { const d = new Date((s||"").replace(" ","T")+"Z"); return isNaN(d) ? null : d; };
async function viewProfil(c){
  const [p, s] = await Promise.all([api("GET","/api/mitra/profil"), api("GET","/api/mitra/ringkasan")]); syncAvail(p.tersedia);
  const since = utcDate(p.bergabung), last = utcDate(p.last_login);
  const head = el("section",{class:"profile-head"}, el("div",{class:"avatar xl","aria-hidden":"true",text:initial(p.nama)}),
    el("div",{class:"who-info"}, el("h2",{text:p.nama}), el("p",{class:"small",text:"+"+p.wa}),
      el("div",{class:"tags"}, el("span",{class:"tag ok",text:"Mitra aktif"}), el("span",{class:"tag",text:p.kelurahan}), p.kendaraan ? el("span",{class:"tag",text:p.kendaraan}) : null,
        since ? el("span",{class:"tag",text:"Bergabung "+BULAN_PANJANG[since.getMonth()]+" "+since.getFullYear()}) : null)),
    el("dl",{class:"mini-stats"}, el("div",{}, el("dt",{text:"Selesai"}), el("dd",{text:s.selesai_total})), el("div",{}, el("dt",{text:"Rating"}), el("dd",{text:s.rating ? s.rating.toFixed(1) : "-"})), el("div",{}, el("dt",{text:"Total"}), el("dd",{text:rpShort(s.pendapatan_total)}))));

  const nama = el("input",{id:"pf-nama",value:p.nama,maxlength:"80"}), kel = el("input",{id:"pf-kel",value:p.kelurahan,maxlength:"80"}),
        ken = el("input",{id:"pf-ken",value:p.kendaraan,maxlength:"40",placeholder:"mis. Motor, Mobil, Pickup"}), bio = el("textarea",{id:"pf-bio",maxlength:"300",placeholder:"Ceritakan singkat pengalaman Anda"}, p.bio);
  const m1 = el("div",{class:"msg err",hidden:true}), b1 = el("button",{class:"btn",type:"submit",text:"Simpan perubahan"});
  const f1 = el("form",{class:"card form",novalidate:true}, el("div",{}, el("h3",{text:"Data mitra"}), el("p",{class:"small",text:"Nomor WhatsApp dipakai untuk masuk dan hanya bisa diubah admin."})),
    el("div",{class:"row2"}, field("Nama",nama), field("Kelurahan / area utama",kel)), field("Kendaraan",ken), field("Tentang saya",bio), m1, el("div",{class:"form-foot"}, b1));
  f1.onsubmit = async e=>{ e.preventDefault(); note(m1,""); b1.disabled = true;
    try{ const r = await api("PATCH","/api/mitra/profil",{nama:nama.value,kelurahan:kel.value,kendaraan:ken.value,bio:bio.value}); head.querySelector("h2").textContent = r.nama; head.querySelector(".avatar").textContent = initial(r.nama); $("whoName").textContent = r.nama; toast("Profil diperbarui."); }
    catch(x){ note(m1,x.message); } b1.disabled = false; };

  const lay = el("section",{class:"card form"}, el("div",{}, el("h3",{text:"Layanan yang Anda tangani"}), el("p",{class:"small",text:"Diatur oleh admin. Hubungi admin untuk menambah atau mengurangi layanan."})),
    p.layanan.length ? el("div",{class:"tags"}, p.layanan.map(n=>el("span",{class:"tag",text:n}))) : el("p",{class:"small",text:"Belum ada layanan yang dipilih."}));

  const lama = el("input",{id:"pw-lama",type:"password",autocomplete:"current-password"}), baru = el("input",{id:"pw-baru",type:"password",autocomplete:"new-password",minlength:"8"}), ulang = el("input",{id:"pw-ulang",type:"password",autocomplete:"new-password"});
  const m2 = el("div",{class:"msg err",hidden:true}), b2 = el("button",{class:"btn",type:"submit",text:"Ganti password"});
  const f2 = el("form",{class:"card form",novalidate:true}, el("div",{}, el("h3",{text:"Password"}), el("p",{class:"small",text:"Ganti password sementara dari admin dengan yang hanya Anda ketahui. Minimal 8 karakter."})),
    field("Password saat ini",lama), el("div",{class:"row2"}, field("Password baru",baru), field("Ulangi password baru",ulang)), m2, el("div",{class:"form-foot"}, b2));
  f2.onsubmit = async e=>{ e.preventDefault(); note(m2,""); if(baru.value!==ulang.value){ note(m2,"Password baru dan pengulangannya berbeda."); return; } b2.disabled = true;
    try{ await api("POST","/api/my/password",{lama:lama.value,baru:baru.value}); f2.reset(); toast("Password diganti."); }catch(x){ note(m2,x.message); } b2.disabled = false; };

  const f3 = el("section",{class:"card form"}, el("div",{}, el("h3",{text:"Sesi"}), el("p",{class:"small",text:last ? "Login terakhir "+utcLocal(p.last_login)+"." : "Kendalikan akses ke akun Anda."})),
    el("div",{class:"setting-row"}, el("div",{}, el("b",{text:"Keluar dari perangkat lain"}), el("p",{class:"small",text:"Berguna jika Anda masuk di ponsel bersama atau perangkat yang hilang."})),
      el("button",{class:"btn ghost sm",type:"button",onclick:async()=>{ if(!await confirmDialog("Keluar dari perangkat lain?","Perangkat lain harus masuk lagi. Perangkat ini tetap masuk.","Ya, keluarkan")) return;
        try{ await api("POST","/api/my/logout-all",{}); toast("Perangkat lain sudah keluar."); }catch(x){ toast(x.message,"bad"); } }}, ico("logout"), "Keluarkan")));

  c.replaceChildren(el("div",{class:"page-head"}, el("div",{}, el("h2",{text:"Profil"}), el("p",{text:"Data mitra, keamanan, dan sesi akun Anda."}))), head, el("div",{class:"grid2 align-start"}, f1, el("div",{class:"stack"}, lay, f2)), f3);
}

/* ---------- ketersediaan (tombol di pojok atas) ---------- */
function syncAvail(v){ $("availToggle").checked = !!v; $("availText").textContent = v ? "Tersedia" : "Libur"; $("topAvail").classList.toggle("off", !v); }
$("availToggle").onchange = async ()=>{
  const v = $("availToggle").checked; syncAvail(v);
  try{ await api("PATCH","/api/mitra/profil",{tersedia:v}); toast(v ? "Anda tersedia menerima tugas." : "Status libur. Admin tidak akan mengirim tugas baru."); if(M.sum) M.sum.tersedia = v; }
  catch(x){ syncAvail(!v); toast(x.message,"bad"); } };

/* ---------- pembaruan otomatis tugas masuk ---------- */
async function poll(){
  if(document.hidden) return;
  try{ const s = await api("GET","/api/mitra/ringkasan"); setCount("tugas", s.masuk); syncAvail(s.tersedia);
    if(M.masukSeen!==null && s.masuk>M.masukSeen){ toast("Ada tugas baru untuk Anda."); if(!document.querySelector("dialog[open]") && ["ringkasan","tugas"].includes((location.hash||"#ringkasan").slice(1))) route(); }
    M.masukSeen = s.masuk; }catch(e){ if(e.status===401||e.status===403) location.href="/akun"; }
}
function paintMe(){ $("whoName").textContent = M.me.nama; $("whoWa").textContent = "+"+M.me.wa; $("avatar").textContent = initial(M.me.nama); }
(async function(){
  buildNav(); setupShell();
  try{ M.me = (await api("GET","/api/me")).user; }catch(e){}
  if(!M.me){ location.href="/masuk?next=/mitra"; return; }
  if(M.me.role==="admin"){ location.href="/admin"; return; }
  if(!M.me.mitra){ location.href="/akun"; return; }
  paintMe();
  try{ M.cfg = await api("GET","/api/config"); }catch(e){}
  route(); poll();
  setInterval(poll, 30000);
})();
