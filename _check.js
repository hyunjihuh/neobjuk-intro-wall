
/* ===================== CONFIG ===================== *
 * Paste your Supabase project values here (see setup guide).
 * Until then, the site runs in PREVIEW MODE with sample data. */
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
const BUCKET = "photos";
/* ================================================== */

const configured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
let sb = null;
if (configured) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentBatch = 1;
let rows = [];

/* ---- sample data for preview mode ---- */
const SAMPLE = [
  {batch:1,team:"Team 1",name:"Rahim",intro:"2nd yr CSE · loves cricket 🏏 · wants to build a study app",role:"member",photo_url:""},
  {batch:1,team:"Team 1",name:"Ayesha",intro:"3rd yr EEE · digital art · a drawing game",role:"member",photo_url:""},
  {batch:1,team:"Team 1",name:"Karim",intro:"1st yr · never coded! · excited to try",role:"member",photo_url:""},
  {batch:1,team:"Team 2",name:"Nadia",intro:"CSE · K-pop fan 💜 · a fan community app",role:"member",photo_url:""},
  {batch:2,team:"Team 1",name:"Fahim",intro:"SWE · football · a match-score tracker",role:"member",photo_url:""},
];

/* ---------- rendering ---------- */
function esc(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}

function render(){
  const data = configured ? rows : SAMPLE;
  const batchRows = data.filter(r=>Number(r.batch)===currentBatch);

  // group by team, preserve first-seen order
  const teams = new Map();
  for(const r of batchRows){
    if(!teams.has(r.team)) teams.set(r.team,[]);
    teams.get(r.team).push(r);
  }

  const wall = document.getElementById("wall");
  document.getElementById("count").textContent =
    `${teams.size} team${teams.size!==1?"s":""} · ${batchRows.length} people`;

  if(teams.size===0){
    wall.innerHTML = `<div class="empty-state">No one here yet — be the first! Tap <b>＋ Add me</b>.</div>`;
    return;
  }

  let html = "";
  for(const [team, list] of teams){
    const members = list.filter(r=>r.role!=="team");
    const teamPhoto = list.find(r=>r.role==="team");
    // 3 photo cells + 1 organizer cell
    const cuts = [];
    for(let i=0;i<3;i++){
      const m = members[i];
      cuts.push(m && m.photo_url
        ? `<div class="cell"><img src="${esc(m.photo_url)}" alt=""></div>`
        : `<div class="cell"><span class="ph">${m?"🙂":"＋"}</span></div>`);
    }
    cuts.push(teamPhoto && teamPhoto.photo_url
      ? `<div class="cell org"><img src="${esc(teamPhoto.photo_url)}" alt=""></div>`
      : `<div class="cell org"><span class="ph">📸</span></div>`);

    let mlist = members.map(m=>
      `<div class="m"><div class="mn">${esc(m.name)}</div><div class="mi">${esc(m.intro)}</div></div>`
    ).join("");
    // show placeholders up to 3
    for(let i=members.length;i<3;i++){
      mlist += `<div class="m empty"><div class="mn">waiting for a teammate…</div></div>`;
    }

    html += `
      <div class="team">
        <div class="team-top">
          <div class="frame">
            <div class="cells">${cuts.join("")}</div>
            <div class="strip"><b>NEOBJUK LEARNING</b>2026 · ${esc(team)}</div>
          </div>
          <div class="members">
            <div class="team-name"><span class="dot"></span>${esc(team)}</div>
            ${mlist}
          </div>
        </div>
      </div>`;
  }
  wall.innerHTML = html;

  // refresh team datalist for this batch
  const dl = document.getElementById("teamlist");
  dl.innerHTML = [...new Set(batchRows.map(r=>r.team))].map(t=>`<option value="${esc(t)}">`).join("");
}

/* ---------- data ---------- */
async function load(){
  if(!configured){ render(); return; }
  const {data,error} = await sb.from("members").select("*").order("created_at",{ascending:true});
  if(error){ console.error(error); document.getElementById("banner").style.display="block";
    document.getElementById("banner").innerHTML="⚠️ Could not load data: "+esc(error.message); return; }
  rows = data || [];
  render();
}

/* ---------- image resize ---------- */
function resizeImage(file, max=900){
  return new Promise((res,rej)=>{
    const img = new Image();
    img.onload = ()=>{
      let {width:w,height:h} = img;
      if(w>h && w>max){ h=Math.round(h*max/w); w=max; }
      else if(h>=w && h>max){ w=Math.round(w*max/h); h=max; }
      const c=document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      c.toBlob(b=>b?res(b):rej(new Error("resize failed")),"image/jpeg",0.85);
    };
    img.onerror=rej;
    img.src=URL.createObjectURL(file);
  });
}

/* ---------- submit ---------- */
let chosenFile = null;
async function submit(){
  const batch = document.getElementById("f-batch").value;
  const role  = document.getElementById("f-role").value;
  const team  = document.getElementById("f-team").value.trim();
  const name  = document.getElementById("f-name").value.trim();
  const intro = document.getElementById("f-intro").value.trim();
  const st = document.getElementById("status");

  if(!team){ st.textContent="Please enter your team name."; return; }
  if(role==="member" && !name){ st.textContent="Please enter your name."; return; }
  if(!chosenFile){ st.textContent="Please choose a photo."; return; }
  if(!configured){ st.textContent="⚠️ Preview mode — not connected yet. (See setup guide.)"; return; }

  const btn=document.getElementById("submit"); btn.disabled=true;
  try{
    st.textContent="Optimizing photo…";
    const blob = await resizeImage(chosenFile);
    const safe = (team+"_"+(name||"team")).replace(/[^a-zA-Z0-9]/g,"-");
    const path = `b${batch}/${Date.now()}_${safe}.jpg`;
    st.textContent="Uploading…";
    const up = await sb.storage.from(BUCKET).upload(path, blob, {contentType:"image/jpeg"});
    if(up.error) throw up.error;
    const {data:{publicUrl}} = sb.storage.from(BUCKET).getPublicUrl(path);
    st.textContent="Saving…";
    const ins = await sb.from("members").insert({
      batch:Number(batch), team, name:name||"Team", intro, role, photo_url:publicUrl
    });
    if(ins.error) throw ins.error;
    closeModal();
    await load();
  }catch(e){
    console.error(e); st.textContent="Error: "+(e.message||e);
  }finally{ btn.disabled=false; }
}

/* ---------- modal wiring ---------- */
function openModal(){
  document.getElementById("f-batch").value = String(currentBatch);
  document.getElementById("overlay").classList.add("on");
}
function closeModal(){
  document.getElementById("overlay").classList.remove("on");
  chosenFile=null;
  document.getElementById("f-team").value="";
  document.getElementById("f-name").value="";
  document.getElementById("f-intro").value="";
  document.getElementById("preview").style.display="none";
  const fp=document.getElementById("filepick"); fp.classList.remove("has"); fp.textContent="📷 Tap to choose a photo";
  document.getElementById("status").textContent="";
}

document.getElementById("fab").addEventListener("click",openModal);
document.getElementById("cancel").addEventListener("click",closeModal);
document.getElementById("overlay").addEventListener("click",e=>{ if(e.target.id==="overlay") closeModal(); });
document.getElementById("submit").addEventListener("click",submit);

document.getElementById("f-role").addEventListener("change",e=>{
  document.getElementById("member-fields").style.display = e.target.value==="team" ? "none":"block";
});
document.getElementById("filepick").addEventListener("click",()=>document.getElementById("f-photo").click());
document.getElementById("f-photo").addEventListener("change",e=>{
  const f=e.target.files[0]; if(!f) return;
  chosenFile=f;
  const fp=document.getElementById("filepick"); fp.classList.add("has"); fp.textContent="✓ "+f.name;
  const pv=document.getElementById("preview"); pv.src=URL.createObjectURL(f); pv.style.display="block";
});

document.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  t.classList.add("active");
  currentBatch=Number(t.dataset.batch);
  render();
}));

/* ---------- init ---------- */
if(!configured){
  const b=document.getElementById("banner"); b.style.display="block";
  b.innerHTML="👀 <b>Preview mode</b> — showing sample data. To go live, add your Supabase keys in the code (<code>SUPABASE_URL</code> / <code>SUPABASE_ANON_KEY</code>). See the setup guide.";
}
load();
