import { createImportPackage } from './import-package.js';

export function createImportDialog({ document, download }) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#import-dialog');
  let current;
  function expand(value) {
    $('#import-details').hidden = !value;
    dialog.classList.toggle('expanded', value);
    $('#toggle-import-details').textContent = value ? 'Visa mindre' : 'Visa detaljer';
    $('#toggle-import-details').setAttribute('aria-expanded', String(value));
  }
  $('#toggle-import-details').onclick = () => expand($('#import-details').hidden);
  $('#close-import').onclick = $('#dismiss-import').onclick = () => dialog.close();
  $('#last-import').onclick = () => { expand(false); if (!dialog.open) dialog.showModal(); };
  $('#save-import-package').onclick = async () => {
    const button = $('#save-import-package'), session = current;
    button.disabled = true;
    $('#import-package-status').textContent = 'Skapar paket…';
    try {
      const blob = await createImportPackage(session, $('#include-import-file').checked);
      download(session.file.name.replace(/\.[^.]+$/, '') + '-felsokning.zip', blob, 'application/zip');
      if (current === session) $('#import-package-status').textContent = 'Paketet är klart för nedladdning.';
    } catch (error) {
      if (current === session) $('#import-package-status').textContent = `Kunde inte spara paketet: ${error.message}`;
    } finally { button.disabled = false; }
  };
  function show(session) {
    current = session;
    const format = /\.dwg$/i.test(session.file.name) ? 'DWG' : 'DXF';
    const failed = !!session.error;
    const issues = session.issues;
    expand(false);
    dialog.classList.toggle('failed', failed);
    $('#import-title').textContent = failed ? `${format} kunde inte öppnas` : `${format} öppnad`;
    $('#import-icon').textContent = failed ? '!' : '✓';
    $('#import-filename').textContent = session.file.name;
    $('#import-status').textContent = failed ? session.error.message : issues.length ? issues.length === 1 ? '1 typ av avvikelse hittades.' : `${issues.length} typer av avvikelser hittades.` : 'Inga kända importavvikelser hittades.';
    $('#import-status').classList.toggle('has-issues', !!issues.length);
    $('#import-summary').textContent = failed ? 'Importen avbröts. Spara underlaget för felsökning.' : `${session.count.toLocaleString('sv-SE')} objekt inlästa. Vissa objekt kan se annorlunda ut om avvikelser hittades.`;
    $('#import-issues').replaceChildren(...issues.map(item => {
      const li = document.createElement('li');
      li.textContent = `${item.message} (${item.count})`;
      return li;
    }));
    $('#import-log').textContent = JSON.stringify({ ...session, file: { name: session.file.name, size: session.file.size } }, null, 2);
    for (const details of dialog.querySelectorAll('details')) details.open = false;
    $('#include-import-file').checked = true;
    $('#include-import-label').textContent = `Inkludera original-${format}`;
    $('#import-package-status').textContent = '';
    $('#close-import').textContent = failed ? 'Stäng' : 'Fortsätt till ritningen';
    $('#last-import').hidden = false;
    if (!dialog.open) dialog.showModal();
  }
  return { show };
}
