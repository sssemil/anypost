export type EscapeEntry = {
  readonly id: string;
  readonly handler: () => void;
};

export const pushEntry = (
  entries: readonly EscapeEntry[],
  entry: EscapeEntry,
): readonly EscapeEntry[] => [
  ...entries.filter((e) => e.id !== entry.id),
  entry,
];

export const removeEntry = (
  entries: readonly EscapeEntry[],
  id: string,
): readonly EscapeEntry[] =>
  entries.filter((e) => e.id !== id);

export const topEntry = (
  entries: readonly EscapeEntry[],
): EscapeEntry | undefined =>
  entries.length === 0 ? undefined : entries[entries.length - 1];
