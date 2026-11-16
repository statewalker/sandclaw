/**
 * httpeers-libp2p 0.5 made one windowed mux per peer the default exchange path
 * (httpeers#56): `servePeer` (the Sharer) and `startMember` (the Guest) carry
 * every exchange with a peer as a port of ONE libp2p stream on `MUX_PROTOCOL`,
 * instead of one libp2p stream per exchange. PeerShare passes no `muxPerPeer`,
 * so it takes that default: this pins it, on a real mesh.
 */

import type { Libp2p } from "@libp2p/interface";
import { MUX_PROTOCOL } from "@statewalker/httpeers-libp2p";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeMeshPlatform } from "../src/node/index.js";
import { AddService, Invite, Join, StartSharing, StopSharing } from "../src/public/commands.js";
import type { MeshInit } from "../src/public/mesh.js";
import { meshFor, onMesh, startRelay } from "./mesh-harness.js";

let relay: Awaited<ReturnType<typeof startRelay>>;
let dirk: ReturnType<typeof onMesh> | undefined;
let claudia: ReturnType<typeof onMesh> | undefined;
let guestNode: Libp2p | undefined;

/** A Guest's mesh whose member node the test keeps a hand on. */
function capturingGuestMesh(): MeshInit {
  const mesh = meshFor(relay.addr);
  return {
    ...mesh,
    platform: {
      ...nodeMeshPlatform,
      member: {
        createNode: async (init: Parameters<typeof nodeMeshPlatform.member.createNode>[0]) => {
          guestNode = await nodeMeshPlatform.member.createNode(init);
          return guestNode;
        },
      },
    },
  };
}

beforeAll(async () => {
  relay = await startRelay();
  dirk = onMesh(meshFor(relay.addr));
  await dirk.call(AddService, {
    name: "site",
    kind: "direct",
    target: "https://peershare-demo.httpeers.net",
  });
  await dirk.call(StartSharing, undefined);
});
afterAll(async () => {
  claudia?.dispose();
  await dirk?.call(StopSharing, undefined);
  dirk?.dispose();
  await relay?.stop();
});

describe("httpeers 0.6 — one windowed mux per peer", () => {
  it("a Guest's exchanges with the Sharer run over the mux protocol, on one stream", async () => {
    if (dirk == null) throw new Error("no sharer");
    const { url } = await dirk.call(Invite, undefined);
    claudia = onMesh(capturingGuestMesh());
    expect(await claudia.call(Join, { link: url })).toMatchObject({ stage: "joined" });
    if (guestNode == null) throw new Error("the Guest's node was not created through the platform");

    // Joining is a run of exchanges with the Sharer's hub (the invite, membership, the
    // service list), each of which used to open a libp2p stream of its own.
    const muxStreams = guestNode
      .getConnections()
      .flatMap((c) => c.streams)
      .filter((s) => s.protocol === MUX_PROTOCOL);
    expect(muxStreams.length).toBeGreaterThanOrEqual(1);
  });
});
