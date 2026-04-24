import { google } from 'googleapis';

import { loadTokens, saveTokens, type StoredTokens } from './tokenStore';
import { REDIRECT_URI } from './config';

export type AuthClient = InstanceType<typeof google.auth.OAuth2>;

function getEnvCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      JSON.stringify({
        error:
          'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set.\n' +
          'Add them to your ~/.zshrc:\n' +
          '  export GOOGLE_CLIENT_ID="your-client-id"\n' +
          '  export GOOGLE_CLIENT_SECRET="your-client-secret"',
      })
    );
    process.exit(1);
  }

  return { clientId, clientSecret };
}

export function getAuthClient(): AuthClient {
  const { clientId, clientSecret } = getEnvCredentials();
  const tokens = loadTokens();

  if (!tokens) {
    console.error(
      JSON.stringify({
        error: 'Not logged in. Run `gtools-cli login` first.',
      })
    );
    process.exit(1);
  }

  if (!tokens.refresh_token) {
    console.error(
      JSON.stringify({
        error:
          'Stored token missing refresh_token. Run `gtools-cli login` again. ' +
          'Tip: revoke prior consent at https://myaccount.google.com/permissions first to force Google to re-issue a refresh_token.',
      })
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  oauth2Client.setCredentials(tokens);

  // Track the latest persisted tokens so refresh_token rotation survives
  // subsequent refresh events that omit refresh_token.
  let currentTokens: StoredTokens = tokens;
  oauth2Client.on('tokens', (newTokens) => {
    const merged: StoredTokens = { ...currentTokens, ...newTokens };
    if (!newTokens.refresh_token && currentTokens.refresh_token) {
      merged.refresh_token = currentTokens.refresh_token;
    }
    try {
      saveTokens(merged);
      currentTokens = merged;
    } catch (err) {
      console.error(
        JSON.stringify({
          error: 'Failed to persist refreshed OAuth tokens.',
          detail: err instanceof Error ? err.message : String(err),
        })
      );
    }
  });

  return oauth2Client;
}
