---
name: google-sheets
description: Read Google Sheets (spreadsheets) content via a Bun CLI script. Use this skill whenever the user mentions Google Sheets, shares a Google Sheets URL (docs.google.com/spreadsheets/...), provides a spreadsheet ID, or asks questions like "這張表有哪些資料", "表格裡有沒有 xxx", "幫我從試算表找 yyy", "試算表的 zzz 欄位是什麼", "幫我整理這張表". Also use when the user references data tables, inventory lists, price sheets, payment ID lookup tables, mapping tables, or configuration spreadsheets — even if they don't say "Google Sheets" explicitly but are clearly asking you to read a spreadsheet they linked to.
---

# Google Sheets Query Skill

Run a Bun CLI to fetch Google Sheets content and answer the user's question.

## Prerequisites

This skill requires OAuth login. If a command returns an auth error, tell the user to:

1. Set environment variables in `~/.zshrc`:
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   ```
2. Run `gtools-cli login` to authenticate. The default scopes are read-only; pass `--write` (`gtools-cli login --write`) if you also need write access.

If `gtools-cli` is not found, run `bun link` inside the gtools-cli repo directory first.

> **Note:** The `spreadsheets.readonly` scope was added together with this skill. Existing users who already logged in before must re-run `gtools-cli login` to refresh the token with the new scope.

## How to Run

```bash
gtools-cli sheets <command> [flags]
```

## Available Commands

| Command | Flags | Purpose |
|---------|-------|---------|
| `get` | `--id <spreadsheetId>` | Read every tab of the spreadsheet as a JSON object with rows (2D string array) |

## Extracting Spreadsheet ID from URL

From a Google Sheets URL like:
```
https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit#gid=0
```
The spreadsheet ID is the part between `/d/` and `/edit`: `1aBcDeFgHiJkLmNoPqRsTuVwXyZ`

The URL may also end in `/edit?usp=sharing`, `/view`, or include `#gid=...` — the ID is always between `/d/` and the next `/` or `?`.

## Workflow

1. If the user provides a Google Sheets URL, extract the spreadsheet ID from the URL.
2. Run `gtools-cli sheets get --id <spreadsheetId>` to fetch the content.
3. Parse the JSON output. The shape is:
   ```json
   {
     "spreadsheet": {
       "spreadsheetId": "...",
       "title": "...",
       "sheets": [
         {
           "title": "Sheet1",
           "rows": [
             ["header1", "header2"],
             ["row1col1", "row1col2"]
           ]
         }
       ]
     }
   }
   ```
4. Each `rows` is a 2D string array — row 0 is usually the header.
5. Search the relevant sheet(s) for the user's query, quote the matching row(s), and answer in Traditional Chinese.

## Example: Full Flow

User: "MBSB Bank Berhad 的 PaymentID 是多少？https://docs.google.com/spreadsheets/d/1MJ4MTeF.../edit#gid=0"

Step 1 — extract the ID: `1MJ4MTeF...`

Step 2 — fetch:
```bash
gtools-cli sheets get --id 1MJ4MTeF...
```

Step 3 — search each sheet's `rows` for "MBSB" (case-insensitive), find the row, report the PaymentID column back to the user in Traditional Chinese.

## Handling Long Spreadsheets

Spreadsheets can be very large. When answering:
- Don't dump the whole spreadsheet back.
- Identify the relevant sheet(s) first (by `title`).
- Quote only the matching row(s), plus the header row so the user can see column meaning.
- If the user asks for a summary, describe each sheet's purpose (title + column headers) and row count instead of listing all rows.

## Error Handling

If the script outputs `{ "error": "..." }`, read the message and suggest the fix in Traditional Chinese.

Common errors:
- **"Not logged in"** → run `gtools-cli login`
- **"GOOGLE_CLIENT_ID ... not set"** → user needs to configure env vars in `~/.zshrc` (see Prerequisites)
- **403 / insufficient permission** → the token may lack the `spreadsheets.readonly` scope (it was added later). Tell the user to re-run `gtools-cli login` to refresh the token.
- **404 / not found** → the spreadsheet ID is wrong, or the logged-in Google account doesn't have access. Ask the user to verify they can open the URL in a browser with the same account.
