# SolidJS Skeleton with Plaintext Chat

**Source**: brutal-plan
**Plan**: `workspace/plans/PLAN-0001-p2p-e2e-encrypted-chat.md`
**Phase**: Phase 1 — Foundation

## Description

Create the SolidJS web app skeleton in `anypost-web/` with a minimal plaintext chat UI. This wires together the libp2p node, GossipSub routing, and a basic message input + message list to achieve the Phase 1 milestone: two browser tabs exchange plaintext messages through a relay.

## Acceptance Criteria

- [ ] SolidJS app scaffolded with Vite + vite-plugin-solid
- [ ] App creates a libp2p browser node on startup
- [ ] Text input sends messages via GossipSub
- [ ] Message list displays received GossipSub messages
- [ ] Two browser tabs can exchange plaintext messages through the relay
- [ ] Integration test: "two browser nodes should exchange plaintext messages via GossipSub"
- [ ] No persistence yet (messages lost on reload — that's Phase 2)

## Implementation Notes

- This is the Phase 1 milestone integration point
- Minimal UI: just a text input and a scrolling message list
- Connection to relay should be automatic on page load
- Show basic connection status (connected/disconnected)
- The integration test may need Playwright or a multi-tab Vitest setup
- Use SolidJS signals for reactive message list
- No routing needed yet — single page

## Dependencies

- Blocked by: 0010, 0011, 0012
- Blocks: 0014 (Phase 2 builds on this)

## History

- 2026-02-22 Created from brutal-plan PLAN-0001
