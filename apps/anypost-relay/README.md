# anypost-relay

Relay node for Anypost (libp2p circuit relay v2 + DHT provider advertising).

## Docker

Build from repository root:

```bash
./run relay-docker-build
```

Or directly:

```bash
docker build -f apps/anypost-relay/Dockerfile -t anypost-relay:local .
```

Run:

```bash
docker run --name anypost-relay \
  --restart unless-stopped \
  -p 9001:9001 \
  -p 9090:9090 \
  -e RELAY_TCP_PORT=9001 \
  -e RELAY_WS_PORT=9090 \
  -v "$(pwd)/apps/anypost-relay/data:/workspace/apps/anypost-relay/data" \
  anypost-relay:local
```

Compose example:

```bash
docker compose -f apps/anypost-relay/docker-compose.yml up -d
```

## Environment

- `RELAY_TCP_PORT` default `9001`
- `RELAY_WS_PORT` default `9090`

The relay identity key is stored at:

- `/workspace/apps/anypost-relay/data/relay-identity.key`
