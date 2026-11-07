/**
 * The Sharer's page, the hub: `/` (and `/peer-share`). Sharing starts as soon
 * as the page is open, and stops with the tab (ADR 0001). Services without
 * CORS go through the local proxy, which is checked only when it is in use:
 * after its settings are saved or come from a link, or on its first request.
 */

import { createRuntime, peershare, StartSharing } from "@statewalker/peershare.share";
import { browserMesh, idbSharerStore } from "@statewalker/peershare.share/browser";
import {
  BridgeStatus,
  PeerShareProvider,
  ProxySettings,
  SharerScreen,
} from "@statewalker/peershare.share-react";
import { useEffect, useRef, useState } from "react";
import { type BridgeDiagnosis, diagnoseBridge } from "./bridge-diagnosis.js";
import type { PeerShareConfig } from "./config.js";
import {
  loadProxySettings,
  proxySupported,
  type ProxySettings as Settings,
  saveProxySettings,
} from "./proxy-settings.js";

export function SharerApp({ config }: { config: PeerShareConfig }) {
  const fromLink = location.hash.includes("localUrl=");
  const [settings, setSettings] = useState(() => loadProxySettings(window));
  const current = useRef(settings);
  current.current = settings;
  const [diagnosis, setDiagnosis] = useState<BridgeDiagnosis | "checking">();
  const checked = useRef(false);

  const check = async () => {
    checked.current = true;
    setDiagnosis("checking");
    const { url, key } = current.current;
    setDiagnosis(await diagnoseBridge({ localUrl: url, token: key }));
  };

  const [rt] = useState(() => {
    const runtime = createRuntime();
    peershare({
      store: idbSharerStore(),
      // Read per request; the first request through the proxy checks it.
      bridge: () => {
        if (!checked.current) void check();
        return { base: current.current.url, token: current.current.key };
      },
      mesh: browserMesh({
        relayAddrs: config.relayAddrs,
        invitePage: config.invitePage ?? `${location.origin}/invite`,
        dev: config.dev ?? false,
      }),
    }).contribute(runtime);
    return runtime;
  });
  useEffect(() => {
    void rt.commands.call(StartSharing, undefined).promise;
    if (fromLink) void check();
  }, []);

  const save = (next: Settings) => {
    saveProxySettings(window, next);
    current.current = next;
    setSettings(next);
    void check();
  };

  return (
    <PeerShareProvider rt={rt}>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
        <ProxySettings
          value={settings}
          command={`curl -fsSL ${location.origin}/proxy/peershare-proxy.sh | sh`}
          supported={proxySupported(navigator.userAgent)}
          onSave={save}
        />
        {diagnosis != null && (
          <BridgeStatus permission="prompt" diagnosis={diagnosis} onCheck={check} />
        )}
        <SharerScreen />
      </main>
    </PeerShareProvider>
  );
}
