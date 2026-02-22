type PersistenceStatus = "unknown" | "granted" | "denied";

type StoragePersistenceState = {
  readonly status: PersistenceStatus;
};

export const createStoragePersistenceState = (): StoragePersistenceState => ({
  status: "unknown",
});

export const recordPersistenceResult = (
  state: StoragePersistenceState,
  granted: boolean,
): StoragePersistenceState => ({
  ...state,
  status: granted ? "granted" : "denied",
});

export const getPersistenceStatus = (
  state: StoragePersistenceState,
): PersistenceStatus => state.status;

export const isPersistenceGranted = (
  state: StoragePersistenceState,
): boolean => state.status === "granted";
