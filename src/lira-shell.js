// Common Lira shell. Reuses existing controls and their command handlers.
const paths = {
  select: "m5 3 14 10-7 1-3 7Z",
  draw: "m4 17 12-12 3 3-12 12-4 1Z M14 7l3 3",
  edit: "M5 5h14v14H5Z M3 3h4v4H3Z M17 17h4v4h-4Z",
  block: "M4 4h12v12H4Z M9 9h12v12H9Z",
  pdf: "M6 3h8l4 4v14H6Z M14 3v5h5 M9 12h6M9 16h6",
  measure: "M3 7v10M21 7v10M3 12h18M7 9l-4 3 4 3m10-6 4 3-4 3",
  layout: "M3 4h18v16H3Z M7 8h10v8H7Z",
  layers: "m3 8 9-5 9 5-9 5Z M3 12l9 5 9-5M3 16l9 5 9-5",
};
function decorate(button, icon, label) {
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[icon]}"/></svg><span>${label}</span>`;
  button.title = label;
  button.setAttribute("aria-label", label);
}
export function initializeLiraShell() {
  const kind = document.body.dataset.liraApp;
  const workspace = document.querySelector("main > .workspace");
  const header = document.querySelector("body > header");
  if (!workspace || !header || kind === "structure") return;
  const rail = document.querySelector(kind === "pdf" ? ".tool-tabs" : ".tabs");
  const ribbon = document.querySelector(".ribbon");
  rail.classList.add("lira-rail");
  if (kind === "pdf") rail.setAttribute("aria-orientation", "vertical");
  ribbon.classList.add("lira-tool-panel");
  ribbon.id ||= "liraToolPanel";
  workspace.append(rail, ribbon);
  const categories = [
    ...rail.querySelectorAll(
      kind === "pdf" ? "[data-category]" : "[data-ribbon]",
    ),
  ];
  const config =
    kind === "pdf"
      ? [
          ["draw", "Rita"],
          ["edit", "Ändra"],
          ["pdf", "PDF"],
          ["measure", "Mått"],
        ]
      : {draw:["draw","Rita"],edit:["edit","Ändra"],block:["block","Block"],dimension:["measure","Mått"],layout:["layout","Layout"]};
  const close = () => {
    ribbon.hidden = true;
    categories.forEach((b) => {
      b.setAttribute("aria-expanded", "false");
      b.classList.remove("lira-open");
    });
  };
  categories.forEach((b, i) => {
    decorate(b, ...(kind==='pdf'?config[i]:config[b.dataset.ribbon]));
    b.setAttribute("aria-controls", ribbon.id);
    b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", () => {
      const wasOpen = b.classList.contains("lira-open");
      close();
      if (!wasOpen) {
        ribbon.hidden = false;
        b.classList.add("lira-open");
        b.setAttribute("aria-expanded", "true");
      }
    });
  });
  let select;
  if (kind === "pdf") {
    select = document.querySelector('[data-tool="select"]');
    const properties = document.querySelector(".properties");
    if (properties) {
      const panel = document.createElement("aside");
      panel.className = "lira-inspector";
      panel.setAttribute("aria-label", "Egenskaper");
      const heading = document.createElement("div");
      heading.className = "inspector-header";
      const title = document.createElement("h1");
      title.textContent = "Egenskaper";
      heading.append(title);
      panel.append(heading, properties);
      document.querySelector("main").append(panel);
    }
    const history = ribbon.querySelector(".history");
    if (history) header.insertBefore(history, document.querySelector("#save"));
    const view = ribbon.querySelector(".viewtools");
    if (view) {
      view.classList.add("lira-footer-view");
      const snap = document.querySelector(
        kind === "pdf" ? "#snap" : "#snap-toggle",
      );
      snap.parentNode.insertBefore(view, snap);
      if (kind === "cad") {
        const zoom = document.querySelector("#zoom-level");
        const minus = document.querySelector("#zoom-out");
        const plus = document.querySelector("#zoom-in");
        view.append(minus, zoom, plus);
      }
    }
    const toggle = ribbon.querySelector("#togglePages");
    if (toggle) header.querySelector(".menu-panel").append(toggle);
  } else {
    select = document.createElement("button");
    select.dataset.command = "SELECT";
    const history = rail.querySelector(".history-buttons");
    if (history) {
      const more = document.createElement("details");
      more.className = "lira-more";
      const summary = document.createElement("summary");
      summary.textContent = "Arkiv";
      more.append(summary, history);
      header.insertBefore(more, header.querySelector(".document-name"));
    }
    const layers = rail.querySelector("#layers-tab");
    if (layers) decorate(layers, "layers", "Lager");
    const help = rail.querySelector("#help-button");
    if (help) header.querySelector(".history-buttons").append(help);
    const view = ribbon.querySelector(".view-tools");
    if (view) {
      view.classList.add("lira-footer-view");
      const snap = document.querySelector(
        kind === "pdf" ? "#snap" : "#snap-toggle",
      );
      snap.parentNode.insertBefore(view, snap);
      if (kind === "cad") {
        const zoom = document.querySelector("#zoom-level");
        const minus = document.querySelector("#zoom-out");
        const plus = document.querySelector("#zoom-in");
        view.append(minus, zoom, plus);
      }
    }
  }
  if (select) {
    decorate(select, "select", "Markera");
    rail.prepend(select);
    select.addEventListener("click", close);
  }
  ribbon.addEventListener("click", (e) => {
    if (e.target.closest("button")) close();
  });
  document.addEventListener("pointerdown", (e) => {
    if (!rail.contains(e.target) && !ribbon.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !ribbon.hidden) {
      const trigger = categories.find((b) => b.classList.contains("lira-open"));
      close();
      trigger?.focus();
    }
  });
  const inspector = document.querySelector("main > aside:not(.page-strip)");
  if (inspector) {
    inspector.id ||= "lira-inspector";
    const toggle = document.createElement("button");
    toggle.className = "lira-inspector-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", inspector.id);
    const update = (collapsed) => {
      document.body.classList.toggle("lira-inspector-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute(
        "aria-label",
        collapsed ? "Öppna inspector" : "Minimera inspector",
      );
      toggle.title = collapsed ? "Öppna inspector" : "Minimera inspector";
      toggle.textContent = collapsed ? "‹" : "›";
      inspector.querySelector(".inspector-header").append(toggle);
      inspector.hidden = false;
      for (const child of inspector.children) {
        if (!child.classList.contains("inspector-header"))
          child.hidden = collapsed;
      }
      window.dispatchEvent(new Event("resize"));
    };
    toggle.addEventListener("click", () =>
      update(!document.body.classList.contains("lira-inspector-collapsed")),
    );
    update(false);
  }
  if (kind === "pdf") {
    const entry = document.querySelector(".command");
    const commandPanel = document.createElement("section");
    commandPanel.className = "lira-command-panel";
    commandPanel.setAttribute("aria-label", "Kommandorad");
    const log = document.createElement("div");
    log.id = "lira-command-log";
    log.setAttribute("role", "log");
    log.setAttribute("aria-label", "Senaste kommandon");
    const label = document.createElement("label");
    label.htmlFor = "command";
    label.textContent = "Kommando";
    entry.insertBefore(label, document.querySelector("#command"));
    commandPanel.append(log, entry);
    document.body.insertBefore(
      commandPanel,
      document.querySelector("body > footer"),
    );
  }
  close();
  window.dispatchEvent(new Event("resize"));
}
