import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import { Card, ColorPicker, FormError, Group, SheetFrame } from './SettingsParts.jsx';
import { plural } from '../../lib/text.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';

function SegmentForm({ segment, colors, onSubmit, onDelete, onClose, canDelete }) {
  const creating = !segment;
  const [name, setName] = useState(segment?.name ?? '');
  const [color, setColor] = useState(segment?.color ?? colors.find((c) => c !== 'slate') ?? colors[0]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const changed = creating || name.trim() !== segment.name || color !== segment.color;

  async function submit(e) {
    e.preventDefault();
    if (saving || !name.trim() || !changed) return;
    setSaving(true);
    setError(null);
    const result = await onSubmit({ name: name.trim(), color });
    setSaving(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <form className="segment-form" onSubmit={submit}>
      <div className="settings-field">
        <label className="rd-t-secondary rd-muted" htmlFor="segment-name">
          Name
        </label>
        <input
          id="segment-name"
          className={`rd-input ${error ? 'rd-input--error' : ''}`}
          value={name}
          maxLength={40}
          autoComplete="off"
          data-autofocus=""
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="settings-field">
        <span className="rd-t-secondary rd-muted">Color</span>
        <ColorPicker colors={colors} value={color} onChange={setColor} />
      </div>
      <div className="segment-form__preview">
        <span className="rd-t-secondary rd-muted">Preview</span>
        <span className={`rd-chip rd-seg-${color}`}>
          <span className="rd-dot" />
          <span className="rd-ell">{name.trim() || 'Segment name'}</span>
        </span>
      </div>
      <FormError error={error} />
      <div className="picker__buttons segment-form__buttons">
        {!creating && canDelete && (
          <button type="button" className="rd-btn rd-btn--danger segment-form__delete" onClick={onDelete}>
            <Icon name="trash" size={16} /> Delete…
          </button>
        )}
        <button type="button" className="rd-btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="rd-btn rd-btn--primary" disabled={saving || !name.trim() || !changed}>
          {saving ? 'Saving…' : creating ? 'Add segment' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function DeleteForm({ segment, others, onConfirm, onClose }) {
  const empty = segment.itemCount === 0;
  const general = others.find((s) => s.protected) ?? others[0];
  const [mode, setMode] = useState('move');
  const [target, setTarget] = useState(general?.id ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    setError(null);
    const body = empty ? {} : mode === 'move' ? { moveTo: target } : { deleteItems: true };
    const result = await onConfirm(body);
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <div className="delete-form">
      {empty ? (
        <p className="rd-t-body">
          <strong>{segment.name}</strong> has no items. It will be removed from the sidebar and from Home.
        </p>
      ) : (
        <>
          <p className="rd-t-body">
            <strong>{segment.name}</strong> has {plural(segment.itemCount, 'item')}. Where should {segment.itemCount === 1 ? 'it' : 'they'} go?
          </p>
          <fieldset className="delete-form__choices">
            <legend className="sr-only">What to do with the items</legend>
            <label className="delete-form__choice">
              <input type="radio" name="what" checked={mode === 'move'} onChange={() => setMode('move')} />
              <span className="rd-fill">
                <span className="settings-row__label">Move to another segment</span>
                <select
                  className="rd-input settings-select"
                  aria-label="Move items to"
                  value={target}
                  disabled={mode !== 'move'}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {others.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </span>
            </label>
            <label className="delete-form__choice">
              <input type="radio" name="what" checked={mode === 'delete'} onChange={() => setMode('delete')} />
              <span className="rd-fill">
                <span className="settings-row__label">Delete {segment.itemCount === 1 ? 'it' : `all ${segment.itemCount}`} too</span>
                <span className="rd-t-secondary rd-muted settings-row__hint">
                  They go to the archive. You can remove them for good under Your data.
                </span>
              </span>
            </label>
          </fieldset>
        </>
      )}
      <FormError error={error} />
      <div className="picker__buttons">
        <button type="button" className="rd-btn" onClick={onClose} data-autofocus="">
          Cancel
        </button>
        <button type="button" className="rd-btn rd-btn--danger" disabled={busy || (!empty && mode === 'move' && !target)} onClick={confirm}>
          {busy ? 'Deleting…' : empty || mode === 'move' ? 'Delete segment' : `Delete segment and ${plural(segment.itemCount, 'item')}`}
        </button>
      </div>
    </div>
  );
}

export default function SegmentsSection({ data, canEdit, onCreate, onUpdate, onReorder, onDelete }) {
  // Rename / color / Delete buttons sit on each row only when there is room (desktop)
  const wide = useMediaQuery('(min-width: 1100px)');
  const [sheet, setSheet] = useState(null); // {type:'new'} | {type:'edit', id} | {type:'delete', id}
  const [order, setOrder] = useState(null);
  const [dragId, setDragId] = useState(null);
  const rows = useRef(new Map());
  const drag = useRef(null);
  const byId = useMemo(() => new Map(data.segments.map((s) => [s.id, s])), [data.segments]);
  const serverIds = data.segments.map((s) => s.id);
  const ids = order ?? serverIds;
  const list = ids.map((id) => byId.get(id)).filter(Boolean);

  useEffect(() => {
    if (order && order.join() === serverIds.join()) setOrder(null);
  }, [order, serverIds]);

  async function commit(next) {
    if (next.join() === serverIds.join()) {
      setOrder(null);
      return;
    }
    setOrder(next);
    const result = await onReorder(next);
    if (!result.ok) setOrder(null);
  }

  function nudge(id, delta) {
    const from = ids.indexOf(id);
    const to = from + delta;
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    commit(next);
    requestAnimationFrame(() => document.querySelector(`[data-handle="${id}"]`)?.focus());
  }

  function startDrag(e, id) {
    if (!canEdit || e.button > 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, from: ids };
    setDragId(id);
  }

  function moveDrag(e) {
    const d = drag.current;
    if (!d) return;
    const others = ids.filter((x) => x !== d.id);
    let index = 0;
    for (const oid of others) {
      const el = rows.current.get(oid);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) index += 1;
    }
    const next = [...others];
    next.splice(index, 0, d.id);
    if (next.join() !== ids.join()) setOrder(next);
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    setDragId(null);
    if (d && order) commit(order);
  }

  function onHandleKey(e, id) {
    if (!canEdit) return;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      nudge(id, -1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(id, 1);
    }
  }

  const editing = sheet && sheet.type !== 'new' ? byId.get(sheet.id) : null;
  useEffect(() => {
    if (sheet && sheet.type !== 'new' && !byId.has(sheet.id)) setSheet(null);
  }, [sheet, byId]);

  return (
    <>
      <Group
        title="Segments"
        note={
          wide
            ? 'Rename, recolor and reorder. Drag a row by its handle, or use the arrows. The order here is the order everywhere else.'
            : 'Tap a row to rename, recolor or delete it. Drag by the handle, or use the arrows, to reorder.'
        }
      >
        <Card>
          <ul className="segment-list">
            {list.map((s, index) => (
              <li
                key={s.id}
                ref={(el) => {
                  if (el) rows.current.set(s.id, el);
                  else rows.current.delete(s.id);
                }}
                className={`settings-row segment-row rd-seg-${s.color} ${dragId === s.id ? 'segment-row--dragging' : ''}`}
              >
                <button
                  type="button"
                  className="segment-row__handle"
                  data-handle={s.id}
                  aria-label={`Move ${s.name}. Use the arrow keys, or drag.`}
                  disabled={!canEdit}
                  onPointerDown={(e) => startDrag(e, s.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => onHandleKey(e, s.id)}
                >
                  <Icon name="grip" size={20} />
                </button>
                <span className="rd-dot rd-dot--lg" aria-hidden="true" />
                <button
                  type="button"
                  className="segment-row__main rd-fill"
                  disabled={!canEdit}
                  onClick={() => setSheet({ type: 'edit', id: s.id })}
                  aria-label={`Edit ${s.name}`}
                  tabIndex={wide ? -1 : 0}
                >
                  <span className="settings-row__label rd-ell">{s.name}</span>
                  <span className="rd-t-secondary rd-muted">{plural(s.itemCount, 'item')}</span>
                </button>
                <span className="segment-row__arrows">
                  <button type="button" className="rd-btn rd-btn--ghost segment-row__arrow" aria-label={`Move ${s.name} up`} disabled={!canEdit || index === 0} onClick={() => nudge(s.id, -1)}>
                    <span className="flip"><Icon name="chevd" size={18} /></span>
                  </button>
                  <button type="button" className="rd-btn rd-btn--ghost segment-row__arrow" aria-label={`Move ${s.name} down`} disabled={!canEdit || index === list.length - 1} onClick={() => nudge(s.id, 1)}>
                    <Icon name="chevd" size={18} />
                  </button>
                </span>
                {wide && (
                  <button type="button" className="rd-btn rd-btn--sm segment-row__edit" disabled={!canEdit} onClick={() => setSheet({ type: 'edit', id: s.id })}>
                    Rename / color
                  </button>
                )}
                {wide &&
                  (s.protected ? (
                    <span className="rd-t-secondary rd-quiet segment-row__locked">Can’t be deleted</span>
                  ) : (
                    <button type="button" className="rd-btn rd-btn--sm rd-btn--danger segment-row__delete" disabled={!canEdit} onClick={() => setSheet({ type: 'delete', id: s.id })}>
                      Delete
                    </button>
                  ))}
                {!wide && <Icon name="chev" size={16} />}
              </li>
            ))}
          </ul>
        </Card>
        <div>
          <button type="button" className="rd-btn" disabled={!canEdit} onClick={() => setSheet({ type: 'new' })}>
            <Icon name="plus" size={16} /> Add a segment
          </button>
        </div>
      </Group>

      {sheet?.type === 'new' && (
        <SheetFrame title="New segment" onClose={() => setSheet(null)}>
          <SegmentForm colors={data.colors} onSubmit={(v) => onCreate(v)} onClose={() => setSheet(null)} />
        </SheetFrame>
      )}
      {sheet?.type === 'edit' && editing && (
        <SheetFrame title={`Edit ${editing.name}`} label="Edit segment" onClose={() => setSheet(null)}>
          <SegmentForm
            segment={editing}
            colors={data.colors}
            canDelete={!editing.protected}
            onSubmit={(v) => onUpdate(editing.id, v)}
            onDelete={() => setSheet({ type: 'delete', id: editing.id })}
            onClose={() => setSheet(null)}
          />
          {editing.protected && <p className="rd-t-secondary rd-quiet">General / Administrative can’t be deleted. It’s where things go when nothing else fits.</p>}
        </SheetFrame>
      )}
      {sheet?.type === 'delete' && editing && (
        <SheetFrame title={`Delete ${editing.name}?`} label="Delete segment" onClose={() => setSheet(null)}>
          <DeleteForm
            segment={editing}
            others={data.segments.filter((s) => s.id !== editing.id)}
            onConfirm={(body) => onDelete(editing, body)}
            onClose={() => setSheet(null)}
          />
        </SheetFrame>
      )}
    </>
  );
}
