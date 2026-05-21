# gtools-cli

A command-line tool for interacting with Google services. Currently supports:

- **Google Tag Manager (GTM)** — containers, tags, triggers, variables, and custom templates
- **Google Docs** — read document content as plain text
- **Google Sheets** — read spreadsheet values across all tabs; push CSV files into tabs

Built with [Bun](https://bun.sh) and the Google APIs.

## Requirements

- [Bun](https://bun.sh) v1.0+
- A Google OAuth 2.0 client (Desktop app type)
- Access to the Google services you want to query (GTM, Docs, Sheets)

## Setup

**1. Clone and install dependencies**

```bash
git clone https://github.com/Dylan0916/gtools-cli.git
cd gtools-cli
bun install
```

**2. Set up Google OAuth credentials**

Create a Google OAuth 2.0 client (Desktop app) in [Google Cloud Console](https://console.cloud.google.com/apis/credentials), then add to `~/.zshrc`:

```bash
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
source ~/.zshrc
```

Required OAuth scopes (requested automatically on login):
- `tagmanager.edit.containers` — edit GTM containers (but not publish)
- `documents.readonly` — read Google Docs
- `spreadsheets.readonly` — read Google Sheets (upgraded to `spreadsheets` with `--write` so `push-csv` / `push-dir` can write)

**3. Register as a global command**

Run this inside the `gtools-cli` directory (from step 1):

```bash
bun link
```

After this, `gtools-cli` is available anywhere in your terminal.

**4. Log in**

```bash
gtools-cli login
```

This opens a browser for Google OAuth consent. Tokens are stored at `~/.config/gtools-cli/token.json`.

## Usage

```bash
gtools-cli <service> <command> [flags]
```

All output is JSON. Top-level commands (`login`) don't require a service prefix.

### GTM Commands

`--account` takes the numeric accountId and `--container` takes the numeric containerId (not the `GTM-XXXXXX` public ID). Run `gtm list-accounts` → `gtm list-containers` first to get these IDs.

| Command | Flags | Description |
|---------|-------|-------------|
| `gtm list-accounts` | — | List all GTM accounts |
| `gtm list-containers` | `--account <id>` | List containers in an account |
| `gtm list-tags` | `--account <id> --container <id>` | List tags in a container |
| `gtm list-triggers` | `--account <id> --container <id>` | List triggers in a container |
| `gtm list-variables` | `--account <id> --container <id>` | List variables in a container |
| `gtm list-templates` | `--account <id> --container <id>` | List custom templates in a container |
| `gtm get-tag` | `--account <id> --container <id> --id <tagId>` | Full tag details |
| `gtm get-trigger` | `--account <id> --container <id> --id <triggerId>` | Full trigger details |
| `gtm get-variable` | `--account <id> --container <id> --id <variableId>` | Full variable details |
| `gtm get-template` | `--account <id> --container <id> --id <templateId>` | Full template details including source code |
| `gtm search` | `--account <id> --container <id> --query <keyword>` | Search tags, triggers, and variables by keyword |
| `gtm update-tag-html` | `--account <id> --container <id> --id <tagId> --html-file <path>` | Update an HTML tag's `html` parameter from a file |
| `gtm list-versions` | `--account <id> --container <id>` | List all container versions (published + drafts) |
| `gtm get-version` | `--account <id> --container <id> --id <versionId>` | Full snapshot of a version (tags/triggers/variables/templates/builtInVariables) |
| `gtm get-live-version` | `--account <id> --container <id>` | Full snapshot of the currently published version |
| `gtm diff-versions` | `--account <id> --container <id> --from-version <id> --to-version <id>` | Diff two versions in the same container (matched by resource ID). Output: `added` / `removed` / `modified` with field-level diff |
| `gtm diff-containers` | `--from-account <id> --from-container <id> --to-account <id> --to-container <id>` | Diff the live versions of two containers (matched by resource name). `--account` may be used as a shared default if both containers live in the same account |
| `gtm create-tag` | `--account <id> --container <id> --from-file <path>` | Create a tag from a JSON file (accepts raw tag object or the wrapped `{tag: ...}` format emitted by `get-tag`) |
| `gtm create-trigger` | `--account <id> --container <id> --from-file <path>` | Create a trigger from a JSON file (raw trigger object or `{trigger: ...}`) |
| `gtm create-variable` | `--account <id> --container <id> --from-file <path>` | Create a variable from a JSON file (raw variable object or `{variable: ...}`) |
| `gtm update-variable` | `--account <id> --container <id> --id <variableId> --from-file <path>` | Replace an existing variable's `parameter` array with the one from a JSON file |

### Docs Commands

| Command | Flags | Description |
|---------|-------|-------------|
| `docs get` | `--id <documentId>` | Read document as plain text (title + content) |

The document ID is the part between `/d/` and `/edit` in a Google Docs URL:
```
https://docs.google.com/document/d/1aBcDeFg.../edit
                                  ^^^^^^^^^^
                                  document ID
```

### Sheets Commands

| Command | Flags | Description |
|---------|-------|-------------|
| `sheets get` | `--id <spreadsheetId>` | Read all tabs in a spreadsheet. Output: `{ spreadsheetId, title, sheets: [{ title, rows }] }` |
| `sheets push-csv` | `--id <spreadsheetId> --csv <path> [--tab <name>] [--clear]` | Push a single CSV file into one tab. Tab title defaults to the filename (sans `.csv`); use `--tab` to override. `--clear` wipes the tab before writing — useful when re-uploading shrinking data so stale rows past the new range don't linger. Tab is created if it doesn't exist. Requires `--write` scopes (run `gtools-cli login --write`). |
| `sheets push-dir` | `--id <spreadsheetId> --dir <path> [--clear]` | Push every `*.csv` in a directory into separate tabs of one spreadsheet. Tab titles are taken from filenames. Writes run serially with a small inter-call delay to stay under Sheets' per-spreadsheet write quota. Requires `--write` scopes. |

The spreadsheet ID is the part between `/d/` and `/edit` in a Google Sheets URL:
```
https://docs.google.com/spreadsheets/d/1aBcDeFg.../edit
                                      ^^^^^^^^^^
                                      spreadsheet ID
```

### Examples

```bash
# --- GTM ---

# Find your account and container IDs
gtools-cli gtm list-accounts
gtools-cli gtm list-containers --account 123456789

# List all tags
gtools-cli gtm list-tags --account 123456789 --container 987654321

# Get full tag details
gtools-cli gtm get-tag --account 123456789 --container 987654321 --id 42

# Search for purchase-related items
gtools-cli gtm search --account 123456789 --container 987654321 --query purchase

# Get custom template source code
gtools-cli gtm get-template --account 123456789 --container 987654321 --id 26

# Update an HTML tag's html content (the file's content is uploaded as-is)
gtools-cli gtm update-tag-html --account 123456789 --container 987654321 --id 42 --html-file ./new-tag.html

# List all versions in a container
gtools-cli gtm list-versions --account 123456789 --container 987654321

# Get a specific version's full snapshot
gtools-cli gtm get-version --account 123456789 --container 987654321 --id 31

# Diff two versions in the same container (e.g. what changed from v28 → v31)
gtools-cli gtm diff-versions --account 123456789 --container 987654321 --from-version 28 --to-version 31

# Diff the live versions of two containers (same account)
gtools-cli gtm diff-containers --account 123456789 --from-container 987654321 --to-container 987654322

# Copy a tag/trigger/variable from one container to another:
#   1. Dump the source resource to a file
gtools-cli gtm get-tag --account 123456789 --container 987654321 --id 42 > /tmp/src-tag.json
#   2. Create it in the target container (--from-file accepts the whole `{tag: ...}` output)
gtools-cli gtm create-tag --account 123456789 --container 987654322 --from-file /tmp/src-tag.json

# Update a variable's parameter block (use get-variable output as input)
gtools-cli gtm get-variable --account 123456789 --container 987654321 --id 27 > /tmp/src-var.json
gtools-cli gtm update-variable --account 123456789 --container 987654322 --id 63 --from-file /tmp/src-var.json

# --- Docs ---

# Read a Google Doc's content
gtools-cli docs get --id 1aBcDeFgHiJkLmNoPqRsTuVwXyZ

# --- Sheets ---

# Read every tab's values from a spreadsheet
gtools-cli sheets get --id 1aBcDeFgHiJkLmNoPqRsTuVwXyZ

# Push a single CSV into a tab (creates the tab if missing; default
# tab title = CSV filename without ".csv")
gtools-cli sheets push-csv --id 1aBcDeFgHiJkLmNoPqRsTuVwXyZ \
  --csv ./report.csv

# Same, but write into a tab named "Q1 Summary" and wipe it first
gtools-cli sheets push-csv --id 1aBcDeFgHiJkLmNoPqRsTuVwXyZ \
  --csv ./report.csv --tab "Q1 Summary" --clear

# Push every *.csv in a directory into the same spreadsheet, one tab per file
gtools-cli sheets push-dir --id 1aBcDeFgHiJkLmNoPqRsTuVwXyZ \
  --dir ./backtest_results
```

## Development

```bash
bun test       # Run tests
bun run start  # Run directly without linking
```

## Project Structure

```
src/
  cli.ts                 # Entry point, subcommand routing
  auth.ts                # OAuth client initialization
  oauth.ts               # OAuth login flow
  tokenStore.ts          # Token persistence
  config.ts              # Scopes, paths, OAuth config
  types.ts               # Shared CommandResult union
  commands/login.ts      # Top-level login command
  commands/install.ts    # Install skills command
  services/
    gtm/                 # Google Tag Manager service
      router.ts, client.ts, types.ts, diff.ts, commands/
    docs/                # Google Docs service
      router.ts, client.ts, extractText.ts, types.ts, commands/
    sheets/              # Google Sheets service
      router.ts, client.ts, types.ts, commands/
```

Adding a new Google service means adding a new directory under `src/services/` with `router.ts`, `client.ts`, `types.ts`, and `commands/`, then registering it in `src/cli.ts`.

## Claude Code Skills

Three skills are included for natural-language querying in Claude Code sessions:

- `skills/gtm/SKILL.md` — query GTM data
- `skills/google-docs/SKILL.md` — query Google Docs content
- `skills/google-sheets/SKILL.md` — query Google Sheets content

To install, run the interactive installer:

```bash
gtools-cli install --skills
```

It will ask you:
1. **Scope** — current project or global (`~/`)
2. **Target** — `.claude/skills`, `.agents/skills`, or a custom path
