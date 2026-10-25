export function inboxMeta(item) {
  if (item.kind === 'note') return `Note · ${item.creator} · ${item.capturedLabel}`;
  if (item.kind === 'link') return `Link · ${item.domain ?? 'link'} · ${item.capturedLabel}`;
  return item.capturedLabel === 'today' ? `${item.creator} · today` : `${item.creator} · captured ${item.capturedLabel}`;
}
