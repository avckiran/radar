import data from '../assets/icons.json';

export default function Icon({ name, size = 20 }) {
  const inner = data.icons[name];
  if (!inner) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={data.viewBox}
      fill={data.fill}
      stroke={data.stroke}
      strokeWidth={data.strokeWidth}
      strokeLinecap={data.strokeLinecap}
      strokeLinejoin={data.strokeLinejoin}
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
