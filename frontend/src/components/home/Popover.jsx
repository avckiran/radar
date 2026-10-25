import { useEffect, useRef } from 'react';

export default function Popover({ label, onClose, children }) {
  const box = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    box.current?.querySelector('button, input')?.focus();
    const onPointer = (e) => !box.current?.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [onClose]);

  return (
    <div ref={box} className="rd-popover snooze-pop" role="dialog" aria-label={label}>
      {children}
    </div>
  );
}
