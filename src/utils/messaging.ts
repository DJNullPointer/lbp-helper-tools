// Messaging utilities for communication between popup, content scripts, and background

export interface Message {
  type: string;
  [key: string]: unknown;
}

export interface MessageResponse<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

/**
 * Send a message to the background service worker
 */
export function sendMessageToBackground<T = unknown>(
  message: Message,
): Promise<MessageResponse<T>> {
  return chrome.runtime.sendMessage(message) as Promise<MessageResponse<T>>;
}

/**
 * Send a message to a content script in a specific tab
 */
export async function sendMessageToContentScript<T = unknown>(
  tabId: number,
  message: Message,
): Promise<MessageResponse<T>> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as MessageResponse<T>;
  } catch (error) {
    const err = error as Error;
    if (err.message?.includes("receiving end does not exist") || err.message?.includes("Could not establish connection")) {
      throw new Error(
        "Content script not loaded. Please refresh the page and try again."
      );
    }
    throw error;
  }
}

/**
 * Send a message to the active tab's content script
 */
export async function sendMessageToActiveTab<T = unknown>(
  message: Message,
): Promise<MessageResponse<T>> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.id) {
    throw new Error("No active tab found");
  }
  return sendMessageToContentScript<T>(tab.id, message);
}

/**
 * Get the current active tab
 */
export async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    throw new Error("No active tab found");
  }
  return tab;
}

/**
 * Check if current tab matches a URL pattern
 */
export function matchesUrlPattern(url: string, pattern: string | RegExp): boolean {
  if (typeof pattern === "string") {
    return url.includes(pattern);
  }
  return pattern.test(url);
}

