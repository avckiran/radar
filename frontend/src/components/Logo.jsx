const BASE = import.meta.env.BASE_URL;

export default function Logo({ size = 28 }) {
  return (
    <span className="rd-logo" aria-hidden="true">
      <img className="rd-logo__on-light" src={`${BASE}icons/logo-mark.svg`} width={size} height={size} alt="" />
      <img className="rd-logo__on-dark" src={`${BASE}icons/logo-mark-light.svg`} width={size} height={size} alt="" />
    </span>
  );
}
