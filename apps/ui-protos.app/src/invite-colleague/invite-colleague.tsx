import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@statewalker/ui.view.shadcn";
import { Check, Copy, Link2, UserPlus } from "lucide-react";
import { useState } from "react";
import { colleagues, initials, inviteLink, pendingInvites, type Role } from "../mock.js";

function CopyLinkField({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={link} className="font-mono text-xs" aria-label="Invite link" />
      <Button
        variant="outline"
        size="icon"
        aria-label="Copy invite link"
        onClick={() => {
          void navigator.clipboard?.writeText(link);
          setCopied(true);
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Role)}>
      <SelectTrigger className="w-32" aria-label="Role">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="member">Member</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Variant A: one button opens a dialog that produces a link to send by any channel. */
export function InviteLinkDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [role, setRole] = useState<Role>("member");
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState(false);
  return (
    <Dialog defaultOpen={defaultOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite a colleague
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a colleague</DialogTitle>
          <DialogDescription>
            Send the link by email or chat. Opening it in a browser connects that browser to your
            office machine — nothing to install.
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="grid gap-2">
            <Label>Invite link for {label || "a colleague"}</Label>
            <CopyLinkField link={inviteLink} />
            <p className="text-muted-foreground text-xs">Works once. Expires in 7 days.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="invite-label">Who is it for?</Label>
              <Input
                id="invite-label"
                placeholder="e.g. Paul (accounting)"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Role</Label>
              <RoleSelect value={role} onChange={setRole} />
            </div>
          </div>
        )}
        <DialogFooter>
          {created ? (
            <Button variant="outline" onClick={() => setCreated(false)}>
              Invite someone else
            </Button>
          ) : (
            <Button onClick={() => setCreated(true)}>
              <Link2 /> Create link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Variant B: the team page itself is the invite surface; pending invites sit beside members. */
export function TeamPanel() {
  const [role, setRole] = useState<Role>("member");
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>People whose browsers can reach this office machine.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex gap-2">
          <Input placeholder="Name or note for the invite" aria-label="Invite label" />
          <RoleSelect value={role} onChange={setRole} />
          <Button>
            <Link2 /> Invite
          </Button>
        </div>
        <Separator />
        <ul className="grid gap-3">
          {colleagues.map((c) => (
            <li key={c.email} className="flex items-center gap-3">
              <Avatar>
                <AvatarFallback>{initials(c.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="text-muted-foreground truncate text-xs">{c.email}</div>
              </div>
              <span className="text-muted-foreground text-xs">{c.lastSeen}</span>
              <span className="bg-secondary rounded-md px-2 py-0.5 text-xs capitalize">
                {c.role}
              </span>
            </li>
          ))}
          {pendingInvites.map((p) => (
            <li key={p.label} className="flex items-center gap-3 opacity-70">
              <Avatar>
                <AvatarFallback>
                  <Link2 className="size-4" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.label}</div>
                <div className="text-muted-foreground text-xs">
                  Invite pending · expires {p.expires}
                </div>
              </div>
              <Button variant="ghost" size="sm">
                Copy link
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
