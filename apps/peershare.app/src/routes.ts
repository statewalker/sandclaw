/** `/invite` is a Guest's page (D6); `/peer-share/invite` keeps older links working. Everything else is the hub. */
export function isGuestPage(pathname: string): boolean {
  return /^\/(peer-share\/)?invite(\/|$)/.test(pathname);
}
