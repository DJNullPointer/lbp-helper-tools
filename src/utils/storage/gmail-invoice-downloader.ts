/**
 * Gmail Invoice Downloader - Redis storage utility
 * 
 * Stores and retrieves the last run time for Gmail invoice attachment downloads.
 * Uses the Netlify proxy function for all Redis operations.
 */

import { PROXY_BASE_URL } from '../proxy-config';

/**
 * Get the last run time for Gmail invoice downloads from Redis
 * Returns null if no time is stored
 */
export async function getGmailInvoiceDownloaderLastRunTime(): Promise<number | null> {
  try {
    const url = `${PROXY_BASE_URL.replace('/proxy', '/gmail-invoice-downloader')}`;
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getLastRunTime',
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`[GmailInvoiceDownloader] Failed to get last run time: ${resp.status} ${errorText}`);
      return null;
    }

    const result = await resp.json();
    if (result.value === null || result.value === undefined) {
      return null;
    }

    const timestamp = parseInt(result.value, 10);
    if (isNaN(timestamp)) {
      console.error(`[GmailInvoiceDownloader] Invalid timestamp value: ${result.value}`);
      return null;
    }

    return timestamp;
  } catch (error) {
    console.error('[GmailInvoiceDownloader] Error getting last run time:', error);
    return null;
  }
}

/**
 * Set the last run time for Gmail invoice downloads in Redis
 */
export async function setGmailInvoiceDownloaderLastRunTime(timestamp: number): Promise<void> {
  try {
    const url = `${PROXY_BASE_URL.replace('/proxy', '/gmail-invoice-downloader')}`;
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'setLastRunTime',
        timestamp,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Gmail invoice downloader set failed: ${resp.status} ${errorText}`);
    }
  } catch (error) {
    console.error('[GmailInvoiceDownloader] Error setting last run time:', error);
    throw error;
  }
}
