/* ═══════════════════════════════════════════════════════════
   ACADEMIC PERFORMANCE TRACKER  —  script.js
   Full functionality: GPA · CGPA · localStorage · Theme
═══════════════════════════════════════════════════════════ */

"use strict";

// ── GRADE POINT MAP ──────────────────────────────────────
const GP = { O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, RA: 0 };

// ── STATE ─────────────────────────────────────────────────
const gpaStore = {};        // { semNum: { gpa, credits } }
let cgpaFieldCount = 0;     // track manual row count

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  restoreSavedData();
  updateHeroCard();

  document.getElementById("themeBtn").addEventListener("click", toggleTheme);

  // Restore last active tab
  const lastTab = localStorage.getItem("apt_tab");
  if (lastTab) {
    showSem(isNaN(lastTab) ? lastTab : Number(lastTab));
  } else {
    showSem(1);
  }
});

// ═══════════════════════════════════════════════════════════
//  SHOW SEMESTER / NAV
// ═══════════════════════════════════════════════════════════
function showSem(sem) {
  // Hide all sections
  document.querySelectorAll(".sem-section").forEach(s => s.classList.remove("active-section"));
  // Deactivate all tabs
  document.querySelectorAll(".s-tab").forEach(b => b.classList.remove("active"));

  // Show target section
  const section = document.getElementById("sem" + sem);
  if (section) section.classList.add("active-section");

  // Activate matching tab
  const tab = document.querySelector(`.s-tab[data-sem="${sem}"]`);
  if (tab) tab.classList.add("active");

  // If CGPA tab opened, refresh the auto-chip display
  if (sem === "cgpa") refreshAutoChips();

  // Remember tab
  localStorage.setItem("apt_tab", sem);
}

// ═══════════════════════════════════════════════════════════
//  ON GRADE CHANGE  (live point display + auto-save)
// ═══════════════════════════════════════════════════════════
function onGradeChange(selectEl, semNum) {
  // Update visual state of select
  selectEl.classList.remove("grade-valid", "grade-invalid");
  if (selectEl.value) selectEl.classList.add("grade-valid");

  // Update the pts cell for this row (hide-sm but update anyway)
  const row    = selectEl.closest(".st-row");
  const rowIdx = [...row.parentElement.querySelectorAll(".st-row")].indexOf(row);
  const ptEl   = document.getElementById(`pts_${semNum}_${rowIdx}`);
  if (ptEl) {
    if (selectEl.value) {
      const pts = GP[selectEl.value] * Number(selectEl.dataset.credit);
      ptEl.textContent = pts;
      ptEl.style.color = "var(--accent)";
    } else {
      ptEl.textContent = "—";
      ptEl.style.color = "";
    }
  }

  // Auto-save
  autoSave(semNum);
}

// ═══════════════════════════════════════════════════════════
//  CALCULATE GPA  (for a single semester)
// ═══════════════════════════════════════════════════════════
function calculateGPA(semNum) {
  const section  = document.getElementById("sem" + semNum);
  const selects  = section.querySelectorAll(".grade-sel");
  const resultEl = document.getElementById("result-" + semNum);

  let totalCr   = 0;
  let totalPts  = 0;
  let hasRA     = false;
  let hasEmpty  = false;

  selects.forEach(sel => {
    if (!sel.value) {
      hasEmpty = true;
      sel.classList.add("grade-invalid");
      // Re-trigger animation
      sel.style.animation = "none";
      void sel.offsetWidth;
      sel.style.animation = "";
      return;
    }
    sel.classList.remove("grade-invalid");
    sel.classList.add("grade-valid");

    const cr = Number(sel.dataset.credit);
    const gp = GP[sel.value];
    totalCr  += cr;
    totalPts += cr * gp;
    if (sel.value === "RA") hasRA = true;
  });

  if (hasEmpty) {
    toast("⚠️  Please select a grade for every subject.");
    return;
  }

  if (totalCr === 0) { toast("No credits found."); return; }

  const gpa     = totalPts / totalCr;
  const gpaR    = r2(gpa);
  const pct     = r2((gpa - 0.5) * 10);
  const cl      = classify(gpaR);

  // Store GPA for CGPA calculation
  gpaStore[semNum] = { gpa: gpaR, credits: totalCr };
  persistGPAStore();
  updateHeroCard();

  // Animate progress ring
  animateRing(semNum, gpaR);

  // Render result card
  renderResult(`result-${semNum}`, {
    heading:    `Semester ${semNum} GPA`,
    gpa:        gpaR,
    pct,
    totalCr,
    totalPts,
    hasRA,
    showGradeRef: false,
  });

  toast(`✅  Semester ${semNum} GPA: ${gpaR.toFixed(2)}`);
}

// ═══════════════════════════════════════════════════════════
//  RESET SEMESTER
// ═══════════════════════════════════════════════════════════
function resetSem(semNum) {
  const section = document.getElementById("sem" + semNum);

  // Reset all selects
  section.querySelectorAll(".grade-sel").forEach(sel => {
    sel.value = "";
    sel.classList.remove("grade-valid", "grade-invalid");
  });

  // Reset point cells
  section.querySelectorAll(".sub-pts").forEach(el => {
    el.textContent = "—";
    el.style.color = "";
  });

  // Hide result
  const res = document.getElementById("result-" + semNum);
  if (res) res.classList.add("hidden");

  // Reset ring
  const fg  = document.getElementById("rc" + semNum);
  const lbl = document.getElementById("rl" + semNum);
  if (fg)  { fg.style.strokeDashoffset = "107"; }
  if (lbl) { lbl.textContent = "—"; }

  // Remove from store
  delete gpaStore[semNum];
  persistGPAStore();
  updateHeroCard();

  localStorage.removeItem("apt_sem" + semNum);
  toast(`↺  Semester ${semNum} reset.`);
}

// ═══════════════════════════════════════════════════════════
//  AUTO CGPA  (from stored semester GPAs)
// ═══════════════════════════════════════════════════════════
function autoCGPA() {
  const keys = Object.keys(gpaStore);
  if (!keys.length) {
    toast("⚠️  No semester GPA calculated yet.");
    return;
  }

  let totalPts = 0, totalCr = 0;
  keys.forEach(k => {
    totalPts += gpaStore[k].gpa * gpaStore[k].credits;
    totalCr  += gpaStore[k].credits;
  });

  const cgpa = r2(totalPts / totalCr);
  const pct  = r2((cgpa - 0.5) * 10);

  renderResult("cgpa-result", {
    heading:      `CGPA — ${keys.length} Semester${keys.length > 1 ? "s" : ""}`,
    gpa:          cgpa,
    pct,
    totalCr,
    totalPts:     r2(totalPts),
    hasRA:        false,
    showGradeRef: true,
  });

  toast(`🎯  CGPA: ${cgpa.toFixed(2)}`);
}

// ═══════════════════════════════════════════════════════════
//  ADD CGPA FIELD  (exactly like original addCGPAField())
//  Dynamically injects a new GPA input row
// ═══════════════════════════════════════════════════════════
function addCGPAField() {
  cgpaFieldCount++;

  const container = document.getElementById("cgpa-inputs");
  const row = document.createElement("div");
  row.className = "cgpa-input-row";

  row.innerHTML = `
    <span class="cgpa-row-label">Semester ${cgpaFieldCount}</span>
    <input
      type="number"
      class="cgpa-gpa-input"
      placeholder="e.g. 8.50"
      min="0"
      max="10"
      step="0.01"
      aria-label="GPA for Semester ${cgpaFieldCount}"
    />
    <button
      class="cgpa-del-btn"
      onclick="removeCGPARow(this)"
      aria-label="Remove semester ${cgpaFieldCount}"
    >✕</button>
  `;

  container.appendChild(row);
}

// ── Remove a manual CGPA row ─────────────────────────────
function removeCGPARow(btn) {
  const allRows = document.querySelectorAll("#cgpa-inputs .cgpa-input-row");
  if (allRows.length <= 1) {
    toast("Keep at least one semester entry.");
    return;
  }
  const row = btn.closest(".cgpa-input-row");
  row.style.opacity    = "0";
  row.style.transform  = "translateX(8px)";
  row.style.transition = "all .2s ease";
  setTimeout(() => row.remove(), 210);
}

// ═══════════════════════════════════════════════════════════
//  CALCULATE CGPA  (manual inputs)
// ═══════════════════════════════════════════════════════════
function calculateCGPA() {
  const inputs = document.querySelectorAll("#cgpa-inputs .cgpa-gpa-input");
  const vals   = [];
  let allOk    = true;

  inputs.forEach(inp => {
    inp.classList.remove("inp-error");
    const v = parseFloat(inp.value);
    if (inp.value.trim() === "" || isNaN(v) || v < 0 || v > 10) {
      inp.classList.add("inp-error");
      allOk = false;
    } else {
      vals.push(v);
    }
  });

  if (!allOk) { toast("⚠️  GPA values must be between 0.00 and 10.00."); return; }
  if (!vals.length) { toast("Please add at least one semester GPA."); return; }

  const avg = r2(vals.reduce((a, b) => a + b, 0) / vals.length);
  const pct = r2((avg - 0.5) * 10);

  renderResult("cgpa-result", {
    heading:      `CGPA — ${vals.length} Semester${vals.length > 1 ? "s" : ""}`,
    gpa:          avg,
    pct,
    totalCr:      null,
    totalPts:     null,
    hasRA:        false,
    showGradeRef: true,
  });

  toast(`🎯  CGPA: ${avg.toFixed(2)}`);
}

// ═══════════════════════════════════════════════════════════
//  RESET CGPA TAB  (exactly like original resetCGPAtab())
// ═══════════════════════════════════════════════════════════
function resetCGPAtab() {
  // Clear all dynamic input rows
  const container = document.getElementById("cgpa-inputs");
  container.innerHTML = "";
  cgpaFieldCount = 0;

  // Hide result
  const res = document.getElementById("cgpa-result");
  if (res) res.classList.add("hidden");

  toast("↺  CGPA tab reset.");
}

// ═══════════════════════════════════════════════════════════
//  RENDER RESULT CARD
// ═══════════════════════════════════════════════════════════
function renderResult(id, { heading, gpa, pct, totalCr, totalPts, hasRA, showGradeRef }) {
  const el = document.getElementById(id);
  if (!el) return;

  const cl   = classify(gpa);
  const prog = (gpa / 10) * 100;

  el.innerHTML = `
    <div class="rb-header">
      <div>
        <div class="rb-lbl">${heading}</div>
        <div class="rb-gpa" id="rb_num_${id}">0.00</div>
      </div>
      <span class="rb-tag ${cl.css}">${cl.icon} ${cl.label}</span>
    </div>

    <div class="rb-bar-wrap">
      <div class="rb-bar-row">
        <span>Performance</span>
        <span>${gpa.toFixed(2)} / 10.00</span>
      </div>
      <div class="rb-bar-bg">
        <div class="rb-bar-fill" id="rb_bar_${id}"></div>
      </div>
    </div>

    <div class="rb-chips">
      <div class="rb-chip">
        <span class="rb-chip-lbl">GPA</span>
        <span class="rb-chip-val">${gpa.toFixed(2)}</span>
      </div>
      ${totalCr !== null ? `
      <div class="rb-chip">
        <span class="rb-chip-lbl">Credits</span>
        <span class="rb-chip-val">${totalCr}</span>
      </div>` : ""}
      ${totalPts !== null ? `
      <div class="rb-chip">
        <span class="rb-chip-lbl">Points</span>
        <span class="rb-chip-val">${totalPts}</span>
      </div>` : ""}
      <div class="rb-chip">
        <span class="rb-chip-lbl">Percentage</span>
        <span class="rb-chip-val">${pct}%</span>
      </div>
      <div class="rb-chip">
        <span class="rb-chip-lbl">Class</span>
        <span class="rb-chip-val" style="font-size:.78rem">${degreeClass(gpa)}</span>
      </div>
    </div>

    ${hasRA ? `<div class="rb-ra">⚠️  RA detected — re-attempt required to pass.</div>` : ""}

    ${showGradeRef ? gradeRefHTML() : ""}
  `;

  el.classList.remove("hidden");

  // Animate bar
  requestAnimationFrame(() => {
    setTimeout(() => {
      const bar = document.getElementById(`rb_bar_${id}`);
      if (bar) bar.style.width = prog + "%";
    }, 60);
  });

  // Count-up animation for GPA number
  countUp(`rb_num_${id}`, gpa);
}

// ── Grade reference table HTML ───────────────────────────
function gradeRefHTML() {
  const grades = [
    { g: "O",   p: "10", r: "≥ 91%" },
    { g: "A+",  p: "9",  r: "81–90%" },
    { g: "A",   p: "8",  r: "71–80%" },
    { g: "B+",  p: "7",  r: "61–70%" },
    { g: "B",   p: "6",  r: "51–60%" },
    { g: "C",   p: "5",  r: "≥ 50%" },
    { g: "RA",  p: "0",  r: "< 50%" },
  ];
  return `
    <div class="grade-ref">
      <div class="grade-ref-title">Grade Scale Reference</div>
      <div class="grade-ref-chips">
        ${grades.map(g => `<span class="grc">${g.g} → ${g.p} pts (${g.r})</span>`).join("")}
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  AUTO CHIP GRID  (CGPA auto panel)
// ═══════════════════════════════════════════════════════════
function refreshAutoChips() {
  const grid = document.getElementById("autoChips");
  if (!grid) return;

  const keys = Object.keys(gpaStore).map(Number).sort((a, b) => a - b);

  if (!keys.length) {
    grid.innerHTML = `<p class="no-chips-msg">No semester GPA calculated yet. Go to each semester tab and click <strong>Calculate GPA</strong>.</p>`;
    return;
  }

  grid.innerHTML = keys.map((k, i) => `
    <div class="auto-chip" style="animation-delay:${i * 0.05}s">
      <span class="chip-sem-lbl">Sem ${k}</span>
      <span class="chip-gpa-val">${parseFloat(gpaStore[k].gpa).toFixed(2)}</span>
      <span class="chip-cr-lbl">${gpaStore[k].credits} cr</span>
    </div>
  `).join("");
}

// ═══════════════════════════════════════════════════════════
//  HERO SCORECARD  (live update)
// ═══════════════════════════════════════════════════════════
function updateHeroCard() {
  const keys = Object.keys(gpaStore).map(Number).sort((a, b) => a - b);
  const semsEl  = document.getElementById("hc-sems");
  const cgpaEl  = document.getElementById("hc-cgpa");
  const pctEl   = document.getElementById("hc-pct");
  const barEl   = document.getElementById("hcBar");
  const lblEl   = document.getElementById("hcBarLbl");

  if (semsEl) semsEl.textContent = `${keys.length} / 8`;

  if (!keys.length) {
    if (cgpaEl)  cgpaEl.textContent = "—";
    if (pctEl)   pctEl.textContent  = "—";
    if (barEl)   barEl.style.width  = "0%";
    if (lblEl)   lblEl.textContent  = "Enter grades to see live progress";
    return;
  }

  let tp = 0, tc = 0;
  keys.forEach(k => { tp += gpaStore[k].gpa * gpaStore[k].credits; tc += gpaStore[k].credits; });
  const cgpa = r2(tp / tc);
  const pct  = r2((cgpa - 0.5) * 10);

  if (cgpaEl) cgpaEl.textContent = cgpa.toFixed(2);
  if (pctEl)  pctEl.textContent  = pct + "%";
  if (barEl)  barEl.style.width  = ((cgpa / 10) * 100) + "%";
  if (lblEl)  lblEl.textContent  = `${keys.length} semester${keys.length > 1 ? "s" : ""} · ${classify(cgpa).label}`;
}

// ═══════════════════════════════════════════════════════════
//  SVG PROGRESS RING ANIMATION
// ═══════════════════════════════════════════════════════════
const RING_CIRC = 2 * Math.PI * 17; // r = 17 → circumference ≈ 106.8

function animateRing(semNum, gpa) {
  const fg  = document.getElementById("rc" + semNum);
  const lbl = document.getElementById("rl" + semNum);
  if (!fg || !lbl) return;
  const offset = RING_CIRC - (gpa / 10) * RING_CIRC;
  fg.style.strokeDashoffset = offset;
  lbl.textContent = gpa.toFixed(1);
}

// ═══════════════════════════════════════════════════════════
//  COUNT-UP ANIMATION  (GPA number)
// ═══════════════════════════════════════════════════════════
function countUp(elId, target) {
  const el = document.getElementById(elId);
  if (!el) return;
  const dur = 750, start = performance.now();
  function frame(now) {
    const p = Math.min((now - start) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3); // ease-out-cubic
    el.textContent = (target * e).toFixed(2);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ═══════════════════════════════════════════════════════════
//  AUTO-SAVE / RESTORE  (localStorage)
// ═══════════════════════════════════════════════════════════
function autoSave(semNum) {
  const section = document.getElementById("sem" + semNum);
  if (!section) return;
  const vals = [...section.querySelectorAll(".grade-sel")].map(s => s.value);
  localStorage.setItem("apt_sem" + semNum, JSON.stringify(vals));
}

function restoreSavedData() {
  // Restore grade selections for each semester
  for (let s = 1; s <= 8; s++) {
    const raw = localStorage.getItem("apt_sem" + s);
    if (!raw) continue;
    try {
      const vals    = JSON.parse(raw);
      const section = document.getElementById("sem" + s);
      if (!section) continue;
      const sels = section.querySelectorAll(".grade-sel");
      sels.forEach((sel, i) => {
        if (vals[i] !== undefined && vals[i] !== "") {
          sel.value = vals[i];
          sel.classList.add("grade-valid");
          // Update pts cell
          onGradeChange(sel, s);
        }
      });
    } catch (_) { /* ignore parse errors */ }
  }

  // Restore GPA store
  const rawStore = localStorage.getItem("apt_gpaStore");
  if (rawStore) {
    try {
      const parsed = JSON.parse(rawStore);
      Object.assign(gpaStore, parsed);
      // Re-animate rings
      Object.keys(gpaStore).forEach(k => animateRing(Number(k), gpaStore[k].gpa));
    } catch (_) { /* ignore */ }
  }
}

function persistGPAStore() {
  localStorage.setItem("apt_gpaStore", JSON.stringify(gpaStore));
}

// ═══════════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem("apt_theme") || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}
function toggleTheme() {
  const cur  = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("apt_theme", next);
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════
let _toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════
function r2(n) { return Math.round(n * 100) / 100; }

function classify(gpa) {
  if (gpa >= 9.5) return { label: "Outstanding",  css: "gt-O",  icon: "🏆" };
  if (gpa >= 9.0) return { label: "Excellent",     css: "gt-Ap", icon: "⭐" };
  if (gpa >= 8.0) return { label: "Very Good",     css: "gt-A",  icon: "✨" };
  if (gpa >= 7.0) return { label: "Good",          css: "gt-Bp", icon: "👍" };
  if (gpa >= 6.0) return { label: "Average",       css: "gt-B",  icon: "📘" };
  if (gpa >= 5.0) return { label: "Pass",          css: "gt-C",  icon: "✔️" };
  return              { label: "Below Pass",    css: "gt-RA", icon: "⚠️" };
}

function degreeClass(cgpa) {
  if (cgpa >= 9.0) return "First Class w/ Distinction";
  if (cgpa >= 7.5) return "First Class";
  if (cgpa >= 6.5) return "Second Class";
  if (cgpa >= 5.0) return "Pass";
  return "Fail";
}
