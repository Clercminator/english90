// Device voices only: no provider, network dependency, microphone or voice recording.
export function englishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices.filter(v => /^en(?:[-_]|$)/i.test(v.lang) && v.localService)
    .sort((a, b) => Number(b.default) - Number(a.default))[0];
}
export function audioAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined' && !!englishVoice(speechSynthesis.getVoices());
}
let generation = 0;
let watchdog: ReturnType<typeof setTimeout> | undefined;
export function stopAudio(): void {
  generation++; clearTimeout(watchdog);
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}
export function speakEnglish(text: string, slow: boolean, report: (message: string) => void): void {
  stopAudio();
  if (typeof speechSynthesis === 'undefined') { report('Este navegador no ofrece audio. Puedes continuar leyendo.'); return; }
  const voice = englishVoice(speechSynthesis.getVoices());
  if (!voice) { report('No hay una voz local en inglés disponible. Puedes continuar leyendo o instalar una voz inglesa en tu dispositivo.'); return; }
  const current = generation;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = slow ? 0.7 : 0.95;
  const update = (message: string) => { if (current === generation) report(message); };
  report('Preparando audio…');
  utterance.onstart = () => update('Reproduciendo en inglés…');
  utterance.onend = () => { if (current === generation) { clearTimeout(watchdog); update('Audio terminado. Puedes volver a escucharlo.'); } };
  utterance.onerror = () => { if (current === generation) { clearTimeout(watchdog); update('No se pudo reproducir. Intenta de nuevo o continúa leyendo.'); } };
  watchdog = setTimeout(() => { if (current === generation) { stopAudio(); report('El audio no respondió. Intenta de nuevo o continúa leyendo.'); } }, 20000);
  try { speechSynthesis.speak(utterance); }
  catch { stopAudio(); report('No se pudo reproducir. Puedes continuar leyendo.'); }
}
