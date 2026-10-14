// UI for the existing ProjectWorkspace. Persistence and session ownership remain there.
export function createProjectTabs({
  document,
  projectWorkspace,
  switchProject,
  prepareProjectSwitch,
  activateProject,
  log,
  focusWorkspace,
}) {
  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#canvas");
  function renderProjectTabs() {
    const tabs = $("#project-tabs");
    const signature = JSON.stringify([
      projectWorkspace.activeId,
      projectWorkspace.entries.map((entry) => [
        entry.id,
        entry.session.document.name,
        entry.saveState,
      ]),
      projectWorkspace.closed.map((entry) => [entry.id, entry.name]),
    ]);
    if (tabs.dataset.state === signature) return;
    const focused = document.activeElement?.dataset.project;
    const revealActive =
      tabs.dataset.activeProject !== projectWorkspace.activeId;
    tabs.replaceChildren(
      ...projectWorkspace.entries.map((entry) => {
        const group = document.createElement("div");
        group.className = "project-tab";
        group.setAttribute("role", "presentation");
        const button = document.createElement("button");
        button.type = "button";
        button.id = "tab-" + entry.id;
        button.dataset.project = entry.id;
        button.textContent = entry.session.document.name || "Namnlös ritning";
        button.title = entry.session.document.name + " · " + entry.saveState;
        button.setAttribute("role", "tab");
        button.setAttribute("aria-controls", "canvas");
        button.setAttribute(
          "aria-selected",
          String(entry.id === projectWorkspace.activeId),
        );
        button.tabIndex = entry.id === projectWorkspace.activeId ? 0 : -1;
        button.onclick = () => switchProject(entry.id);
        const close = document.createElement("button");
        close.type = "button";
        close.className = "close-project";
        close.textContent = "×";
        close.title = "Stäng projektflik";
        close.setAttribute(
          "aria-label",
          "Stäng " + entry.session.document.name,
        );
        close.onclick = async () => {
          if (!prepareProjectSwitch()) return;
          document.body.inert = true;
          try {
            if (await projectWorkspace.close(entry.id))
              activateProject(projectWorkspace.active);
          } catch (error) {
            log("Kunde inte stänga projektfliken: " + error.message);
          } finally {
            document.body.inert = false;
            focusWorkspace();
          }
        };
        group.append(button, close);
        return group;
      }),
    );
    if (projectWorkspace.active)
      canvas.setAttribute(
        "aria-labelledby",
        "tab-" + projectWorkspace.activeId,
      );
    else canvas.removeAttribute("aria-labelledby");
    const reopen = $("#reopen-project");
    reopen.hidden = !projectWorkspace.closed.length;
    reopen.replaceChildren(
      new Option("Återöppna projekt…", ""),
      ...projectWorkspace.closed.map(
        (entry) => new Option(entry.name, entry.id),
      ),
    );
    tabs.dataset.state = signature;
    const active = [...tabs.querySelectorAll('[role="tab"]')].find(
      (button) => button.getAttribute("aria-selected") === "true",
    );
    if (revealActive)
      active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    tabs.dataset.activeProject = projectWorkspace.activeId || "";
    if (focused)
      [...tabs.querySelectorAll("[data-project]")]
        .find((button) => button.dataset.project === focused)
        ?.focus();
  }
  $("#new-project-tab").onclick = () => $("#new-file").click();
  $("#empty-new").onclick = () => {
    $("#new-file").click();
    focusWorkspace();
  };
  $("#empty-open").onclick = () => $("#open-file").click();
  $("#reopen-project").onchange = async (event) => {
    const id = event.target.value;
    event.target.value = "";
    if (!id || !prepareProjectSwitch()) return;
    document.body.inert = true;
    try {
      const entry = await projectWorkspace.reopen(id);
      if (entry) activateProject(entry);
    } catch (error) {
      log("Kunde inte återöppna projektet: " + error.message);
    } finally {
      document.body.inert = false;
      focusWorkspace();
    }
  };
  $("#project-tabs").onkeydown = (event) => {
    if (
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) ||
      !event.target.dataset.project
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const entries = projectWorkspace.entries,
      index = entries.findIndex(
        (entry) => entry.id === event.target.dataset.project,
      );
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? entries.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + entries.length) %
            entries.length;
    switchProject(entries[next].id);
    [...$("#project-tabs").querySelectorAll("[data-project]")]
      .find((button) => button.dataset.project === projectWorkspace.activeId)
      ?.focus();
  };

  return { render: renderProjectTabs };
}
