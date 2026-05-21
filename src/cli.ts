#!/usr/bin/env bun
import { getAuthClient } from './auth';
import { runLogin } from './commands/login';
import { runInstallSkills } from './commands/install';
import { validateGtmArgs, routeGtm } from './services/gtm/router';
import { validateDocsArgs, routeDocs } from './services/docs/router';
import { validateSheetsArgs, routeSheets } from './services/sheets/router';
import type { CommandResult } from './types';

const SERVICES = ['gtm', 'docs', 'sheets'];
const TOP_LEVEL_COMMANDS = ['login', 'install'];

export interface ParsedArgs {
  service?: string;
  command: string;
  account?: string;
  container?: string;
  id?: string;
  query?: string;
  htmlFile?: string;
  skills?: boolean;
  fromVersion?: string;
  toVersion?: string;
  fromAccount?: string;
  toAccount?: string;
  fromContainer?: string;
  toContainer?: string;
  fromFile?: string;
  // sheets push-csv / push-dir flags
  csv?: string;
  dir?: string;
  tab?: string;
  clear?: boolean;
}

export function parseCliArgs(argv: string[]): ParsedArgs & { error?: string } {
  const first = argv[0] ?? '';

  // Determine if first arg is a service name or a top-level command
  let service: string | undefined;
  let command: string;
  let flagsStart: number;

  if (SERVICES.includes(first)) {
    service = first;
    command = argv[1] ?? '';
    flagsStart = 2;
  } else {
    command = first;
    flagsStart = 1;
  }

  const result: ParsedArgs & { error?: string } = { service, command };

  for (let i = flagsStart; i < argv.length; i++) {
    if (argv[i] === '--account' && argv[i + 1]) {
      result.account = argv[++i];
    } else if (argv[i] === '--container' && argv[i + 1]) {
      result.container = argv[++i];
    } else if (argv[i] === '--id' && argv[i + 1]) {
      result.id = argv[++i];
    } else if (argv[i] === '--query' && argv[i + 1]) {
      result.query = argv[++i];
    } else if (argv[i] === '--html-file' && argv[i + 1]) {
      result.htmlFile = argv[++i];
    } else if (argv[i] === '--from-version' && argv[i + 1]) {
      result.fromVersion = argv[++i];
    } else if (argv[i] === '--to-version' && argv[i + 1]) {
      result.toVersion = argv[++i];
    } else if (argv[i] === '--from-account' && argv[i + 1]) {
      result.fromAccount = argv[++i];
    } else if (argv[i] === '--to-account' && argv[i + 1]) {
      result.toAccount = argv[++i];
    } else if (argv[i] === '--from-container' && argv[i + 1]) {
      result.fromContainer = argv[++i];
    } else if (argv[i] === '--to-container' && argv[i + 1]) {
      result.toContainer = argv[++i];
    } else if (argv[i] === '--from-file' && argv[i + 1]) {
      result.fromFile = argv[++i];
    } else if (argv[i] === '--csv' && argv[i + 1]) {
      result.csv = argv[++i];
    } else if (argv[i] === '--dir' && argv[i + 1]) {
      result.dir = argv[++i];
    } else if (argv[i] === '--tab' && argv[i + 1]) {
      result.tab = argv[++i];
    } else if (argv[i] === '--clear') {
      result.clear = true;
    } else if (argv[i] === '--skills') {
      result.skills = true;
    }
  }

  return result;
}

function buildUsageError(): string {
  return 'No command provided. Usage: gtools-cli <service> <command>\n' +
    `  Services: ${SERVICES.join(', ')}\n` +
    `  Top-level: ${TOP_LEVEL_COMMANDS.join(', ')}\n` +
    '  Skills:    gtools-cli install --skills';
}

async function run(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));

  // No input at all
  if (!args.command && !args.service) {
    console.log(JSON.stringify({ error: buildUsageError() }));
    process.exit(1);
  }

  // Top-level commands (no service prefix)
  if (!args.service) {
    if (args.command === 'login') {
      await runLogin();
      return;
    }

    if (args.command === 'install') {
      if (args.skills) {
        await runInstallSkills();
      } else {
        console.log(JSON.stringify({ error: 'Usage: gtools-cli install --skills' }));
        process.exit(1);
      }
      return;
    }

    // Unknown top-level command — maybe they forgot the service prefix
    const serviceHints = SERVICES.map((s) => `"gtools-cli ${s} ${args.command}"`).join(' or ');
    console.log(JSON.stringify({
      error: `Unknown command: "${args.command}". Did you mean ${serviceHints}?`,
    }));
    process.exit(1);
  }

  // Validate service-specific args before auth (so missing-arg errors show before auth errors)
  switch (args.service) {
    case 'gtm': {
      const validationError = validateGtmArgs(args);
      if (validationError) {
        console.log(JSON.stringify({ error: validationError }));
        process.exit(1);
      }
      break;
    }
    case 'docs': {
      const validationError = validateDocsArgs(args);
      if (validationError) {
        console.log(JSON.stringify({ error: validationError }));
        process.exit(1);
      }
      break;
    }
    case 'sheets': {
      const validationError = validateSheetsArgs(args);
      if (validationError) {
        console.log(JSON.stringify({ error: validationError }));
        process.exit(1);
      }
      break;
    }
    default:
      console.log(JSON.stringify({ error: `Unknown service: "${args.service}"` }));
      process.exit(1);
  }

  const auth = getAuthClient();
  let result: CommandResult;

  try {
    switch (args.service) {
      case 'gtm':
        result = await routeGtm(auth, args);
        break;
      case 'docs':
        result = await routeDocs(auth, args);
        break;
      case 'sheets':
        result = await routeSheets(auth, args);
        break;
      default:
        result = { error: `Unknown service: "${args.service}"` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result = { error: message };
  }

  console.log(JSON.stringify(result, null, 2));
}

// Only run when executed directly, not when imported in tests
if (import.meta.main) {
  run();
}
