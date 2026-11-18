export interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let installEvent: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvent = e as InstallEvent;
  window.dispatchEvent(new Event('install-state'));
});
window.addEventListener('appinstalled', () => {
  installEvent = null;
  void navigator.storage?.persist?.().catch(() => false);
  window.dispatchEvent(new Event('install-state'));
});
export const canInstall = () => !!installEvent;
export const standalone = () => matchMedia('(display-mode: standalone)').matches;
export async function promptInstall() {
  if (!installEvent) return false;
  await installEvent.prompt();
  const accepted = (await installEvent.userChoice).outcome === 'accepted';
  installEvent = null;
  return accepted;
}
export async function registerPWA(
  ready: (v: boolean) => void,
  update: (v: ServiceWorkerRegistration) => void,
) {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const r = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
  if (r.waiting) update(r);
  r.addEventListener('updatefound', () => {
    r.installing?.addEventListener('statechange', () => {
      if (r.waiting && navigator.serviceWorker.controller) update(r);
    });
  });
  await navigator.serviceWorker.ready;
  ready(true);
}
