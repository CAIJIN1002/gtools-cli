import { readFileSync, statSync, readdirSync } from 'fs';
import { basename, extname, join } from 'path';

import {
  addSheet,
  clearSheet,
  getSpreadsheetMeta,
  writeRows,
} from '@/services/sheets/client';
import type { AuthClient } from '@/auth';
import type { CommandResult } from '@/types';

/**
 * Minimal RFC-4180-style CSV parser.
 *
 * Why hand-rolled (vs. pulling a dep): the only consumers in scope are
 * the user's own backtest CSVs which use a strict comma-separated format
 * with double-quote escaping for cells containing commas / quotes /
 * newlines. We don't need TSV, regional delimiters, BOM stripping, etc.
 * A 30-line state machine covers the contract — no dep churn for a
 * one-CLI use case.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        // RFC-4180: "" inside quoted cell = literal "
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += c;
      i += 1;
      continue;
    }
    if (c === '"' && cell.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      cur.push(cell);
      cell = '';
      i += 1;
      continue;
    }
    if (c === '\r') {
      // skip — treat CRLF and CR as LF
      i += 1;
      continue;
    }
    if (c === '\n') {
      cur.push(cell);
      rows.push(cur);
      cur = [];
      cell = '';
      i += 1;
      continue;
    }
    cell += c;
    i += 1;
  }
  // Trailing cell / row (file without final newline)
  if (cell.length > 0 || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows;
}

/**
 * Sanitize a string for use as a Google Sheets tab title.
 * Sheets reject ``[`` ``]`` ``*`` ``?`` ``/`` ``\`` ``:`` and titles >100 chars.
 * Whitespace-only is rejected too. Collapse to underscores and truncate.
 */
function sanitizeTabTitle(raw: string): string {
  const cleaned = raw.replace(/[\[\]*?/\\:]/g, '_').trim();
  if (!cleaned) return 'Sheet';
  return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned;
}

interface PushResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  tabs: Array<{
    title: string;
    rows: number;
    cells: number;
    created: boolean;
    cleared: boolean;
    sourceFile: string;
  }>;
}

/**
 * Push a single CSV file into a spreadsheet tab.
 *
 *   --id  spreadsheet id
 *   --csv path to CSV
 *   --tab tab title (default: CSV filename without .csv extension)
 *   --clear  wipe existing cells before writing (default: false — appends
 *            from A1, leaving prior cells past the new range untouched.
 *            Use --clear when re-uploading the same data and old data
 *            extended further than the new data)
 */
export async function runPushCsv(
  auth: AuthClient,
  args: {
    spreadsheetId: string;
    csvPath: string;
    tab?: string;
    clear?: boolean;
  },
): Promise<CommandResult> {
  const { spreadsheetId, csvPath } = args;
  const stat = statSync(csvPath);
  if (!stat.isFile()) {
    return { error: `--csv path is not a file: ${csvPath}` };
  }
  const tabTitle = sanitizeTabTitle(args.tab ?? basename(csvPath, '.csv'));

  const text = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(text);

  // Inspect existing tabs to decide whether to create or reuse.
  const meta = await getSpreadsheetMeta(auth, spreadsheetId);
  const existing = (meta.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => typeof t === 'string');
  const tabExists = existing.includes(tabTitle);

  let created = false;
  if (!tabExists) {
    await addSheet(auth, spreadsheetId, tabTitle);
    created = true;
  } else if (args.clear) {
    await clearSheet(auth, spreadsheetId, tabTitle);
  }

  const { updatedCells } = await writeRows(auth, spreadsheetId, tabTitle, rows);

  const result: PushResult = {
    spreadsheetId,
    spreadsheetTitle: meta.properties?.title ?? '',
    tabs: [
      {
        title: tabTitle,
        rows: rows.length,
        cells: updatedCells,
        created,
        cleared: !created && !!args.clear,
        sourceFile: csvPath,
      },
    ],
  };
  return result as unknown as CommandResult;
}

/**
 * Push every ``*.csv`` in a directory into the same spreadsheet, one tab
 * per file. Tab titles default to the filename (sans ``.csv``).
 *
 *   --id     spreadsheet id
 *   --dir    directory containing CSV files
 *   --clear  wipe each tab before writing (only affects tabs that
 *            already existed; newly-created tabs start empty anyway)
 *
 * Why not concurrent: Sheets API has a strict per-spreadsheet write
 * concurrency limit and we hit 429 RESOURCE_EXHAUSTED if we run multiple
 * batchUpdate/values.update against the same sheet in parallel. Serial
 * with a tiny sleep between calls is the safe contract.
 */
export async function runPushDir(
  auth: AuthClient,
  args: { spreadsheetId: string; dir: string; clear?: boolean },
): Promise<CommandResult> {
  const stat = statSync(args.dir);
  if (!stat.isDirectory()) {
    return { error: `--dir path is not a directory: ${args.dir}` };
  }
  const files = readdirSync(args.dir)
    .filter((f) => extname(f).toLowerCase() === '.csv')
    .sort();
  if (files.length === 0) {
    return { error: `no CSV files found in ${args.dir}` };
  }

  const meta = await getSpreadsheetMeta(auth, args.spreadsheetId);
  const existing = new Set(
    (meta.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => typeof t === 'string'),
  );

  const tabs: PushResult['tabs'] = [];
  for (const file of files) {
    const csvPath = join(args.dir, file);
    const tabTitle = sanitizeTabTitle(basename(file, '.csv'));
    const text = readFileSync(csvPath, 'utf-8');
    const rows = parseCsv(text);

    let created = false;
    if (!existing.has(tabTitle)) {
      await addSheet(auth, args.spreadsheetId, tabTitle);
      existing.add(tabTitle);
      created = true;
    } else if (args.clear) {
      await clearSheet(auth, args.spreadsheetId, tabTitle);
    }
    const { updatedCells } = await writeRows(
      auth,
      args.spreadsheetId,
      tabTitle,
      rows,
    );
    tabs.push({
      title: tabTitle,
      rows: rows.length,
      cells: updatedCells,
      created,
      cleared: !created && !!args.clear,
      sourceFile: csvPath,
    });
    // Small pause between writes to stay under per-spreadsheet write quota.
    await new Promise((r) => setTimeout(r, 200));
  }

  const result: PushResult = {
    spreadsheetId: args.spreadsheetId,
    spreadsheetTitle: meta.properties?.title ?? '',
    tabs,
  };
  return result as unknown as CommandResult;
}
