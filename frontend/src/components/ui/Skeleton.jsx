export default function Skeleton({ width = '100%', height = 20, className = '' }) {
  return <span className={`sk ${className}`} style={{ width, height }} aria-hidden="true" />;
}
