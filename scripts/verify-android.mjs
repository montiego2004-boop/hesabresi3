// Run locally with the installed PWA foregrounded on an authorized USB test device.
// Reads display/worker state only. Does not clear storage, fetch records, or change the phone's connectivity.
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
if (!process.env.APP_URL)
  throw Error('Set APP_URL, open the installed PWA from its launcher icon, then run this check.');
const origin = new URL(process.env.APP_URL).origin;
const adb = (...args) =>
  execFileSync(
    'adb',
    [...(process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : []), ...args],
    { encoding: 'utf8' },
  ).trim();
assert.equal(adb('get-state'), 'device');
const port = adb('forward', 'tcp:0', 'localabstract:chrome_devtools_remote');
let ws;
try {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((t) => t.type === 'page' && t.url.startsWith(origin + '/'));
  assert(target, 'Open the installed app and close regular browser tabs for the same origin');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, no) => {
    ws.onopen = ok;
    ws.onerror = no;
  });
  const response = new Promise((ok, no) => {
    const timer = setTimeout(() => no(Error('Android debugging timeout')), 15000);
    ws.onmessage = (e) => {
      const v = JSON.parse(e.data);
      if (v.id === 1) {
        clearTimeout(timer);
        ok(v);
      }
    };
  });
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `({standalone:matchMedia('(display-mode: standalone)').matches,online:navigator.onLine,controller:!!navigator.serviceWorker.controller,secure:isSecureContext,ui:!!document.querySelector('.main')})`,
        returnByValue: true,
      },
    }),
  );
  const result = (await response).result.result.value;
  console.log(result);
  assert(
    result.standalone && result.controller && result.secure && result.ui,
    'Not a launched, controlled standalone PWA',
  );
  if (process.env.EXPECT_OFFLINE === '1')
    assert.equal(result.online, false, 'Disconnect Wi-Fi/mobile data and relaunch the app');
  console.log('Verified on the attached Android device:', origin);
} finally {
  ws?.close();
  adb('forward', '--remove', 'tcp:' + port);
}
