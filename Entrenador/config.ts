import raw from '../site.config.json' with { type: 'json' };

export interface SiteConfig {
  siteUrl: string; commerceSiteUrl?: string; proposedDomain: string; businessName: string; contactEmail: string; contactUrl?: string; legalReviewed: boolean;
  checkoutUrl: string; checkoutConfirmed: boolean;
  ads: { publisherId: string; verificationEnabled: boolean; approved: boolean; enabled: boolean;
    slots: { home: string; article: string }; cmpScriptUrl: string; cmpId: number; cmpCertifiedConfirmed: boolean; consentConfigured: boolean; manualPlacementsConfirmed: boolean };
}
export function validHttps(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
export function validateConfig(config: SiteConfig): SiteConfig {
  const fail = (message: string) => { throw new Error(`Configuración: ${message}`); };
  if (config.siteUrl && (!validHttps(config.siteUrl) || new URL(config.siteUrl).origin !== config.siteUrl)) fail('siteUrl debe ser un origen HTTPS sin ruta.');
  if (config.commerceSiteUrl && (!validHttps(config.commerceSiteUrl) || new URL(config.commerceSiteUrl).origin !== config.commerceSiteUrl)) fail('commerceSiteUrl debe ser un origen HTTPS sin ruta.');
  if (config.checkoutUrl && !validHttps(config.checkoutUrl)) fail('checkoutUrl debe usar HTTPS.');
  if (config.checkoutConfirmed && !config.checkoutUrl) fail('falta el destino de compra confirmado.');
  if (config.contactEmail && !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(config.contactEmail)) fail('correo de contacto inválido.');
  if (config.contactUrl && !validHttps(config.contactUrl)) fail('contactUrl debe usar HTTPS.');
  const ads = config.ads;
  for (const flag of [config.legalReviewed,config.checkoutConfirmed,ads.enabled,ads.approved,ads.verificationEnabled,ads.cmpCertifiedConfirmed,ads.consentConfigured,ads.manualPlacementsConfirmed]) if (typeof flag !== 'boolean') fail('los indicadores deben ser true o false, sin comillas.');
  if (!Number.isInteger(ads.cmpId) || ads.cmpId < 0) fail('cmpId debe ser un entero no negativo.');
  if (ads.publisherId && !/^ca-pub-\d{16}$/.test(ads.publisherId)) fail('publisherId debe ser el identificador real de AdSense.');
  if (ads.verificationEnabled && !ads.publisherId) fail('la verificación necesita publisherId.');
  for (const slot of Object.values(ads.slots)) if (slot && !/^\d{10}$/.test(slot)) fail('el identificador de bloque debe tener 10 dígitos.');
  if (ads.cmpScriptUrl && (!validHttps(ads.cmpScriptUrl) || new URL(ads.cmpScriptUrl).hostname !== 'fundingchoicesmessages.google.com')) fail('usa el script de la CMP de Google obtenido en Privacidad y mensajes.');
  if (ads.enabled && (!ads.approved || !ads.publisherId || !ads.consentConfigured || !ads.cmpCertifiedConfirmed || !ads.manualPlacementsConfirmed || ads.cmpId <= 0 || !ads.cmpScriptUrl || !config.siteUrl || !config.businessName || !config.contactEmail || !config.legalReviewed)) fail('faltan aprobación, anuncios manuales, consentimiento certificado, dominio o revisión/datos legales para anuncios activos.');
  if (ads.enabled && !Object.values(ads.slots).some(Boolean)) fail('falta al menos un bloque de anuncio real.');
  return config;
}
export const siteConfig = validateConfig(raw);
