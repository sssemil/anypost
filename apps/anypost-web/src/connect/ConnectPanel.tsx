type ConnectPanelProps = {
  readonly relayAddr: string;
  readonly onRelayAddrChange: (addr: string) => void;
  readonly onConnect: () => void;
  readonly disabled: boolean;
};

export const ConnectPanel = (props: ConnectPanelProps) => {
  return (
    <div class="rounded-xl border border-tg-border bg-tg-chat p-4">
      <label class="block mb-1.5 font-semibold text-sm text-tg-text">
        Relay address
      </label>
      <input
        type="text"
        value={props.relayAddr}
        onInput={(e) => props.onRelayAddrChange(e.currentTarget.value)}
        placeholder="/ip4/127.0.0.1/tcp/9090/ws/p2p/12D3KooW..."
        class="w-full p-2.5 rounded-xl bg-tg-sidebar border border-tg-border text-tg-text font-mono text-xs mb-2 box-border placeholder:text-tg-text-dim focus:outline-none focus:border-tg-accent"
      />
      <p class="text-xs text-tg-text-dim mb-3">
        Paste the <code class="text-tg-accent">/ws/</code> multiaddr from the relay terminal.
      </p>
      <button
        onClick={props.onConnect}
        disabled={props.disabled}
        class="py-2.5 px-5 rounded-xl bg-tg-accent text-white cursor-pointer disabled:opacity-40 hover:bg-tg-accent/80"
      >
        Connect
      </button>
    </div>
  );
};
