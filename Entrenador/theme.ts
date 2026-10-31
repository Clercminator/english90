import { syncSelect } from './selects';

export const THEME_KEY = 'english90-theme';
type Theme = 'system' | 'light' | 'dark';
const system = matchMedia('(prefers-color-scheme: dark)');
let preference: Theme = 'system';
function read(): Theme {
  try { const value = localStorage.getItem(THEME_KEY); return value === 'dark' || value === 'light' ? value : 'system'; }
  catch { return 'system'; }
}
function apply(): void {
  const dark = preference === 'dark' || (preference === 'system' && system.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101b24' : '#142b41');
  const select = document.getElementById('themeChoice') as HTMLSelectElement | null;
  if (select) { select.value = preference; syncSelect(select); }
}
preference = read(); apply();
system.addEventListener('change', apply);
window.addEventListener('storage', event => { if (event.key === THEME_KEY || event.key === null) { preference = read(); apply(); } });
const host = document.querySelector('.head-inner');
if (host) {
  const label = document.createElement('label'); label.className = 'theme-choice';
  label.innerHTML = 'Tema<select id="themeChoice" aria-label="Tema del sitio"><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Oscuro</option></select>';
  host.append(label); apply();
  label.querySelector('select')!.onchange = event => {
    preference = (event.target as HTMLSelectElement).value as Theme; apply();
    try { localStorage.setItem(THEME_KEY, preference); } catch { /* The theme still works for this page when storage is blocked. */ }
  };
}
