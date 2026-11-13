// Device showcase: renders the live FitNova app in a phone/tablet frame at true CSS resolution.
const DEVICES = [
  { id: "iphone", name: "iPhone 15 Pro", w: 393, h: 852, notch: "island" },
  { id: "pixel", name: "Pixel 8", w: 412, h: 915, notch: "punch" },
  { id: "galaxy", name: "Galaxy S24", w: 360, h: 780, notch: "punch" },
  { id: "ipad", name: "iPad mini", w: 744, h: 1133, notch: null, tablet: true },
];
const SCREENS = [["Home", "/"], ["Create", "/create"], ["Workouts", "/workouts"], ["Progress", "/progress"], ["Vitals", "/vitals"], ["About", "/about"]];

let device = DEVICES[0];
let frame;

const $ = (s) => document.querySelector(s);
const clock = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "");

function build() {
  const currentHash = frame ? (() => { try { return frame.contentWindow.location.hash; } catch { return "#/"; } })() : "#/";
  const stage = $("#stage");
  const statusH = device.tablet ? 28 : 44;
  stage.innerHTML = `
    <div class="device ${device.tablet ? "tablet" : ""}">
      <div class="screen" style="width:${device.w}px;height:${device.h}px">
        ${device.notch === "island" ? '<div class="island"></div>' : device.notch === "punch" ? '<div class="punch"></div>' : ""}
        <div class="statusbar"><span id="clock">${clock()}</span>
          <span class="icons">
            <svg viewBox="0 0 17 12" fill="#fff"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="4.5" y="5.5" width="3" height="6.5" rx="1"/><rect x="9" y="3" width="3" height="9" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1"/></svg>
            <svg viewBox="0 0 26 12" fill="none" stroke="#fff" style="width:25px"><rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke-opacity=".5"/><rect x="2" y="2" width="16" height="8" rx="2" fill="#fff" stroke="none"/><path d="M24.5 4v4" stroke-linecap="round" stroke-opacity=".5"/></svg>
          </span></div>
        <iframe id="app" title="FitNova on ${device.name}" src="/${currentHash || "#/"}" style="height:${device.h - statusH}px"></iframe>
        ${device.tablet ? "" : '<div class="homebar"></div>'}
      </div>
    </div>`;
  frame = $("#app");
  // Phones use overlay scrollbars: hide the desktop scrollbar inside the device (same-origin frame).
  frame.addEventListener("load", () => {
    try {
      const st = frame.contentDocument.createElement("style");
      st.textContent = "html{scrollbar-width:none}::-webkit-scrollbar{width:0;height:0}";
      frame.contentDocument.head.appendChild(st);
    } catch { /* cross-origin: leave as is */ }
  });
  $("#caption").textContent = `${device.name} · ${device.w} × ${device.h} CSS px`;
  fit();
}

function fit() {
  const main = $("#main");
  const dev = $(".device");
  if (!dev) return;
  const s = Math.min(1, (main.clientHeight - (innerWidth <= 760 ? 60 : 110)) / dev.offsetHeight, (main.clientWidth - 40) / dev.offsetWidth);
  $("#stage").style.transform = `scale(${s})`;
  const box = $("#stage-box");
  box.style.width = `${dev.offsetWidth * s}px`;
  box.style.height = `${dev.offsetHeight * s}px`;
}

function renderControls() {
  $("#devices").innerHTML = DEVICES.map((d) => `<button data-d="${d.id}" class="${d === device ? "on" : ""}">${d.name}<small>${d.w}×${d.h}</small></button>`).join("");
  $("#screens").innerHTML = SCREENS.map(([n, p]) => `<button data-s="${p}">${n}</button>`).join("");
}

document.addEventListener("click", (e) => {
  const d = e.target.closest("[data-d]");
  if (d) { device = DEVICES.find((x) => x.id === d.dataset.d); renderControls(); build(); return; }
  const s = e.target.closest("[data-s]");
  if (s && frame) { frame.contentWindow.location.hash = "#" + s.dataset.s; return; }
});
$("#reload").addEventListener("click", () => frame && frame.contentWindow.location.reload());
$("#open").addEventListener("click", () => { let h = "#/"; try { h = frame.contentWindow.location.hash; } catch {} window.open("/" + h, "_blank"); });
window.addEventListener("resize", fit);
setInterval(() => { const c = $("#clock"); if (c) c.textContent = clock(); }, 15000);

renderControls();
build();
