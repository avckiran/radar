import Icon from '../Icon.jsx';

export default function AllClearCard() {
  return (
    <div className="rd-card allclear">
      <Icon name="check" size={22} />
      <div>
        <div className="allclear__title">All clear for the week</div>
        <div className="rd-t-secondary rd-muted">Nothing needs your attention right now.</div>
      </div>
    </div>
  );
}
