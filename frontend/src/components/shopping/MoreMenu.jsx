import { useCallback, useState } from 'react';
import Icon from '../Icon.jsx';
import Popover from '../home/Popover.jsx';

// A three-dot button that opens a small list of actions
export default function MoreMenu({ label, items, disabled = false }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="shop-menu">
      <button
        type="button"
        className="rd-btn rd-btn--ghost shop-menu__button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <Popover label={label} onClose={close}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`rd-btn rd-btn--ghost shop-menu__item ${item.danger ? 'shop-menu__item--danger' : ''}`}
              onClick={() => {
                close();
                item.onClick();
              }}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </Popover>
      )}
    </div>
  );
}
