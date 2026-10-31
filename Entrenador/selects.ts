// Keep the native form control, labels, validation and change events. Only its
// visual presentation and popup are enhanced; assistive input can still set it.
let opened: { select: HTMLSelectElement; menu: HTMLElement; active: number } | null = null;
const enhanced = new WeakSet<HTMLSelectElement>();
let sequence = 0;
let search = '', searchedAt = 0;

export function syncSelect(select: HTMLSelectElement): void {
  const display = select.parentElement?.querySelector('.select-value');
  if (display) display.textContent = select.selectedOptions[0]?.textContent || 'Elige una opción';
}
function close(): void {
  if (!opened) return;
  const current = opened;
  opened = null; search = '';
  current.select.setAttribute('aria-expanded', 'false');
  current.select.removeAttribute('aria-controls');
  current.select.removeAttribute('aria-activedescendant');
  current.menu.remove();
}
function position(): void {
  if (!opened) return;
  const rect = opened.select.parentElement!.getBoundingClientRect();
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
  const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
  if (rect.bottom < top || rect.top > top+height || rect.right < left || rect.left > left+width) { close(); return; }
  const menu = opened.menu;
  const below = top + height - rect.bottom - 16, above = rect.top - top - 16;
  const up = below < 200 && above > below;
  const available = Math.max(48, Math.min(340, up ? above : below));
  menu.style.width = `${Math.min(Math.max(rect.width, 240), width - 24)}px`;
  menu.style.maxHeight = `${available}px`;
  menu.style.left = `${Math.max(left + 12, Math.min(rect.left, left + width - menu.offsetWidth - 12))}px`;
  menu.style.top = `${up ? Math.max(top + 12, rect.top - menu.offsetHeight - 6) : rect.bottom + 6}px`;
}
function activate(index: number): void {
  if (!opened) return;
  opened.active = index;
  for (const option of opened.menu.children) option.classList.toggle('is-active', Number((option as HTMLElement).dataset.index) === index);
  const target = opened.menu.querySelector<HTMLElement>(`[data-index="${index}"]`);
  if (target) {
    opened.select.setAttribute('aria-activedescendant', target.id);
    opened.menu.setAttribute('aria-activedescendant', target.id);
    target.scrollIntoView({ block: 'nearest' });
  }
}
function choose(index: number): void {
  if (!opened) return;
  const select = opened.select;
  if (select.options[index]?.disabled || select.matches(':disabled')) return;
  const changed = select.selectedIndex !== index;
  close(); select.focus({preventScroll:true}); select.selectedIndex = index; syncSelect(select);
  if (changed) {
    select.dispatchEvent(new Event('input', {bubbles:true}));
    select.dispatchEvent(new Event('change', {bubbles:true}));
  }
}
function open(select: HTMLSelectElement): void {
  if (select.matches(':disabled')) return;
  close(); select.focus({preventScroll:true});
  const menu = document.createElement('div'); menu.className = 'select-menu';
  menu.tabIndex = 0;
  menu.onkeydown = event => {
    const forwarded = new KeyboardEvent('keydown',{key:event.key,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey,shiftKey:event.shiftKey,cancelable:true});
    if (!select.dispatchEvent(forwarded)) event.preventDefault();
  };
  menu.onblur = event => { if (event.relatedTarget !== select && !menu.contains(event.relatedTarget as Node)) close(); };
  menu.id = `select-menu-${++sequence}`; menu.setAttribute('role','listbox');
  const label = select.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
  label?.querySelectorAll('select,.select-control,.difficulty-note').forEach(node=>node.remove());
  menu.setAttribute('aria-label', select.getAttribute('aria-label') || label?.textContent?.trim() || 'Opciones');
  for (const [index, option] of [...select.options].entries()) {
    const item = document.createElement('div'); item.className = 'select-option';
    item.id = `${menu.id}-${index}`; item.dataset.index = String(index);
    item.setAttribute('role','option'); item.setAttribute('aria-selected',String(option.selected));
    if (option.disabled) item.setAttribute('aria-disabled','true');
    item.textContent = option.textContent;
    item.onpointerdown = event => event.preventDefault();
    item.onpointerup = event => { if (event.pointerType === 'touch') {event.preventDefault(); choose(index);} };
    item.onclick = () => choose(index);
    menu.append(item);
  }
  document.body.append(menu); opened = {select,menu,active:select.selectedIndex};
  select.setAttribute('aria-controls', menu.id); select.setAttribute('aria-expanded','true');
  position(); activate(select.selectedIndex);
}
function enhance(select: HTMLSelectElement): void {
  if (enhanced.has(select) || select.multiple || select.size > 1) return;
  enhanced.add(select);
  const wrapper = document.createElement('span'); wrapper.className = 'select-control';
  const value = document.createElement('span'); value.className = 'select-value'; value.setAttribute('aria-hidden','true');
  select.before(wrapper); wrapper.append(select,value); syncSelect(select);
  select.setAttribute('aria-expanded','false');
  let touchedAt = -1000;
  select.addEventListener('pointerdown', event=> { if (!select.matches(':disabled')) { event.preventDefault(); select.focus({preventScroll:true}); } });
  select.addEventListener('pointerup', event=> {
    if (event.pointerType !== 'touch') return;
    event.preventDefault(); touchedAt = performance.now();
    if (opened?.select === select) close(); else open(select);
  });
  select.addEventListener('mousedown', event=>event.preventDefault());
  select.addEventListener('click', event=> { event.preventDefault(); if (performance.now()-touchedAt<600) return; if (opened?.select === select) close(); else open(select); });
  select.addEventListener('blur', event=> { if (opened?.select === select && !opened.menu.contains(event.relatedTarget as Node)) close(); });
  select.addEventListener('keydown', event=> {
    if (event.ctrlKey || event.metaKey || select.matches(':disabled')) return;
    const isOpen = opened?.select === select;
    if (event.key === 'Escape') { if (isOpen) {event.preventDefault(); close();} return; }
    if (event.key === 'Tab') { if (isOpen) choose(opened!.active); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (isOpen) choose(opened!.active); else open(select); return;
    }
    const options = [...select.options].map((option,index)=>({option,index})).filter(({option})=>!option.disabled);
    if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
      event.preventDefault(); if (!isOpen) {open(select); if (event.key.startsWith('Arrow')) return;}
      const current = options.findIndex(o=>o.index === opened!.active);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length-1 : Math.max(0,Math.min(options.length-1,current+(event.key === 'ArrowDown'?1:-1)));
      if (options[next]) activate(options[next].index); return;
    }
    if (event.key.length === 1 && !event.altKey) {
      event.preventDefault(); if (!isOpen) open(select);
      const now = Date.now(); search = now-searchedAt>700 ? event.key : search+event.key; searchedAt=now;
      const term = search.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
      const found = options.find(({option})=>option.textContent?.trim().normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().startsWith(term));
      if (found) activate(found.index);
    }
  });
}
function scan(root: ParentNode): void { root.querySelectorAll<HTMLSelectElement>('select').forEach(enhance); }
scan(document);
new MutationObserver(records=> {
  if (opened && !opened.select.isConnected) close();
  for (const record of records) for (const node of record.addedNodes) {
    if (node instanceof HTMLSelectElement) enhance(node);
    else if (node instanceof HTMLElement && node.querySelector('select')) scan(node);
  }
}).observe(document.body,{childList:true,subtree:true});
document.addEventListener('change', event=> { if (event.target instanceof HTMLSelectElement) syncSelect(event.target); },true);
document.addEventListener('pointerdown', event=> {
  if (opened && !opened.menu.contains(event.target as Node) && !opened.select.parentElement!.contains(event.target as Node)) close();
},true);
document.addEventListener('scroll', event=> { if (opened && !opened.menu.contains(event.target as Node)) position(); },true);
window.addEventListener('resize',position);
window.visualViewport?.addEventListener('resize',position);
window.addEventListener('hashchange',close);
