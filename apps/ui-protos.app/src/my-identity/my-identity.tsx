import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Label,
  Separator,
} from "@statewalker/ui.view.shadcn";
import { ArrowLeft, Lock, LogOut, Pencil, Plus, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { type Device, group, initials, type Person, people, today } from "../mock.js";

const claire = people.find((p) => p.id === "pk_claire") as Person;
const claireDevices = claire.devices ?? [];

/** "Lock this browser": off, on (asked on return), or locked right now. */
export type BrowserLock = "off" | "on" | "locked";

export interface MyIdentityProps {
  /** Claire has only this browser: leaving needs a new invite to come back. */
  onlyDevice?: boolean;
  /** This browser's lock; `locked` starts on the unlock screen. */
  lock?: BrowserLock;
  /** The Sandclaw machine answers; removing a device needs it. */
  machineOnline?: boolean;
}

/** "added 40 days ago", relative to the prototypes' `today`. */
function added(date: Date): string {
  const days = Math.round((today.getTime() - date.getTime()) / 86_400_000);
  if (days <= 0) return "added today";
  if (days === 1) return "added yesterday";
  return `added ${days} days ago`;
}

/** The state behind both layouts: what `getMe()` returns, plus this browser's lock. */
function useMe({
  onlyDevice = false,
  lock: initialLock = "off",
  machineOnline = true,
}: MyIdentityProps) {
  const [name, setName] = useState(claire.name);
  const [devices, setDevices] = useState<Device[]>(
    onlyDevice ? claireDevices.filter((d) => d.isThisDevice) : claireDevices,
  );
  const [lock, setLock] = useState<BrowserLock>(initialLock);
  const [left, setLeft] = useState<null | { erased: boolean }>(null);
  return {
    name,
    setName,
    isAdmin: claire.role === "admin",
    devices,
    removeDevice: (peerId: string) => setDevices((all) => all.filter((d) => d.peerId !== peerId)),
    machineOnline,
    lock,
    setLock,
    left,
    leave: (erased: boolean) => setLeft({ erased }),
  };
}

type Me = ReturnType<typeof useMe>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function NameEditor({ me }: { me: Me }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg font-medium">{me.name}</span>
        <Button size="sm" variant="ghost" onClick={() => setDraft(me.name)}>
          <Pencil /> Change
        </Button>
      </div>
    );
  }
  const save = () => {
    if (draft.trim()) me.setName(draft.trim());
    setDraft(null);
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Input
        aria-label="Your name"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        className="max-w-xs"
      />
      <Button size="sm" type="submit" disabled={!draft.trim()}>
        Save
      </Button>
      <Button size="sm" variant="ghost" type="button" onClick={() => setDraft(null)}>
        Cancel
      </Button>
    </form>
  );
}

function MeSection({ me }: { me: Me }) {
  return (
    <Section title="Me">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          <AvatarFallback>{initials(me.name)}</AvatarFallback>
        </Avatar>
        <div className="grid gap-1">
          <NameEditor me={me} />
          <p className="text-muted-foreground text-xs">
            People in {group.name} will see this name.
          </p>
          <p className="text-sm">{me.isAdmin ? `Admin of ${group.name}` : "Member"}</p>
        </div>
      </div>
    </Section>
  );
}

function RemoveDevice({ me, device }: { me: Me; device: Device }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" disabled={!me.machineOnline}>
          <Trash2 /> Remove
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {device.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {device.label} will no longer reach {group.name}. Files and chats kept on it stay there.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-muted-foreground text-sm">
          Use this when a phone or computer is lost or no longer yours.
        </p>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => me.removeDevice(device.peerId)}>
            Remove device
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DevicesSection({ me }: { me: Me }) {
  const [linkNote, setLinkNote] = useState(false);
  return (
    <Section title="My devices">
      <ul className="divide-y rounded-md border">
        {me.devices.map((d) => (
          <li key={d.peerId} className="flex items-center gap-3 px-3 py-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                d.online ? "bg-success" : "bg-muted-foreground/40",
              )}
            />
            <div className="flex-1">
              <div className="text-sm font-medium">
                {d.label}
                {d.isThisDevice && (
                  <span className="bg-secondary ml-2 rounded-full px-2 py-0.5 text-xs font-normal">
                    this device
                  </span>
                )}
              </div>
              <div className="text-muted-foreground text-xs">
                {d.online ? "online" : "offline"} · {added(d.addedAt)}
              </div>
            </div>
            {!d.isThisDevice && <RemoveDevice me={me} device={d} />}
          </li>
        ))}
      </ul>
      {!me.machineOnline && me.devices.length > 1 && (
        <p className="text-muted-foreground text-xs">
          Removing a device needs the Sandclaw machine, which isn&apos;t answering. Ask{" "}
          {group.admin} to check it&apos;s switched on.
        </p>
      )}
      <div>
        <Button size="sm" variant="outline" onClick={() => setLinkNote(true)}>
          <Plus /> Link a device
        </Button>
      </div>
      {linkNote && (
        <p className="text-muted-foreground text-xs">
          <Smartphone className="mr-1 inline size-3.5" />
          Opens the "Link a device" flow (another prototype).
        </p>
      )}
    </Section>
  );
}

function LockSetup({ me, onDone }: { me: Me; onDone: () => void }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="grid gap-3 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!first) return setError("Choose a password.");
        if (first !== second) return setError("The passwords don't match.");
        me.setLock("on");
        onDone();
      }}
    >
      <p className="text-sm">
        If you forget this password, the files and chats in this browser can&apos;t be opened again.
        You can still get back into {group.name} by linking this browser again from another of your
        devices.
      </p>
      <div className="grid gap-1">
        <Label htmlFor="lock-1">Password</Label>
        <Input
          id="lock-1"
          type="password"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="lock-2">Type it again</Label>
        <Input
          id="lock-2"
          type="password"
          value={second}
          onChange={(e) => setSecond(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Turn on lock
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function BrowserSection({ me }: { me: Me }) {
  const [settingUp, setSettingUp] = useState(false);
  return (
    <Section title="This browser">
      <p className="text-muted-foreground text-sm">
        Your files and chats are kept in this browser. A lock keeps them private if someone else
        uses this computer.
      </p>
      {me.lock === "off" ? (
        settingUp ? (
          <LockSetup me={me} onDone={() => setSettingUp(false)} />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-48 flex-1 text-sm">Lock this browser: off</span>
            <Button size="sm" variant="outline" onClick={() => setSettingUp(true)}>
              <Lock /> Lock this browser…
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-48 flex-1 text-sm">
            Lock this browser: on. You&apos;ll be asked for the password when you come back.
          </span>
          <Button size="sm" variant="outline" onClick={() => me.setLock("locked")}>
            <Lock /> Lock now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => me.setLock("off")}>
            Turn off
          </Button>
        </div>
      )}
      <p className="text-muted-foreground text-xs">
        Locking works even when the Sandclaw machine is offline: it happens in this browser.
      </p>
    </Section>
  );
}

function LeaveSection({ me }: { me: Me }) {
  const [erase, setErase] = useState(false);
  const only = me.devices.length === 1;
  return (
    <Section title="Leave">
      <div className="border-destructive/50 flex flex-wrap items-center gap-3 rounded-md border p-3">
        <span className="min-w-48 flex-1 text-sm">
          Stop using {group.name} on this device. Your other devices are not affected.
        </span>
        <AlertDialog onOpenChange={() => setErase(false)}>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive">
              <LogOut /> Leave the group on this device
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave {group.name} on this device?</AlertDialogTitle>
              <AlertDialogDescription>
                This browser will no longer reach the Sandclaw machine.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {only && (
              <p className="border-warning/60 rounded-md border p-3 text-sm">
                This is your only device in {group.name}. After leaving, you can only come back with
                a new invite.
              </p>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={erase}
                onChange={(e) => setErase(e.target.checked)}
              />
              <span>
                Also erase the files and chats kept in this browser
                <span className="text-muted-foreground block text-xs">
                  {erase
                    ? "They will be gone for good. This cannot be undone."
                    : "They stay in this browser; you can still open them here."}
                </span>
              </span>
            </label>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white"
                onClick={() => me.leave(erase)}
              >
                {erase ? "Leave and erase" : "Leave"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Section>
  );
}

/** Shown after leaving: what is left in this browser. */
function LeftScreen({ me }: { me: Me }) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>This browser has left {group.name}</CardTitle>
        <CardDescription>
          {me.left?.erased
            ? "The files and chats that were kept here have been erased."
            : "The files and chats kept here are still in this browser."}{" "}
          To come back, open a new invite link
          {me.devices.length > 1 ? " or link this browser from another of your devices" : ""}.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

/** The unlock screen: the browser is locked, nothing is shown until the password is typed. */
export function UnlockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [forgot, setForgot] = useState(false);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" /> This browser is locked
        </CardTitle>
        <CardDescription>
          Type your password to open your files and chats in {group.name}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (password) onUnlock();
          }}
        >
          <Label htmlFor="unlock">Password</Label>
          <Input
            id="unlock"
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={!password}>
            Unlock
          </Button>
        </form>
        <Button variant="link" className="justify-self-start px-0" onClick={() => setForgot(true)}>
          Forgot it?
        </Button>
        {forgot && (
          <div className="grid gap-2 rounded-md border p-3 text-sm">
            <p>
              Without the password, the files and chats in this browser can&apos;t be opened — not
              by you, not by {group.admin}, not by anyone.
            </p>
            <p>
              You can start over: this browser is emptied, and you link it again from another of
              your devices (or ask {group.admin} for a new invite). Copies kept on your other
              devices are not affected.
            </p>
            <Button size="sm" variant="destructive" className="justify-self-start">
              Empty this browser and start over
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Settings({ me, onBack }: { me: Me; onBack?: () => void }) {
  if (me.left) return <LeftScreen me={me} />;
  if (me.lock === "locked") return <UnlockScreen onUnlock={() => me.setLock("on")} />;
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        {onBack && (
          <Button size="sm" variant="ghost" className="justify-self-start" onClick={onBack}>
            <ArrowLeft /> Back
          </Button>
        )}
        <CardTitle>My identity and devices</CardTitle>
        <CardDescription>You, in {group.name}.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <MeSection me={me} />
        <Separator />
        <DevicesSection me={me} />
        <Separator />
        <BrowserSection me={me} />
        <Separator />
        <LeaveSection me={me} />
      </CardContent>
    </Card>
  );
}

/** A — one settings page: Me, Devices, This browser, Leave, stacked. */
export function MyIdentityPage(props: MyIdentityProps) {
  return <Settings me={useMe(props)} />;
}

/** B — a compact card opened from the avatar in the top bar; the full page is one click away. */
export function MyIdentityCard(props: MyIdentityProps) {
  const me = useMe(props);
  const [open, setOpen] = useState(true);
  const [full, setFull] = useState(false);
  if (full || me.left || me.lock === "locked") {
    return <Settings me={me} onBack={full ? () => setFull(false) : undefined} />;
  }
  const online = me.devices.filter((d) => d.online).length;
  return (
    <div className="relative w-[28rem] max-w-full">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <span className="text-sm">{group.name}</span>
        <button
          type="button"
          aria-label="Me"
          className="rounded-full"
          onClick={() => setOpen((o) => !o)}
        >
          <Avatar className="size-8">
            <AvatarFallback>{initials(me.name)}</AvatarFallback>
          </Avatar>
        </button>
      </div>
      {open && (
        <Card className="absolute top-14 right-2 w-72 gap-3 py-4">
          <CardContent className="grid gap-3 px-4">
            <div>
              <div className="font-medium">{me.name}</div>
              <div className="text-muted-foreground text-xs">
                {me.isAdmin ? `Admin of ${group.name}` : `Member of ${group.name}`}
              </div>
            </div>
            <div className="text-sm">
              {me.devices.length === 1 ? "1 device" : `${me.devices.length} devices`} · {online}{" "}
              online
            </div>
            <Separator />
            {me.lock === "on" ? (
              <Button size="sm" variant="outline" onClick={() => me.setLock("locked")}>
                <Lock /> Lock now
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setFull(true)}>
                <Lock /> Lock this browser…
              </Button>
            )}
            <Button size="sm" variant="link" className="px-0" onClick={() => setFull(true)}>
              My identity and devices →
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
