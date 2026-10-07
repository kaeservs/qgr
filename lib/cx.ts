/** Joins class names, dropping the falsy ones. */
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');
