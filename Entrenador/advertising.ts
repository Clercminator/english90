import type { createAds } from './ads';

declare const __ADS_ENABLED__: boolean;
type Placement = 'home' | 'article' | null;

// Vite replaces this flag at build time. Disabled builds never import the ad module.
export function connectAdvertising() {
  let placement: Placement = null;
  let controller: ReturnType<typeof createAds> | undefined;
  if (__ADS_ENABLED__) {
    void Promise.all([import('./ads'), import('./config')]).then(([{ createAds }, { siteConfig }]) => {
      const footer = document.querySelector('footer');
      if (!footer) return;
      const region = document.createElement('aside');
      region.id = 'adRegion'; region.className = 'ad-region'; region.hidden = true;
      region.setAttribute('aria-label', 'Publicidad'); footer.before(region);
      controller = createAds(siteConfig, region);
      const privacy = document.createElement('button');
      privacy.type = 'button'; privacy.id = 'privacyChoices'; privacy.className = 'quiet-link';
      privacy.textContent = 'Opciones de privacidad publicitaria';
      privacy.onclick = () => {
        if (!controller?.openPrivacy()) {
          const status = document.getElementById('status');
          if (status) status.textContent = 'La plataforma de consentimiento no está disponible. Puedes seguir practicando sin anuncios.';
        }
      };
      footer.append(privacy);
      controller.setPlacement(placement);
    }).catch(() => { /* Advertising never blocks learning if its optional module is unavailable. */ });
  }
  return { setPlacement(next: Placement) { placement = next; controller?.setPlacement(next); } };
}
