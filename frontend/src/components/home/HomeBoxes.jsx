import { Link } from 'react-router-dom';
import Icon from '../Icon.jsx';
import { ProgressBar } from '../shopping/ListCard.jsx';
import ItemRow, { RowShell } from './ItemRow.jsx';

// The boxes on Home that are previews: each has a heading and a way into the full screen.

export function Box({ id, title, count, to, toLabel, children }) {
  return (
    <section aria-labelledby={id} className="home__section">
      <div className="home__heading">
        <h2 id={id} className="rd-overline">
          {title}
        </h2>
        {count > 0 && <span className="count-chip">{count}</span>}
        {to && (
          <Link to={to} className="home__more">
            {toLabel}
            <Icon name="chev" size={14} />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Quiet({ children }) {
  return <p className="home__quiet rd-t-secondary rd-quiet">{children}</p>;
}

export function FollowUpsBox({ rows, disabled, onAction, onOpen }) {
  return (
    <Box id="followups-h" title="Follow-up items" count={rows.length}>
      {rows.length === 0 ? (
        <Quiet>Nothing is waiting on anyone.</Quiet>
      ) : (
        <ul className="home__list home__list--tight">
          {rows.map((row) => (
            <li key={row.id}>
              <ItemRow row={row} disabled={disabled(row)} onAction={onAction} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

export function CalendarBox() {
  return (
    <Box id="calendar-h" title="Calendar">
      <div className="rd-card home__soon">
        <Icon name="cal" size={20} />
        <div>
          <div className="allclear__title">Coming soon</div>
          <div className="rd-t-secondary rd-muted">Your upcoming days will show up here.</div>
        </div>
      </div>
    </Box>
  );
}

export function ShoppingBox({ shopping }) {
  return (
    <Box id="shopping-h" title="Shopping Lists" count={shopping.count} to="/shopping" toLabel="All lists">
      {shopping.lists.length === 0 ? (
        <Quiet>
          No open lists. <Link to="/shopping">Start one</Link>
        </Quiet>
      ) : (
        <>
          <ul className="home__list home__list--tight">
            {shopping.lists.map((list) => (
              <li key={list.id}>
                <Link to={`/shopping/${list.id}`} className="rd-card home__shop">
                  <span className="home__shop-title rd-ell">{list.title}</span>
                  <ProgressBar list={list} />
                </Link>
              </li>
            ))}
          </ul>
          {shopping.count > shopping.lists.length && (
            <Link to="/shopping" className="home__quiet rd-t-secondary rd-quiet">
              + {shopping.count - shopping.lists.length} more
            </Link>
          )}
        </>
      )}
    </Box>
  );
}

export function NotesBox({ notes, onOpen }) {
  return (
    <Box id="notes-h" title="Notes" count={notes.count}>
      {notes.items.length === 0 ? (
        <Quiet>No notes yet.</Quiet>
      ) : (
        <ul className="home__list home__list--tight">
          {notes.items.map((note) => (
            <li key={note.id}>
              <RowShell segment={note.segment}>
                <button type="button" className="hrow__open" onClick={() => onOpen(note.id)}>
                  <span className="hrow__title rd-ell">{note.title}</span>
                  {note.excerpt && <span className="hrow__excerpt">{note.excerpt}</span>}
                  <span className="hrow__meta rd-ell">{note.segment?.name ?? 'No segment'}</span>
                </button>
              </RowShell>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}
