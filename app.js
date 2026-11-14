/* Kart Race Control — tournament scheduler, scoreboard and TV display.
   Data lives in one Supabase row per slot ("live" and "test"). With no
   database configured (config.js left blank) it runs as a demo that saves
   in this browser only. */
(function(){
"use strict";

/* ---------------- game data ---------------- */
const CUPS=[
 ["Mushroom",1,"Mario Kart Stadium|Water Park|Sweet Sweet Canyon|Thwomp Ruins"],
 ["Flower",1,"Mario Circuit|Toad Harbor|Twisted Mansion|Shy Guy Falls"],
 ["Star",1,"Sunshine Airport|Dolphin Shoals|Electrodrome|Mount Wario"],
 ["Special",1,"Cloudtop Cruise|Bone-Dry Dunes|Bowser's Castle|Rainbow Road"],
 ["Shell",1,"Moo Moo Meadows|GBA Mario Circuit|Cheep Cheep Beach|Toad's Turnpike"],
 ["Banana",1,"Dry Dry Desert|Donut Plains 3|Royal Raceway|DK Jungle"],
 ["Leaf",1,"Wario Stadium|Sherbet Land|Music Park|Yoshi Valley"],
 ["Lightning",1,"Tick-Tock Clock|Piranha Plant Slide|Grumble Volcano|N64 Rainbow Road"],
 ["Egg",1,"Yoshi Circuit|Excitebike Arena|Dragon Driftway|Mute City"],
 ["Triforce",1,"Wario's Gold Mine|SNES Rainbow Road|Ice Ice Outpost|Hyrule Circuit"],
 ["Crossing",1,"Baby Park|Cheese Land|Wild Woods|Animal Crossing"],
 ["Bell",1,"Neo Bowser City|Ribbon Road|Super Bell Subway|Big Blue"],
 ["Golden Dash",0,"Paris Promenade|Toad Circuit|Choco Mountain|Coconut Mall"],
 ["Lucky Cat",0,"Tokyo Blur|Shroom Ridge|Sky Garden|Ninja Hideaway"],
 ["Turnip",0,"New York Minute|Mario Circuit 3|Kalimari Desert|Waluigi Pinball"],
 ["Propeller",0,"Sydney Sprint|Snow Land|Mushroom Gorge|Sky-High Sundae"],
 ["Rock",0,"London Loop|Boo Lake|Rock Rock Mountain|Maple Treeway"],
 ["Moon",0,"Berlin Byways|Peach Gardens|Merry Mountain|3DS Rainbow Road"],
 ["Fruit",0,"Amsterdam Drift|Riverside Park|DK Summit|Yoshi's Island"],
 ["Boomerang",0,"Bangkok Rush|DS Mario Circuit|Waluigi Stadium|Singapore Speedway"],
 ["Feather",0,"Athens Dash|Daisy Cruiser|Moonview Highway|Squeaky Clean Sprint"],
 ["Cherry",0,"Los Angeles Laps|Sunset Wilds|Koopa Cape|Vancouver Velocity"],
 ["Acorn",0,"Rome Avanti|DK Mountain|Daisy Circuit|Piranha Plant Cove"],
 ["Spiny",0,"Madrid Drive|Rosalina's Ice World|Bowser Castle 3|Wii Rainbow Road"]
].map(([name,base,t])=>({name,base:!!base,tracks:t.split("|")}));
const CUP=Object.fromEntries(CUPS.map(c=>[c.name,c]));
const RACES=4;
const TVC=["var(--tv1)","var(--tv2)","var(--tv3)","var(--tv4)"];
const TVN=["Red","Blue","Green","Purple"];
const SAMPLE_NAMES=["Ava","Ben","Chloe","Dev","Ella","Finn","Gia","Hugo","Iris","Jack","Kai","Lena","Max","Nora","Omar"];
const ORD=n=>n+(["th","st","nd","rd"][(n%100>10&&n%100<14)?0:(n%10<4?n%10:0)]);

/* ---------------- environment ---------------- */
const CFG=window.KART_CONFIG||{};
const params=new URLSearchParams(location.search);
const SLOT=params.get("mode")==="test"?"test":"live";
const ONLINE=!!(CFG.supabaseUrl&&CFG.supabaseAnonKey&&window.supabase&&window.supabase.createClient);
const sb=ONLINE?window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey,{auth:{persistSession:false}}):null;
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const isTV=()=>location.hash==="#tv"||/\/tv\/?$/.test(location.pathname);
const linkFor=(slot,tv)=>{const base=location.pathname.replace(/\/tv\/?$/,"/");return base+(slot==="test"?"?mode=test":"")+(tv?"#tv":"")};

function defaultState(){return{v:1,settings:{tvs:3,points:[10,7,5,3],finalPoints:[15,12,10,9,8,7,6,5],minHeats:2,cupPool:"all"},players:[],rounds:[],finals:null}}
function normalize(d){const s=Object.assign(defaultState(),d||{});s.settings=Object.assign(defaultState().settings,s.settings||{});
  s.players=Array.isArray(s.players)?s.players:[];s.rounds=Array.isArray(s.rounds)?s.rounds:[];return s}
const clone=o=>JSON.parse(JSON.stringify(o));

let S=defaultState(), ver=0, loaded=false;
let pin=LS.get("krc-pin")||"";
let canWrite=!ONLINE;
let tab=LS.get("krc-tab")||"race";
const ui={msg:"",confirm:null,errs:{},hist:null,pinMsg:"",confettiFor:null};

const uid=()=>Math.random().toString(36).slice(2,9);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const pname=id=>(S.players.find(p=>p.id===id)||{name:"(removed)"}).name;
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};

/* ---------------- scoring ---------------- */
function qualPts(place,n){
  const t=S.settings.points;if(n<2)return 0;const L=t.length;
  const x=(place-1)*(L-1)/(n-1),lo=Math.floor(x),hi=Math.ceil(x);
  return Math.round((t[lo]+(t[hi]-t[lo])*(x-lo))*10)/10;
}
const finPts=place=>S.settings.finalPoints[place-1]??0;
function raceCheck(h,r){
  const placed=h.players.filter(p=>Number.isFinite(h.res?.[p]?.[r]));
  const vals=placed.map(p=>h.res[p][r]).sort((a,b)=>a-b);
  return{placed,n:placed.length,ok:vals.every((v,i)=>v===i+1)};
}
function heatScore(h,fn){
  const out={};h.players.forEach(p=>out[p]={pts:0,races:0});
  for(let r=0;r<RACES;r++){const c=raceCheck(h,r);if(!c.ok||c.n<2)continue;
    c.placed.forEach(p=>{out[p].pts+=fn(h.res[p][r],c.n);out[p].races++})}
  Object.values(out).forEach(o=>o.pts=Math.round(o.pts*10)/10);
  return out;
}
function validateHeat(h){
  for(let r=0;r<RACES;r++){const c=raceCheck(h,r);
    if(c.n===0)return`Race ${r+1} has no results yet.`;
    if(!c.ok)return`Race ${r+1}: places must run 1st to ${ORD(c.n)} with no repeats.`;
    if(c.n<2)return`Race ${r+1} needs at least 2 finishers.`;}
  return"";
}
const touchedHeat=h=>Object.values(h.res||{}).some(a=>a&&a.some(Number.isFinite));
function racesDone(h){let n=0;for(let r=0;r<RACES;r++){if(raceCheck(h,r).n>0)n++;else break}return n}

/* ---------------- stats ---------------- */
function stats(){
  const st={};S.players.forEach(p=>st[p.id]={heats:0,sched:0,races:0,pts:0,last:-1,cups:{}});
  const meet={},cupUse={};
  S.rounds.forEach((rd,ri)=>rd.heats.forEach(h=>{
    cupUse[h.cup]=(cupUse[h.cup]||0)+1;
    h.players.forEach(p=>{const s=st[p];if(!s)return;s.sched++;s.last=ri;s.cups[h.cup]=(s.cups[h.cup]||0)+1;
      h.players.forEach(q=>{if(q!==p)meet[p+"|"+q]=(meet[p+"|"+q]||0)+1})});
    if(h.done){Object.entries(heatScore(h,qualPts)).forEach(([p,o])=>{const s=st[p];if(!s)return;
      if(o.races>0)s.heats++;s.races+=o.races;s.pts+=o.pts})}
  }));
  if(S.finals)S.finals.stages.forEach(h=>{cupUse[h.cup]=(cupUse[h.cup]||0)+1;h.players.forEach(p=>{if(st[p])st[p].cups[h.cup]=(st[p].cups[h.cup]||0)+1})});
  Object.values(st).forEach(s=>{s.pts=Math.round(s.pts*10)/10;s.avg=s.races?s.pts/s.races:0});
  return{st,meet,cupUse};
}
function standings(){
  const {st}=stats();const min=S.settings.minHeats;
  return S.players.map(p=>({id:p.id,name:p.name,...st[p.id],q:st[p.id].heats>=min}))
    .sort((a,b)=>(b.q-a.q)||(b.avg-a.avg)||(b.races-a.races)||a.name.localeCompare(b.name));
}

/* ---------------- scheduling ---------------- */
function heatSizes(n,tvs){
  if(n<2)return[];
  const h=Math.min(tvs,Math.max(1,Math.floor(n/3)));const m=Math.min(n,4*h);
  return Array.from({length:h},(_,i)=>Math.floor(m/h)+(i<m%h?1:0));
}
function pickCup(players,exclude,ctx){
  const pool=CUPS.filter(c=>(S.settings.cupPool==="all"||c.base)&&!exclude.includes(c.name));
  const cand=pool.length?pool:CUPS;let best=[],bc=Infinity;
  cand.forEach(c=>{const cost=players.reduce((a,p)=>a+(ctx.st[p]?.cups[c.name]||0)*10,0)+(ctx.cupUse[c.name]||0);
    if(cost<bc){bc=cost;best=[c.name]}else if(cost===bc)best.push(c.name)});
  return best[Math.floor(Math.random()*best.length)];
}
function buildRound(){
  const ctx=stats();
  const here=S.players.filter(p=>p.present).map(p=>p.id);
  const sizes=heatSizes(here.length,S.settings.tvs);if(!sizes.length)return null;
  const m=sizes.reduce((a,b)=>a+b,0);
  const ranked=shuffle(here).sort((a,b)=>(ctx.st[a].sched-ctx.st[b].sched)||(ctx.st[a].last-ctx.st[b].last));
  const chosen=ranked.slice(0,m),sitting=ranked.slice(m);
  let best=null,bc=Infinity;
  for(let t=0;t<400;t++){
    const sh=shuffle(chosen);const groups=[];let i=0;sizes.forEach(s=>{groups.push(sh.slice(i,i+s));i+=s});
    let cost=0;groups.forEach(g=>{for(let a=0;a<g.length;a++)for(let b=a+1;b<g.length;b++){const k=ctx.meet[g[a]+"|"+g[b]]||0;cost+=k*k}});
    if(cost<bc){bc=cost;best=groups;if(cost===0)break}
  }
  const used=[];
  const heats=best.map((g,i)=>{const cup=pickCup(g,used,ctx);used.push(cup);return{tv:i,cup,players:g,res:{},done:false}});
  return{id:uid(),heats,sitting};
}
const curRound=()=>S.rounds[S.rounds.length-1];
const roundDone=r=>r&&r.heats.every(h=>h.done);
const roundTouched=r=>r&&r.heats.some(touchedHeat);

/* ---------------- finals ---------------- */
const qualifiers=()=>standings().filter(s=>s.q);
function stageRank(stage){
  const sc=heatScore(stage,p=>finPts(p));const seeds=S.finals.seeds;
  return stage.players.slice().sort((a,b)=>(sc[b].pts-sc[a].pts)||(seeds.indexOf(a)-seeds.indexOf(b))).map(p=>({id:p,pts:sc[p].pts}));
}
const nextSize=n=>n>4?Math.max(4,n-2):0;
function finalsSizes(){const out=[];let n=S.finals?S.finals.seeds.length:0;while(n){out.push(n);n=nextSize(n)}return out}
function champion(){
  if(!S.finals)return null;const st=S.finals.stages;const cur=st[st.length-1];
  if(!cur||!cur.done||nextSize(cur.players.length))return null;return stageRank(cur);
}

/* ---------------- test helpers ---------------- */
function fillHeat(h){h.res={};h.players.forEach(p=>h.res[p]=[null,null,null,null]);
  for(let r=0;r<RACES;r++)shuffle(h.players).forEach((p,i)=>h.res[p][r]=i+1);h.done=true}

/* ---------------- persistence ---------------- */
let pending=[],flushing=false,retryTimer=null;
function setSync(cls,txt){const el=document.getElementById("sync");if(!el)return;el.className="sync "+cls;el.lastElementChild.textContent=txt}
function localKey(){return"krc-state-"+SLOT}
function localLoad(){try{const raw=LS.get(localKey());if(raw){const o=JSON.parse(raw);return{body:o.body,version:o.version||0}}}catch(e){}return{body:{},version:0}}
function localSave(){
  const prev=LS.get(localKey());
  if(prev){let h=[];try{h=JSON.parse(LS.get("krc-hist-"+SLOT)||"[]")}catch(e){}
    const o=JSON.parse(prev);h.unshift({hid:Date.now(),version:o.version,saved_at:new Date().toISOString(),body:o.body});LS.set("krc-hist-"+SLOT,JSON.stringify(h.slice(0,30)))}
  ver++;LS.set(localKey(),JSON.stringify({body:S,version:ver}));
}
async function fetchRow(){
  const {data,error}=await sb.from("tournaments").select("body,version").eq("id",SLOT).maybeSingle();
  if(error)throw error;return data||{body:{},version:0};
}
function commit(fn){
  if(!canWrite)return;
  fn();render();
  if(!ONLINE){localSave();setSync("ok","Saved in this browser");return}
  pending.push(fn);flush();
}
async function flush(){
  if(flushing||!pending.length)return;flushing=true;clearTimeout(retryTimer);setSync("busy","Saving…");
  while(pending.length){
    const n=pending.length;const body=clone(S);
    const {data,error}=await sb.rpc("save_state",{p_pin:pin,p_id:SLOT,p_body:body,p_base:ver});
    if(!error){ver=Number(data);pending=pending.slice(n);continue}
    const msg=String(error.message||"");
    if(msg.includes("conflict")){
      try{const row=await fetchRow();ver=Number(row.version);S=normalize(row.body);pending.forEach(f=>f());render();continue}
      catch(e){setSync("err","Not saved, retrying…");break}
    }
    if(msg.includes("bad_pin")){pending=[];canWrite=false;pin="";LS.del("krc-pin");ui.pinMsg="That PIN was rejected. Enter it again.";
      try{const row=await fetchRow();ver=Number(row.version);S=normalize(row.body)}catch(e){}flushing=false;setSync("err","Locked");render();return}
    setSync("err","Not saved, retrying…");break;
  }
  flushing=false;
  if(pending.length)retryTimer=setTimeout(flush,4000);else setSync("ok",SLOT==="test"?"Test · saved":"Live · saved");
}
function applyRemote(row){
  if(!row||pending.length||flushing)return;
  const v=Number(row.version||0);if(loaded&&v<=ver)return;
  const prev=sig();ver=v;S=normalize(row.body);loaded=true;
  react(prev);render();
}

/* TV reacts to new rounds / cups / a champion */
let lastSig=null;
function sig(){const c=champion();return{r:S.rounds.length,f:S.finals?S.finals.stages.length:0,c:c?c[0].id+S.finals.seeds.join():""}}
function react(){
  const now=sig();
  if(lastSig&&isTV()){
    if(now.r>lastSig.r)startLights(`Round ${now.r}`);
    else if(now.f>lastSig.f)startLights(now.f===1?"Finals":`Cup ${now.f}`);
    if(now.c&&now.c!==lastSig.c)setTimeout(confetti,300);
  }
  lastSig=now;
}

/* ---------------- actions ---------------- */
function act(a,el){
  const d=el.dataset;ui.msg="";
  switch(a){
  case"add":{const inp=document.getElementById("newname");const names=inp.value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);inp.value="";
    commit(()=>names.forEach(n=>{if(!S.players.some(p=>p.name.toLowerCase()===n.toLowerCase()))S.players.push({id:uid(),name:n.slice(0,24),present:false})}));break}
  case"toggle":commit(()=>{const p=S.players.find(p=>p.id===d.id);if(p)p.present=!p.present});break;
  case"allin":commit(()=>S.players.forEach(p=>p.present=true));break;
  case"allout":commit(()=>S.players.forEach(p=>p.present=false));break;
  case"remove":commit(()=>{S.players=S.players.filter(p=>p.id!==d.id)});break;
  case"round":{if(!heatSizes(S.players.filter(p=>p.present).length,S.settings.tvs).length){ui.msg="Check in at least 2 players first (Players tab).";render();break}
    commit(()=>{const r=buildRound();if(r)S.rounds.push(r)});startLights(`Round ${S.rounds.length}`);break}
  case"reshuffle":commit(()=>{if(!roundTouched(curRound())){S.rounds.pop();const r=buildRound();if(r)S.rounds.push(r)}});break;
  case"undo":commit(()=>{if(!roundTouched(curRound()))S.rounds.pop()});break;
  case"swapcup":{const k=d.k;commit(()=>{const h=getHeat(k);if(!h||touchedHeat(h))return;const others=k.startsWith("f")?S.finals.stages.map(s=>s.cup):curRound().heats.map(x=>x.cup);h.cup=pickCup(h.players,others,stats())});break}
  case"done":{const h=getHeat(d.k);const err=validateHeat(h);if(err){ui.errs[d.k]=err;render();break}
    delete ui.errs[d.k];const k=d.k;commit(()=>{const x=getHeat(k);if(x)x.done=true});break}
  case"reopen":{const k=d.k;commit(()=>{const x=getHeat(k);if(x)x.done=false});break}
  case"finals":{if(qualifiers().length<2){ui.msg="Need at least 2 qualified players.";render();break}
    commit(()=>{if(S.finals)return;const seeds=qualifiers().slice(0,8).map(s=>s.id);S.finals={seeds,stages:[{tv:-1,cup:pickCup(seeds,[],stats()),players:seeds,res:{},done:false}]}});startLights("Finals");break}
  case"advance":{const len=S.finals.stages.length;commit(()=>{const st=S.finals.stages;if(st.length!==len)return;const last=st[st.length-1];if(!last.done)return;
      const keep=stageRank(last).slice(0,nextSize(last.players.length)).map(x=>x.id);if(!keep.length)return;
      st.push({tv:-1,cup:pickCup(keep,st.map(s=>s.cup),stats()),players:keep,res:{},done:false})});startLights(`Cup ${len+1}`);break}
  case"undofinal":commit(()=>{if(!S.finals)return;const st=S.finals.stages;if(st.length>1)st.pop();else S.finals=null});break;
  case"savesettings":{
    const nums=v=>v.split(/[^0-9.]+/).map(Number).filter(x=>x>0);
    const pts=nums(document.getElementById("s-pts").value),fp=nums(document.getElementById("s-fpts").value);
    if(pts.length<2||fp.length<8){ui.msg="Qualifying needs at least 2 values; finals needs 8 values (1st to 8th).";render();break}
    const ns={points:pts.sort((a,b)=>b-a),finalPoints:fp.sort((a,b)=>b-a),minHeats:Math.max(1,parseInt(document.getElementById("s-min").value)||1),
      tvs:parseInt(document.getElementById("s-tvs").value)||3,cupPool:document.getElementById("s-pool").value};
    ui.msg="Settings saved.";commit(()=>Object.assign(S.settings,ns));break}
  case"ask":ui.confirm=d.what;render();break;
  case"cancel":ui.confirm=null;render();break;
  case"wipe-results":ui.confirm=null;commit(()=>{S.rounds=[];S.finals=null});break;
  case"wipe-all":ui.confirm=null;commit(()=>{S=defaultState()});break;
  case"sample":commit(()=>SAMPLE_NAMES.forEach(n=>{let p=S.players.find(p=>p.name===n);if(!p)S.players.push({id:uid(),name:n,present:true});else p.present=true}));break;
  case"fillround":commit(()=>{const r=curRound();if(r)r.heats.forEach(h=>{if(!h.done)fillHeat(h)})});break;
  case"simquals":commit(()=>{for(let i=0;i<8;i++){const r=curRound();if(r&&!roundDone(r))r.heats.forEach(h=>{if(!h.done)fillHeat(h)});const n=buildRound();if(!n)break;n.heats.forEach(fillHeat);S.rounds.push(n)}});break;
  case"fillfinal":commit(()=>{if(!S.finals)return;const st=S.finals.stages;const c=st[st.length-1];if(!c.done)fillHeat(c)});break;
  case"unlock":unlock();break;
  case"lock":pin="";LS.del("krc-pin");canWrite=false;setSync("ok","View only");render();break;
  case"loadhist":loadHistory();break;
  case"restore":{const item=(ui.hist||[])[+d.i];if(!item)break;ui.confirm=null;ui.msg="Restored the save from "+new Date(item.saved_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})+".";
    const body=clone(item.body);commit(()=>{S=normalize(body)});ui.hist=null;break}
  case"opentv":window.open(linkFor(SLOT,true),"_blank");break;
  }
}
function getHeat(k){const [t,a,b]=k.split(":");return t==="f"?S.finals&&S.finals.stages[+a]:S.rounds[+a]&&S.rounds[+a].heats[+b]}

async function unlock(){
  const v=(document.getElementById("pin")||{}).value||"";if(!v){ui.pinMsg="Enter the PIN.";render();return}
  ui.pinMsg="Checking…";render();
  const {data,error}=await sb.rpc("check_pin",{p_pin:v});
  if(error){ui.pinMsg="Couldn't reach the database. Check the connection and try again.";render();return}
  if(data===true){pin=v;LS.set("krc-pin",v);canWrite=true;ui.pinMsg="";setSync("ok",SLOT==="test"?"Test · editing":"Live · editing");
    try{const row=await fetchRow();ver=Number(row.version);S=normalize(row.body)}catch(e){}}
  else ui.pinMsg="That PIN doesn't match.";
  render();
}
async function loadHistory(){
  if(!ONLINE){try{ui.hist=JSON.parse(LS.get("krc-hist-"+SLOT)||"[]")}catch(e){ui.hist=[]}render();return}
  ui.hist="loading";render();
  const {data,error}=await sb.rpc("list_history",{p_pin:pin,p_id:SLOT});
  ui.hist=error?[]:(data||[]);if(error)ui.msg="Couldn't load backups: "+error.message;render();
}
function summarize(b){b=normalize(b);const done=b.rounds.reduce((a,r)=>a+r.heats.filter(h=>h.done).length,0);
  return`${b.players.length} players · ${b.rounds.length} round${b.rounds.length===1?"":"s"} · ${done} cups finished${b.finals?" · finals cup "+b.finals.stages.length:""}`}

/* ---------------- phone / laptop views ---------------- */
function heatCard(h,k,{final=false,label,color}={}){
  const fn=final?(p=>finPts(p)):qualPts;const sc=heatScore(h,fn);const touched=touchedHeat(h);
  const n=h.players.length;const ro=!canWrite||h.done;
  const opts=v=>`<option value="">–</option>`+Array.from({length:n},(_,i)=>`<option value="${i+1}"${v===i+1?" selected":""}>${ORD(i+1)}</option>`).join("");
  const rows=h.players.map(p=>`<tr><td class="name">${esc(pname(p))}</td>${Array.from({length:RACES},(_,r)=>{const v=h.res?.[p]?.[r];
    return`<td><select aria-label="${esc(pname(p))} race ${r+1}" data-k="${k}" data-p="${p}" data-r="${r}" class="${v>=1&&v<=3?"pos"+v:""}" ${ro?"disabled":""}>${opts(v)}</select></td>`}).join("")}<td class="pts">${sc[p].pts}</td></tr>`).join("");
  const c=CUP[h.cup];
  return`<article class="heat" style="--tv:${color}">
  <div class="heat-head"><div class="tvtag">${label}</div><div class="cup"><b>${esc(h.cup)} Cup</b><small>${esc(c?c.tracks.join(" · "):"")}</small></div>
  <span class="status ${h.done?"done":"live"}">${h.done?"Finished":touched?"Racing":"Up next"}</span></div>
  <div class="rumble"></div>
  <div class="gridwrap"><table class="grid"><thead><tr><th>Racer</th>${Array.from({length:RACES},(_,r)=>`<th><span class="lap">R${r+1}</span></th>`).join("")}<th>Pts</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${canWrite?`<div class="heat-foot">${ui.errs[k]?`<span class="err">${esc(ui.errs[k])}</span>`:`<span class="small muted">${h.done?"Locked. Reopen to correct a result.":"Leave a racer blank if they left mid-cup."}</span>`}
   <div class="row">${!touched&&!h.done?`<button class="btn ghost" data-act="swapcup" data-k="${k}">Swap cup</button>`:""}
   ${h.done?`<button class="btn ghost" data-act="reopen" data-k="${k}">Reopen</button>`:`<button class="btn primary" data-act="done" data-k="${k}">Cup finished</button>`}</div></div>`:""}
  </article>`;
}
const tvLinkRow=()=>`<div class="tvlink"><span class="muted">TV screen:</span><code>${esc((location.host||"")+(SLOT==="test"?"/?mode=test#tv":"/tv"))}</code><button class="btn sm" data-act="opentv">Open TV view</button></div>`;

function viewRace(){
  const r=curRound();const ri=S.rounds.length-1;const here=S.players.filter(p=>p.present).length;
  const sizes=heatSizes(here,S.settings.tvs);const msg=ui.msg?`<div class="note warn">${esc(ui.msg)}</div>`:"";
  if(!r){
    return`<div class="panel"><div><div class="label">Qualifying</div><h2>Ready to start</h2></div>
      <p class="muted" style="margin:0">${here} checked in${sizes.length?` → ${sizes.length} TV${sizes.length>1?"s":""} of ${sizes.join(" / ")}`:""}. Each round is one 4-race cup per TV. The app picks who races, mixes up opponents, and assigns cups nobody has run yet.</p>
      ${canWrite?`<div class="row"><button class="btn primary" data-act="round" ${sizes.length?"":"disabled"}>Start round 1</button>${sizes.length?"":`<span class="small muted">Check in at least 2 players on the Players tab.</span>`}</div>`:""}
      ${tvLinkRow()}</div>`+msg;
  }
  const done=roundDone(r);const nextHere=sizes.reduce((a,b)=>a+b,0);
  const top=`<div class="panel"><div class="row between"><div><div class="label">Qualifying</div><h2>Round ${ri+1}${done?" · complete":""}</h2></div>
    ${canWrite?`<div class="row">${!roundTouched(r)?`<button class="btn" data-act="reshuffle">Reshuffle</button><button class="btn ghost" data-act="undo">Cancel round</button>`:""}
      <button class="btn primary" data-act="round" ${done&&sizes.length?"":"disabled"}>Start round ${ri+2}</button></div>`:""}</div>
    ${!done&&canWrite?`<span class="small muted">Next round unlocks when every TV marks its cup finished.</span>`:""}
    ${done&&canWrite?`<span class="small muted">${here} checked in now → ${nextHere} race next round. Check people in or out before starting.</span>`:""}
    ${r.sitting&&r.sitting.length?`<div class="small"><span class="label">Sitting out</span> ${r.sitting.map(p=>esc(pname(p))).join(", ")}</div>`:""}
    ${tvLinkRow()}</div>`+msg;
  const cards=r.heats.map((h,hi)=>heatCard(h,`r:${ri}:${hi}`,{label:`TV ${h.tv+1}`,color:TVC[h.tv%4]})).join("");
  const past=S.rounds.slice(0,-1).map((rd,i)=>({rd,i})).reverse().map(({rd,i})=>`<details><summary>Round ${i+1} · ${rd.heats.map(h=>`TV ${h.tv+1} ${esc(h.cup)}`).join(", ")}</summary><div class="inner">${rd.heats.map((h,hi)=>heatCard(h,`r:${i}:${hi}`,{label:`TV ${h.tv+1}`,color:TVC[h.tv%4]})).join("")}</div></details>`).join("");
  return top+`<div class="heats">${cards}</div>`+(past?`<h3>Earlier rounds</h3><div class="heats">${past}</div>`:"");
}

function viewPlayers(){
  const {st}=stats();const r=curRound();const live={};
  if(r&&!roundDone(r))r.heats.forEach(h=>{if(!h.done)h.players.forEach(p=>live[p]=h.tv)});
  const here=S.players.filter(p=>p.present).length;
  const list=S.players.slice().sort((a,b)=>(b.present-a.present)||a.name.localeCompare(b.name)).map(p=>{
    const s=st[p.id];const meta=[s.heats?`${s.heats} cup${s.heats>1?"s":""}`:"",live[p.id]!==undefined?`Racing TV ${live[p.id]+1}`:""].filter(Boolean).join(" · ");
    return`<div class="pl"><span class="nm">${esc(p.name)}</span><span class="meta">${meta}</span>
    ${canWrite?`<button class="toggle ${p.present?"on":""}" data-act="toggle" data-id="${p.id}" aria-pressed="${p.present}">${p.present?"Here":"Not here"}</button>${s.sched?"":`<button class="x" data-act="remove" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">×</button>`}`:`<span class="tag ${p.present?"q":""}">${p.present?"Here":"Away"}</span>`}</div>`}).join("");
  return`<div class="panel"><div class="row between"><div><div class="label">Roster</div><h2>${here} of ${S.players.length} here</h2></div>
   ${canWrite&&S.players.length?`<div class="row"><button class="btn ghost" data-act="allin">All here</button><button class="btn ghost" data-act="allout">Clear</button></div>`:""}</div>
   ${canWrite?`<div class="add"><input type="text" id="newname" placeholder="Add names (comma-separated works)" autocomplete="off"><button class="btn primary" data-act="add">Add</button></div>
   <span class="small muted">Load the roster ahead of time, then tap a name when that person arrives or leaves. Leaving only affects future rounds.</span>`:""}</div>
   ${S.players.length?`<div class="plist">${list}</div>`:`<div class="panel empty"><strong>No players yet</strong>Add everyone who might show up. Nobody is scheduled until they're checked in.</div>`}`;
}

function viewStandings(){
  const rows=standings();const min=S.settings.minHeats;
  if(!rows.length)return`<div class="panel empty"><strong>No standings yet</strong>Results show here once a cup is marked finished.</div>`;
  const qn=rows.filter(r=>r.q).length;
  return`<div class="panel"><div><div class="label">Qualifying standings</div><h2>Ranked by points per race</h2></div>
   <p class="small muted" style="margin:0">Points per race: ${S.settings.points.join(" / ")} for 1st to ${ORD(S.settings.points.length)} (scaled evenly in smaller heats). ${min} finished cup${min>1?"s":""} to qualify. Top 8 qualifiers make the finals; the gold line marks the cut.</p>
   <div class="gridwrap"><table class="stand"><thead><tr><th>#</th><th>Racer</th><th>Cups</th><th>Races</th><th>Pts</th><th>Avg</th></tr></thead><tbody>
   ${rows.map((r,i)=>`<tr class="${!r.q?"unq":""} ${r.q&&i===7&&qn>8?"cut":""}"><td class="rk ${r.q&&i<3?"r"+(i+1):""}">${r.q?i+1:"–"}</td><td class="nm">${esc(r.name)}${r.q?`<span class="tag q">Q</span>`:`<span class="tag">${r.heats}/${min}</span>`}</td><td>${r.heats}</td><td>${r.races}</td><td>${r.pts}</td><td class="avg">${r.races?r.avg.toFixed(2):"–"}</td></tr>`).join("")}
   </tbody></table></div></div>`;
}

function viewFinals(){
  const F=S.finals;
  if(!F){const q=qualifiers();
    return`<div class="panel"><div><div class="label">Finals</div><h2>Elimination cups</h2></div>
    <div class="ladder"><div class="step"><span class="label">Cup 1</span><b>8</b><span class="small muted">cut 2</span></div><div class="step"><span class="label">Cup 2</span><b>6</b><span class="small muted">cut 2</span></div><div class="step"><span class="label">Cup 3</span><b>4</b><span class="small muted">winner</span></div></div>
    <p class="small muted" style="margin:0">Link two consoles for 8 players. Points reset each cup (${S.settings.finalPoints.join("/")}). Ties go to the higher qualifying seed. ${q.length} qualified so far.</p>
    ${canWrite?`<div class="row"><button class="btn primary" data-act="finals" ${q.length>=2?"":"disabled"}>Seed top ${Math.min(8,q.length)} and start finals</button></div>`:""}
    ${ui.msg?`<div class="note warn">${esc(ui.msg)}</div>`:""}</div>`}
  const st=F.stages;const cur=st[st.length-1];const ci=st.length-1;const sizes=finalsSizes();
  const ladder=`<div class="ladder">${sizes.map((s,i)=>`<div class="step ${i===ci?"now":i<ci?"past":""}"><span class="label">Cup ${i+1}</span><b>${s}</b><span class="small muted">${i===sizes.length-1?"winner":"cut "+(s-sizes[i+1])}</span></div>`).join("")}</div>`;
  let after="";
  if(cur.done){const rk=stageRank(cur);const keep=nextSize(cur.players.length);
    if(!keep){const step=(x,i)=>x?`<div class="s${i+1}"><b>${esc(pname(x.id))}</b><small>${x.pts} pts</small><span class="num">${i+1}</span></div>`:"<div></div>";
      after=`<div class="podiumwrap"><span class="label">Champion</span><div class="champname">${esc(pname(rk[0].id))}</div>
      <div class="podium">${step(rk[1],1)}${step(rk[0],0)}${step(rk[2],2)}</div>
      <div class="podiumrest">${rk.slice(3).map((x,i)=>`${ORD(i+4)} ${esc(pname(x.id))} (${x.pts})`).join(" · ")}</div></div>`;
      const key=F.seeds.join()+ci;if(ui.confettiFor!==key){ui.confettiFor=key;setTimeout(confetti,50)}}
    else after=`<div class="panel"><h3>Cup ${ci+1} result</h3><div class="small" style="display:grid;gap:4px">${rk.map((x,i)=>`<div class="${i<keep?"adv":"out"}"><span class="placebadge ${i<3?"b"+(i+1):""}">${ORD(i+1)}</span>${esc(pname(x.id))} · ${x.pts} pts ${i<keep?"→ advances":"· eliminated"}</div>`).join("")}</div>
      ${canWrite?`<div class="row"><button class="btn primary" data-act="advance">Cut ${cur.players.length-keep} and start cup ${ci+2}</button></div>`:""}</div>`}
  const seeds=`<details><summary>Seeds</summary><div class="inner small">${F.seeds.map((s,i)=>`${i+1}. ${esc(pname(s))}`).join("<br>")}</div></details>`;
  const prev=st.slice(0,-1).map((h,i)=>`<details><summary>Cup ${i+1} · ${esc(h.cup)}</summary><div class="inner">${heatCard(h,`f:${i}`,{final:true,label:"Final",color:"var(--final)"})}</div></details>`).join("");
  return`<div class="panel"><div class="row between"><div><div class="label">Finals</div><h2>Cup ${ci+1} of ${sizes.length}</h2></div>${canWrite?`<button class="btn ghost" data-act="undofinal">${st.length>1?"Undo last cut":"Cancel finals"}</button>`:""}</div>${ladder}</div>
   ${heatCard(cur,`f:${ci}`,{final:true,label:`Cup ${ci+1}`,color:"var(--final)"})}${after}${prev}${seeds}`;
}

function viewSetup(){
  const s=S.settings;const testLink=SLOT==="test"?`<a href="${linkFor("live")}">Go to the live event</a>`:`<a href="${linkFor("test")}">Open test mode</a>`;
  const access=!ONLINE?`<div class="panel"><div><div class="label">Editing</div><h3>Demo mode</h3></div><p class="small muted" style="margin:0">No database is configured, so everything saves in this browser only. Fill in config.js to go live.</p></div>`
   :canWrite?`<div class="panel"><div class="row between"><div><div class="label">Editing</div><h3>Unlocked on this device</h3></div><button class="btn ghost" data-act="lock">Lock</button></div><p class="small muted" style="margin:0">Lock before handing this device to someone else.</p></div>`
   :`<div class="panel"><div><div class="label">Editing</div><h3>Enter PIN to edit</h3></div><div class="pinrow"><input type="text" id="pin" autocomplete="off" placeholder="Organizer PIN"><button class="btn primary" data-act="unlock">Unlock</button></div>${ui.pinMsg?`<span class="small">${esc(ui.pinMsg)}</span>`:`<span class="small muted">Everyone else sees a read-only view.</span>`}</div>`;
  const test=`<div class="panel"><div><div class="label">Testing</div><h3>${SLOT==="test"?"Test tools":"Try it safely first"}</h3></div>
   ${SLOT==="test"?`<p class="small muted" style="margin:0">Test mode has its own data. Nothing here touches the live event.</p>
   ${canWrite?`<div class="row"><button class="btn" data-act="sample">Load 15 sample players</button><button class="btn" data-act="fillround">Auto-fill current round</button><button class="btn" data-act="simquals">Simulate 8 rounds</button><button class="btn" data-act="fillfinal">Auto-fill finals cup</button></div>`:""}`
   :`<p class="small muted" style="margin:0">Test mode is a separate copy of the app with sample players and auto-filled results. Its TV view works too.</p>`}
   <div class="small">${testLink}</div></div>`;
  if(!canWrite)return access+test+`<div class="panel"><h3>Format</h3><p class="small muted" style="margin:0">${s.tvs} TVs · points ${s.points.join("/")} · finals ${s.finalPoints.join("/")} · ${s.minHeats} cups to qualify.</p></div>`;
  const hist=ui.hist==="loading"?`<span class="small muted">Loading backups…</span>`:Array.isArray(ui.hist)?(ui.hist.length?`<div class="hist">${ui.hist.map((h,i)=>`<div class="row"><div><b>${new Date(h.saved_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit",second:"2-digit"})}</b><div class="small muted">${esc(summarize(h.body))}</div></div><button class="btn sm" data-act="restore" data-i="${i}">Restore</button></div>`).join("")}</div>`:`<span class="small muted">No backups yet. One is kept every time something is saved.</span>`):"";
  return access+`<div class="panel"><div><div class="label">Format</div><h2>Setup</h2></div>
  <div class="settings">
   <label>TVs (4 players each)<select id="s-tvs">${[1,2,3,4].map(n=>`<option ${n===s.tvs?"selected":""}>${n}</option>`).join("")}</select></label>
   <label>Cups needed to qualify<input type="number" id="s-min" min="1" max="10" value="${s.minHeats}"></label>
   <label>Qualifying points, 1st→4th<input type="text" id="s-pts" value="${s.points.join(", ")}"></label>
   <label>Finals points, 1st→8th<input type="text" id="s-fpts" value="${s.finalPoints.join(", ")}"></label>
   <label>Cup pool<select id="s-pool"><option value="all" ${s.cupPool==="all"?"selected":""}>All 24 cups (with Booster Course)</option><option value="base" ${s.cupPool==="base"?"selected":""}>Base game 12 cups</option></select></label>
  </div>
  <div class="row"><button class="btn primary" data-act="savesettings">Save settings</button>${ui.msg?`<span class="small">${esc(ui.msg)}</span>`:""}</div>
  <p class="small muted" style="margin:0">Point changes recalculate every past result.</p></div>
  ${test}
  <div class="panel"><div><div class="label">Safety net</div><h3>Backups</h3></div><p class="small muted" style="margin:0">The last 50 saves are kept. Restoring one replaces the current ${SLOT==="test"?"test":"live"} data, and the current state is backed up first.</p>
   <div class="row"><button class="btn" data-act="loadhist">${Array.isArray(ui.hist)?"Refresh list":"Show backups"}</button></div>${hist}</div>
  <div class="panel"><div><div class="label">Reset</div><h3>Start over${SLOT==="test"?" (test data)":""}</h3></div>
   ${ui.confirm==="results"?`<div class="note warn">This erases every round, result and the finals. The roster stays.</div><div class="row"><button class="btn danger" data-act="wipe-results">Erase results</button><button class="btn ghost" data-act="cancel">Keep everything</button></div>`
    :ui.confirm==="all"?`<div class="note warn">This erases the roster, results and settings.</div><div class="row"><button class="btn danger" data-act="wipe-all">Erase everything</button><button class="btn ghost" data-act="cancel">Keep everything</button></div>`
    :`<div class="row"><button class="btn" data-act="ask" data-what="results">Clear results, keep roster</button><button class="btn danger" data-act="ask" data-what="all">Erase everything</button></div>`}
   <span class="small muted">Made a mistake? Restore from Backups above.</span></div>`;
}

/* ---------------- TV view ---------------- */
function tvHeat(h,label,sub,color,final){
  const fn=final?(p=>finPts(p)):qualPts;const sc=heatScore(h,fn);const touched=touchedHeat(h);
  const c=CUP[h.cup];const nd=racesDone(h);
  const order=touched?h.players.slice().sort((a,b)=>sc[b].pts-sc[a].pts):h.players;
  const status=h.done?"Finished":touched?`Race ${Math.min(nd+1,4)} of 4`:"Up next";
  return`<section class="tvheat${final?" compact":""}" style="--tv:${color}"><header><span class="tvn">${label}</span>${sub?`<span class="tvc">${sub}</span>`:""}<span class="st">${status}</span></header><div class="rumble"></div>
   <div class="tvcup"><b>${esc(h.cup)} Cup</b><ol>${(c?c.tracks:[]).map((t,i)=>`<li class="${!h.done&&i===nd?"now":i<nd?"done":""}">${esc(t)}</li>`).join("")}</ol></div>
   <table class="tvtable"><thead><tr><th></th>${[1,2,3,4].map(i=>`<th>R${i}</th>`).join("")}<th>Pts</th></tr></thead><tbody>
   ${order.map(p=>`<tr><td class="nm">${esc(pname(p))}</td>${[0,1,2,3].map(r=>{const v=h.res?.[p]?.[r];return`<td>${Number.isFinite(v)?`<span class="pb ${v<=3?"b"+v:""}">${ORD(v)}</span>`:`<span class="pb e">–</span>`}</td>`}).join("")}<td class="pt">${touched?sc[p].pts:""}</td></tr>`).join("")}
   </tbody></table></section>`;
}
function tvStandings(limit){
  const rows=standings();const min=S.settings.minHeats;const qn=rows.filter(r=>r.q).length;
  const shown=rows.slice(0,limit);
  return`<aside class="tvside"><h3>Standings <small>avg pts / race · top 8 to finals</small></h3>
   ${rows.length?`<table class="tvst"><tbody>${shown.map((r,i)=>`<tr class="${!r.q?"unq":""} ${r.q&&i===7&&qn>8?"cut":""}"><td class="rk ${r.q&&i<3?"r"+(i+1):""}">${r.q?i+1:"–"}</td><td class="nm">${esc(r.name)}</td><td class="av">${r.races?r.avg.toFixed(2):"–"}</td><td class="cu">${r.q?r.heats+" cups":r.heats+"/"+min}</td></tr>`).join("")}</tbody></table>
   ${rows.length>limit?`<div class="tvmore">+${rows.length-limit} more on your phone</div>`:""}`:`<p class="muted" style="font-size:1.3em">Standings appear after the first cup.</p>`}</aside>`;
}
function viewTV(){
  const r=curRound();const F=S.finals;const champ=champion();
  let stage="Starting soon";
  if(F)stage=champ?"Champion":`Finals · Cup ${F.stages.length} of ${finalsSizes().length}`;
  else if(r)stage=`Round ${S.rounds.length}`+(roundDone(r)?" · complete":"");
  const bar=`<div class="tvflag"></div><div class="tvbar"><div class="tvtitle">Kart <span>Race</span> Control</div><div class="tvstage">${stage}</div>${SLOT==="test"?`<div class="tvtest">TEST MODE</div>`:""}<div class="tvclock" id="tvclock">${clock()}</div></div>`;
  const url=esc(location.host||"");
  let main="",foot="";
  if(champ){
    const rk=champ;const step=(x,i)=>x?`<div class="s${i+1}"><b>${esc(pname(x.id))}</b><small>${x.pts} pts</small><span class="num">${i+1}</span></div>`:"<div></div>";
    main=`<div class="tvchamp"><div class="lbl">Tournament champion</div><div class="who">${esc(pname(rk[0].id))}</div><div class="tvpod">${step(rk[1],1)}${step(rk[0],0)}${step(rk[2],2)}</div></div>`;
    foot=`<div class="tvfoot"><span class="sit">${rk.slice(3).map((x,i)=>`${ORD(i+4)} <b>${esc(pname(x.id))}</b>`).join(" · ")}</span></div>`;
  }else if(F){
    const st=F.stages;const cur=st[st.length-1];const sizes=finalsSizes();const ci=st.length-1;const keep=nextSize(cur.players.length);
    const rk=stageRank(cur);const touched=touchedHeat(cur);
    const ladder=`<div class="tvladder">${sizes.map((s,i)=>`<div class="${i===ci?"now":i<ci?"past":""}"><b>${s}</b><span>Cup ${i+1} · ${i===sizes.length-1?"winner takes it":"bottom "+(s-sizes[i+1])+" out"}</span></div>`).join("")}</div>`;
    const side=`<aside class="tvside"><h3>Cup ${ci+1} <small>${keep?`top ${keep} advance`:"winner takes the title"}</small></h3><table class="tvst"><tbody>
      ${rk.map((x,i)=>`<tr class="${keep&&i===keep-1?"cut":""} ${keep&&i>=keep&&touched?"danger":""}"><td class="rk ${i<3?"r"+(i+1):""}">${i+1}</td><td class="nm">${esc(pname(x.id))}</td><td class="av">${x.pts}</td><td class="cu">#${F.seeds.indexOf(x.id)+1} seed</td></tr>`).join("")}</tbody></table>
      <div class="tvmore">Ties go to the higher seed.</div></aside>`;
    main=`<div class="tvmain"><div class="tvfinal">${ladder}<div class="tvheats" style="grid-template-columns:1fr">${tvHeat(cur,`Finals`,`Cup ${ci+1}`,"var(--final)",true)}</div></div>${side}</div>`;
    foot=`<div class="tvfoot"><span class="sit">${cur.done&&keep?`Out: <b>${rk.slice(keep).map(x=>esc(pname(x.id))).join(", ")}</b>`:`${cur.players.length} racers · points ${S.settings.finalPoints.slice(0,cur.players.length).join("/")}`}</span><span class="url">${url}</span></div>`;
  }else if(r){
    main=`<div class="tvmain"><div class="tvheats" style="grid-template-columns:repeat(${r.heats.length},1fr)">${r.heats.map(h=>tvHeat(h,`TV ${h.tv+1}`,TVN[h.tv%4],TVC[h.tv%4],false)).join("")}</div>${tvStandings(12)}</div>`;
    const sit=(r.sitting||[]).map(p=>esc(pname(p)));
    foot=`<div class="tvfoot"><span class="sit">${sit.length?`Sitting out: <b>${sit.join(", ")}</b>`:"Everyone checked in is racing this round"}</span><span class="url">${url}</span></div>`;
  }else{
    const here=S.players.filter(p=>p.present);const s=S.settings;
    main=`<div class="tvwait"><div class="tvbig"><h2>Checked in: ${here.length}</h2>
      ${here.length?`<div class="tvchips">${here.map(p=>`<span>${esc(p.name)}</span>`).join("")}</div>`:`<p>Players appear here as they arrive.</p>`}
      <div class="tvrules"><div><b>4 races per cup</b><span>One cup per TV each round, up to ${s.tvs*4} racing at once</span></div><div><b>${s.points.join(" / ")}</b><span>Points for 1st to 4th. Ranked by average per race.</span></div><div><b>Top 8 → Finals</b><span>Elimination cups: 8, then 6, then 4</span></div></div></div>${tvStandings(12)}</div>`;
    foot=`<div class="tvfoot"><span class="sit">Follow standings on your phone</span><span class="url">${url}</span></div>`;
  }
  return bar+main+foot;
}
function clock(){return new Date().toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}

/* ---------------- effects ---------------- */
const calm=()=>window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
function startLights(label){
  if(calm())return;
  const box=document.getElementById("lights"),lamps=[...box.querySelectorAll("i")],txt=document.getElementById("lightsTxt");
  lamps.forEach(l=>l.className="");txt.textContent=label||"";box.hidden=false;
  [0,1,2].forEach(i=>setTimeout(()=>{lamps[i].className="red"},350+i*600));
  setTimeout(()=>{lamps.forEach(l=>l.className="green");txt.textContent="GO!"},350+3*600+250);
  setTimeout(()=>{box.hidden=true},350+3*600+1300);box.onclick=()=>{box.hidden=true};
}
function confetti(){
  if(calm())return;
  const cv=document.getElementById("confetti");const ctx=cv.getContext("2d");if(!ctx)return;
  cv.hidden=false;const W=cv.width=innerWidth,H=cv.height=innerHeight;
  const cs=getComputedStyle(document.body);
  const cols=["--gold","--tv1","--tv2","--tv3","--tv4","--accent"].map(v=>cs.getPropertyValue(v).trim()||"#ffcc00");
  const P=Array.from({length:isTV()?320:160},()=>({x:Math.random()*W,y:-20-Math.random()*H*.7,w:6+Math.random()*8,h:8+Math.random()*10,vx:(Math.random()-.5)*2.4,vy:2+Math.random()*3.5,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:cols[Math.floor(Math.random()*cols.length)]}));
  const t0=performance.now();
  (function frame(t){ctx.clearRect(0,0,W,H);P.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.r);ctx.fillStyle=p.c;ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);ctx.restore()});
    if(t-t0<5000)requestAnimationFrame(frame);else{ctx.clearRect(0,0,W,H);cv.hidden=true}})(t0);
}

/* ---------------- render ---------------- */
function render(){
  const tv=isTV();document.body.classList.toggle("tv",tv);
  if(tv){document.getElementById("tvroot").innerHTML=viewTV();return}
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===tab));
  const v={race:viewRace,players:viewPlayers,standings:viewStandings,finals:viewFinals,setup:viewSetup}[tab]||viewRace;
  const a=document.activeElement;const keepId=a&&(a.id==="newname"||a.id==="pin")?a.id:null;const keepVal=keepId?a.value:null;
  const lockNote=ONLINE&&!canWrite&&tab!=="setup"?`<div class="note">Live view. Results update as they're entered. Organizer? Unlock editing on the Setup tab.</div>`:"";
  document.getElementById("app").innerHTML=lockNote+v();
  if(keepId){const i=document.getElementById(keepId);if(i){i.value=keepVal;i.focus()}}
}

/* ---------------- wiring ---------------- */
document.getElementById("tabs").addEventListener("click",e=>{const b=e.target.closest("button[data-tab]");if(!b)return;tab=b.dataset.tab;ui.msg="";ui.confirm=null;LS.set("krc-tab",tab);render();window.scrollTo(0,0)});
document.getElementById("app").addEventListener("click",e=>{const b=e.target.closest("[data-act]");if(b&&!b.disabled)act(b.dataset.act,b)});
document.getElementById("app").addEventListener("change",e=>{const s=e.target;if(s.tagName!=="SELECT"||!s.dataset.k)return;
  const k=s.dataset.k,p=s.dataset.p,r=+s.dataset.r,val=s.value?+s.value:null;delete ui.errs[k];
  commit(()=>{const h=getHeat(k);if(!h)return;h.res=h.res||{};const arr=(h.res[p]||[null,null,null,null]).slice();arr[r]=val;h.res[p]=arr})});
document.getElementById("app").addEventListener("keydown",e=>{if(e.key!=="Enter")return;if(e.target.id==="newname"){e.preventDefault();act("add",e.target)}if(e.target.id==="pin"){e.preventDefault();unlock()}});
window.addEventListener("hashchange",render);
window.addEventListener("storage",e=>{if(!ONLINE&&e.key===localKey()){const row=localLoad();applyRemote(row)}});

/* TV conveniences: full screen, keep awake, hide idle cursor, clock */
const fsBtn=document.getElementById("tvfs");
fsBtn.addEventListener("click",async()=>{try{await document.documentElement.requestFullscreen()}catch(e){}try{await navigator.wakeLock.request("screen")}catch(e){}});
document.addEventListener("fullscreenchange",()=>{fsBtn.textContent=document.fullscreenElement?"Exit full screen":"Full screen"});
let idleT;document.addEventListener("mousemove",()=>{document.body.classList.remove("idle");clearTimeout(idleT);idleT=setTimeout(()=>document.body.classList.add("idle"),3000)});
setInterval(()=>{const c=document.getElementById("tvclock");if(c)c.textContent=clock()},15000);

/* ---------------- boot ---------------- */
if(SLOT==="test")document.getElementById("testbanner").hidden=false;
render();
(async()=>{
  if(!ONLINE){const row=localLoad();ver=row.version;S=normalize(row.body);loaded=true;react();setSync("ok","Demo · this browser only");render();return}
  setSync("busy","Connecting…");
  try{const row=await fetchRow();applyRemote(row);react()}catch(e){setSync("err","Can't reach the database");}
  if(pin){const {data}=await sb.rpc("check_pin",{p_pin:pin});canWrite=data===true;if(!canWrite){pin="";LS.del("krc-pin")}}
  setSync("ok",(SLOT==="test"?"Test":"Live")+(canWrite?" · editing":" · view only"));render();
  sb.channel("krc-"+SLOT).on("postgres_changes",{event:"*",schema:"public",table:"tournaments",filter:"id=eq."+SLOT},p=>{if(p.new&&p.new.body)applyRemote(p.new)}).subscribe();
  setInterval(async()=>{if(document.hidden)return;try{applyRemote(await fetchRow())}catch(e){}},isTV()?8000:20000);
})();
})();
