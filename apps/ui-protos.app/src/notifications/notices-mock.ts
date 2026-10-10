import { today } from "../mock.js";
import type { Notice, NoticeKind } from "./inbox.js";

// Notices for the stories. "Now" is `today` (10 Oct, 10:00 UTC).

const minutesAgo = (min: number) => new Date(today.getTime() - min * 60_000);

const notice = (
  id: string,
  kind: NoticeKind,
  min: number,
  title: string,
  detail?: string,
  read = false,
): Notice => ({ id, kind, at: minutesAgo(min), title, detail, read });

/** Claire's list: a busy morning on top of a read week. */
export const history: Notice[] = [
  notice(
    "n_wait",
    "task-waiting",
    18,
    "“Update the Dupont offer” waits for you",
    "It asks to change Clients/Dupont — offer.docx",
  ),
  notice(
    "n_paul",
    "invite-accepted",
    3 * 60,
    "Paul joined with “Paul (accounting)”",
    "From Edge on Windows",
  ),
  notice(
    "n_unread",
    "files-unreadable",
    5 * 60,
    "3 files couldn't be read",
    "2 password-protected PDFs, 1 damaged spreadsheet",
  ),
  notice("n_idx", "indexing-done", 5 * 60 + 2, "Indexing finished", "412 files in Clients"),
  notice(
    "n_site",
    "site-built",
    26 * 60,
    "Site “Dupont project” built",
    "12 pages · private link",
    true,
  ),
  notice(
    "n_phone",
    "device-added",
    2 * 24 * 60,
    "Safari on iPhone was added to your identity",
    "Added from Firefox on Linux",
    true,
  ),
  notice(
    "n_mail",
    "service-down",
    3 * 24 * 60,
    "The email service stopped answering",
    "Back after 14 min",
    true,
  ),
  notice(
    "n_fail",
    "task-failed",
    4 * 24 * 60,
    "“Merge the Leroy brief” failed",
    "Leroy — brief.pdf is password-protected",
    true,
  ),
  notice(
    "n_marc",
    "invite-declined",
    18 * 24 * 60,
    "The invite “Marc (intern)” was declined",
    undefined,
    true,
  ),
];

/** Arriving now, while Claire looks at the app: three tasks end together, and a new device. */
export const arriving: Notice[] = [
  notice("n_q3", "task-finished", 0, "Q3 figures summary", "1 file created in Finance"),
  notice("n_inv", "task-finished", 1, "Invoice list for October", "1 file created in Finance"),
  notice("n_cont", "task-finished", 2, "Contacts cleanup", "Outputs/contacts.xlsx changed"),
  notice(
    "n_mac",
    "device-added",
    0,
    "Firefox on Mac was added to your identity",
    "Not you? Review your devices and remove it.",
  ),
];

/** The machine was off for two hours; two tasks waited and are running again. */
export const backOnline = {
  history: [
    notice(
      "n_off",
      "machine-offline",
      2 * 60 + 1,
      "The Sandclaw machine went offline",
      "2 tasks paused; new questions wait in this browser",
    ),
    ...history.filter((n) => n.read),
  ],
  arriving: [
    notice(
      "n_on",
      "machine-online",
      0,
      "The Sandclaw machine is back online",
      "Offline for 2 h · 2 tasks resumed: “Q3 figures summary”, “Invoice list for October”",
    ),
  ],
};
