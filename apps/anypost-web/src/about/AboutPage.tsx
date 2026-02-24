type AboutPageProps = {
  readonly githubUrl: string;
  readonly appVersion: string;
};

export const AboutPage = (props: AboutPageProps) => {
  return (
    <div class="space-y-4 text-sm">
      <div class="rounded border border-tg-border bg-tg-hover px-3 py-3 space-y-2">
        <h3 class="text-base font-semibold text-tg-text">Anypost</h3>
        <p class="text-xs text-tg-text-dim leading-relaxed">
          Browser peers connect over libp2p, exchange signed group actions, and sync messages
          from their local action-chain history. Relay + discovery improves reachability, but
          delivery is still best-effort.
        </p>
      </div>

      <div class="rounded border border-tg-border bg-tg-hover px-3 py-3 space-y-2">
        <div class="text-[11px] text-tg-text-dim">Version</div>
        <div class="font-mono text-xs text-tg-text">{props.appVersion}</div>
      </div>

      <div class="rounded border border-tg-border bg-tg-hover px-3 py-3 space-y-2">
        <div class="text-[11px] text-tg-text-dim">License</div>
        <div class="text-xs text-tg-text">MIT</div>
      </div>

      <div class="rounded border border-tg-border bg-tg-hover px-3 py-3 space-y-2">
        <div class="text-[11px] text-tg-text-dim">Project</div>
        <a
          class="text-xs text-tg-accent hover:text-tg-accent/80 break-all"
          href={props.githubUrl}
          target="_blank"
          rel="noreferrer"
        >
          {props.githubUrl}
        </a>
      </div>
    </div>
  );
};
