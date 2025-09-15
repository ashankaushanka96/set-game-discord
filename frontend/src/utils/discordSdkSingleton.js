// Minimal singleton wrapper around @discord/embedded-app-sdk
// Ensures we only instantiate the SDK once per page and only call ready() once.

import { DiscordSDK } from '@discord/embedded-app-sdk';

let sdkInstance = null;
let readyPromise = null;
let cachedClientId = null;

export function getDiscordSDK(clientId) {
  if (!sdkInstance || (cachedClientId && cachedClientId !== clientId)) {
    cachedClientId = clientId;
    try {
      sdkInstance = new DiscordSDK(clientId);
    } catch (_) {
      sdkInstance = null;
    }
  }
  return sdkInstance;
}

export async function readyDiscordSDK(clientId) {
  const sdk = getDiscordSDK(clientId);
  if (!sdk) return null;
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        await sdk.ready();
        return sdk;
      } catch (e) {
        // Reset on failure so we can retry later
        readyPromise = null;
        throw e;
      }
    })();
  }
  return readyPromise;
}

