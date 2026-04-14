# BSI Roadmap

A development roadmap management tool for **Blackforge Space Industries**. Track products, phases, tasks, and subtasks with role-based access control — styled with a retro cyberpunk aesthetic.

---

## Features

- **Admin / Guest roles** — Admins have full CRUD access; guests are read-only
- **MFA authentication** — TOTP-based two-factor login for admin accounts
- **GitHub-backed storage** — Roadmap data and credentials live in GitHub repos
- **Offline fallback** — localStorage cache keeps the app usable without a connection
- **Progress tracking** — Per-product completion percentages calculated automatically
- **Lore database** — Separate narrative page with company, ship, crew, and station lore

---

## Tech Stack

- Vanilla HTML / CSS / JavaScript — no frameworks, no build step
- GitHub REST API v3 — data storage and auth config
- Web Crypto API — SHA-256 password hashing, HMAC-SHA1 TOTP

---

## Setup

### 1. Prerequisites

- A modern browser (Chrome, Firefox, Edge, Safari)
- A GitHub Personal Access Token with `repo` read/write scope
- A private GitHub repo (`bsi-config`) containing `config.json` (see below)

### 2. Clone & serve

```bash
git clone https://github.com/DeviousWings/bsi-roadmap.git
cd bsi-roadmap
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

### 3. GitHub config repo

Create a private repo named `bsi-config` with a file `config.json`:

```json
{
  "username": "your_admin_username",
  "passwordHash": "sha256_hex_of_your_password",
  "mfaSecret": "BASE32_TOTP_SECRET"
}
```

Generate a SHA-256 hash of your password using any standard tool. The `mfaSecret` is a Base32-encoded secret compatible with Google Authenticator or Authy.

### 4. First login

On first load you will be prompted for your GitHub Personal Access Token. It is stored in `localStorage` and used for all API calls. After that:

- **Admin** — enter your username, password, and MFA code
- **Guest** — click `GUEST ACCESS` for read-only view

---

## Data Structure

Roadmap data is stored in `data.json` as a hierarchy:

```
Products
  └── Phases
        └── Tasks
              └── Subtasks (optional)
```

Each task supports a completion flag and optional notes. Changes are saved to GitHub automatically with visual confirmation.

---

## File Overview

| File | Description |
|---|---|
| `index.html` | Main dashboard shell |
| `lore.html` | Lore database page |
| `auth.js` | Authentication — login, MFA, session management |
| `app.js` | App logic — render, CRUD, modals, progress |
| `style.css` | Dark cyberpunk theme |
| `data.json` | Roadmap data |

---

## Session Behavior

- Sessions expire after **24 hours** and are stored in `localStorage`
- Logging out clears the session and returns to the login screen
- Admin UI elements are hidden for guest sessions
