/* Kaban: halaman publik (peta mitra, form pesanan, form pendaftaran mitra). */
(function(){
  // Nomor WhatsApp admin diatur di templates/index.html (window.KABAN.waNumber)
  var WA_NUMBER = (window.KABAN && window.KABAN.waNumber) || "";
  var KOTA = (window.KABAN && window.KABAN.kota) || "";

  // Daftar layanan dibaca dari database (diatur admin). "lain" tidak muncul di peta karena bukan layanan mitra.
  var PALETTE = ["#E4572E","#2F80ED","#2E9E5B","#9B51E0","#D98E04","#0E9AA7","#C2185B","#6D4C41"];
  var SERVICES = [];
  (window.KABAN.services || []).forEach(function(kode, i){
    if(kode !== "lain") SERVICES.push({id:kode, nama:window.KABAN.names[i], warna:PALETTE[SERVICES.length % PALETTE.length]});
  });
  var svcById = {}; SERVICES.forEach(function(s){svcById[s.id]=s});

  // Titik contoh, bukan mitra sungguhan.
  var MITRA = [
    {n:"Mitra contoh A", x:90,  y:75,  k:"Kelurahan Utara",  s:["anak","antar"],  v:"Sepeda motor", jam:"05.30 – 18.00"},
    {n:"Mitra contoh B", x:235, y:80,  k:"Kelurahan Pasar",   s:["titip","antar"], v:"Sepeda motor", jam:"07.00 – 20.00"},
    {n:"Mitra contoh C", x:390, y:70,  k:"Kelurahan Taman",   s:["taman","tandon"],v:"Pikap kecil",  jam:"08.00 – 16.00"},
    {n:"Mitra contoh D", x:545, y:80,  k:"Kelurahan Timur",   s:["anak"],          v:"Mobil",        jam:"06.00 – 17.00"},
    {n:"Mitra contoh E", x:85,  y:190, k:"Kelurahan Barat",   s:["tandon","taman"],v:"Sepeda motor", jam:"08.00 – 17.00"},
    {n:"Mitra contoh F", x:300, y:190, k:"Kelurahan Pusat",   s:["titip","anak","antar"], v:"Sepeda motor", jam:"06.00 – 21.00"},
    {n:"Mitra contoh G", x:400, y:195, k:"Kelurahan Tengah",  s:["antar","titip"], v:"Sepeda motor", jam:"09.00 – 21.00"},
    {n:"Mitra contoh H", x:545, y:190, k:"Kelurahan Selatan", s:["taman"],         v:"Sepeda motor", jam:"07.00 – 15.00"},
    {n:"Mitra contoh I", x:235, y:285, k:"Kelurahan Pesisir", s:["tandon"],        v:"Sepeda motor", jam:"08.00 – 16.00"}
  ];

  // Titik contoh hanya memakai layanan yang masih ada; titik tanpa layanan dibuang.
  MITRA = MITRA.map(function(m){m.s = m.s.filter(function(k){return svcById[k]}); return m}).filter(function(m){return m.s.length});

  var NS="http://www.w3.org/2000/svg";
  var filter="semua", selected=null;
  var $=function(id){return document.getElementById(id)};

  function pinColor(m){return svcById[m.s[0]].warna}

  function renderFilters(){
    var box=$("filters"); box.innerHTML="";
    [{id:"semua",nama:"Semua layanan"}].concat(SERVICES).forEach(function(s){
      var b=document.createElement("button"); b.type="button"; b.className="f"; b.textContent=s.nama;
      b.setAttribute("aria-pressed", String(filter===s.id));
      b.onclick=function(){filter=s.id; selected=null; renderFilters(); renderPins(); renderDetail()};
      box.appendChild(b);
    });
  }
  function renderLegend(){
    $("legend").innerHTML=SERVICES.map(function(s){return '<span><i style="background:'+s.warna+'"></i>'+s.nama+'</span>'}).join("");
  }
  function visible(m){return filter==="semua"||m.s.indexOf(filter)>-1}
  function renderPins(){
    var g=$("pins"); g.innerHTML="";
    MITRA.forEach(function(m,i){
      if(!visible(m)) return;
      var el=document.createElementNS(NS,"g");
      el.setAttribute("class","pin"); el.setAttribute("tabindex","0"); el.setAttribute("role","button");
      el.setAttribute("aria-label",m.n+", "+m.k);
      var c=pinColor(m), on=selected===i;
      el.innerHTML='<circle class="ring" cx="'+m.x+'" cy="'+m.y+'" r="'+(on?20:15)+'" fill="'+c+'" fill-opacity=".22" stroke="'+(on?'var(--ink)':'none')+'" stroke-width="2"/>'+
        '<circle cx="'+m.x+'" cy="'+m.y+'" r="8" fill="'+c+'" stroke="#fff" stroke-width="2.5"/>';
      var pick=function(){selected=i; renderPins(); renderDetail()};
      el.addEventListener("click",pick);
      el.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();pick()}});
      g.appendChild(el);
    });
  }
  function renderDetail(){
    var d=$("detail"), n=MITRA.filter(visible).length;
    if(selected===null){
      d.innerHTML='<h3>'+n+' mitra contoh'+(filter==="semua"?'':' untuk '+svcById[filter].nama.toLowerCase())+'</h3>'+
        '<p style="color:var(--muted)">Pilih satu titik di peta untuk melihat layanan, kendaraan, dan jam kerjanya. Titik ini ilustrasi; area dan mitra asli menyusul setelah perekrutan.</p>'+
        '<a class="btn btn-brand" href="#pesan">Titip pekerjaan di area saya</a>';
      return;
    }
    var m=MITRA[selected];
    d.innerHTML='<h3>'+m.n+'</h3><dl><dt>Area</dt><dd>'+m.k+'</dd><dt>Layanan</dt><dd>'+m.s.map(function(x){return svcById[x].nama}).join(", ")+'</dd><dt>Kendaraan</dt><dd>'+m.v+'</dd><dt>Jam kerja</dt><dd>'+m.jam+'</dd></dl>'+
      '<p class="small">Data contoh untuk menunjukkan tampilan peta.</p>'+
      '<a class="btn btn-brand" href="#pesan">Titip di area ini</a>';
  }

  // tanggal minimal hari ini
  try{var t=new Date();var iso=t.getFullYear()+"-"+String(t.getMonth()+1).padStart(2,"0")+"-"+String(t.getDate()).padStart(2,"0");$("p-tgl").min=iso}catch(e){}

  function ok(outId,judul,isi,waText){
    var out=$(outId);
    out.innerHTML='<div class="result" role="status"><b></b><p></p><div class="acts"></div></div>';
    out.querySelector("b").textContent=judul;
    out.querySelector("p").textContent=isi;
    if(waText!==undefined){
      var a=document.createElement("a");a.className="btn btn-brand";a.target="_blank";a.rel="noopener";
      a.textContent="Kabari kami lewat WhatsApp";
      a.href="https://wa.me/"+WA_NUMBER+"?text="+encodeURIComponent(waText);
      out.querySelector(".acts").appendChild(a);
    }
    out.scrollIntoView({block:"nearest",behavior:"smooth"});
  }
  function fail(id,msg){var e=$(id);e.textContent=msg;e.hidden=!msg}
  function post(url,body){
    return fetch(url,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-Requested-With":"kaban"},body:JSON.stringify(body)})
      .then(function(r){return r.json().catch(function(){return {}}).then(function(d){if(!r.ok)throw new Error(d.error||"Terjadi kesalahan, coba lagi.");return d})},
            function(){throw new Error("Tidak bisa terhubung ke server. Periksa koneksi Anda.")});
  }


  $("formPesan").addEventListener("submit",function(e){
    e.preventDefault();
    var btn=e.target.querySelector("button[type=submit]");btn.disabled=true;fail("p-err","");
    post("/api/orders",{service:$("p-svc").value,nama:$("p-nama").value,wa:$("p-wa").value,alamat:$("p-alamat").value,tanggal:$("p-tgl").value,jam:$("p-jam").value,detail:$("p-cat").value})
      .then(function(d){
        ok("p-out","Pesanan diterima. Kode: "+d.kode,
           d.login?"Pantau statusnya di halaman akun Anda. Admin akan menghubungi lewat WhatsApp untuk konfirmasi dan harga."
                  :"Admin akan menghubungi Anda lewat WhatsApp untuk konfirmasi dan harga. Buat akun dengan nomor yang sama di halaman Masuk untuk memantau pesanan ini.",
           "Halo Kaban, saya baru membuat pesanan "+d.kode+".");
        e.target.reset();
      }).catch(function(x){fail("p-err",x.message)}).then(function(){btn.disabled=false});
  });
  $("formMitra").addEventListener("submit",function(e){
    e.preventDefault();
    var btn=e.target.querySelector("button[type=submit]");btn.disabled=true;fail("m-err","");
    var layanan=Array.prototype.map.call(document.querySelectorAll('input[name="msvc"]:checked'),function(x){return x.value});
    post("/api/mitra-applications",{nama:$("m-nama").value,wa:$("m-wa").value,kelurahan:$("m-kel").value,layanan:layanan,kendaraan:$("m-kend").value,catatan:$("m-cat").value})
      .then(function(){
        ok("m-out","Pendaftaran diterima","Tim Kaban akan memeriksa data Anda dan menghubungi lewat WhatsApp.");
        e.target.reset();
      }).catch(function(x){fail("m-err",x.message)}).then(function(){btn.disabled=false});
  });
  // tombol Masuk berubah jadi Akun saya bila sudah login
  fetch("/api/me",{credentials:"same-origin"}).then(function(r){return r.json()}).then(function(d){
    if(d.user){var a=$("navAkun");a.textContent=d.user.role==="admin"?"Admin":"Akun saya";a.href=d.user.role==="admin"?"/admin":"/akun";
      if($("p-nama")&&!$("p-nama").value){$("p-nama").value=d.user.nama;$("p-wa").value="0"+d.user.wa.slice(2)}}
  }).catch(function(){});

  renderFilters(); renderLegend(); renderPins(); renderDetail();
})();
