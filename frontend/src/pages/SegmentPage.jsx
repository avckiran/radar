import { Link, useParams } from 'react-router-dom';
import PlaceholderPage from './PlaceholderPage.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useShellData } from '../hooks/useShellData.jsx';

export default function SegmentPage() {
  const { segmentId } = useParams();
  const { data, loading } = useShellData();
  const segment = data?.segments.find((s) => s.id === segmentId);

  if (!segment) {
    if (loading) {
      return (
        <div className="page" aria-busy="true">
          <Skeleton width="40%" height={28} />
        </div>
      );
    }
    return (
      <PlaceholderPage title="Segment not found">
        <p className="rd-muted">
          We couldn’t find that segment. <Link to="/">Go to Home</Link>
        </p>
      </PlaceholderPage>
    );
  }
  return (
    <PlaceholderPage title={segment.name} subtitle={`${segment.activeCount} active`} accent={segment.color} />
  );
}
