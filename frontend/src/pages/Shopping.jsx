import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { ArchivedRow, ListCard } from '../components/shopping/ListCard.jsx';
import { NewFromDialog, NewListDialog } from '../components/shopping/ShoppingDialogs.jsx';
import { useResource } from '../hooks/useResource.js';
import { useShellData } from '../hooks/useShellData.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { overviewSubtitle } from '../lib/shopping.js';

function ShoppingSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading shopping lists">
      <Skeleton width={220} height={28} />
      <div className="shop-grid">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={120} />
        ))}
      </div>
    </div>
  );
}

export default function Shopping() {
  useDocumentTitle('Shopping Lists');
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnline();
  const shell = useShellData();
  const today = shell.data?.today;
  const { data, loading, error, reload } = useResource('/api/shopping');
  const [dialog, setDialog] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  if (!data) {
    if (loading) return <ShoppingSkeleton />;
    return (
      <div className="page">
        <div className="rd-card home__error" role="alert">
          <Icon name="alert" size={22} />
          <div className="rd-fill">
            <div className="allclear__title">Couldn’t load your shopping lists</div>
            <div className="rd-t-secondary rd-muted">{error}</div>
          </div>
          <button type="button" className="rd-btn" onClick={reload}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const { open, archived } = data;
  const close = () => setDialog(null);
  const opened = (list) => {
    close();
    navigate(`/shopping/${list.id}`);
  };

  return (
    <div className="page shop">
      <header className="page__header">
        <div className="shop-head">
          <h1 className="page__title rd-t-screen-title rd-fill rd-ell">Shopping Lists</h1>
          <button type="button" className="rd-btn rd-btn--primary" disabled={!online} onClick={() => setDialog({ type: 'new' })}>
            <Icon name="plus" size={18} />
            New list
          </button>
        </div>
        <p className="rd-t-secondary rd-quiet page__subtitle">{overviewSubtitle(data)}</p>
      </header>

      {open.length === 0 ? (
        <div className="rd-card seg-empty">
          <div className="allclear__title">{archived.length ? 'No open shopping lists.' : 'No shopping lists yet.'}</div>
          <p className="rd-t-secondary rd-muted">Make one list for each store or trip, like Whole Foods for groceries or Amazon for the special stuff.</p>
          <button type="button" className="rd-btn rd-btn--primary" disabled={!online} onClick={() => setDialog({ type: 'new' })}>
            <Icon name="plus" size={16} />
            New list
          </button>
        </div>
      ) : (
        <section aria-label="Open lists" className="shop-grid">
          {open.map((list) => (
            <ListCard key={list.id} list={list} today={today} />
          ))}
        </section>
      )}

      {archived.length > 0 && (
        <section className="home__section" aria-label="Archived lists">
          <button type="button" className="seg-done__toggle" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)}>
            <Icon name={showArchived ? 'chevd' : 'chev'} size={16} />
            <span className="rd-overline">Archived</span>
            <span className="rd-t-secondary rd-quiet">{archived.length}</span>
          </button>
          {showArchived && (
            <ul className="home__list home__list--tight">
              {archived.map((list) => (
                <ArchivedRow key={list.id} list={list} today={today} disabled={!online} onCopy={(l) => setDialog({ type: 'copy', list: l })} />
              ))}
            </ul>
          )}
        </section>
      )}

      {dialog?.type === 'new' && <NewListDialog onClose={close} onDone={opened} />}
      {dialog?.type === 'copy' && (
        <NewFromDialog
          list={dialog.list}
          onClose={close}
          onDone={(list) => {
            toast.show('New list created');
            opened(list);
          }}
        />
      )}
    </div>
  );
}
