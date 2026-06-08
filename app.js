// app.js — UI wiring: build sliders, render chart & table, recompute live.

const state = Object.assign({}, DEFAULTS);

const fmtEuro  = v => "€ " + Math.round(v).toLocaleString("nl-NL");
const fmtEuro0 = v => "€ " + Math.round(v).toLocaleString("nl-NL");
const fmtPct   = v => (v * 100).toLocaleString("nl-NL", {maximumFractionDigits: 2}) + " %";
const fmtJaar  = v => v + " jaar";

function fmtFor(kind, v) {
  if (kind === "euro" || kind === "euro0") return fmtEuro(v);
  if (kind === "pct") return fmtPct(v);
  if (kind === "jaar") return fmtJaar(v);
  return v;
}

// ---- Tooltip ----
const tooltip = document.createElement("div");
tooltip.className = "tooltip";
document.body.appendChild(tooltip);

function showTooltip(text, anchor) {
  tooltip.textContent = text;
  tooltip.classList.add("visible");
  positionTooltip(anchor);
}

function positionTooltip(anchor) {
  const r = anchor.getBoundingClientRect();
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  const margin = 8;
  let left = r.right + margin;
  let top  = r.top + window.scrollY;
  // flip left if it would overflow right edge
  if (left + tw > window.innerWidth - margin) left = r.left - tw - margin;
  // keep within vertical viewport
  if (top + th > window.scrollY + window.innerHeight - margin)
    top = window.scrollY + window.innerHeight - th - margin;
  tooltip.style.left = left + "px";
  tooltip.style.top  = top  + "px";
}

function hideTooltip() {
  tooltip.classList.remove("visible");
}

// ---- Mobile controls toggle ----
function setupMobileToggle() {
  const controls = document.getElementById("controls");
  const btn = document.createElement("button");
  btn.className = "controls-toggle";
  btn.innerHTML = "▾ Aannames aanpassen";
  controls.insertBefore(btn, controls.firstChild);

  btn.addEventListener("click", () => {
    controls.classList.toggle("open");
    btn.innerHTML = controls.classList.contains("open")
      ? "▴ Aannames sluiten"
      : "▾ Aannames aanpassen";
  });
}
setupMobileToggle();

// ---- Build controls ----
function buildControls() {
  document.querySelectorAll(".ctrl").forEach(el => {
    const key  = el.dataset.key;
    const kind = el.dataset.fmt;
    const tip  = TOOLTIPS[key] || "";

    const infoIcon = tip
      ? `<button class="info-icon" aria-label="Uitleg ${LABELS[key]}" tabindex="0">ⓘ</button>`
      : "";

    if (kind === "bool") {
      el.classList.add("toggle");
      el.innerHTML = `
        <label class="switch">
          <input type="checkbox" ${state[key] ? "checked" : ""}>
          <span class="track"></span>
          <span>${LABELS[key]}</span>
        </label>${infoIcon}`;
      el.querySelector("input").addEventListener("change", e => {
        state[key] = e.target.checked;
        render();
      });
    } else {
      const min  = parseFloat(el.dataset.min);
      const max  = parseFloat(el.dataset.max);
      const step = parseFloat(el.dataset.step);
      el.innerHTML = `
        <div class="row">
          <label>${LABELS[key]}${infoIcon}</label>
          <span class="val" data-val="${key}" title="Dubbelklik om te bewerken">${fmtFor(kind, state[key])}</span>
        </div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${state[key]}">`;

      const slider  = el.querySelector("input[type=range]");
      const valSpan = el.querySelector(`[data-val="${key}"]`);

      slider.addEventListener("input", e => {
        state[key] = parseFloat(e.target.value);
        valSpan.textContent = fmtFor(kind, state[key]);
        render();
      });

      // Double-click to edit value directly
      valSpan.addEventListener("dblclick", () => {
        const raw = kind === "pct"
          ? (state[key] * 100).toLocaleString("nl-NL", {maximumFractionDigits: 4})
          : String(Math.round(state[key]));
        valSpan.contentEditable = "true";
        valSpan.textContent = raw;
        valSpan.classList.add("editing");
        valSpan.focus();
        const sel = window.getSelection();
        const r2  = document.createRange();
        r2.selectNodeContents(valSpan);
        sel.removeAllRanges();
        sel.addRange(r2);
      });

      function commitEdit() {
        if (valSpan.contentEditable !== "true") return;
        valSpan.contentEditable = "false";
        valSpan.classList.remove("editing");
        const text = valSpan.textContent.replace(/\s/g, "").replace(",", ".");
        let parsed = parseFloat(text);
        if (!isNaN(parsed)) {
          if (kind === "pct") parsed = parsed / 100;
          parsed = Math.min(max, Math.max(min, parsed));
          parsed = Math.round(parsed / step) * step;
          state[key] = parsed;
          slider.value = parsed;
          render();
        }
        valSpan.textContent = fmtFor(kind, state[key]);
      }

      valSpan.addEventListener("blur", commitEdit);
      valSpan.addEventListener("keydown", e => {
        if (e.key === "Enter")  { e.preventDefault(); valSpan.blur(); }
        if (e.key === "Escape") {
          valSpan.contentEditable = "false";
          valSpan.classList.remove("editing");
          valSpan.textContent = fmtFor(kind, state[key]);
        }
      });
    }

    // Wire up info icon
    if (tip) {
      const icon = el.querySelector(".info-icon");
      icon.addEventListener("mouseenter", () => showTooltip(tip, icon));
      icon.addEventListener("mouseleave", hideTooltip);
      icon.addEventListener("focus",      () => showTooltip(tip, icon));
      icon.addEventListener("blur",       hideTooltip);
      // tap on mobile: toggle
      icon.addEventListener("click", e => {
        e.stopPropagation();
        if (tooltip.classList.contains("visible")) { hideTooltip(); }
        else { showTooltip(tip, icon); }
      });
    }
  });

  // Close tooltip on outside click
  document.addEventListener("click", hideTooltip);
}

function syncControls() {
  document.querySelectorAll(".ctrl").forEach(el => {
    const key = el.dataset.key, kind = el.dataset.fmt;
    const input = el.querySelector("input");
    if (kind === "bool") { input.checked = state[key]; return; }
    input.value = state[key];
    el.querySelector(`[data-val="${key}"]`).textContent = fmtFor(kind, state[key]);
  });
}

// ---- Chart ----
let chart;
function renderChart(r) {
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rent = cssv("--rent"), buy = cssv("--buy"), ink = cssv("--ink-soft"), line = cssv("--line");
  const data = {
    labels: r.jaren,
    datasets: [
      { label: "Huur (cumulatief verloren)", data: r.huurCum, borderColor: rent,
        backgroundColor: rent, tension: .25, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6 },
      { label: "Koop: netto kosten (na vermogensopbouw)", data: r.koopNetto, borderColor: buy,
        backgroundColor: buy, tension: .25, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6 },
    ]
  };
  const isMobile = window.innerWidth < 600;
  const opts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: ink, font: { family: "Spline Sans Mono", size: isMobile ? 10 : 12 },
        usePointStyle: true, padding: 12 } },
      tooltip: {
        callbacks: { label: c => `${c.dataset.label}: ${fmtEuro(c.parsed.y)}` },
        titleFont: { family: "Spline Sans Mono" }, bodyFont: { family: "Spline Sans Mono" }
      }
    },
    scales: {
      x: { title: { display: !isMobile, text: "Jaren", color: ink },
           grid: { color: line }, ticks: { color: ink } },
      y: { grid: { color: line },
           ticks: { color: ink, font: { family: "Spline Sans Mono", size: 11 },
             callback: v => "€ " + (v/1000).toLocaleString("nl-NL") + "k" } }
    }
  };
  if (chart) { chart.data = data; chart.update(); }
  else { chart = new Chart(document.getElementById("chart"), { type: "line", data, options: opts }); }

  document.querySelector(".chart-card").style.height = isMobile ? "280px" : "440px";
}

// ---- Verdict ----
function renderVerdict(r) {
  const v = document.getElementById("verdict");
  const n = r.jaren.length;
  const eind = r.verschil[n - 1];
  const koopVoordelig = eind >= 0;
  v.className = "verdict " + (koopVoordelig ? "buy" : "rent");
  const horizon = n;
  let be = r.breakEven
    ? `Het omslagpunt ligt rond <strong>jaar ${r.breakEven}</strong>.`
    : (koopVoordelig
        ? `Kopen is binnen deze horizon al voordeliger.`
        : `Binnen ${horizon} jaar is er nog geen omslagpunt — huren blijft goedkoper.`);
  v.innerHTML = `
    Na <strong>${horizon} jaar</strong> is ${koopVoordelig ? "kopen" : "huren"} voordeliger.
    <span class="big">${koopVoordelig ? "Voordeel kopen" : "Voordeel huren"}: ${fmtEuro(Math.abs(eind))}</span>
    ${be}`;
}

// ---- Table ----
function renderTable(r) {
  const tb = document.querySelector("#table tbody");
  tb.innerHTML = r.jaren.map((j, i) => {
    const d = r.verschil[i];
    const cls = d >= 0 ? "pos" : "neg";
    const be = (j === r.breakEven) ? " class='breakeven'" : "";
    const sign = d >= 0 ? "+" : "−";
    return `<tr${be}>
      <td>${j}</td>
      <td>${fmtEuro(r.huurCum[i])}</td>
      <td>${fmtEuro(r.koopCum[i])}</td>
      <td>${fmtEuro(r.koopNetto[i])}</td>
      <td class="${cls}">${sign} ${fmtEuro(Math.abs(d))}</td>
    </tr>`;
  }).join("");
}

function render() {
  const r = compute(state);
  renderVerdict(r);
  renderTable(r);
  try { if (typeof Chart !== "undefined") renderChart(r); }
  catch (e) { console.error("Chart render failed:", e); }
}

document.getElementById("reset").addEventListener("click", () => {
  Object.assign(state, DEFAULTS);
  syncControls();
  render();
});

buildControls();
render();
