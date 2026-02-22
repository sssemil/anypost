type Success<T> = {
  readonly success: true;
  readonly data: T;
};

type Failure<E> = {
  readonly success: false;
  readonly error: E;
};

export type Result<T, E = Error> = Success<T> | Failure<E>;

export const Result = {
  success: <T>(data: T): Success<T> => ({
    success: true,
    data,
  }),

  failure: <E = Error>(error: E): Failure<E> => ({
    success: false,
    error,
  }),
} as const;
