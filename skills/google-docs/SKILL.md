---
name: google-docs
description: Read Google Docs content via a Bun CLI script. Use this skill whenever the user mentions Google Docs, shares a Google Docs URL (docs.google.com/document/...), provides a document ID, or asks questions like "這份文件寫了什麼", "這份文件有提到 xxx 嗎", "幫我找文件裡有沒有 yyy", "文件的 zzz 是什麼", "幫我整理這份文件". Also use when the user references meeting notes, specs, proposals, requirement docs, design docs, or PRDs that live in Google Docs — even if they don't say "Google Docs" explicitly but are clearly asking you to read a document they linked to.
---

# Google Docs Query Skill

Run a Bun CLI to fetch Google Docs content and answer the user's question.

## Prerequisites

This skill requires OAuth login. If a command returns an auth error, tell the user to:

1. Set environment variables in `~/.zshrc`:
   ```bash
   export GOOGLE_CLIENT_ID="your-client-id"
   export GOOGLE_CLIENT_SECRET="your-client-secret"
   ```
2. Run `gtools-cli login` to authenticate. The default scopes are read-only; pass `--write` (`gtools-cli login --write`) if you also need write access.

If `gtools-cli` is not found, run `bun link` inside the gtools-cli repo directory first.

## How to Run

```bash
gtools-cli docs <command> [flags]
```

## Available Commands

| Command | Flags | Purpose |
|---------|-------|---------|
| `get` | `--id <documentId>` | Read full document content as plain text (title + body) |

## Extracting Document ID from URL

From a Google Docs URL like:
```
https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
```
The document ID is the part between `/d/` and `/edit`: `1aBcDeFgHiJkLmNoPqRsTuVwXyZ`

The URL may also end in `/edit?usp=sharing`, `/view`, or have no suffix — the ID is always between `/d/` and the next `/` or `?`.

## Workflow

1. If the user provides a Google Docs URL, extract the document ID from the URL.
2. Run `gtools-cli docs get --id <documentId>` to fetch the document content.
3. Parse the JSON output. The shape is:
   ```json
   { "document": { "documentId": "...", "title": "...", "content": "..." } }
   ```
4. Use the `content` field (plain text) to answer the user's question.
5. Answer in Traditional Chinese.

## Example: Full Flow

User: "這份文件有提到 A/B testing 嗎？https://docs.google.com/document/d/1abc123xyz/edit"

Step 1 — extract the ID: `1abc123xyz`

Step 2 — fetch:
```bash
gtools-cli docs get --id 1abc123xyz
```

Output:
```json
{
  "document": {
    "documentId": "1abc123xyz",
    "title": "Q2 Product Roadmap",
    "content": "Overview\n...\nExperiment plan: we will run an A/B test on the new checkout flow...\n"
  }
}
```

Step 3 — search the `content` for "A/B testing" (case-insensitive, also match "A/B test", "AB testing" etc.), then quote the relevant section and answer in Traditional Chinese.

## Handling Long Documents

If the document is very long, focus on the user's specific question — don't dump the whole content back. Quote the relevant section(s) and summarize. If the user asks for a full summary, organize by the document's natural sections (detected from headings / blank lines in the content).

## Error Handling

If the script outputs `{ "error": "..." }`, read the message and suggest the fix in Traditional Chinese.

Common errors:
- **"Not logged in"** → run `gtools-cli login`
- **"GOOGLE_CLIENT_ID ... not set"** → user needs to configure env vars in `~/.zshrc` (see Prerequisites)
- **403 / insufficient permission** → the token may lack the `documents.readonly` scope (it was added later). Tell the user to re-run `gtools-cli login` to refresh the token.
- **404 / not found** → the document ID is wrong, or the logged-in Google account doesn't have access to the document. Ask the user to verify they can open the URL in a browser with the same account.
