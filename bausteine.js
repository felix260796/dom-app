/* Textbausteine zum Anhaken (Wunsch Felix, Version 86). Gleiches Muster für Angebot und Rechnung:
   oben die Anfangstexte, dann der Inhalt, dann die Schlusstexte. Jeder Teil ist ein aufklappbarer Block:
   aufklappen, anhaken, was im Dokument stehen soll, wieder zuklappen.

   Ein Baustein: { id, wo: 'vor' | 'nach', titel, text, aus }. aus = true: steht nicht im Dokument.
   Feste Zusätze (z. B. Gruß mit Unterschrift): { k, label, sub, an }.

   Aufruf:
     html += Bausteine.block({ wo: 'vor', titel: 'Anfangstexte', liste, fest: [], leer: 'Kein Text' });
     Bausteine.bind(main(), { liste, speichern: async () => …, bearbeiten: () => …, fest: async (k, an) => … });
   Texte ändern, Reihenfolge und eigene Texte laufen über „bearbeiten“ (im Angebot: Angebot._intern.texteAuftrag). */
window.Bausteine = (() => {
  const kurz = (b) => String(b.text || '').replace(/\s+/g, ' ').trim();
  const name = (b) => String(b.titel || '').trim() || kurz(b).slice(0, 40) || 'Leerer Text';
  const teil = (liste, wo) => liste.filter((b) => (b.wo === 'vor') === (wo === 'vor'));

  function block({ wo, titel, liste, fest = [], leer = 'Kein Text', offen = false }) {
    const l = teil(liste, wo);
    const sub = [...l.filter((b) => !b.aus).map(name), ...fest.filter((f) => f.an).map((f) => f.label)].join(' · ') || leer;
    return `<details class="more card bs" data-bsblock="${wo}" data-bsleer="${esc(leer)}" ${offen ? 'open' : ''}><summary>${icon('edit')}<span>${esc(titel)}<small data-bssub>${esc(sub)}</small></span>${icon('chevron', 'more-chev')}</summary>
      <p class="hint" style="margin:8px 0">Anhaken, was im Dokument stehen soll. Danach wieder zuklappen.</p>
      ${l.map((b) => `<label class="check wv bs-z"><input type="checkbox" data-bs="${esc(b.id)}" ${b.aus ? '' : 'checked'}><span><b>${esc(name(b))}</b>${String(b.titel || '').trim() && kurz(b) ? `<small>${esc(kurz(b).slice(0, 90))}${kurz(b).length > 90 ? ' …' : ''}</small>` : ''}</span></label>`).join('')}
      ${fest.map((f) => `<label class="check wv bs-z"><input type="checkbox" data-bsfest="${esc(f.k)}" ${f.an ? 'checked' : ''}><span><b>${esc(f.label)}</b>${f.sub ? `<small>${esc(f.sub)}</small>` : ''}</span></label>`).join('')}
      <button type="button" class="link-add" data-bsedit="${wo}">${icon('edit')} Texte ändern, Reihenfolge, eigener Text</button></details>`;
  }

  /** Zeile unter der Überschrift: was gerade angehakt ist. */
  function zeile(blockEl) {
    const an = $$('input[type="checkbox"]', blockEl).filter((c) => c.checked).map((c) => $('b', c.closest('label')).textContent);
    $('[data-bssub]', blockEl).textContent = an.join(' · ') || blockEl.dataset.bsleer || '';
  }

  function bind(box, { liste, speichern, bearbeiten, fest }) {
    $$('[data-bs]', box).forEach((c) => (c.onchange = async () => {
      const b = liste.find((x) => String(x.id) === c.dataset.bs);
      if (!b) return;
      if (c.checked) delete b.aus; else b.aus = true;
      zeile(c.closest('[data-bsblock]'));
      await speichern?.();
    }));
    $$('[data-bsfest]', box).forEach((c) => (c.onchange = async () => { zeile(c.closest('[data-bsblock]')); await fest?.(c.dataset.bsfest, c.checked); }));
    $$('[data-bsedit]', box).forEach((b) => (b.onclick = () => bearbeiten?.(b.dataset.bsedit)));
  }

  return { block, bind, teil };
})();
