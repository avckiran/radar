import Icon from '../components/Icon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useOnline } from '../hooks/useOnline.js';
import { Brand } from './SignIn.jsx';

export function CheckingScreen() {
  return (
    <main className="signin" aria-busy="true" aria-label="Checking your sign-in">
      <div className="signin__card">
        <Brand />
        <Skeleton height={20} />
        <Skeleton height={44} />
      </div>
    </main>
  );
}

export function UnreachableScreen() {
  const { error, retry } = useAuth();
  const online = useOnline();
  return (
    <main className="signin">
      <div className="signin__card" role="alert">
        <Brand />
        <h1 className="signin__title">{online ? 'Can’t reach RADAR' : 'You’re offline'}</h1>
        <p className="rd-t-secondary rd-muted signin__notice">
          <Icon name={online ? 'alert' : 'offline'} size={16} /> {error}
        </p>
        <button type="button" className="rd-btn rd-btn--primary signin__submit" onClick={retry}>
          Try again
        </button>
      </div>
    </main>
  );
}
