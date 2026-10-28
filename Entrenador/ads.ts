import type { SiteConfig } from './config';

export interface ConsentData {
  cmpId?: number; cmpStatus?: string; eventStatus?: string; gdprApplies?: boolean; tcString?: string;
  purpose?: { consents?: Record<number, boolean>; legitimateInterests?: Record<number, boolean> };
  vendor?: { consents?: Record<number, boolean>; legitimateInterests?: Record<number, boolean> };
  publisher?: { restrictions?: Record<number, Record<number, number>> };
}
declare global {
  interface Window {
    __tcfapi?: (command: string, version: number, callback: (data: ConsentData, success: boolean) => void) => void;
    googlefc?: { showRevocationMessage?: () => void };
    adsbygoogle?: { push: (value: Record<string, unknown>) => void; requestNonPersonalizedAds?: number };
  }
}
// Conservative worldwide gate: no inferred consent or geo-IP exception. Google remains responsible for checking the TC string.
export function consentAllowsAds(data: ConsentData, expectedCmpId: number): boolean {
  if (data.cmpId !== expectedCmpId || data.cmpStatus !== 'loaded' || !['tcloaded', 'useractioncomplete'].includes(data.eventStatus || '') || !data.tcString) return false;
  const consent = (p: number) => data.purpose?.consents?.[p] === true && data.vendor?.consents?.[755] === true;
  const interest = (p: number) => data.purpose?.legitimateInterests?.[p] === true && data.vendor?.legitimateInterests?.[755] === true;
  if (!consent(1)) return false;
  return [1, 2, 7, 9, 10].every(p => {
    const restriction = data.publisher?.restrictions?.[p]?.[755];
    if (restriction === 0) return false;
    if (p === 1 || restriction === 1) return consent(p);
    if (restriction === 2) return interest(p);
    return consent(p) || interest(p);
  });
}
export function createAds(config: SiteConfig, region: HTMLElement) {
  let consent = false; let placement: 'home' | 'article' | null = null;
  let initialized = false; let subscribed = false; let script: Promise<boolean> | null = null;
  let poll: ReturnType<typeof setInterval> | undefined;
  const used = new Set<string>();
  const active = config.ads.enabled && config.ads.approved && config.ads.consentConfigured && config.ads.cmpCertifiedConfirmed && config.ads.manualPlacementsConfirmed;
  const clear = () => { region.replaceChildren(); region.hidden = true; };
  const loadAds = () => script ||= new Promise<boolean>(resolve => {
    const queue = window.adsbygoogle ||= Object.assign([] as Record<string, unknown>[], { requestNonPersonalizedAds: 1 });
    queue.requestNonPersonalizedAds = 1;
    const s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${config.ads.publisherId}`;
    s.onload = () => resolve(true); s.onerror = () => resolve(false); document.head.append(s);
  });
  async function show() {
    const target = placement;
    if (!active || !consent || !target || !config.ads.slots[target] || used.has(target)) return;
    used.add(target);
    if (!await loadAds() || !consent || placement !== target) return;
    region.replaceChildren(); region.hidden = false;
    const label = document.createElement('p'); label.className = 'ad-label'; label.textContent = 'Publicidad';
    const ins = document.createElement('ins'); ins.className = 'adsbygoogle';
    ins.dataset.adClient = config.ads.publisherId; ins.dataset.adSlot = config.ads.slots[target];
    ins.dataset.adFormat = 'auto'; ins.dataset.fullWidthResponsive = 'true';
    region.append(label, ins);
    try { window.adsbygoogle!.push({}); }
    catch { clear(); }
    // Collapse unfilled units; no retries, artificial refreshes or requests on gameplay events.
    const observer = new MutationObserver(() => { if (ins.dataset.adStatus === 'unfilled') { clear(); observer.disconnect(); } });
    observer.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
    setTimeout(() => { if (ins.isConnected && ins.dataset.adStatus !== 'filled') clear(); observer.disconnect(); }, 15000);
  }
  function subscribe() {
    if (subscribed || !window.__tcfapi) return;
    subscribed = true; if (poll) clearInterval(poll);
    window.__tcfapi('addEventListener', 2, (data, success) => {
      consent = success && consentAllowsAds(data, config.ads.cmpId);
      if (!consent) clear(); else void show();
    });
  }
  function initialize() {
    if (initialized || !active) return;
    initialized = true;
    const s = document.createElement('script'); s.async = true; s.src = config.ads.cmpScriptUrl;
    s.onload = subscribe; s.onerror = clear; document.head.append(s);
    subscribe(); if (!subscribed) poll = setInterval(subscribe, 250);
    setTimeout(() => { if (poll) clearInterval(poll); }, 15000);
  }
  clear();
  return {
    setPlacement(next: 'home' | 'article' | null) { if (next === placement) return; placement = next; clear(); if (next) { initialize(); void show(); } },
    openPrivacy() {
      if (window.googlefc?.showRevocationMessage) { consent = false; clear(); window.googlefc.showRevocationMessage(); return true; }
      return false;
    },
  };
}
