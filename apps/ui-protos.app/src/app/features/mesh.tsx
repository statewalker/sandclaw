import {
  Avatar,
  AvatarFallback,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@statewalker/ui.view.shadcn";
import {
  Activity,
  Lock as LockIcon,
  Mail,
  Settings,
  Smartphone,
  UserRound,
  Users,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { BrowserData } from "../../browser-data/browser-data.js";
import { GroupPill } from "../../group-status/group-status.js";
import { InvitationsLog } from "../../invitations-log/invitations-log.js";
import { MyIdentityPage, UnlockScreen } from "../../my-identity/my-identity.js";
import { Services } from "../../services/services.js";
import { TeamOneList } from "../../team/team.js";
import {
  appViewsSlot,
  headerItemsSlot,
  Lock,
  menuItem,
  menuItemsSlot,
  OpenSettings,
  overlaysSlot,
  ShowPanel,
} from "../contracts.js";
import {
  all,
  createStore,
  type Feature,
  handle,
  provideAll,
  registerAll,
  settingsTab,
  useAppRuntime,
  useStore,
} from "../runtime.js";
import { menuContentClass, menuRowClass } from "../shell/menubar.js";
import { PanelPage } from "../shell/panel-page.js";

const PEOPLE = { admin: "Claire Morel", member: "Hugo Benali" } as const;

/** The group, its people and this device: Team, identity, invitations, the pill, the avatar, the lock. */
export const mesh: Feature = {
  id: "mesh",
  label: "Mesh",
  contribute(rt, ctx) {
    const admin = ctx.viewer === "admin";
    const name = PEOPLE[ctx.viewer];
    const locked = createStore(false);

    function AvatarMenu() {
      const { commands } = useAppRuntime();
      const initials = name
        .split(" ")
        .map((w) => w[0])
        .join("");
      return (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" aria-label={name} className="rounded-full">
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={4} className={menuContentClass}>
              <DropdownMenu.Item
                className={menuRowClass}
                onSelect={() => commands.call(ShowPanel, { id: "my-identity" })}
              >
                <UserRound className="size-4" /> My identity and devices
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuRowClass}
                onSelect={() => commands.call(OpenSettings, {})}
              >
                <Settings className="size-4" /> Settings
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={menuRowClass}
                onSelect={() => commands.call(Lock, undefined)}
              >
                <LockIcon className="size-4" /> Lock
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      );
    }

    function LockScreen() {
      // A modal dialog that cannot be dismissed: it traps Tab, and the shell's shortcuts stand down.
      const stay = (e: Event) => e.preventDefault();
      return (
        <Dialog open={useStore(locked)}>
          <DialogContent
            className="max-w-sm border-0 bg-transparent p-0 shadow-none sm:rounded-none [&>button]:hidden"
            onEscapeKeyDown={stay}
            onPointerDownOutside={stay}
            onInteractOutside={stay}
          >
            <DialogTitle className="sr-only">Locked</DialogTitle>
            <DialogDescription className="sr-only">
              Type your password to unlock the App.
            </DialogDescription>
            <UnlockScreen onUnlock={() => locked.set(false)} />
          </DialogContent>
        </Dialog>
      );
    }

    return all(
      registerAll(rt.slots, appViewsSlot, [
        {
          id: "team",
          title: "Team",
          Icon: Users,
          zone: "left",
          activity: 50,
          mobile: "more",
          render: () => (
            <PanelPage>
              <TeamOneList viewer={ctx.viewer} />
            </PanelPage>
          ),
        },
        {
          id: "my-identity",
          title: "My identity and devices",
          Icon: UserRound,
          zone: "center",
          render: () => (
            <PanelPage>
              <MyIdentityPage />
            </PanelPage>
          ),
        },
        ...(admin
          ? [
              {
                id: "invitations-log",
                title: "Invitations log",
                Icon: Mail,
                zone: "center" as const,
                render: () => (
                  <PanelPage>
                    <InvitationsLog />
                  </PanelPage>
                ),
              },
            ]
          : []),
      ]),
      provideAll(rt.slots, headerItemsSlot, [
        { id: "group", order: 10, Component: () => <GroupPill state="connected" /> },
        { id: "avatar", order: 30, Component: AvatarMenu },
      ]),
      provideAll(rt.slots, menuItemsSlot, [
        menuItem(
          ShowPanel,
          { id: "team" },
          { id: "mesh.team", menu: "Mesh", order: 10, label: "Team", Icon: Users },
        ),
        ...(admin
          ? [
              menuItem(
                ShowPanel,
                { id: "invitations-log" },
                {
                  id: "mesh.invitations",
                  menu: "Mesh",
                  order: 20,
                  label: "Invitations log",
                  Icon: Mail,
                },
              ),
            ]
          : []),
        menuItem(
          ShowPanel,
          { id: "team" },
          { id: "mesh.status", menu: "Mesh", order: 5, label: "Group status", Icon: Activity },
        ),
        menuItem(
          ShowPanel,
          { id: "my-identity" },
          {
            id: "mesh.identity",
            menu: "Mesh",
            order: 30,
            label: "My identity and devices",
            Icon: UserRound,
          },
        ),
        menuItem(
          OpenSettings,
          { section: "me" },
          { id: "mesh.link", menu: "Mesh", order: 40, label: "Link a device…", Icon: Smartphone },
        ),
        ...(admin
          ? [
              menuItem(
                OpenSettings,
                { section: "services" },
                { id: "mesh.services", menu: "Mesh", order: 50, label: "Services…" },
              ),
            ]
          : []),
        menuItem(Lock, undefined, {
          id: "file.lock",
          menu: "File",
          order: 90,
          label: "Lock",
          Icon: LockIcon,
        }),
        menuItem(
          ShowPanel,
          { id: "team" },
          { id: "view.team", menu: "View", order: 45, label: "Team", Icon: Users },
        ),
      ]),
      settingsTab(rt.slots, "me", 10, () => <MyIdentityPage />),
      settingsTab(rt.slots, "browser", 60, (go) => <BrowserData onOpenIdentity={() => go("me")} />),
      admin ? settingsTab(rt.slots, "team", 100, () => <TeamOneList viewer="admin" />) : () => {},
      admin ? settingsTab(rt.slots, "invitations", 105, () => <InvitationsLog />) : () => {},
      admin
        ? settingsTab(rt.slots, "services", 108, () => <Services variant="inline" />)
        : () => {},
      handle(rt, Lock, () => locked.set(true)),
      rt.slots.provide(overlaysSlot, { id: "lock", Component: LockScreen }),
    );
  },
};
