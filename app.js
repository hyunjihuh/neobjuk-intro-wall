/* ====================================================================
 *  app.js  –  Neobjuk Intro Wall  (main application logic)
 * ==================================================================== */

/* -------------------- CONFIG -------------------- */
const SUPABASE_URL  = "https://hdlxpwqwggxcunhzygvb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a8F4ZmbqCT0vmR42Od0wlQ_A6A64U8l";
const BUCKET        = "photos";
const FRAME_SRC     = "frame.png";
const TEAM_PHOTO_SRC = "team-photo.jpg";
const ORG_TEAM      = "Neobjuk Learning";

/* -------------------- SUPABASE CLIENT -------------------- */
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const isCal = new URLSearchParams(location.search).has("calibrate");
if (isCal) document.body.classList.add("cal");

/* -------------------- STATE -------------------- */
let currentBatch   = 1;
let rows           = [];
let modalTeam      = "";
let chosenFile     = null;
let editingId      = null;
let editChosenFile = null;
let editorResultBlob = null;

/* -------------------- HEIC CONVERSION -------------------- */
async function ensureJpeg(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".heic") || name.endsWith(".heif")) {
    try {
      const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      return Array.isArray(blob) ? blob[0] : blob;
    } catch (e) {
      console.warn("HEIC conversion failed, returning original:", e);
      return file;
    }
  }
  return file;
}

/* -------------------- FUN PLACEHOLDERS -------------------- */
const FUN_PLACEHOLDERS = [
  "I can eat 10 biryanis in one sitting",
  "I once stayed awake 48 hours for an assignment",
  "My hidden talent is beatboxing",
  "I know every BTS song by heart",
  "I've been to 12 countries before age 20",
  "I've watched One Piece 3 times and I'd do it again",
  "I can cook better than my mom (don't tell her)",
  "My comfort food is instant noodles at 3am",
  "I talk to my plants and they actually grow better",
  "I once accidentally joined the wrong class for 3 weeks",
  "I can name every FIFA World Cup winner",
  "I cried watching Hachiko and I'm not ashamed",
];

function randomPlaceholder() {
  return "e.g. " + FUN_PLACEHOLDERS[Math.floor(Math.random() * FUN_PLACEHOLDERS.length)];
}

/* -------------------- HELPERS -------------------- */
function esc(s) {
  return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2500);
}

/* -------------------- RENDER -------------------- */
function frameHTML(members, isOrgTeam) {
  const cell = (i, cls, url) =>
    `<div class="cell c${i} ${cls}" data-lbl="c${i}">` +
    (url ? `<img src="${esc(url)}" alt="">` : ``) + `</div>`;

  let c = "";
  if (isOrgTeam) {
    for (let i = 0; i < 4; i++) {
      const m = members[i];
      c += cell(i + 1, "", m && m.photo_url);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const m = members[i];
      c += cell(i + 1, "", m && m.photo_url);
    }
    c += cell(4, "org", TEAM_PHOTO_SRC);
  }
  return `<div class="frame"><img class="frameimg" src="${FRAME_SRC}" alt="frame"
            onerror="this.style.display='none';this.parentNode.classList.add('noimg')">${c}</div>`;
}

function render() {
  const br = rows.filter(r => Number(r.batch) === currentBatch || r.team === ORG_TEAM);
  const teams = new Map();
  for (const r of br) {
    if (!teams.has(r.team)) teams.set(r.team, []);
    teams.get(r.team).push(r);
  }

  const memberCount = br.filter(r => r.role === "member" || r.role === "leader").length;
  document.getElementById("count").textContent =
    `${teams.size} team${teams.size !== 1 ? "s" : ""} · ${memberCount} people`;

  const wall = document.getElementById("wall");
  let html = "";

  if (teams.size === 0) {
    html += `<div class="welcome">
      <h2>Welcome to Our First Page!</h2>
      <p>Create your team to get started. Each team gets a 4-cut photo frame!</p>
    </div>`;
  }

  for (const [team, list] of teams) {
    const isOrg = team === ORG_TEAM;
    const maxMembers = isOrg ? 4 : 3;
    const members = list
      .filter(r => r.role === "member" || r.role === "leader")
      .sort((a, b) => {
        if (a.role === "leader") return -1;
        if (b.role === "leader") return 1;
        return new Date(a.created_at) - new Date(b.created_at);
      });
    const cnt = members.length;

    const cellTops = [5, 25.1, 45, 64.6];
    const cellH = 18;
    let mlist = "";

    for (let i = 0; i < maxMembers; i++) {
      const m = members[i];
      const top = cellTops[i];

      if (m) {
        const isLeader = m.role === "leader";
        const parts = m.intro.split(" · ");
        const introLine = parts[0] || "";
        const funLine = parts.slice(1).join(" · ") || "";
        mlist += `<div class="m${isLeader ? " is-leader" : ""}" style="top:${top}%;min-height:${cellH}%">
          <div class="m-info">
            <div class="mn">${esc(m.name)}${isLeader ? ' <span class="crown">👑</span>' : ''}</div>
            ${m.nickname ? `<div class="mi-nick">"${esc(m.nickname)}"</div>` : ''}
            ${introLine ? `<div class="mi-intro">${esc(introLine)}</div>` : ''}
            ${funLine ? `<div class="mi-fun">"${esc(funLine)}"</div>` : ''}
          </div>
          <div class="m-actions">
            <button class="m-btn edit" onclick="openEdit(${m.id})" title="Edit">&#x270E;</button>
            <button class="m-btn del" onclick="deleteMember(${m.id},'${esc(m.name)}')" title="Delete">&#x00D7;</button>
          </div>
          <div class="m-popup">
            <div class="mn">${esc(m.name)}${isLeader ? ' 👑' : ''}</div>
            ${m.nickname ? `<div class="mi-nick">"${esc(m.nickname)}"</div>` : ''}
            ${introLine ? `<div class="mi-intro">${esc(introLine)}</div>` : ''}
            ${funLine ? `<div class="mi-fun">"${esc(funLine)}"</div>` : ''}
          </div>
        </div>`;
      } else {
        mlist += `<div class="m-slot" style="top:${top}%;min-height:${cellH}%;display:flex;align-items:center">
          <div class="m-add" style="width:100%" onclick="openAddMember('${esc(team)}')">
            <div class="plus">+</div><span>Join</span>
          </div>
        </div>`;
      }
    }

    html += `<div class="team">
      <div class="team-header">
        <span class="dot"></span>
        <span class="tname">${esc(team)}</span>
        <span class="tcount">${cnt}/${maxMembers}</span>
        <button onclick="deleteTeam('${esc(team)}')" title="Delete team" style="border:none;background:none;color:#ccc;font-size:.7rem;cursor:pointer;padding:4px;margin-left:2px">×</button>
      </div>
      <div class="team-body">${frameHTML(members, isOrg)}
        <div class="members">${mlist}</div>
      </div></div>`;
  }

  html += `<div class="add-team-card" onclick="openNewTeam()">
    <div class="big-plus">+</div><span>Add new team</span></div>`;
  wall.innerHTML = html;
}

/* -------------------- CRUD -------------------- */
async function load() {
  const { data, error } = await sb.from("members").select("*").order("created_at", { ascending: true });
  if (error) { console.error(error); return; }
  rows = data || [];
  render();
}

async function deleteTeam(teamName) {
  if (!confirm("Delete team \"" + teamName + "\" and all its members?")) return;
  const ids = rows.filter(r => r.team === teamName && Number(r.batch) === currentBatch).map(r => r.id);
  const { error } = await sb.from("members").delete().in("id", ids);
  if (error) { console.error(error); toast("Delete failed"); return; }
  await load();
  toast("Team \"" + teamName + "\" deleted");
}
window.deleteTeam = deleteTeam;

async function deleteMember(id, name) {
  if (!confirm("Delete " + name + "?")) return;
  const { error } = await sb.from("members").delete().eq("id", id);
  if (error) { console.error(error); toast("Delete failed"); return; }
  await load();
  toast(name + " removed");
}

/* -------------------- MODAL OPEN / CLOSE -------------------- */
function openAddMember(team) {
  modalTeam = team;
  document.getElementById("modal-context").textContent = team;
  document.getElementById("sheet-member").style.display = "block";
  document.getElementById("sheet-team").style.display   = "none";
  document.getElementById("sheet-edit").style.display    = "none";
  document.getElementById("f-intro").placeholder = randomPlaceholder();

  // Check if leader already exists
  const teamMembers = rows.filter(r => r.team === team && Number(r.batch) === currentBatch);
  const hasLeader = teamMembers.some(r => r.role === "leader");
  document.getElementById("leader-check").style.display = hasLeader ? "none" : "flex";
  document.getElementById("f-leader").checked = false;

  // Reset photo state
  chosenFile = null;
  editorResultBlob = null;
  document.getElementById("photoPreview").style.display = "none";
  document.getElementById("photoPreview").src = "";

  document.getElementById("overlay").classList.add("on");
  setTimeout(() => document.getElementById("f-name").focus(), 100);
}

function openNewTeam() {
  document.getElementById("sheet-member").style.display = "none";
  document.getElementById("sheet-team").style.display   = "block";
  document.getElementById("sheet-edit").style.display    = "none";
  document.getElementById("overlay").classList.add("on");
  setTimeout(() => document.getElementById("f-team").focus(), 100);
}

function openEdit(id) {
  const m = rows.find(r => r.id === id);
  if (!m) return;
  editingId = id;
  editChosenFile = null;
  editorResultBlob = null;

  document.getElementById("sheet-member").style.display = "none";
  document.getElementById("sheet-team").style.display   = "none";
  document.getElementById("sheet-edit").style.display    = "block";
  document.getElementById("edit-context").textContent = m.team;
  document.getElementById("e-name").value = m.name;
  document.getElementById("e-nickname").value = m.nickname || "";

  // Split intro by " · "
  const parts = m.intro.split(" · ");
  document.getElementById("e-intro1").value = parts[0] || "";
  document.getElementById("e-intro2").value = parts.slice(1).join(" · ") || "";
  document.getElementById("e-leader").checked = m.role === "leader";

  // Hide leader check if team already has a different leader
  const teamMembers = rows.filter(r => r.team === m.team && Number(r.batch) === m.batch);
  const otherLeader = teamMembers.find(r => r.role === "leader" && r.id !== id);
  document.getElementById("edit-leader-check").style.display = otherLeader ? "none" : "flex";

  // Show existing photo in edit preview
  const editPreview = document.getElementById("editPhotoPreview");
  if (m.photo_url) {
    editPreview.src = m.photo_url;
    editPreview.style.display = "block";
    document.getElementById("editPhotoActions").style.display = "flex";
  } else {
    editPreview.style.display = "none";
    document.getElementById("editPhotoActions").style.display = "none";
  }

  document.getElementById("overlay").classList.add("on");
  setTimeout(() => document.getElementById("e-name").focus(), 100);
}

function closeModal() {
  document.getElementById("overlay").classList.remove("on");

  // Reset add-member fields
  chosenFile = null;
  editorResultBlob = null;
  document.getElementById("f-team").value = "";
  document.getElementById("f-name").value = "";
  document.getElementById("f-nickname").value = "";
  document.getElementById("f-intro1").value = "";
  document.getElementById("f-intro").value = "";
  document.getElementById("f-photo").value = "";
  document.getElementById("f-leader").checked = false;
  document.getElementById("photoPreview").style.display = "none";
  document.getElementById("photoPreview").src = "";
  const fp = document.getElementById("filepick");
  fp.classList.remove("has");
  fp.textContent = "Tap to choose a photo";
  document.getElementById("status-member").textContent = "";

  // Reset team fields
  document.getElementById("status-team").textContent = "";

  // Reset edit fields
  document.getElementById("status-edit").textContent = "";
  document.getElementById("e-photo").value = "";
  document.getElementById("editPhotoPreview").style.display = "none";
  document.getElementById("editPhotoPreview").src = "";
  document.getElementById("editPhotoActions").style.display = "none";
  editingId = null;
  editChosenFile = null;
}

/* -------------------- SUBMIT: ADD MEMBER -------------------- */
document.getElementById("btn-submit-member").onclick = async function () {
  const st    = document.getElementById("status-member");
  const name  = document.getElementById("f-name").value.trim();
  const nickname = document.getElementById("f-nickname").value.trim();
  const intro1 = document.getElementById("f-intro1").value.trim();
  const intro2 = document.getElementById("f-intro").value.trim();
  const intro  = [intro1, intro2].filter(Boolean).join(" · ");
  const isLeader = document.getElementById("f-leader").checked;

  if (!name) { st.textContent = "Please enter your name."; return; }
  if (!chosenFile && !editorResultBlob) { st.textContent = "Please choose a photo."; return; }

  // Duplicate check
  const existing = rows.find(r =>
    r.team === modalTeam &&
    r.name.toLowerCase() === name.toLowerCase() &&
    (r.role === "member" || r.role === "leader")
  );
  if (existing) { st.textContent = "Someone with that name is already in this team!"; return; }

  // Team full check — refetch latest data to prevent race condition
  const btn = this;
  btn.disabled = true;
  st.textContent = "Checking team...";
  const { data: freshRows } = await sb.from("members").select("*").eq("team", modalTeam);
  const teamMembers = (freshRows || []).filter(r =>
    (Number(r.batch) === currentBatch || modalTeam === ORG_TEAM) &&
    (r.role === "member" || r.role === "leader")
  );
  const maxM = modalTeam === ORG_TEAM ? 4 : 3;
  if (teamMembers.length >= maxM) { st.textContent = "This team is full!"; btn.disabled = false; return; }
  // Also re-check duplicate with fresh data
  const freshDup = teamMembers.find(r => r.name.toLowerCase() === name.toLowerCase());
  if (freshDup) { st.textContent = "Someone with that name is already in this team!"; btn.disabled = false; return; }

  try {
    let blob;
    if (editorResultBlob) {
      blob = editorResultBlob;
    } else {
      // Process through ensureJpeg then open editor
      st.textContent = "Processing photo...";
      const processed = await ensureJpeg(chosenFile);
      const url = URL.createObjectURL(processed);
      const result = await openPhotoEditor(url);
      if (result) {
        blob = result;
        editorResultBlob = result;
      } else {
        st.textContent = "Photo editing cancelled.";
        btn.disabled = false;
        return;
      }
    }

    const safe = (modalTeam + "_" + name).replace(/[^a-zA-Z0-9]/g, "-");
    const path = `b${currentBatch}/${Date.now()}_${safe}.jpg`;
    st.textContent = "Uploading...";
    const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (up.error) throw up.error;
    const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path);

    st.textContent = "Saving...";
    const ins = await sb.from("members").insert({
      batch: currentBatch,
      team: modalTeam,
      name,
      nickname: nickname || "",
      intro: intro || "",
      role: isLeader ? "leader" : "member",
      photo_url: publicUrl
    });
    if (ins.error) throw ins.error;

    closeModal();
    await load();
    toast(isLeader ? "&#x1F451; " + name + " is the leader!" : "Added! Welcome, " + name + "!");
  } catch (e) {
    console.error(e);
    st.textContent = "Error: " + (e.message || e);
  } finally {
    btn.disabled = false;
  }
};

/* -------------------- SUBMIT: NEW TEAM -------------------- */
document.getElementById("btn-submit-team").onclick = async function () {
  const st   = document.getElementById("status-team");
  const teamInput = document.getElementById("f-team").value.trim();
  if (!teamInput) { st.textContent = "Please enter a team number."; return; }
  const team = "Team " + teamInput;

  // Duplicate check
  const existing = rows.find(r =>
    r.team.toLowerCase() === team.toLowerCase() &&
    Number(r.batch) === currentBatch
  );
  if (existing) { st.textContent = "This team already exists!"; return; }

  const btn = this;
  btn.disabled = true;
  try {
    st.textContent = "Creating team...";
    const ins = await sb.from("members").insert({
      batch: currentBatch,
      team,
      name: "__placeholder__",
      intro: "",
      role: "placeholder",
      photo_url: ""
    });
    if (ins.error) throw ins.error;
    closeModal();
    await load();
    toast('Team "' + team + '" created!');
  } catch (e) {
    console.error(e);
    st.textContent = "Error: " + (e.message || e);
  } finally {
    btn.disabled = false;
  }
};

/* -------------------- SUBMIT: EDIT MEMBER -------------------- */
document.getElementById("btn-submit-edit").onclick = async function () {
  const st     = document.getElementById("status-edit");
  const name   = document.getElementById("e-name").value.trim();
  const nickname = document.getElementById("e-nickname").value.trim();
  const intro1 = document.getElementById("e-intro1").value.trim();
  const intro2 = document.getElementById("e-intro2").value.trim();
  const intro  = [intro1, intro2].filter(Boolean).join(" · ");
  const isLeader = document.getElementById("e-leader").checked;

  if (!name) { st.textContent = "Please enter a name."; return; }

  const btn = this;
  btn.disabled = true;

  try {
    const updates = { name, nickname: nickname || "", intro, role: isLeader ? "leader" : "member" };

    // If editor produced a new photo
    if (editorResultBlob) {
      const safe = name.replace(/[^a-zA-Z0-9]/g, "-");
      const path = `edit/${Date.now()}_${safe}.jpg`;
      st.textContent = "Uploading...";
      const up = await sb.storage.from(BUCKET).upload(path, editorResultBlob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path);
      updates.photo_url = publicUrl;
    }

    st.textContent = "Saving...";
    const { error } = await sb.from("members").update(updates).eq("id", editingId);
    if (error) throw error;

    closeModal();
    await load();
    toast("Updated!");
  } catch (e) {
    console.error(e);
    st.textContent = "Error: " + (e.message || e);
  } finally {
    btn.disabled = false;
  }
};

/* -------------------- PHOTO HANDLING: ADD MEMBER -------------------- */
document.getElementById("filepick").onclick = () => document.getElementById("f-photo").click();

document.getElementById("f-photo").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fp = document.getElementById("filepick");
  fp.classList.add("has");
  fp.textContent = "Processing...";

  try {
    chosenFile = await ensureJpeg(f);
    const url = URL.createObjectURL(chosenFile);
    // Verify image loads
    await new Promise((ok, fail) => { const t = new Image(); t.onload = ok; t.onerror = fail; t.src = url; });

    fp.textContent = "* " + f.name.replace(/\.heic$/i, ".jpg");

    // Show preview
    const preview = document.getElementById("photoPreview");
    preview.src = url;
    preview.style.display = "block";

    // Open editor immediately
    const result = await openPhotoEditor(url);
    if (result) {
      editorResultBlob = result;
      preview.src = URL.createObjectURL(result);
    }
  } catch (err) {
    console.error("Photo load error:", err);
    fp.classList.remove("has");
    fp.textContent = "Could not load this photo. Try another one.";
    chosenFile = null;
  }
});

// Click on add-member preview opens editor
function openEditor() {
  const preview = document.getElementById("photoPreview");
  if (!preview.src) return;
  openPhotoEditor(preview.src).then(blob => {
    if (blob) {
      editorResultBlob = blob;
      preview.src = URL.createObjectURL(blob);
    }
  });
}

/* -------------------- PHOTO HANDLING: EDIT MEMBER -------------------- */
document.getElementById("e-photo").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;

  try {
    editChosenFile = await ensureJpeg(f);
    const url = URL.createObjectURL(editChosenFile);
    // Verify image loads
    await new Promise((ok, fail) => { const t = new Image(); t.onload = ok; t.onerror = fail; t.src = url; });

    // Show preview
    const preview = document.getElementById("editPhotoPreview");
    preview.src = url;
    preview.style.display = "block";
    document.getElementById("editPhotoActions").style.display = "flex";

    // Open editor immediately
    const result = await openPhotoEditor(url);
    if (result) {
      editorResultBlob = result;
      preview.src = URL.createObjectURL(result);
    }
  } catch (err) {
    console.error("Photo load error:", err);
    editChosenFile = null;
  }
});

// Click on edit preview opens editor with existing photo URL
function openEditorForEdit() {
  const preview = document.getElementById("editPhotoPreview");
  if (!preview.src) return;
  openPhotoEditor(preview.src).then(blob => {
    if (blob) {
      editorResultBlob = blob;
      preview.src = URL.createObjectURL(blob);
    }
  });
}

// "Change photo" button triggers file input
function changeEditPhoto() {
  document.getElementById("e-photo").click();
}

/* -------------------- EVENT WIRING -------------------- */

// Tab clicks switch batch
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  currentBatch = Number(t.dataset.batch);
  render();
}));

// Overlay background click closes modal
document.getElementById("overlay").addEventListener("click", e => {
  if (e.target.id === "overlay") closeModal();
});

// Realtime subscription — debounced to prevent flood when 70 students edit simultaneously
let realtimeTimer = null;
sb.channel("members-realtime")
  .on("postgres_changes", { event: "*", schema: "public", table: "members" }, () => {
    clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(load, 500);
  })
  .subscribe();

/* -------------------- CALIBRATION -------------------- */
if (isCal) {
  const root = document.documentElement.style;
  const map = {
    "r-left":  "--cell-left",
    "r-width": "--cell-width",
    "r-height":"--cell-h",
    "r-c1":    "--c1-top",
    "r-c2":    "--c2-top",
    "r-c3":    "--c3-top",
    "r-c4":    "--c4-top"
  };

  function updateCSS() {
    for (const [id, prop] of Object.entries(map)) {
      const val = document.getElementById(id).value;
      root.setProperty(prop, val + "%");
      document.getElementById("v-" + id.split("-")[1]).textContent = val + "%";
    }
    document.getElementById("cssOut").textContent =
      `--cell-left:${document.getElementById("r-left").value}%; ` +
      `--cell-width:${document.getElementById("r-width").value}%; ` +
      `--cell-h:${document.getElementById("r-height").value}%;\n` +
      `--c1-top:${document.getElementById("r-c1").value}%; ` +
      `--c2-top:${document.getElementById("r-c2").value}%; ` +
      `--c3-top:${document.getElementById("r-c3").value}%; ` +
      `--c4-top:${document.getElementById("r-c4").value}%;`;
  }

  for (const id of Object.keys(map)) {
    document.getElementById(id).addEventListener("input", updateCSS);
  }

  document.getElementById("copyCSS").addEventListener("click", () => {
    navigator.clipboard.writeText(document.getElementById("cssOut").textContent).then(() => {
      document.getElementById("copyCSS").textContent = "Copied!";
      setTimeout(() => document.getElementById("copyCSS").textContent = "Copy CSS values", 1500);
    });
  });

  updateCSS();
}

/* -------------------- EXPOSE GLOBALS (for onclick in HTML) -------------------- */
window.openAddMember   = openAddMember;
window.openNewTeam     = openNewTeam;
window.openEdit        = openEdit;
window.closeModal      = closeModal;
window.deleteMember    = deleteMember;
window.openEditor      = openEditor;
window.openEditorForEdit = openEditorForEdit;
window.changeEditPhoto = changeEditPhoto;

/* -------------------- INIT -------------------- */
load();
