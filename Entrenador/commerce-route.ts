declare const __COMMERCE_LANDING__: boolean;
declare const __PREMIUM_GUARD__: boolean;

export function commercialPath(): string {
  const hash = location.hash.split('?')[0];
  if (hash === '#/comprar') return 'landing';
  if (hash === '#/cuenta') return 'account';
  if (hash === '#/pago') return 'payment';
  if (!hash && (__COMMERCE_LANDING__ || document.body.dataset.commerceLanding === 'true')) return 'landing';
  return '';
}

export function requiresPremiumAccess(): boolean {
  return __PREMIUM_GUARD__ && /^#\/(guide|plan)(\/|\?|$)/.test(location.hash);
}
