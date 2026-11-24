import { iconMarkup } from './icons';
import { HarvestJournal, harvestMeasurement } from './harvest';

// This view reads observations only; it has no access to hidden environmental traits.
export function createFieldNotes(journal: HarvestJournal, flowers: { id: string; name: string; icon: string }[], qualities: { name: string; icon: string }[]) {
  const panel = document.querySelector<HTMLElement>('#field-notes')!;
  panel.innerHTML = `<div class="notes-scroll" tabindex="0" aria-label="Field notes contents"><div class="notes-content"><div class="menu-heading"><h1>Field notes</h1></div>
    <div class="notes-controls"><div class="notes-buttons" role="group" aria-label="Flower">${flowers.map((f, i) => `<button type="button" class="notes-choice" data-flower="${f.id}" aria-label="${f.name}" title="${f.name}" aria-pressed="${i === 0}"><img src="${f.icon}" alt=""></button>`).join('')}</div>
    <div class="notes-buttons" role="group" aria-label="Measurement"><button type="button" class="notes-choice" data-metric="quality" aria-pressed="true">${`<img src="${qualities[1].icon}" alt="">`}<span>Quality</span></button><button type="button" class="notes-choice" data-metric="growth" aria-pressed="false">${iconMarkup('clock')}<span>Growth time</span></button></div>
    <div class="notes-buttons notes-filter" role="group" aria-label="Harvest filter"><button type="button" class="notes-choice" id="notes-natural" aria-pressed="false" title="Exclude harvests affected by heat, nutrients, fertilizer, or Selective Breeding">Unboosted harvests only</button></div></div>
    <p class="notes-caption">Picked results only · blank cells are unobserved. Growth is timed until ripe, including the initial cycle and its starting progress.</p>
    <div class="notes-axis">Elevation ↑ · Watering →</div><div class="notes-map" id="notes-map"></div>
    <p id="notes-total"></p>
    <div id="notes-detail" aria-live="polite"></div>
    <p class="notes-caption">Green: more improved flowers, or faster growth. Red: fewer improved flowers, or slower growth. Faint cells have fewer samples. Quality counts individual rolls, including overgrowth; growth time counts one cycle per crop. Unboosted excludes heat, nutrients, fertilizer and selective breeding. Observations last for this session.</p></div></div>
    <button type="button" class="notes-scroll-cue" aria-label="Scroll field notes down" hidden><svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`;
  const scroller = panel.querySelector<HTMLElement>('.notes-scroll')!;
  const scrollCue = panel.querySelector<HTMLButtonElement>('.notes-scroll-cue')!;
  function updateScrollCue() {
    const more = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 3;
    panel.classList.toggle('has-more', more);
    scrollCue.hidden = !more;
  }
  scroller.addEventListener('scroll', updateScrollCue, { passive: true });
  scrollCue.addEventListener('click', () => scroller.scrollBy({ top: scroller.clientHeight * .65, behavior: 'smooth' }));
  const resizeObserver = new ResizeObserver(updateScrollCue);
  resizeObserver.observe(scroller);
  resizeObserver.observe(panel.querySelector('.notes-content')!);
  let flower = flowers[0].id;
  let metric: 'quality' | 'growth' = 'quality';
  const natural = panel.querySelector<HTMLButtonElement>('#notes-natural')!;
  let unboostedOnly = false;
  const grid = panel.querySelector<HTMLElement>('#notes-map')!;
  const detail = panel.querySelector<HTMLElement>('#notes-detail')!;
  let selected: [number, number] | undefined;
  function render() {
    requestAnimationFrame(updateScrollCue);
    let total = 0;
    let timed = 0;
    let html = '<span></span>' + Array.from({ length: 10 }, (_, m) => `<span class="notes-tick">${m * 10}%</span>`).join('');
    for (let e = 9; e >= 0; e--) {
      html += `<span class="notes-tick">${e * 10}–${(e + 1) * 10}%</span>`;
      for (let m = 0; m < 10; m++) {
        const stats = journal.get(flower, e, m, unboostedOnly);
        total += stats?.count ?? 0;
        timed += stats?.growthCount ?? 0;
        const { count, unit, value } = harvestMeasurement(stats, metric);
        const intensity = value === undefined ? 0 : metric === 'growth' ? Math.max(0, Math.min(1, (15 - value) / 12)) : Math.min(1, value / .3);
        const color = value === undefined ? '#1a241e' : `hsl(${intensity * 120} 65% 35%)`;
        const label = value === undefined ? '—' : metric === 'growth' ? `${value.toFixed(1)}s` : `${(value * 100).toFixed(0)}%`;
        html += `<button type="button" class="notes-cell" data-e="${e}" data-m="${m}" style="background:${color};opacity:${count ? .5 + .5 * Math.min(1, count / 20) : 1}" aria-label="Elevation ${e * 10} to ${(e + 1) * 10}%, watering ${m * 10} to ${(m + 1) * 10}%, ${label}, ${count} ${unit}" aria-pressed="${selected?.[0] === e && selected?.[1] === m}"><span>${label}</span><small>${count ? `${count} ${unit}` : ''}</small></button>`;
      }
    }
    grid.innerHTML = html;
    panel.querySelector('#notes-total')!.textContent = `${total} flowers picked · ${timed} growth cycles measured`;
    if (!selected) { detail.textContent = 'Select a cell to inspect its harvests.'; return; }
    const [e, m] = selected;
    const stats = journal.get(flower, e, m, unboostedOnly);
    detail.innerHTML = `<b>Elevation ${e * 10}–${(e + 1) * 10}% · Watering ${m * 10}–${(m + 1) * 10}%</b>` +
      (!stats?.count ? '<p>No matching harvests recorded.</p>' : `<p>${stats.count} picked · ${stats.growthCount ? `${(stats.growthSeconds / stats.growthCount).toFixed(2)}s mean regrowth (${stats.growthCount} cycles)` : 'No growth measured'}</p><div class="notes-qualities">${qualities.map((q, i) => `<span><img src="${q.icon}" alt="${q.name}">${stats.qualities[i]} <small>(${(stats.qualities[i] / stats.count * 100).toFixed(1)}%)</small></span>`).join('')}</div>`);
  }
  grid.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-e]');
    if (target) { selected = [Number(target.dataset.e), Number(target.dataset.m)]; render(); }
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-flower], [data-metric]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.flower) flower = button.dataset.flower;
      if (button.dataset.metric === 'quality' || button.dataset.metric === 'growth') metric = button.dataset.metric;
      panel.querySelectorAll<HTMLButtonElement>('[data-flower], [data-metric]').forEach(choice => {
        choice.setAttribute('aria-pressed', String(choice.dataset.flower ? choice.dataset.flower === flower : choice.dataset.metric === metric));
      });
      render();
    });
  });
  natural.addEventListener('click', () => {
    unboostedOnly = !unboostedOnly;
    natural.setAttribute('aria-pressed', String(unboostedOnly));
    render();
  });
  return render;
}
