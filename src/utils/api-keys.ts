// API key storage and retrieval utilities

export interface PropertywareApiKeys {
  clientId: string;
  clientSecret: string;
  systemId: string;
}

const STORAGE_KEY = "propertyware_api_keys";

/**
 * Get Propertyware API keys from Chrome storage
 * @returns The API keys, or null if not configured
 */
export async function getPropertywareApiKeys(): Promise<PropertywareApiKeys | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const keys = result[STORAGE_KEY] as PropertywareApiKeys | undefined;
  
  if (!keys || !keys.clientId || !keys.clientSecret || !keys.systemId) {
    return null;
  }
  
  return keys;
}

/**
 * Save Propertyware API keys to Chrome storage
 * @param keys The API keys to save
 */
export async function savePropertywareApiKeys(
  keys: PropertywareApiKeys,
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: keys });
}

/**
 * Clear Propertyware API keys from Chrome storage
 */
export async function clearPropertywareApiKeys(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}

/**
 * Check if API keys are configured
 */
export async function hasPropertywareApiKeys(): Promise<boolean> {
  const keys = await getPropertywareApiKeys();
  return keys !== null;
}
