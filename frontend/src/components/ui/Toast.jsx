import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const Ctx = createContext({ show: () => {} });

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);

  const show = useCallback((text, { action } = {}) => {
    clearTimeout(timer.current);
    setMessage({ text, action });
    timer.current = setTimeout(() => setMessage(null), action ? 6000 : 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {message && (
          <div className="rd-toast">
            <span>{message.text}</span>
            {message.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  setMessage(null);
                  message.action.onClick();
                }}
              >
                {message.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
