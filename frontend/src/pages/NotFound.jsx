import { Link } from 'react-router-dom';
import PlaceholderPage from './PlaceholderPage.jsx';

export default function NotFound() {
  return (
    <PlaceholderPage title="Page not found">
      <p className="rd-muted">
        There’s nothing at this address. <Link to="/">Go to Home</Link>
      </p>
    </PlaceholderPage>
  );
}
