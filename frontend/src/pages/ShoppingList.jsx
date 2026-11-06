import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import ItemRow from '../components/shopping/ItemRow.jsx';
import MoreMenu from '../components/shopping/MoreMenu.jsx';
import { ProgressBar } from '../components/shopping/ListCard.jsx';
import { ArchiveDialog, DeleteListDialog, EditListDialog, NewFromDialog } from '../components/shopping/ShoppingDialogs.jsx';
import { apiDelete, apiPatch, apiPost } from '../lib/api.js';
import { newId } from '../lib/ids.js';
import { LIMITS, archivedLabel, createdLabel, withChecked, withNewItem, withText, withoutItem } from '../lib/shopping.js';
import { useResource } from '../hooks/useResource.js';
import { useShellData } from '../hooks/useShellData.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

function ListSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading shopping list">
      <Skeleton width={200} height={28} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} height={52} />
      ))}
    </div>
  );
}

export default function ShoppingList() {
  const { listId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const shell = useShellData();
  const today = shell.data?.today;
  const me = shell.data?.user?.displayName;
  const { data, loading, error, reload, setData } = useResource(`/api/shopping/${listId}`);
  const list = data?.list;
  useDocumentTitle(list?.title ?? 'Shopping list');

  const [text, setText] = useState('');
  const [dialog, setDialog] = useState(null);
  const input = useRef(null);
  // Answers from the server replace the screen only when nothing newer is still on its way
  const inFlight = useRef(0);

  const change = useCallback(
    async (optimistic, request, onDone) => {
      setData((d) => ({ ...d, list: optimistic(d.list) }));
      inFlight.current += 1;
      try {
        const result = await request();
        inFlight.current -= 1;
        if (inFlight.current === 0) setData(() => ({ list: result.list }));
        onDone?.(result);
      } catch (err) {
        inFlight.current -= 1;
        toast.show(err.message);
        reload();
      }
    },
    [setData, toast, reload]
  );

  if (!data) {
    if (loading) return <ListSkeleton />;
    const missing = /wasn’t found/i.test(error ?? '');
    return (
      <div className="page">
        <div className="rd-card home__error" role="alert">
          <Icon name="alert" size={22} />
          <div className="rd-fill">
            <div className="allclear__title">{missing ? 'List not found' : 'Couldn’t load this list'}</div>
            <div className="rd-t-secondary rd-muted">{missing ? 'It may have been deleted.' : error}</div>
          </div>
          {missing ? (
            <Link to="/shopping" className="rd-btn">
              Shopping Lists
            </Link>
          ) : (
            <button type="button" className="rd-btn" onClick={reload}>
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const archived = list.archived;
  const base = `/api/shopping/${list.id}`;
  const undoArchive = (uncheckItemId) => async () => {
    try {
      const result = await apiPost(`${base}/reopen`, uncheckItemId ? { uncheckItemId } : {});
      setData(() => ({ list: result.list }));
    } catch (err) {
      toast.show(err.message);
    }
  };
  const archivedToast = (uncheckItemId) => toast.show('List archived', { action: { label: 'Undo', onClick: undoArchive(uncheckItemId) } });

  function addItem(e) {
    e.preventDefault();
    const value = text.trim();
    if (!value || !online) return;
    const id = newId();
    setText('');
    input.current?.focus();
    change(
      (l) => withNewItem(l, { id, text: value, addedBy: me }),
      () => apiPost(`${base}/items`, { id, text: value }),
      null
    );
  }

  function toggle(item) {
    const checked = !item.checked;
    change(
      (l) => withChecked(l, item.id, checked),
      () => apiPatch(`${base}/items/${item.id}`, { checked }),
      (result) => result.archived && archivedToast(item.id)
    );
  }

  function saveItem(item, value) {
    change(
      (l) => withText(l, item.id, value),
      () => apiPatch(`${base}/items/${item.id}`, { text: value })
    );
  }

  function deleteItem(item) {
    change(
      (l) => withoutItem(l, item.id),
      () => apiDelete(`${base}/items/${item.id}`),
      (result) => (result.archived ? archivedToast(null) : toast.show('Item deleted'))
    );
  }

  const close = () => setDialog(null);
  const openItems = list.items.filter((i) => !i.checked);
  const checkedItems = list.items.filter((i) => i.checked);
  const row = (item) => (
    <ItemRow key={item.id} item={item} me={me} disabled={!online} readOnly={archived} onToggle={toggle} onSave={saveItem} onDelete={deleteItem} />
  );

  const menu = archived
    ? [{ label: 'Delete list', icon: 'trash', danger: true, onClick: () => setDialog({ type: 'delete' }) }]
    : [
        { label: 'Edit title and note', icon: 'edit', onClick: () => setDialog({ type: 'edit' }) },
        { label: 'Archive list', icon: 'tray', onClick: () => setDialog({ type: 'archive' }) },
        { label: 'Delete list', icon: 'trash', danger: true, onClick: () => setDialog({ type: 'delete' }) },
      ];

  return (
    <div className="page shop">
      <Link to="/shopping" className="shop-back rd-t-secondary rd-muted">
        <Icon name="back" size={16} />
        Shopping Lists
      </Link>

      <header className="page__header">
        <div className="shop-head">
          <h1 className="page__title rd-t-screen-title rd-fill">{list.title}</h1>
          {archived && (
            <button type="button" className="rd-btn rd-btn--primary shop-head__action" disabled={!online} onClick={() => setDialog({ type: 'copy' })}>
              New list from this
            </button>
          )}
          <MoreMenu label="List actions" items={menu} disabled={!online} />
        </div>
        {list.note && <p className="shop-note rd-t-secondary rd-muted">{list.note}</p>}
        <p className="rd-t-secondary rd-quiet page__subtitle">
          {createdLabel(list, today)}
          {list.createdBy ? ` by ${list.createdBy}` : ''}
        </p>
      </header>

      {archived && (
        <div className="rd-card shop-banner" role="status">
          <Icon name="tray" size={18} />
          <span className="rd-fill">
            <strong>{archivedLabel(list, today)}.</strong> This list is read only. Start a new list from it to shop again.
          </span>
        </div>
      )}

      <ProgressBar list={list} />

      {!archived && (
        <form className="shop-add" onSubmit={addItem}>
          <label className="sr-only" htmlFor="shop-add-input">
            Add an item
          </label>
          <input
            id="shop-add-input"
            ref={input}
            className="rd-input"
            maxLength={LIMITS.item}
            placeholder="Add an item"
            autoComplete="off"
            enterKeyHint="done"
            value={text}
            disabled={!online}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="rd-btn rd-btn--primary" disabled={!online || !text.trim()}>
            <Icon name="plus" size={18} />
            Add
          </button>
        </form>
      )}

      {list.items.length === 0 ? (
        <div className="rd-card seg-empty">
          <div className="allclear__title">{archived ? 'This list had no items.' : 'Nothing on this list yet.'}</div>
          {!archived && <p className="rd-t-secondary rd-muted">Type an item above and press Enter. You can keep adding.</p>}
        </div>
      ) : (
        <>
          {openItems.length > 0 && (
            <ul className="rd-card shop-items" aria-label="To buy">
              {openItems.map(row)}
            </ul>
          )}
          {checkedItems.length > 0 && (
            <section className="home__section" aria-label="Checked off">
              <div className="home__heading">
                <h2 className="rd-overline">Checked off</h2>
                <span className="rd-t-secondary rd-quiet">{checkedItems.length}</span>
              </div>
              <ul className="rd-card shop-items">{checkedItems.map(row)}</ul>
            </section>
          )}
        </>
      )}

      {dialog?.type === 'edit' && (
        <EditListDialog
          list={list}
          onClose={close}
          onDone={(next) => {
            close();
            setData((d) => ({ ...d, list: { ...d.list, title: next.title, note: next.note } }));
          }}
        />
      )}
      {dialog?.type === 'archive' && (
        <ArchiveDialog
          list={list}
          onClose={close}
          onDone={(result) => {
            close();
            if (result.newList) {
              toast.show(`Archived. ${result.copied} ${result.copied === 1 ? 'item' : 'items'} copied to a new list`);
              navigate(`/shopping/${result.newList.id}`);
            } else {
              setData(() => ({ list: result.list }));
              toast.show('List archived');
            }
          }}
        />
      )}
      {dialog?.type === 'copy' && (
        <NewFromDialog
          list={list}
          onClose={close}
          onDone={(next) => {
            close();
            toast.show('New list created');
            navigate(`/shopping/${next.id}`);
          }}
        />
      )}
      {dialog?.type === 'delete' && (
        <DeleteListDialog
          list={list}
          onClose={close}
          onDone={() => {
            close();
            toast.show('List deleted');
            navigate('/shopping');
          }}
        />
      )}
    </div>
  );
}
