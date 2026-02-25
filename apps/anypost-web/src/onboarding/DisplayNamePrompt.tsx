import { createSignal, Show } from "solid-js";

type DisplayNamePromptProps = {
  readonly defaultUsePublicBootstrapNodes?: boolean;
  readonly onSubmit: (displayName: string, options: { readonly usePublicBootstrapNodes: boolean }) => void;
};

export const DisplayNamePrompt = (props: DisplayNamePromptProps) => {
  const [name, setName] = createSignal("");
  const [usePublicBootstrapNodes, setUsePublicBootstrapNodes] = createSignal(
    props.defaultUsePublicBootstrapNodes ?? true,
  );
  const [error, setError] = createSignal("");

  const handleSubmit = () => {
    const trimmed = name().trim();
    if (!trimmed) {
      setError("Display name is required");
      return;
    }
    if (trimmed.length > 100) {
      setError("Display name must be 100 characters or less");
      return;
    }
    props.onSubmit(trimmed, {
      usePublicBootstrapNodes: usePublicBootstrapNodes(),
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div class="max-w-md mx-auto mt-20 px-5 font-sans text-center">
      <h1 class="text-2xl font-bold text-tg-text mb-2">Choose a Display Name</h1>
      <p class="text-tg-text-dim mb-6">
        This is how others will see you. You can change it later.
      </p>

      <input
        type="text"
        value={name()}
        onInput={(e) => {
          setName(e.currentTarget.value);
          setError("");
        }}
        onKeyDown={handleKeyDown}
        placeholder="Enter your display name..."
        maxLength={100}
        class="w-full p-3 rounded-xl bg-tg-chat border border-tg-border text-tg-text text-lg mb-3 box-border placeholder:text-tg-text-dim focus:outline-none focus:border-tg-accent"
      />

      <Show when={error()}>
        <p class="text-tg-danger text-sm mt-0 mb-3">{error()}</p>
      </Show>

      <label class="flex items-start gap-2 text-left text-sm text-tg-text-dim mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={usePublicBootstrapNodes()}
          onChange={(e) => setUsePublicBootstrapNodes(e.currentTarget.checked)}
          class="mt-1 accent-tg-accent"
        />
        <span>
          Use IPFS public bootstrap nodes for easier peer discovery.
          Disable to run in private/self-hosted relay mode only.
        </span>
      </label>

      <button
        onClick={handleSubmit}
        disabled={!name().trim()}
        class="w-full py-3 px-6 rounded-xl bg-tg-accent text-white text-lg cursor-pointer disabled:opacity-40 hover:bg-tg-accent/80"
      >
        Continue
      </button>
    </div>
  );
};
