export function removeAttentionRow(home, id) {
  if (!home) return home;
  return { ...home, needsAttention: home.needsAttention.filter((row) => row.id !== id) };
}
