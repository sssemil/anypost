import { describe, it, expect, afterEach } from "vitest";
import { createMultiGroupChat } from "./multi-group-chat.js";
import type { MultiGroupChat } from "./multi-group-chat.js";

const waitFor = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const GROUP_A = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01";
const GROUP_B = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02";

describe("MultiGroupChat", () => {
  const instances: MultiGroupChat[] = [];

  afterEach(async () => {
    await Promise.all(instances.map((c) => c.stop()));
    instances.length = 0;
  });

  it("should start and return a peer ID", async () => {
    const chat = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat);

    expect(chat.peerId).toMatch(/^12D3KooW/);
  });

  it("should have no joined groups initially", async () => {
    const chat = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat);

    expect(chat.getJoinedGroups()).toEqual([]);
  });

  it("should track joined groups", async () => {
    const chat = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat);

    chat.joinGroup(GROUP_A);
    chat.joinGroup(GROUP_B);

    expect(chat.getJoinedGroups()).toEqual([GROUP_A, GROUP_B]);
  });

  it("should remove group on leave", async () => {
    const chat = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat);

    chat.joinGroup(GROUP_A);
    chat.leaveGroup(GROUP_A);

    expect(chat.getJoinedGroups()).toEqual([]);
  });

  it("should exchange messages on the same group", async () => {
    const chat1 = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat1);

    const chat2 = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat2);

    chat1.joinGroup(GROUP_A);
    chat2.joinGroup(GROUP_A);

    await chat1.connectTo(chat2.multiaddrs[0]);
    await waitFor(500);

    const received: Array<{ groupId: string; text: string }> = [];
    chat2.onMessage((msg) => {
      received.push(msg);
    });

    await chat1.sendMessage(GROUP_A, "Hello from chat1!");
    await waitFor(500);

    expect(received.length).toBe(1);
    expect(received[0].text).toBe("Hello from chat1!");
    expect(received[0].groupId).toBe(GROUP_A);
  });

  it("should route messages to correct group", async () => {
    const chat1 = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat1);

    const chat2 = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat2);

    chat1.joinGroup(GROUP_A);
    chat1.joinGroup(GROUP_B);
    chat2.joinGroup(GROUP_A);
    chat2.joinGroup(GROUP_B);

    await chat1.connectTo(chat2.multiaddrs[0]);
    await waitFor(500);

    const received: Array<{ groupId: string; text: string }> = [];
    chat2.onMessage((msg) => {
      received.push(msg);
    });

    await chat1.sendMessage(GROUP_A, "Message for A");
    await chat1.sendMessage(GROUP_B, "Message for B");
    await waitFor(500);

    expect(received.length).toBe(2);

    const groupAMsg = received.find((m) => m.groupId === GROUP_A);
    const groupBMsg = received.find((m) => m.groupId === GROUP_B);
    expect(groupAMsg?.text).toBe("Message for A");
    expect(groupBMsg?.text).toBe("Message for B");
  });

  it("should not receive messages after leaving a group", async () => {
    const chat1 = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat1);

    const chat2 = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });
    instances.push(chat2);

    chat1.joinGroup(GROUP_A);
    chat2.joinGroup(GROUP_A);

    await chat1.connectTo(chat2.multiaddrs[0]);
    await waitFor(500);

    const received: Array<{ groupId: string; text: string }> = [];
    chat2.onMessage((msg) => {
      received.push(msg);
    });

    chat2.leaveGroup(GROUP_A);
    await waitFor(200);

    await chat1.sendMessage(GROUP_A, "Should not arrive");
    await waitFor(500);

    expect(received.length).toBe(0);
  });

  it("should stop cleanly", async () => {
    const chat = await createMultiGroupChat({
      listenAddresses: ["/ip4/127.0.0.1/tcp/0"],
      useTransports: "tcp",
    });

    await chat.stop();
  });
});
