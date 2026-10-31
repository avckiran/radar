// The twelve approved segment colors. The names match the database check and the rd-seg-* tokens in the frontend.
export const SEGMENT_COLORS = [
  'emerald', 'rose', 'blue', 'violet', 'slate', 'teal',
  'lime', 'indigo', 'magenta', 'brown', 'sky', 'stone',
];

export function isSegmentColor(value) {
  return SEGMENT_COLORS.includes(value);
}
