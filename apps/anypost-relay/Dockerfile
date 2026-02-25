FROM node:22-bookworm-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /workspace

RUN set -eux; \
  n=0; \
  until [ "$n" -ge 5 ]; do \
    npm install --global pnpm@9.15.0 && break; \
    n=$((n+1)); \
    echo "npm install failed, retry $n/5"; \
    sleep 5; \
  done; \
  [ "$n" -lt 5 ]

# Install workspace dependencies required to build/run relay.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/anypost-core/package.json packages/anypost-core/package.json
COPY apps/anypost-relay/package.json apps/anypost-relay/package.json
RUN set -eux; \
  n=0; \
  until [ "$n" -ge 5 ]; do \
    pnpm install --frozen-lockfile --filter anypost-core --filter anypost-relay && break; \
    n=$((n+1)); \
    echo "pnpm install failed, retry $n/5"; \
    sleep 5; \
  done; \
  [ "$n" -lt 5 ]

# Copy source and build only required packages.
COPY packages/anypost-core packages/anypost-core
COPY apps/anypost-relay apps/anypost-relay
RUN pnpm --filter anypost-core build && pnpm --filter anypost-relay build

WORKDIR /workspace/apps/anypost-relay
RUN mkdir -p data

EXPOSE 9001 9090
VOLUME ["/workspace/apps/anypost-relay/data"]

CMD ["node", "dist/index.js"]
