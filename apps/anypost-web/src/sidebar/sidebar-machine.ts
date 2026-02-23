export type SidebarState = {
  readonly isJoinFormOpen: boolean;
  readonly joinInput: string;
  readonly joinError: string | null;
  readonly isJoining: boolean;
  readonly isCreateFormOpen: boolean;
  readonly createInput: string;
  readonly createError: string | null;
  readonly isCreating: boolean;
};

export type SidebarEvent =
  | { readonly type: "join-form-opened" }
  | { readonly type: "join-form-closed" }
  | { readonly type: "join-input-changed"; readonly value: string }
  | { readonly type: "join-started" }
  | { readonly type: "join-failed"; readonly error: string }
  | { readonly type: "join-succeeded" }
  | { readonly type: "create-form-opened" }
  | { readonly type: "create-form-closed" }
  | { readonly type: "create-input-changed"; readonly value: string }
  | { readonly type: "create-started" }
  | { readonly type: "create-failed"; readonly error: string }
  | { readonly type: "create-succeeded" };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const createSidebarState = (): SidebarState => ({
  isJoinFormOpen: false,
  joinInput: "",
  joinError: null,
  isJoining: false,
  isCreateFormOpen: false,
  createInput: "",
  createError: null,
  isCreating: false,
});

export const transitionSidebar = (
  state: SidebarState,
  event: SidebarEvent,
): SidebarState => {
  switch (event.type) {
    case "join-form-opened":
      return {
        ...state,
        isJoinFormOpen: true,
        isCreateFormOpen: false,
        createInput: "",
        createError: null,
        isCreating: false,
      };
    case "join-form-closed":
      return {
        ...state,
        isJoinFormOpen: false,
        joinInput: "",
        joinError: null,
        isJoining: false,
      };
    case "join-input-changed":
      return { ...state, joinInput: event.value, joinError: null };
    case "join-started":
      return { ...state, joinError: null, isJoining: true };
    case "join-failed":
      return { ...state, joinError: event.error, isJoining: false };
    case "join-succeeded":
      return {
        ...state,
        isJoinFormOpen: false,
        joinInput: "",
        joinError: null,
        isJoining: false,
      };
    case "create-form-opened":
      return {
        ...state,
        isCreateFormOpen: true,
        isJoinFormOpen: false,
        joinInput: "",
        joinError: null,
        isJoining: false,
      };
    case "create-form-closed":
      return {
        ...state,
        isCreateFormOpen: false,
        createInput: "",
        createError: null,
        isCreating: false,
      };
    case "create-input-changed":
      return { ...state, createInput: event.value, createError: null };
    case "create-started":
      return { ...state, createError: null, isCreating: true };
    case "create-failed":
      return { ...state, createError: event.error, isCreating: false };
    case "create-succeeded":
      return {
        ...state,
        isCreateFormOpen: false,
        createInput: "",
        createError: null,
        isCreating: false,
      };
  }
};

export const isValidGroupIdInput = (input: string): boolean =>
  UUID_PATTERN.test(input);
