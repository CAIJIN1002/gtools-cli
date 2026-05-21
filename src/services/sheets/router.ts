import type { AuthClient } from '@/auth';
import type { CommandResult } from '@/types';
import type { ParsedArgs } from '@/cli';

import { runGetSpreadsheet } from './commands/get';
import { runPushCsv, runPushDir } from './commands/push-csv';

// Commands that need --id (spreadsheet ID)
const ID_COMMANDS = ['get', 'push-csv', 'push-dir'];

const ALL_COMMANDS = [...ID_COMMANDS];

export function validateSheetsArgs(args: ParsedArgs): string | null {
  if (!args.command) {
    return `No Sheets command provided. Available: ${ALL_COMMANDS.join(', ')}`;
  }

  if (!ALL_COMMANDS.includes(args.command)) {
    return `Unknown Sheets command: "${args.command}". Available: ${ALL_COMMANDS.join(', ')}`;
  }

  if (ID_COMMANDS.includes(args.command) && !args.id) {
    return `Command "sheets ${args.command}" requires --id <spreadsheetId>`;
  }

  if (args.command === 'push-csv' && !args.csv) {
    return `Command "sheets push-csv" requires --csv <path>`;
  }
  if (args.command === 'push-dir' && !args.dir) {
    return `Command "sheets push-dir" requires --dir <directory>`;
  }

  return null;
}

export async function routeSheets(auth: AuthClient, args: ParsedArgs): Promise<CommandResult> {
  switch (args.command) {
    case 'get':
      return runGetSpreadsheet(auth, args.id!);
    case 'push-csv':
      return runPushCsv(auth, {
        spreadsheetId: args.id!,
        csvPath: args.csv!,
        tab: args.tab,
        clear: args.clear,
      });
    case 'push-dir':
      return runPushDir(auth, {
        spreadsheetId: args.id!,
        dir: args.dir!,
        clear: args.clear,
      });
    default:
      return { error: `Unknown Sheets command: "${args.command}"` };
  }
}
