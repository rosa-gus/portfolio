export const storageKey = (key: string) => `portfolio:v1:${key}`;

const obsoleteStorageKeys = ["intro-seen", storageKey("intro-seen")];

export const cleanStorage = (storage: Storage) => {
  for (const key of obsoleteStorageKeys) storage.removeItem(key);
};

export const migrateStorageValue = (
  target: Storage,
  key: string,
  legacyKey: string,
  source: Storage = target,
): string | null => {
  const current = target.getItem(key);
  const previous = source.getItem(legacyKey);
  if (current === null && previous !== null) target.setItem(key, previous);
  // Remove the old value only after successfully saving its replacement.
  source.removeItem(legacyKey);
  return current ?? previous;
};
