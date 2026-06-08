// app.js — UI wiring: build sliders, render chart & table, recompute live.

const state = Object.assign({}, DEFAULTS);

const fmtEuro  = v => "€ " + Math.round(v).toLocaleString("nl-NL");
const fmtEuro0 = v => "€ " + Math.round(v).toLocaleString("nl-NL");
const fmtPct   = v => (v * 100).toLocaleString("nl-NL", {maximumFractionDigits: 2}) + " %";
const fmtJaar  = v => v + (v === 1 ? " jaar" : " jaar");

function fmtFor(kind, v) {
  if (kind === "euro" || kind === "euro0") return fmtEuro(v);
  if (kind === "pct") return fmtPct(v);
  if (kind === "jaar") return fmtJaar(v);
  return v;
}

// ---- Build controls ----
function buildControls() {
  document.querySelectorAll(".ctrl").forEach(el => {
    const key = el.dataset.key;
    const kind = el.dataset.fmt;

    if (kind === "bool") {
      el.classList.add("toggle");
      el.innerHTML = `
        <label class="switch">
          <input type="checkbox" ${state[key] ? "checked" : ""}>
          <span class="track"></span>
          <span>${LABELS[key]}</span>
        </label>`;
      el.querySelector("input").addEventListener("change", e => {
        state[key] = e.target.checked;
        render();
      });
      return;
    }

    const min = parseFloat(el.dataset.min);
    const max = parseFloat(el.dataset.max);
    const step = parseFloat(el.dataset.step);
    el.innerHTML = `
      <div class="row">
        <label>${LABELS[key]}</label>
        <span class="val" data-val="${key}" title="Dubbelklik om te bewerken">${fmtFor(kind, state[key])}</span>
      </div>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${state[key]}">`;

    const slider = el.querySelector("input[type=range]");
    const valSpan = el.querySelector(`[data-val="${key}"]`);

    slider.addEventListener("input", e => {
      state[key] = parseFloat(e.target.value);
      valSpan.textContent = fmtFor(kind, state[key]);
      render();
    });

    valSpan.addEventListener("dblclick", () => {
      const raw = kind === "pct"
        ? (state[key] * 100).toLocaleString("nl-NL", {maximumFractionDigits: 4})
        : String(Math.round(state[key]));
      valSpan.contentEditable = "true";
      valSpan.textContent = raw;
      valSpan.classList.add("editing");
      valSpan.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(valSpan);
      sel.removeAllRanges();
      sel.addRange(range);
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
      if (e.key === "Enter") { e.preventDefault(); valSpan.blur(); }
      if (e.key === "Escape") {
        valSpan.contentEditable = "false";
        valSpan.classList.remove("editing");
        valSpan.textContent = fmtFor(kind, state[key]);
      }
    });
  });
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
  const opts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: ink, font: { family: "Spline Sans Mono", size: 12 }, usePointStyle: true, padding: 16 } },
      tooltip: {
        callbacks: { label: c => `${c.dataset.label}: ${fmtEuro(c.parsed.y)}` },
        titleFont: { family: "Spline Sans Mono" }, bodyFont: { family: "Spline Sans Mono" }
      }
    },
    scales: {
      x: { title: { display: true, text: "Jaren", color: ink }, grid: { color: line }, ticks: { color: ink } },
      y: { grid: { color: line },
        ticks: { color: ink, font: { family: "Spline Sans Mono", size: 11 },
          callback: v => "€ " + (v/1000).toLocaleString("nl-NL") + "k" } }
    }
  };
  if (chart) { chart.data = data; chart.options.plugins.title = undefined; chart.update(); }
  else { chart = new Chart(document.getElementById("chart"), { type: "line", data, options: opts }); }

  const card = document.querySelector(".chart-card");
  card.style.height = "440px";
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
  try {
    if (typeof Chart !== "undefined") renderChart(r);
  } catch (e) {
    console.error("Chart render failed:", e);
  }
}

document.getElementById("reset").addEventListener("click", () => {
  Object.assign(state, DEFAULTS);
  syncControls();
  render();
});

buildControls();
render();
