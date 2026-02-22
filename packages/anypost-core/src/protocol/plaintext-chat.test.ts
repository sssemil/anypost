import { describe, it, expect, afterEach } from "vitest";
import { createPlaintextChat } from "./plaintext-chat.js";
import type { PlaintextChat } from "./plaintext-chat.js";

const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe("PlaintextChat", () => {
  const chats: PlaintextChat[] = [];

  afterEach(async () => {
    await Promise.all(chats.map((c) => c.stop()));
    chats.length = 0;
  });

  it("should start and return peer ID", async () => {
    const chat = await createPlaintextChat({
      groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    chats.push(chat);

    expect(chat.peerId).toMatch(/^12D3KooW/);
  });

  it("should send and receive messages between two peers", async () => {
    const chat1 = await createPlaintextChat({
      groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    chats.push(chat1);

    const chat2 = await createPlaintextChat({
      groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    chats.push(chat2);

    await chat1.connectTo(chat2.multiaddrs[0]);
    await waitFor(500);

    const received: Array<{ senderPeerId: string; text: string }> = [];
    chat2.onMessage((msg) => {
      received.push(msg);
    });

    await chat1.sendMessage("Hello from chat1!");
    await waitFor(500);

    expect(received.length).toBe(1);
    expect(received[0].text).toBe("Hello from chat1!");
    expect(received[0].senderPeerId).toBe(chat1.peerId);
  });

  it("should stop cleanly", async () => {
    const chat = await createPlaintextChat({
      groupId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });

    await chat.stop();
  });
});
