/* Grafik SVG sederhana untuk dasbor: batang dan area satu warna (warna merek), batang tipis, grid samar,
   tooltip saat hover, dan tabel data sebagai alternatif teks. Semua warna dari token tema. */
function svgEl(tag, attrs, ...kids){
  const e = document.createElementNS(NS_SVG, tag);
  for(const [k,v] of Object.entries(attrs||{})) e.setAttribute(k, v);
  kids.forEach(c=>c && e.append(c)); return e;
}
function niceScale(max){
  const raw = Math.max(max, 1) / 4, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1,2,5,10].find(m=>m*p >= raw) * p;
  return {step, max: step*4};
}
function compactNum(n){
  if(n >= 1e9) return (n/1e9).toFixed(1).replace(".",",").replace(",0","")+" M";
  if(n >= 1e6) return (n/1e6).toFixed(1).replace(".",",").replace(",0","")+" jt";
  if(n >= 1e3) return (n/1e3).toFixed(n%1e3?1:0).replace(".",",").replace(",0","")+" rb";
  return String(n);
}
/* items: [{label, tip, value}] ; opts: {kind:"bar"|"area", fmt(v)->teks tooltip, unit, aria} */
function timeChart(items, opts){
  const W=640, H=230, m={l:52,r:10,t:12,b:28}, iw=W-m.l-m.r, ih=H-m.t-m.b, n=items.length;
  const sc = niceScale(Math.max(...items.map(i=>i.value), 0));
  const y = v => m.t + ih - (v/sc.max)*ih;
  const band = iw/n, cx = i => m.l + band*i + band/2;
  const svg = svgEl("svg",{viewBox:`0 0 ${W} ${H}`,role:"img","aria-label":opts.aria||"Grafik"});
  for(let k=0;k<=4;k++){
    const v = sc.step*k;
    svg.append(svgEl("line",{class:"ch-grid",x1:m.l,x2:W-m.r,y1:y(v),y2:y(v)}));
    const t = svgEl("text",{class:"ch-tick",x:m.l-8,y:y(v)+4,"text-anchor":"end"}); t.textContent = compactNum(v); svg.append(t);
  }
  const every = n > 10 ? 2 : 1;
  items.forEach((it,i)=>{ if((n-1-i) % every) return;
    const t = svgEl("text",{class:"ch-tick",x:cx(i),y:H-7,"text-anchor":"middle"}); t.textContent = it.label; svg.append(t); });
  const cross = svgEl("line",{class:"ch-cross",y1:m.t,y2:m.t+ih,style:"display:none"});
  const hover = svgEl("circle",{class:"ch-dot",r:4.5,style:"display:none"});
  if(opts.kind === "bar"){
    const bw = Math.min(22, band*.56);
    items.forEach((it,i)=>{ const h = Math.max(it.value ? 2 : 0, (it.value/sc.max)*ih);
      svg.append(svgEl("path",{class:"ch-bar"+(i<n-1?" past":""), d:`M${cx(i)-bw/2},${m.t+ih} v${-h+3} a3,3 0 0 1 3,-3 h${bw-6} a3,3 0 0 1 3,3 v${h-3} z`})); });
  } else {
    const pts = items.map((it,i)=>[cx(i), y(it.value)]);
    const line = pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
    svg.append(svgEl("path",{class:"ch-area",d:`${line} L${pts[n-1][0]},${m.t+ih} L${pts[0][0]},${m.t+ih} Z`}));
    svg.append(svgEl("path",{class:"ch-line",d:line}));
    svg.append(svgEl("circle",{class:"ch-dot",cx:pts[n-1][0],cy:pts[n-1][1],r:4.5}));
  }
  svg.append(cross, hover);
  const wrap = el("div",{class:"chart"}), tip = el("div",{class:"tip",hidden:true});
  items.forEach((it,i)=>{
    const hit = svgEl("rect",{class:"ch-hit",x:m.l+band*i,y:m.t,width:band,height:ih});
    const show = ()=>{
      const px = cx(i), py = y(it.value);
      cross.setAttribute("x1",px); cross.setAttribute("x2",px); cross.style.display = "";
      if(opts.kind !== "bar"){ hover.setAttribute("cx",px); hover.setAttribute("cy",py); hover.style.display = ""; }
      tip.hidden = false; tip.replaceChildren(el("b",{text:opts.fmt(it.value)}), it.tip || it.label);
      tip.style.left = (px/W*100)+"%"; tip.style.top = (py/H*100)+"%";
    };
    const hide = ()=>{ tip.hidden = true; cross.style.display = "none"; hover.style.display = "none"; };
    hit.addEventListener("mouseenter",show); hit.addEventListener("mouseleave",hide);
    hit.addEventListener("touchstart",show,{passive:true});
    svg.append(hit);
  });
  wrap.append(svg, tip);
  const rows = items.map(i=>el("tr",{}, el("td",{text:i.tip||i.label}), el("td",{class:"num",text:opts.fmt(i.value)})));
  wrap.append(el("details",{class:"data"}, el("summary",{text:"Lihat sebagai tabel"}),
    el("div",{class:"tablewrap"}, el("table",{}, el("thead",{}, el("tr",{}, el("th",{text:"Tanggal"}), el("th",{class:"num",text:opts.unit}))), el("tbody",{}, rows)))));
  return wrap;
}
/* batang horizontal HTML: items [{nama, n}] */
function hBars(items, emptyText){
  if(!items.length) return el("div",{class:"empty",text:emptyText||"Belum ada data."});
  const mx = Math.max(...items.map(i=>i.n), 1);
  return el("div",{class:"hbars"}, items.map(i=>el("div",{class:"hb"},
    el("span",{class:"nm",title:i.nama,text:i.nama}),
    el("span",{class:"track"}, el("span",{class:"fill",style:`width:${Math.max(3,i.n/mx*100)}%;display:block`})),
    el("span",{class:"v",text:String(i.n)}))));
}
