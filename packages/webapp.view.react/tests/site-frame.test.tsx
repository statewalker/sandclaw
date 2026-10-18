// React vitest (jsdom + @testing-library/react) for the SiteFrame renderer — task 5.2 /
// webapp-dock-view R2 "Client visible in the dock tab". The pure component renders an
// <iframe> whose src is exactly baseUrl + clientEntry.

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SiteFrame } from "../src/site-frame.js";

afterEach(cleanup);

describe("SiteFrame", () => {
  it("renders an iframe whose src is baseUrl + the `~/`-prefixed clientEntry the open command emits", () => {
    // The open command stores `clientEntry: `~/${config.clientEntry}`` (webapp.browser
    // open-web-app.ts) because the hosted site serves project files under the `~/` prefix,
    // so this is the exact params shape the dock spec carries — not a bare `client/...`.
    const { container } = render(
      <SiteFrame baseUrl="http://site.local/abcd/" clientEntry="~/client/index.html" />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe("http://site.local/abcd/~/client/index.html");
  });
});
