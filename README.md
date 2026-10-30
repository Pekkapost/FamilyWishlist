# Family Wishlist

<h4 align="center">A single-page web app for sharing family wishlists — gifts stay a surprise, picking them doesn't have to be.</h4>

## Layout

```
FamilyWishlist/
├── index.html          # the whole app — markup, styles, and script in one file
├── config.js           # Firebase web app config (public identifiers, not secrets)
├── firestore.rules     # Firestore security rules — who can read and write what
└── worker/
    └── lookup.js       # Cloudflare Worker that reads a pasted link's name and price
```

## Tech Stack

| Dependency | Version | Purpose |
|---|---|---|
| [Firebase Authentication](https://firebase.google.com/docs/auth) | JS SDK 10.12.2 | Google sign-in |
| [Cloud Firestore](https://firebase.google.com/docs/firestore) | JS SDK 10.12.2 | Groups, members, wishes, and claims, with live updates |
| [Cloudflare Workers](https://developers.cloudflare.com/workers/) | Free plan | Reads a pasted link's page title and price to fill in a wish |
| [Google Fonts](https://fonts.google.com/) | — | Lora (headings) + DM Sans (body) |
| HTML / CSS / JavaScript | — | No framework, no build step |

The app is [`index.html`](index.html); the Firebase SDK loads from Google's CDN. All access control lives in [`firestore.rules`](firestore.rules) and is enforced by Firebase's servers, not the page.

## Setup

Everything fits on Firebase's free **Spark** plan — no billing account needed.

### **1. Create a Firebase project**

1. Go to the [Firebase console](https://console.firebase.google.com/) and click **Create a project**. Google Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method** → enable **Google**, pick a support email, and save.
3. **Build → Firestore Database → Create database**. Pick a location near you and start in **production mode**.

### **2. Publish the security rules**

In **Firestore Database → Rules**, replace the contents with [`firestore.rules`](firestore.rules) and click **Publish**. Without these rules nobody can read or write anything.

### **3. config.js**

**Project settings → General → Your apps → Web (`</>`)**. Register an app (no Hosting needed), then copy the four values from the `firebaseConfig` it shows into [`config.js`](config.js):

```js
export const firebaseConfig = {
  apiKey: '...',
  authDomain: '<project-id>.firebaseapp.com',
  projectId: '<project-id>',
  appId: '...'
};
```

These identify the project and are meant to be public — commit them. Anything they could be used for is still checked against `firestore.rules`.

### **4. Host the page**

The page loads as an ES module, so it has to be served over http(s) — opening `index.html` as a file shows a "couldn't start" message.

**GitHub Pages** — on GitHub, *Settings → Pages → Build and deployment*, set *Source* to **Deploy from a branch**, pick `main` and `/ (root)`, and save. The site is live at `https://<user>.github.io/FamilyWishlist/` after a minute.

**Locally** — from the repo root:

```bash
python -m http.server 8000
```

then open <http://localhost:8000>.

Google sign-in only works on domains Firebase trusts. `localhost` is allowed by default; for GitHub Pages add `<user>.github.io` under **Authentication → Settings → Authorized domains**.

### **5. Make yourself an admin**

1. Open the app and sign in with Google once.
2. In the console, **Authentication → Users**, copy your **User UID**.
3. **Firestore Database → Data → Start collection**. Collection ID `admins`, Document ID your UID, and add any field (e.g. `role` = `admin`). Save.
4. Reload the app. You now see **⚙ Groups** in the header, or a *Create Group* form if you're in no Groups yet.

Admins can only be added this way — the app itself can never write to `admins`.

### **6. Link autofill Worker (optional)**

Pasting a link fills in the name and price through a [Cloudflare Worker](worker/lookup.js). Without it the app still guesses a name from the link.

1. Create a free [Cloudflare](https://dash.cloudflare.com/sign-up) account. No domain is needed.
2. **Workers & Pages → Create application → Start with Hello World**. Name it `familywishlist-lookup` and deploy.
3. **Edit code**, replace everything with [`worker/lookup.js`](worker/lookup.js), and **Deploy**.
4. If your site isn't `https://pekkapost.github.io`, add its origin to `ALLOWED_ORIGINS` at the top of the Worker.
5. Set `LOOKUP_ENDPOINT` in [`index.html`](index.html) to the Worker's address, `https://familywishlist-lookup.<your-subdomain>.workers.dev/`.

The free plan allows 100,000 requests a day. The account's `workers.dev` subdomain appears in the public page, so pick one under **Workers & Pages → Account details → Subdomain** that you're happy to show.

### **7. Create a Group and invite family**

Create a Group from **⚙ Groups**. Each Group gets an 8-character invite code; share either the code or the **🔗 Copy link** link (`…/?invite=CODE`). Family members open the link — or enter the code — sign in with Google, pick the name shown to everyone, and they're in.

## Architecture

All app code is in [`index.html`](index.html); the script is split into labelled sections.

| Section | Description |
|---|---|
| **State** | Signed-in user, admin flag, the user's Groups, and the current Group's members, wishes, and claims. |
| **Persistence** | `localStorage` remembers the last Group you viewed; `sessionStorage` holds an invite code across sign-in. Neither is trusted for access. |
| **Screens** | Setup-card modes — *loading*, *config*, *sign in*, *join*, *no Group* — and the main app. |
| **Auth** | Google sign-in popup. On sign-in, checks `admins/{uid}` and starts the Groups listener. |
| **Groups** | Live listener on the Groups you belong to, and per-Group listeners for members, wishes, and claims. |
| **Invites & joining** | Looks up an invite code, shows the join screen, and joins in one batch (member doc + Group membership). Also *Leave this Group*. |
| **Admin** | Create Groups, copy or replace invite codes, remove members, delete Groups. |
| **Rendering** | Card grid, family sidebar, counts, and the Group picker. |
| **Navigation** | Sidebar views (everyone / mine / I'm gifting / one person) and the priority / unclaimed filter chips. |
| **Wish CRUD** | Add, edit, delete, claim, unclaim. The live listeners redraw the page when writes land. |
| **Link autofill** | When a link is pasted, guesses a name from the URL, then asks the Worker for the page title and price. Only fills fields that are empty or were filled by an earlier lookup. |
| **Boot** | Saves `?invite=` from the URL, then starts Firebase — or shows the config screen if [`config.js`](config.js) still has placeholders. |

### Data model

```
admins/{uid}                      # exists = admin; added by hand in the console
invites/{code}                    # { groupId, groupName, createdAt }
groups/{groupId}                  # { name, createdBy, createdAt, memberUids[] }
  ├── members/{uid}               # { name, photoURL, inviteCode, joinedAt }
  ├── wishes/{wishId}             # { name, price, priority, link, notes, ownerUid, createdAt }
  └── claims/{wishId}             # { uid, wishOwnerUid, claimedAt }
```

### Security rules

| Who | Can |
|---|---|
| **Anyone signed in** | Look up an invite code they already have. Join that code's Group under their own user id. |
| **Group members** | Read the Group's members and wishes. Add, edit, and delete their own wishes. Claim and unclaim other people's wishes. Leave. |
| **Wish owners** | Never read claims on their own wishes — the surprise is enforced by the server, not hidden in the page. |
| **Admins** | Create and delete Groups, create and replace invite codes, remove members, delete any wish. |

## Features

| Surface | Summary |
|---|---|
| **Setup Screen** | Sign in with Google, join from an invite link or code, or (admins) create the first Group. |
| **Header** | Group picker (with *+ Join with code…*) · your name · **⚙ Groups** for admins · add wish · sign out. |
| **Sidebar** | **Browse** views with counts · **Family** list of the current Group's members · *Leave this Group*. |
| **Wish Grid** | Card per wish with priority dot, price, owner, notes, and an optional link. Filter chips above the grid. |
| **Add/Edit Modal** | Link first — paste one and the name (and price, when the store publishes it) fill in automatically. Then item name, approximate price (a number — cards show it as `$49.99`), priority, and notes. |
| **Manage Groups** | Admin-only. Create Groups, see each one's invite code and members, and manage them. |

### Wish Grid

| Element | Behaviour |
|---|---|
| **Filter chips** | All · 🔴 High · 🟠 Medium · 🟡 Low · Not yet claimed. Combine with any sidebar view. |
| **Your own wishes** | *Edit* and *Delete*, and a *Your wish* badge. Never shows whether anyone has claimed it. |
| **Other people's wishes** | *🎁 I'll gift this* to claim; *Unclaim* if you claimed it; otherwise *Claimed by &lt;name&gt;*, dimmed. |
| **Live updates** | Changes from anyone in the Group appear within a second or two, no reload needed. |

### Manage Groups

| Element | Behaviour |
|---|---|
| **Create** | New Group with you as its first member and a fresh invite code. |
| **Invite** | *Copy link* · *Copy code* · *New code* — replacing a code stops the old one and its links from working; people already in the Group stay. |
| **Members** | Click × to remove someone. Their wishes in that Group are deleted. |
| **Delete Group** | Deletes the Group, its members, wishes, claims, and invite code. |

## Limitations

| Area | Notes |
|---|---|
| **Invite codes** | Codes don't expire. Anyone holding a code can join until you replace it with *New code*. |
| **Display names** | Picked when joining and fixed after that. To change one, remove the person and re-invite them. |
| **Admins** | Added by hand in the Firebase console (Setup step 5). There is no in-app admin management. |
| **Sign-in in app browsers** | Google blocks sign-in inside some in-app browsers (e.g. links opened from Messenger or Instagram). Open the link in Chrome or Safari instead. |
| **Phones** | The sidebar is hidden below 680 px wide, so the person filter and *Leave this Group* are desktop-only. |
| **Deletes** | Removing a member or deleting a Group runs from the admin's browser in batches. If it's interrupted, run it again to finish. |
| **Console access** | The surprise is enforced for app users. Whoever owns the Firebase project can still see every claim in the console. |
| **Price** | US dollars only — the field takes a number and cards add the `$`. No sorting or totals yet. |
| **Link autofill** | Best effort. Works on Amazon, LEGO, and most Shopify-style shops; Walmart, Etsy, Best Buy, and REI block it, and then the name is guessed from the URL and the price is left blank. Prices are dollars only. Results are cached for 6 hours, so a price can lag a recent change. |

## Authors

| Name | Role |
|---|---|
| [@Pekkapost](https://github.com/Pekkapost) | Author |
