import { google } from 'googleapis';
import type { sheets_v4 } from 'googleapis';

import type { AuthClient } from '@/auth';

const sheets = google.sheets('v4');

export async function getSpreadsheetMeta(
  auth: AuthClient,
  spreadsheetId: string,
): Promise<sheets_v4.Schema$Spreadsheet> {
  const res = await sheets.spreadsheets.get({
    auth,
    spreadsheetId,
    includeGridData: false,
  });
  return res.data;
}

export async function batchGetValues(
  auth: AuthClient,
  spreadsheetId: string,
  ranges: string[],
): Promise<sheets_v4.Schema$BatchGetValuesResponse> {
  const res = await sheets.spreadsheets.values.batchGet({
    auth,
    spreadsheetId,
    ranges,
  });
  return res.data;
}

/**
 * Add a new tab/sheet to an existing spreadsheet. Returns the created
 * sheet's id and final title (Google may suffix the title if a sheet by
 * that name already exists — but we only call this when we've verified
 * the title is free, so the returned title should match the requested
 * one unless racing against another writer).
 */
export async function addSheet(
  auth: AuthClient,
  spreadsheetId: string,
  title: string,
): Promise<{ sheetId: number; title: string }> {
  const res = await sheets.spreadsheets.batchUpdate({
    auth,
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title } } }],
    },
  });
  const reply = res.data.replies?.[0]?.addSheet?.properties;
  if (!reply || reply.sheetId == null || !reply.title) {
    throw new Error(`addSheet response missing sheetId/title: ${JSON.stringify(res.data)}`);
  }
  return { sheetId: reply.sheetId, title: reply.title };
}

/**
 * A1-notation-safe quoted tab title.
 *
 * Sheets' batchGet/values endpoints require any title containing a
 * space or special character to be wrapped in single quotes (the
 * existing ``get`` command does this at commands/get.ts:17–22 when
 * building batchGet ranges). Bare tab names work for the "no spaces /
 * no special chars" subset only; anything else 400s with an opaque
 * "Unable to parse range" error.
 *
 * sanitizeTabTitle in push-csv.ts strips ``[ ] * ? / \ :`` but leaves
 * spaces (Sheets accepts spaces in titles), so spaced filenames like
 * ``my data.csv`` flow through to the write path and would have
 * triggered the parse error pre-fix. Quote at the boundary so callers
 * never have to think about A1 escaping.
 *
 * The doubled-quote replace handles titles that themselves contain a
 * single quote (rare but RFC-allowed): ``a'b`` → ``'a''b'``.
 */
function quoteRange(tabTitle: string, cellRange?: string): string {
  const escaped = tabTitle.replace(/'/g, "''");
  return cellRange ? `'${escaped}'!${cellRange}` : `'${escaped}'`;
}

/** Wipe a sheet's cells (everything in the tab). Tab itself stays. */
export async function clearSheet(
  auth: AuthClient,
  spreadsheetId: string,
  tabTitle: string,
): Promise<void> {
  await sheets.spreadsheets.values.clear({
    auth,
    spreadsheetId,
    range: quoteRange(tabTitle),
  });
}

/**
 * Write a 2D string array to ``<tabTitle>!A1`` using RAW input. RAW
 * preserves the strings exactly — no auto-typing of numbers or dates —
 * which is what we want for backtest CSVs: the user may want to parse
 * dates / numbers themselves, and Google's auto-detection has bitten us
 * on currency-like cells. If a future caller needs Sheets to interpret
 * cells (e.g. '=A1+B1' formulas), add a separate ``writeRowsParsed`` fn.
 */
export async function writeRows(
  auth: AuthClient,
  spreadsheetId: string,
  tabTitle: string,
  rows: string[][],
): Promise<{ updatedCells: number }> {
  if (rows.length === 0) return { updatedCells: 0 };
  const res = await sheets.spreadsheets.values.update({
    auth,
    spreadsheetId,
    range: quoteRange(tabTitle, 'A1'),
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
  return { updatedCells: res.data.updatedCells ?? 0 };
}
