import { useRef, useState } from 'react';
import Overlay from '../ui/Overlay.jsx';
import { apiDelete, apiPatch, apiPost } from '../../lib/api.js';
import { newId } from '../../lib/ids.js';
import { LIMITS, itemsLeftText, openCount } from '../../lib/shopping.js';

// Each dialog does its own request and tells the page what came back. The new list's ID is made once,
// so pressing the button twice (or retrying after a bad connection) never makes two lists.
function useRequest() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function run(fn, onDone) {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function ErrorText({ message }) {
  return message ? (
    <p className="waiting-form__error rd-t-secondary" role="alert">
      {message}
    </p>
  ) : null;
}

function Actions({ onCancel, busy, children }) {
  return (
    <div className="picker__buttons">
      <button type="button" className="rd-btn" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {children}
    </div>
  );
}

function TitleField({ id, value, onChange, label = 'Title' }) {
  return (
    <div className="waiting-form__field">
      <label className="rd-t-secondary rd-muted" htmlFor={id}>
        {label}
      </label>
      <input id={id} data-autofocus className="rd-input" maxLength={LIMITS.title} placeholder="Whole Foods, Walmart, Amazon…" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NoteField({ id, value, onChange }) {
  return (
    <div className="waiting-form__field">
      <label className="rd-t-secondary rd-muted" htmlFor={id}>
        Note (optional)
      </label>
      <textarea id={id} className="rd-textarea" rows={2} maxLength={LIMITS.note} placeholder="Christmas shopping, guests visit…" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function NewListDialog({ onClose, onDone }) {
  const id = useRef(newId());
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const { busy, error, run } = useRequest();
  return (
    <Overlay label="New shopping list" onClose={onClose}>
      <form
        className="waiting-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) run(() => apiPost('/api/shopping', { id: id.current, title, note }), (r) => onDone(r.list));
        }}
      >
        <h2 className="rd-t-item-title waiting-form__title">New shopping list</h2>
        <TitleField id="new-list-title" value={title} onChange={setTitle} />
        <NoteField id="new-list-note" value={note} onChange={setNote} />
        <ErrorText message={error} />
        <Actions onCancel={onClose} busy={busy}>
          <button type="submit" className="rd-btn rd-btn--primary" disabled={busy || !title.trim()}>
            Create list
          </button>
        </Actions>
      </form>
    </Overlay>
  );
}

export function EditListDialog({ list, onClose, onDone }) {
  const [title, setTitle] = useState(list.title);
  const [note, setNote] = useState(list.note ?? '');
  const { busy, error, run } = useRequest();
  return (
    <Overlay label="Edit shopping list" onClose={onClose}>
      <form
        className="waiting-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) run(() => apiPatch(`/api/shopping/${list.id}`, { title, note }), (r) => onDone(r.list));
        }}
      >
        <h2 className="rd-t-item-title waiting-form__title">Edit list</h2>
        <TitleField id="edit-list-title" value={title} onChange={setTitle} />
        <NoteField id="edit-list-note" value={note} onChange={setNote} />
        <ErrorText message={error} />
        <Actions onCancel={onClose} busy={busy}>
          <button type="submit" className="rd-btn rd-btn--primary" disabled={busy || !title.trim()}>
            Save
          </button>
        </Actions>
      </form>
    </Overlay>
  );
}

// Archive by hand. If items are still unchecked, they can be copied into a new list first.
export function ArchiveDialog({ list, onClose, onDone }) {
  const left = openCount(list);
  const newId_ = useRef(newId());
  const [title, setTitle] = useState(list.title);
  const { busy, error, run } = useRequest();

  function archive(copyOpen) {
    const body = copyOpen ? { copyOpen: true, newList: { id: newId_.current, title } } : {};
    run(() => apiPost(`/api/shopping/${list.id}/archive`, body), (r) => onDone({ ...r, copied: copyOpen && r.newList ? r.newList.total : 0 }));
  }

  if (left === 0) {
    return (
      <Overlay label="Archive list" onClose={onClose}>
        <form
          className="waiting-form"
          onSubmit={(e) => {
            e.preventDefault();
            archive(false);
          }}
        >
          <h2 className="rd-t-item-title waiting-form__title">Archive this list?</h2>
          <p className="rd-t-secondary rd-muted shop-dialog__text">{list.title} moves to Archived with today’s date. You can start a new list from it any time.</p>
          <ErrorText message={error} />
          <Actions onCancel={onClose} busy={busy}>
            <button type="submit" className="rd-btn rd-btn--primary" disabled={busy}>
              Archive
            </button>
          </Actions>
        </form>
      </Overlay>
    );
  }

  return (
    <Overlay label="Archive list" onClose={onClose}>
      <form
        className="waiting-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) archive(true);
        }}
      >
        <h2 className="rd-t-item-title waiting-form__title">{itemsLeftText(list)}</h2>
        <p className="rd-t-secondary rd-muted shop-dialog__text">Copy them into a new list, then archive this one? The archived list keeps everything for your records.</p>
        <TitleField id="archive-new-title" value={title} onChange={setTitle} label="New list title" />
        <ErrorText message={error} />
        <div className="shop-dialog__stack">
          <button type="submit" className="rd-btn rd-btn--primary" disabled={busy || !title.trim()}>
            Copy to a new list and archive
          </button>
          <button type="button" className="rd-btn" disabled={busy} onClick={() => archive(false)}>
            Archive without copying
          </button>
          <button type="button" className="rd-btn rd-btn--ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Overlay>
  );
}

// "New list from this one": all items are copied, unchecked
export function NewFromDialog({ list, onClose, onDone }) {
  const id = useRef(newId());
  const [title, setTitle] = useState(list.title);
  const { busy, error, run } = useRequest();
  return (
    <Overlay label="New list from this one" onClose={onClose}>
      <form
        className="waiting-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) run(() => apiPost(`/api/shopping/${list.id}/copy`, { id: id.current, title }), (r) => onDone(r.list));
        }}
      >
        <h2 className="rd-t-item-title waiting-form__title">New list from this one</h2>
        <p className="rd-t-secondary rd-muted shop-dialog__text">All {list.total} items are copied, unchecked, into a new list. This archived list stays as it is.</p>
        <TitleField id="copy-list-title" value={title} onChange={setTitle} label="New list title" />
        <ErrorText message={error} />
        <Actions onCancel={onClose} busy={busy}>
          <button type="submit" className="rd-btn rd-btn--primary" disabled={busy || !title.trim()}>
            Create list
          </button>
        </Actions>
      </form>
    </Overlay>
  );
}

export function DeleteListDialog({ list, onClose, onDone }) {
  const { busy, error, run } = useRequest();
  return (
    <Overlay label="Delete list" onClose={onClose}>
      <form
        className="waiting-form"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => apiDelete(`/api/shopping/${list.id}`), () => onDone());
        }}
      >
        <h2 className="rd-t-item-title waiting-form__title">Delete this list?</h2>
        <p className="rd-t-secondary rd-muted shop-dialog__text">{list.title} and its items will disappear from RADAR. This can’t be undone from the app.</p>
        <ErrorText message={error} />
        <Actions onCancel={onClose} busy={busy}>
          <button type="submit" className="rd-btn rd-btn--danger" disabled={busy}>
            Delete list
          </button>
        </Actions>
      </form>
    </Overlay>
  );
}
