# DrakoBot-Verify-Addon

> ⚠️ **Archived test project**
>
> This repository was a private test project (May 2025) and is provided here as an
> archive only. It is **not maintained** and there is **no support**.
> **No guarantee is given that anything works** – use at your own risk.
>
> This is an **unofficial** addon. It is not affiliated with or endorsed by the
> developers of Drako Bot. Drako Bot itself is **not** included.

## What is it?

A member verification system for Drako Bot (discord.js v14): new members get a join role,
verify themselves and then receive the verified role (the join role can be removed
automatically).

**Verification levels** (`/verifyconfig level`):

| Level | Required |
|-------|----------|
| 1 | Verify button only |
| 2 | Verify button + math challenge (pick the right answer) |
| 3 | Verify button + verification website (180 s to confirm) |
| 4 | Verify button + verification website + math challenge |
| 5 | Verify button + verification website + math challenge + typed answer (modal) |

**Commands**

- `/verify` – start the verification
- `/verifypanel` – post a verification panel with custom text and link (*Administrator* or *Manage Server*)
- `/verifyconfig` – set level, verified role, join role, role to remove, redirect link (*Administrator*)
- `/unverify` – delete a user's verification so they can verify again (*Administrator* or *Moderate Members*)

**Verification website** (`verify_website.js`, Express, default port `8084`): shows a
privacy notice and rules checkbox, stores IP address, user agent and timestamps in
`verify_data/<userId>.json`, then redirects back to Discord. The data is deleted when the
user leaves the server or `/unverify` is used.

> Note: the bot replies, the website and the code comments are mostly in **German**
> (the verification flow itself supports German and English).

## Files

| File | Purpose |
|------|---------|
| `verify.js` | event addon: buttons, math challenge, modal, join role, cleanup on leave |
| `cmd_verify.js`, `cmd_verifypanel.js`, `cmd_verifyconfig.js`, `cmd_unverify.js` | slash commands |
| `verify_website.js` | standalone verification website |
| `verify_config.json` | configuration (role IDs, website URL, level, redirect link) |

## Setup (rough outline)

1. Copy the files into your Drako Bot addon folder.
2. `npm install` (`discord.js`, `express`, `body-parser`, `uuid`).
3. Edit `verify_config.json` (or use `/verifyconfig`):
   - `role` – role given after verification
   - `joinRole` – role given on join (optional)
   - `removeRole` – role removed after verification (optional, usually the join role)
   - `verifyLink` – public URL of the verification website
   - `redirectLink` – where the website redirects after success
   - `verificationLevel` – 1–5
4. For levels 3–5 start the website: `npm run website` (put it behind HTTPS / a reverse proxy).
   It must run in the same folder as the bot addon, because both use `verify_data/`.

## ⚠️ Security notice / known weaknesses

- The website does **not** check whether a challenge was really issued by the bot (the two
  processes only share the `verify_data/` folder). Anyone can create a verification file
  for any user ID by posting to `/submit` directly. Levels 4 and 5 still require solving the
  math challenge in Discord, level 3 can effectively be bypassed.
- The math challenge is simple and not a real bot protection.
- You are responsible for a correct privacy policy if you store IP addresses (e.g. GDPR).
  The privacy text in `verify_website.js` is only a generic example.

## Changes compared to the original private version

- Personal server/role/channel IDs and domains were replaced with placeholders, the
  privacy text was made generic.
- **Fixed a path traversal vulnerability**: the website used the user ID from the form as
  a file name without validation, which allowed overwriting e.g. `verify_config.json`
  from outside. User IDs, challenge IDs and tokens are now validated strictly.
- IP address and user agent are now taken from the request instead of hidden form fields.
- Fixed the permission checks of `/verifypanel`, `/verifyconfig` and `/unverify`
  (discord.js v13 flag names threw `BitFieldInvalid` on v14).
- Added `package.json`.

## Known state

Briefly tested (October 2026, Node.js 26, discord.js 14.27, mocked Discord client):
website page, token generation, input validation (path traversal attempts rejected),
storing the verification file; level 2 flow (wrong/right answer, roles added/removed),
join role on join, permission checks and `/verifyconfig level`.
Not tested against a real Drako Bot installation or a live Discord server.

## License

[MIT](LICENSE)
