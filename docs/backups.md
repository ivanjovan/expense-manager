# Backups

SRS §19 treats this as a feature, not an operational footnote:

> Moving off Excel means moving from a file the household can copy and email
> to a database they cannot. If data loss is possible, this application is a
> downgrade regardless of its features.

There are three layers, and they cover different failures.

| Layer | Protects against | Automatic |
|---|---|---|
| Neon point-in-time restore | a bad delete, inside the retention window | yes, by Neon |
| Nightly encrypted dump → Google Drive | losing the Neon account or project | yes, once configured |
| Excel export (owner → Settings) | this app ceasing to exist | no — you click it |

Only the middle layer survives losing the database provider, and only the
last is readable without any of this software.

## How the Google Drive part actually works

There is one idea here, and the rest is plumbing:

> A script cannot log in to Google. So you log in **once, in your own
> browser**, and Google hands back a *refresh token*. `rclone` stores that
> token in a config file. From then on, any machine holding that file can
> write to your Drive as you — no browser, no password.

So the work splits in two, and they are independent:

1. **Create the token** — done once, on your own machine, in a browser
   (§ Step 2 below). Unavoidable; nothing can do this for you.
2. **Decide what runs the script on a schedule** — your machine, or GitHub
   Actions. Both use the same token from step 1.

A Google **service account will not work here**, which is the usual dead
end. Service accounts have no Drive storage of their own, so uploading into
a folder shared with one fails with `storageQuotaExceeded` on a personal
(`@gmail.com`) account — that path only works with a Workspace Shared
Drive. Logging in as yourself also means *you* own the resulting files,
which is what you want if this repo ever disappears.

## Step 1 — prove the dump works, before involving Drive

No system packages are required: the script uses `pg_dump` if it is
installed and otherwise runs a pinned one via Docker.

```bash
export DIRECT_DATABASE_URL="postgresql://..."   # direct host, not -pooler
export BACKUP_PASSPHRASE="$(openssl rand -base64 32)"   # then save it, see below
npm run db:backup:remote
```

You should get a file in `backups/`. If you do, the hard part is done —
everything after this is a file copy.

The connection string is the **direct** Neon host, i.e. the one *without*
`-pooler` in the hostname. `pg_dump` holds a long-lived snapshot, which
PgBouncer's transaction pooling breaks. It is the same value migrations
use, and its Prisma-only query parameters (`?schema=public`, etc.) are
stripped automatically — libpq rejects the URL outright otherwise.

**Save that passphrase somewhere that is not this repo, not the database,
and not Google Drive.** A password manager is right. An encrypted backup
whose passphrase was only ever kept next to the backup is not encrypted,
and one whose passphrase is lost is not a backup.

## Step 2 — connect rclone to your Drive

```bash
rclone config
```

Answer as follows — everything not listed can take its default:

| Prompt | Answer |
|---|---|
| `e/n/d/r/c/s/q>` | `n` (new remote) |
| `name>` | `gdrive` |
| `Storage>` | `drive` |
| `client_id>` / `client_secret>` | blank |
| `scope>` | **`3`** — `drive.file`, limits rclone to files it created |
| `service_account_file>` | blank — see the warning above |
| `Edit advanced config?` | `n` |
| `Use web browser to authenticate?` | `y` |

The browser step opens `localhost:53682`. On WSL that works from the
Windows browser, since WSL2 shares localhost — if it does not open by
itself, copy the printed URL across manually.

Then verify, and create the destination folder:

```bash
rclone lsd gdrive:                              # lists your Drive folders
rclone mkdir gdrive:expense-manager-backups
rclone copy backups gdrive:expense-manager-backups --include "*.dump.gpg" -P
rclone lsl gdrive:expense-manager-backups       # confirm it arrived
```

At this point you have working backups to Google Drive. What remains is
only making it happen without you.

The config file (`~/.config/rclone/rclone.conf`) now contains the refresh
token — treat it as a credential. Revoke it from your Google account's
third-party access page if it leaks.

## Step 3 — run it on a schedule

Pick one.

### Option A — your machine (works today)

No repository permissions needed. Add a cron entry:

```bash
crontab -e
```

```cron
15 2 * * * cd ~/dev/expense-manager && DIRECT_DATABASE_URL="postgresql://..." BACKUP_PASSPHRASE="..." ./scripts/backup-remote.sh >> /tmp/backup.log 2>&1 && rclone copy backups gdrive:expense-manager-backups --include "*.dump.gpg" >> /tmp/backup.log 2>&1
```

The obvious limitation: it only runs when the machine is on. Fine as a
starting point, and better than the alternative of waiting.

### Option B — GitHub Actions (survives your laptop)

`.github/workflows/backup.yml` runs at 02:15 UTC and can be triggered by
hand from the Actions tab. **It cannot be committed with the current token
— pushing `.github/` needs a PAT with `workflow` scope**, the same blocker
as `ci.yml`. Add the file through the GitHub web UI, or use a token with
that scope.

It needs four repository secrets (Settings → Secrets and variables →
Actions):

| Secret | Value |
|---|---|
| `DIRECT_DATABASE_URL` | from step 1 |
| `BACKUP_PASSPHRASE` | from step 1 |
| `RCLONE_CONFIG_BASE64` | `base64 -w0 ~/.config/rclone/rclone.conf` |
| `RCLONE_REMOTE` | `gdrive:expense-manager-backups` |

Then run it once from the Actions tab rather than waiting for 02:15 — a
schedule you have never triggered by hand is a schedule you have not
tested.

## Restoring

The point of §19 is that this has been *done*, not just documented.

```bash
# 1. Fetch a backup
rclone copy gdrive:expense-manager-backups ./backups \
  --include "expense_manager-2026*.dump.gpg"

# 2. Decrypt
gpg --batch --decrypt --passphrase "$BACKUP_PASSPHRASE" \
    --output restored.dump backups/expense_manager-<timestamp>.dump.gpg

# 3. Restore into a scratch database first — safe, and re-runnable as a drill
./scripts/restore.sh restored.dump

# 4. Only for real disaster recovery:
./scripts/restore.sh restored.dump --into-original
```

Do step 3 at least once now, and again whenever the schema changes
substantially. A backup you have never restored is a guess.

## Retention

90 days of nightly dumps, pruned after a successful upload — a failed
backup never deletes the last good one.

## What the script refuses to do

`scripts/backup-remote.sh` writes to `backups/`, which is gitignored. It
fails loudly rather than producing something that merely looks like a
backup:

- no passphrase → refuses to run, rather than quietly writing plaintext;
- dump under 1KB → treated as failed, because an unreachable database still
  produces a small, well-formed encrypted file that only reveals itself at
  restore time;
- any non-zero exit → the partial file is deleted, since `gpg` has usually
  written a few bytes by the time `pg_dump` fails.
