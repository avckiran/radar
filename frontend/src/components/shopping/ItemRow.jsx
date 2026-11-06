import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import MoreMenu from './MoreMenu.jsx';
import { LIMITS } from '../../lib/shopping.js';

// One item: a check box to strike it off, its text, and a three-dot menu to edit or delete it
export default function ItemRow({ item, me, disabled, readOnly, onToggle, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const input = useRef(null);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  function startEdit() {
    setText(item.text);
    setEditing(true);
  }

  function save(e) {
    e.preventDefault();
    const next = text.trim();
    if (!next) return;
    setEditing(false);
    if (next !== item.text) onSave(item, next);
  }

  const by = item.addedBy && item.addedBy !== me ? `Added by ${item.addedBy}` : null;

  if (editing) {
    return (
      <li className="shop-item shop-item--editing">
        <form className="shop-item__edit" onSubmit={save}>
          <label className="sr-only" htmlFor={`edit-${item.id}`}>
            Item
          </label>
          <input
            id={`edit-${item.id}`}
            ref={input}
            className="rd-input"
            maxLength={LIMITS.item}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(false);
              }
            }}
          />
          <button type="button" className="rd-btn" onClick={() => setEditing(false)}>
            Cancel
          </button>
          <button type="submit" className="rd-btn rd-btn--primary" disabled={!text.trim()}>
            Save
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className={`shop-item ${item.checked ? 'shop-item--checked' : ''}`}>
      <input
        id={`item-${item.id}`}
        type="checkbox"
        className="shop-check"
        checked={item.checked}
        disabled={disabled || readOnly}
        onChange={() => onToggle(item)}
      />
      <label htmlFor={`item-${item.id}`} className="shop-item__body">
        <span className="shop-item__text">{item.text}</span>
        {by && <span className="shop-item__by rd-t-secondary rd-quiet">{by}</span>}
      </label>
      {!readOnly && (
        <MoreMenu
          label={`More for ${item.text}`}
          disabled={disabled}
          items={[
            { label: 'Edit', icon: 'edit', onClick: startEdit },
            { label: 'Delete', icon: 'trash', danger: true, onClick: () => onDelete(item) },
          ]}
        />
      )}
      {readOnly && item.checked && <Icon name="check" size={16} />}
    </li>
  );
}
