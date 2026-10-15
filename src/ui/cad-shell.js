const icons = {
  properties: '<path d="M4 6h16M4 12h16M4 18h16M9 3v6M15 9v6M8 15v6"/>',
  catalog: '<path d="m12 3 9 5v8l-9 5-9-5V8Z M3 8l9 5 9-5M12 13v8"/>',
  references: '<path d="M8 3h12v15H8Z M4 7v14h12M11 7h6M11 11h6"/>',
  layers: '<path d="m3 8 9-5 9 5-9 5Z M3 12l9 5 9-5M3 16l9 5 9-5"/>',
};

// Adopt existing controls. Their actions, IDs and transaction owners stay intact.
export function installCadShell({ document, onResize }) {
  const $ = (selector) => document.querySelector(selector);
  document.body.classList.add("cad-workspace");
  const header = $("body > header");
  const menu = document.createElement("details");
  menu.className = "cad-file-menu";
  menu.innerHTML =
    '<summary>Arkiv <span aria-hidden="true">⌄</span></summary><div class="cad-file-commands"></div>';
  const commands = menu.lastElementChild;
  for (const id of [
    "new-file",
    "open-file",
    "save-file",
    "export-dxf",
    "demo-file",
    "help-button",
    "install-app",
    "update-app",
  ])
    commands.append($("#" + id));
  header.prepend(menu);
  const history = $(".history-buttons");
  header.insertBefore(history, $(".file-actions"));
  history.querySelector(".divider")?.remove();
  menu.addEventListener("click", (event) => {
    if (event.target.closest("button")) menu.open = false;
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      menu.firstElementChild.focus();
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    menu.open = true;
    const buttons = [...commands.querySelectorAll("button")].filter(
      (button) => !button.hidden && !button.disabled,
    );
    const index = buttons.indexOf(document.activeElement);
    buttons[
      (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
        buttons.length
    ]?.focus();
  });
  // Open files span the full window; model/layout tabs stay with the drawing.
  $("main").before($(".project-bar"));
  $(".project-bar").setAttribute("aria-label", "Öppna ritningar");
  const inspector = $("main > aside");
  inspector.classList.add("cad-inspector");
  const rail = $(".inspector-tabs");
  const content = document.createElement("div");
  content.className = "inspector-content";
  for (const child of [...inspector.children])
    if (child !== rail) content.append(child);
  inspector.append(content, rail);
  rail.setAttribute("aria-orientation", "vertical");
  for (const name of ["properties", "catalog", "references"]) {
    const button = $("#" + name + "-tab");
    const label = button.textContent;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg><span class="sr-only">${label}</span>`;
  }
  const layers = $("#layers-tab");
  layers.title = "Lager";
  layers.setAttribute("aria-label", "Lager");
  layers.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons.layers}</svg>`;
  // Layers is an action, not a panel tab.
  const actions = document.createElement("div");
  actions.className = "inspector-rail-actions";
  actions.append(layers);
  rail.after(actions);
  const toggle = document.createElement("button");
  toggle.className = "inspector-collapse";
  toggle.type = "button";
  toggle.textContent = "›";
  toggle.title = "Minimera inspektor";
  toggle.setAttribute("aria-label", "Minimera inspektor");
  content.id = "inspector-content";
  toggle.setAttribute("aria-controls", content.id);
  toggle.setAttribute("aria-expanded", "true");
  actions.append(toggle);
  toggle.onclick = () => {
    const collapsed = document.body.classList.toggle("inspector-collapsed");
    content.hidden = collapsed;
    toggle.textContent = collapsed ? "‹" : "›";
    toggle.title = collapsed ? "Öppna inspektor" : "Minimera inspektor";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    onResize();
  };
  rail.addEventListener("click", (event) => {
    if (event.target.closest('[role="tab"]') && content.hidden) toggle.click();
  });
  document.addEventListener("pointerdown", (event) => {
    document.querySelectorAll(".color-dropdown[open]").forEach((dropdown) => {
      if (!dropdown.contains(event.target)) dropdown.open = false;
    });
  });
}
