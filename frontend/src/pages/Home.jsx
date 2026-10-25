import PlaceholderPage from './PlaceholderPage.jsx';

const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

export default function Home() {
  return <PlaceholderPage title="Home" subtitle={today} />;
}
