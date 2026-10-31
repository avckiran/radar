import { useState } from 'react';
import { Card, FormError, Group, Row, SheetFrame } from './SettingsParts.jsx';
import { apiFile } from '../../lib/api.js';
import { plural } from '../../lib/text.js';

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function DeleteArchived({ archived, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const result = await onConfirm(archived.total);
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <div className="delete-form">
      <p className="rd-t-body">
        This permanently deletes <strong>{plural(archived.total, 'archived item')}</strong>
        {archived.done > 0 && archived.deleted > 0
          ? `: ${archived.done} finished and ${archived.deleted} you deleted`
          : archived.done > 0
            ? ', all finished'
            : ', all ones you deleted'}
        . Their history goes with them. Nothing that is still open is touched.
      </p>
      <p className="rd-t-secondary rd-muted">This can’t be undone. Export your data first if you want a copy.</p>
      <FormError error={error} />
      <div className="picker__buttons">
        <button type="button" className="rd-btn" data-autofocus="" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="rd-btn rd-btn--danger" disabled={busy} onClick={confirm}>
          {busy ? 'Deleting…' : `Delete ${plural(archived.total, 'item')} permanently`}
        </button>
      </div>
    </div>
  );
}

export default function DataSection({ data, canEdit, online, onDeleteArchived, onNotify }) {
  const [working, setWorking] = useState(null);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const { archived, me } = data;

  async function download(format) {
    setWorking(format);
    setError(null);
    try {
      const { blob, filename } = await apiFile(`/api/export?format=${format}`);
      saveBlob(blob, filename);
      onNotify(`Saved ${filename}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setWorking(null);
    }
  }

  const archiveHint = !me.isOwner
    ? 'Only the owner can do this'
    : archived.total === 0
      ? 'Nothing is archived yet'
      : `${plural(archived.done, 'finished item')} and ${plural(archived.deleted, 'deleted item')}`;

  return (
    <>
      <Group title="Your data" note="Exports include items, history, segments and people. They never include passwords.">
        <Card>
          <Row
            icon="download"
            label={working === 'json' ? 'Preparing JSON…' : 'Export as JSON'}
            hint="Everything in one file, for backups"
            onClick={() => download('json')}
            disabled={!online || working !== null}
          />
          <Row
            icon="download"
            label={working === 'csv' ? 'Preparing CSV…' : 'Export as CSV'}
            hint="A .zip with items, history, segments and users for spreadsheets"
            onClick={() => download('csv')}
            disabled={!online || working !== null}
          />
        </Card>
        <FormError error={error} />
        <Card>
          <Row
            icon="trash"
            label="Delete archived items permanently…"
            hint={archiveHint}
            danger
            onClick={() => setConfirming(true)}
            disabled={!canEdit || !me.isOwner || archived.total === 0}
          />
        </Card>
      </Group>

      <Group title="Notifications">
        <div className="rd-reserved settings-reserved">
          <Row icon="alert" label="Push notifications" pill="Later" disabled />
        </div>
      </Group>

      {confirming && (
        <SheetFrame title="Delete archived items?" label="Delete archived items" onClose={() => setConfirming(false)}>
          <DeleteArchived archived={archived} onConfirm={onDeleteArchived} onClose={() => setConfirming(false)} />
        </SheetFrame>
      )}
    </>
  );
}
