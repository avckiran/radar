import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import SearchResult from '../components/search/SearchResult.jsx';
import { useSearch, MIN_QUERY } from '../hooks/useSearch.js';
import { useOpenItem } from '../hooks/useOpenItem.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { addRecent, readRecent, saveRecent } from '../lib/recentSearches.js';
import { plural } from '../lib/text.js';

export default function Search() {
  useDocumentTitle('Search');
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const { openItem } = useOpenItem();
  const input = useRef(null);
  const [text, setText] = useState(() => params.get('q') ?? '');
  const [debounced, setDebounced] = useState(text);
  const [recent, setRecent] = useState(readRecent);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { status, data, error, retry } = useSearch(debounced);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(text), 150);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    const q = debounced.trim();
    if ((params.get('q') ?? '') === q) return;
    const next = new URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    setParams(next, { replace: true });
  }, [debounced, params, setParams]);

  const results = data?.results ?? [];
  useEffect(() => setActiveIndex(-1), [data]);

  const remember = useCallback((query) => {
    setRecent((list) => {
      const next = addRecent(list, query);
      saveRecent(next);
      return next;
    });
  }, []);

  const open = useCallback(
    (result) => {
      remember(data?.query ?? text);
      openItem(result.id);
    },
    [data, text, remember, openItem]
  );

  function leave() {
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (results.length === 0) return;
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((i) => {
        const next = i + step;
        if (next < 0) return results.length - 1;
        return next >= results.length ? 0 : next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) open(target);
      else remember(text);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (text) setText('');
      else leave();
    }
  }

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`search-result-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const trimmed = text.trim();
  const typing = trimmed.length >= MIN_QUERY;
  const busy = status === 'loading';

  let body;
  if (!typing) {
    body = (
      <div className="search-start">
        <p className="rd-t-secondary rd-muted search-hint">
          Search titles, notes, links and history notes. Try a word from a follow-up.
        </p>
        {recent.length > 0 && (
          <section aria-labelledby="recent-h">
            <div className="search-recent__head">
              <h2 id="recent-h" className="rd-overline">
                Recent searches
              </h2>
              <button
                type="button"
                className="rd-btn rd-btn--sm rd-btn--ghost"
                onClick={() => {
                  setRecent([]);
                  saveRecent([]);
                }}
              >
                Clear
              </button>
            </div>
            <ul className="search-recent">
              {recent.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    className="search-recent__item"
                    onClick={() => {
                      setText(q);
                      input.current?.focus();
                    }}
                  >
                    <Icon name="clock" size={16} />
                    <span className="rd-ell">{q}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  } else if (status === 'offline') {
    body = (
      <div className="rd-card search-note" role="status">
        <Icon name="offline" size={22} />
        <div>
          <div className="allclear__title">You’re offline</div>
          <div className="rd-t-secondary rd-muted">Search needs a connection for now. Try again when you’re back online.</div>
        </div>
      </div>
    );
  } else if (status === 'error' && results.length === 0) {
    body = (
      <div className="rd-card search-note" role="alert">
        <Icon name="alert" size={22} />
        <div className="rd-fill">
          <div className="allclear__title">Search didn’t work</div>
          <div className="rd-t-secondary rd-muted">{error}</div>
        </div>
        <button type="button" className="rd-btn" onClick={retry}>
          Try again
        </button>
      </div>
    );
  } else if (results.length === 0 && (busy || status === 'idle' || debounced.trim() !== trimmed)) {
    body = (
      <div className="search-list" aria-busy="true" aria-label="Searching">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={88} />
        ))}
      </div>
    );
  } else if (results.length === 0) {
    body = (
      <div className="rd-card search-note" role="status">
        <Icon name="search" size={22} />
        <div>
          <div className="allclear__title">No results for “{data?.query ?? trimmed}”</div>
          <div className="rd-t-secondary rd-muted">Try fewer or different words. Search looks at titles, notes, links and history notes.</div>
        </div>
      </div>
    );
  } else {
    body = (
      <div className={busy ? 'search-busy' : undefined} aria-busy={busy}>
        <p className="rd-t-secondary rd-muted search-count" role="status">
          {plural(results.length, 'result')}
          {data.more ? ' shown' : ''} for “{data.query}”
        </p>
        <div className="search-list" role="listbox" aria-label="Search results">
          {results.map((result, i) => (
            <SearchResult
              key={result.id}
              id={`search-result-${i}`}
              result={result}
              active={i === activeIndex}
              onOpen={open}
              onHover={() => setActiveIndex(i)}
            />
          ))}
        </div>
        {status === 'error' && (
          <p className="rd-t-secondary rd-muted" role="alert">
            Couldn’t refresh these results. <button type="button" className="search-link" onClick={retry}>Try again</button>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="page search">
      <h1 className="sr-only">Search</h1>
      <div className="search-bar">
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            ref={input}
            id="search-input"
            className="rd-input search-input"
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="search-results"
            aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
            aria-label="Search"
            placeholder="Search everything"
            inputMode="search"
            enterKeyHint="search"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={100}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        {desktop ? (
          <span className="rd-t-secondary rd-quiet search-keys">↑↓ move · ↵ open · Esc close</span>
        ) : (
          <button type="button" className="rd-btn rd-btn--ghost" onClick={leave}>
            Cancel
          </button>
        )}
      </div>
      <div id="search-results">{body}</div>
    </div>
  );
}
