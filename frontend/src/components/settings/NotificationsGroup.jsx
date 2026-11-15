import { useEffect, useRef, useState } from 'react';
import { Card, Group } from './SettingsParts.jsx';
import { apiGet, apiPost, apiDelete } from '../../lib/api.js';
import { blockedHelp, currentPlatform, currentSupport, isInstalledApp, notificationPermission, registerAgain, thisDeviceHash, turnOffHere, turnOnHere } from '../../lib/push.js';

const NEEDS_INSTALL = 'On iPhone and iPad, notifications only work from the Home Screen app. In Safari tap Share, then Add to Home Screen. Open RADAR from the new icon, sign in, and come back to this screen.';

function addedLabel(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : `Added ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

// Turn notifications on for the phone or computer you are holding, see the devices that get them, send a test.
export default function NotificationsGroup({ me, canEdit, onRun, onNotify }) {
  const devices = me.pushDevices ?? [];
  const support = currentSupport();
  const platform = currentPlatform();
  const [config, setConfig] = useState(null); // { enabled, publicKey }
  const [permission, setPermission] = useState(() => (support === 'ok' ? notificationPermission() : 'default'));
  const [here, setHere] = useState(null); // this device's tag when the browser has a subscription
  const [busy, setBusy] = useState(false);
  const repaired = useRef(false);

  useEffect(() => {
    let live = true;
    apiGet('/api/push/config')
      .then((c) => live && setConfig(c))
      .catch(() => live && setConfig({ enabled: false, publicKey: null, unreachable: true }));
    thisDeviceHash().then((hash) => live && setHere(hash));
    return () => {
      live = false;
    };
  }, [devices.length]);

  // Subscribed in this browser but the server forgot it (for example it was removed from another device): save it again
  const known = here && devices.some((d) => d.hash === here);
  useEffect(() => {
    if (!here || known || repaired.current || !config?.enabled || !canEdit) return;
    repaired.current = true;
    registerAgain().then((ok) => ok && onRun(async () => null));
  }, [here, known, config, canEdit, onRun]);

  async function turnOn() {
    setBusy(true);
    repaired.current = true; // the tap itself saves this device; no need for the quiet re-save to do it as well
    const result = await turnOnHere(config.publicKey);
    setPermission(notificationPermission());
    if (result.ok) {
      setHere(await thisDeviceHash());
      await onRun(async () => null, 'Notifications turned on for this device');
    } else if (result.reason === 'dismissed') onNotify('No problem. You can turn them on any time.');
    else if (result.reason === 'error') onNotify(result.error);
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true);
    const result = await turnOffHere();
    if (!result.ok) onNotify(result.error);
    setHere(null);
    await onRun(async () => null, result.ok ? 'Notifications turned off for this device' : undefined);
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    try {
      const r = await apiPost('/api/push/test');
      if (r.sent > 0) onNotify(r.sent === 1 ? 'Test sent. It should arrive in a few seconds.' : `Test sent to ${r.sent} devices. It should arrive in a few seconds.`);
      else if (r.devices === 0) onNotify('No device has notifications turned on yet.');
      else onNotify('The notification service did not accept the test. Try again in a minute.');
    } catch (err) {
      onNotify(err.message);
    }
    setBusy(false);
  }

  async function remove(device) {
    await onRun(() => apiDelete(`/api/push/devices/${device.id}`), `${device.label} removed`);
  }

  let hint;
  let action = null;
  if (support === 'dev') hint = 'Notifications only work in the installed app, not while RADAR is being developed.';
  else if (support === 'needs-install') hint = NEEDS_INSTALL;
  else if (support === 'unsupported') hint = 'This browser can’t show notifications from RADAR.';
  else if (!config) hint = 'Checking…';
  else if (!config.enabled) hint = config.unreachable ? 'Couldn’t reach the server to check.' : 'Notifications aren’t set up on the server yet. The owner needs to add the notification keys there.';
  else if (permission === 'denied') hint = `Blocked on this device. ${blockedHelp(platform, isInstalledApp())}`;
  else if (known) {
    hint = 'On for this device.';
    action = (
      <>
        <button type="button" className="rd-btn rd-btn--sm" disabled={!canEdit || busy} onClick={test}>
          Send a test
        </button>
        <button type="button" className="rd-btn rd-btn--sm" disabled={!canEdit || busy} onClick={turnOff}>
          Turn off
        </button>
      </>
    );
  } else {
    hint = 'Off on this device.';
    action = (
      <button type="button" className="rd-btn rd-btn--primary rd-btn--sm" disabled={!canEdit || busy} onClick={turnOn}>
        Turn on
      </button>
    );
  }

  return (
    <Group
      title="Notifications on this device"
      note="Notifications follow the schedule above and show only a short count, never the names of your tasks. Each phone or computer is turned on separately, from RADAR’s own window on that device."
    >
      <Card>
        <div className="settings-row notify-row">
          <span className="settings-row__text rd-fill">
            <span className="settings-row__label">This device</span>
            <span className="rd-t-secondary rd-muted settings-row__hint notify-row__hint" role="status">
              {hint}
            </span>
          </span>
          {action && <span className="notify-row__actions">{action}</span>}
        </div>
        {devices.map((d) => (
          <div key={d.id} className="settings-row">
            <span className="settings-row__text rd-fill">
              <span className="settings-row__label">
                {d.label}
                {d.hash === here && <span className="rd-nav__pill settings-row__pill notify-row__here">This device</span>}
              </span>
              <span className="rd-t-secondary rd-muted settings-row__hint">{addedLabel(d.addedAt)}</span>
            </span>
            <button type="button" className="rd-btn rd-btn--sm" aria-label={`Remove ${d.label}`} disabled={!canEdit} onClick={() => remove(d)}>
              Remove
            </button>
          </div>
        ))}
      </Card>
    </Group>
  );
}
