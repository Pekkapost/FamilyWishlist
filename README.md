# Family Wishlist

<h4 align="center">A single-page web app for sharing family wishlists — gifts stay a surprise, picking them doesn't have to be.</h4>

## Layout

```
FamilyWishlist/
└── index.html          # the whole app — markup, styles, and script in one file
```

## Tech Stack

| Dependency | Version | Purpose |
|---|---|---|
| [JSONBin.io](https://jsonbin.io/) | API v3 | Shared storage for the wishlist (one private bin per family) |
| [Google Fonts](https://fonts.google.com/) | — | Lora (headings) + DM Sans (body) |
| HTML / CSS / JavaScript | — | No framework, no build step |

Everything lives in [`index.html`](index.html). There is nothing to install or compile.

## Setup

### **1. Get a JSONBin API key**

1. Sign up at <https://jsonbin.io>.
2. Copy your **Master API Key** from the dashboard.

The Master Key is only used once, during setup, and is never stored.

### **2. Host the page**

The invite link is built from the page's own URL, so the app needs to be served from somewhere your family can reach. Any static host works — the simplest is **GitHub Pages**:

1. On GitHub, open the repo's *Settings → Pages*.
2. Under *Build and deployment*, set *Source* to **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute the site is live at `https://<user>.github.io/FamilyWishlist/`.

For local testing you can open `index.html` directly in a browser, but invite links generated that way point at a file on your machine and won't work for anyone else.

### **3. Create the wishlist**

Open the page, enter your name and paste the Master API Key, then click **Create wishlist →**. The app:

1. Creates a private bin named `family-wishlist` holding `{ "wishes": [] }`.
2. Creates a scoped access key (`family-wishlist-key`) that can only **read** and **update** bins — no create, no delete.
3. Saves the bin id, access key, and your name to `localStorage` and opens the app.

### **4. Invite the family**

Click **🔗 Invite link** in the header to copy a link of the form `…/index.html?key=<access key>&bin=<bin id>`. Anyone who opens it only has to enter their name to join. The query string is stripped from the address bar as soon as the page loads.

## Architecture

All code is in [`index.html`](index.html); the script is split into labelled sections.

| Section | Description |
|---|---|
| **State** | Current user, access key, bin id, the in-memory `allWishes` array, and the active view/filter. |
| **Persistence** | `saveConfig()` / `loadConfig()` — reads and writes `fw_user`, `fw_apikey`, `fw_binid` in `localStorage`. |
| **JSONBin API** | `readBin()`, `writeBin()`, and `createBinAndAccessKey()`. Reads and writes use the scoped `X-Access-Key`; only setup uses `X-Master-Key`. |
| **Setup modes** | The three entry screens — **create** (new wishlist), **join** (arrived via invite link), **switch** (credentials saved, pick a name). |
| **App init** | `startApp()` loads the bin and polls it every 30 seconds to pick up other family members' changes. |
| **Rendering** | Builds the card grid, the family sidebar, and the sidebar counts from `allWishes`. |
| **Navigation** | Sidebar views (everyone / mine / I'm gifting / one person) and the priority / unclaimed filter chips. |
| **Wish CRUD** | Add, edit, delete, claim, unclaim. Each change updates the UI immediately, writes the full list back to the bin, and rolls back with a toast if the write fails. |
| **Invite link** | Copies the join URL to the clipboard, falling back to a prompt if clipboard access is blocked. |
| **Boot** | On `DOMContentLoaded`, picks a setup mode — or goes straight into the app — from saved config and the URL. |

Each wish is stored as:

```json
{
  "id": "lq2x8k3fa1b2",
  "name": "Cozy knit blanket",
  "price": "$50",
  "priority": "high",
  "link": "https://...",
  "notes": "Grey, queen size",
  "owner": "Mom",
  "claimedBy": null,
  "createdAt": 1714200000000
}
```

## Features

| Surface | Summary |
|---|---|
| **Setup Screen** | Create a new wishlist, join from an invite link, or switch user on a device that already has one saved. |
| **Sidebar** | **Browse** views with counts · **Family** list with one entry per person who has added a wish. |
| **Wish Grid** | Card per wish with priority dot, price, owner, notes, and an optional link. Filter chips above the grid. |
| **Add/Edit Modal** | Item name, approximate price, priority, link, and notes. |

### Sidebar

| Element | Behaviour |
|---|---|
| **Everyone's list** | Every wish from the whole family. |
| **My wishlist** | Wishes you added for yourself. |
| **I'm gifting** | Wishes you have claimed. |
| **Family** | One entry per wish owner, with a coloured initials avatar and their wish count. Click to see just their list. |

### Wish Grid

| Element | Behaviour |
|---|---|
| **Filter chips** | All · 🔴 High priority · 🟡 Medium · ⚪ Low · Not yet claimed. Combine with any sidebar view. |
| **Your own wishes** | Show *Edit* and *Delete*, and a *Your wish* badge in place of the claim button. |
| **Other people's wishes** | *🎁 I'll gift this* to claim; *Unclaim* if you claimed it; otherwise *Claimed by &lt;name&gt;*. |
| **Claimed cards** | Dimmed with a **✓ Claimed** badge. |

## Limitations

| Area | Notes |
|---|---|
| **Identity** | There are no accounts — a user is just the name typed in. Anyone with the invite link can sign in under any name, including someone else's. |
| **Surprise** | Claimed cards are dimmed and badged for everyone, including the wish's owner, so owners can see *that* a wish was claimed (but not by whom). |
| **Invite link** | The access key travels in the link itself. Share it only with family; anyone holding it can read and edit the whole list. |
| **Concurrent edits** | Every change writes the full list back, and other devices only refresh every 30 seconds. Two people editing at nearly the same time can overwrite each other — last write wins. |
| **Storage** | Saved config lives in the browser's `localStorage`. Clearing site data or switching browsers means re-joining with the invite link. |
| **Price** | Free text, not a number — no sorting or totals. |
| **JSONBin** | Depends on JSONBin.io being up, and on your account's free-tier request limits. |

## Authors

| Name | Role |
|---|---|
| [@Pekkapost](https://github.com/Pekkapost) | Author |
