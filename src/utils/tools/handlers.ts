// Tool execution handlers
// These connect the popup UI to content scripts and background workers

import { ToolItem } from "../ui/tool-item";
import { sendMessageToActiveTab, sendMessageToContentScript, getActiveTab, matchesUrlPattern } from "../messaging";

// Copy to clipboard using content script (has page context, most reliable)
async function copyToClipboardRobust(text: string): Promise<void> {
  console.log(`[Clipboard] Attempting to copy text (${text.length} chars)`);

  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab?.id) {
    throw new Error("No active tab found for clipboard operation");
  }

  const response = await sendMessageToContentScript(
    currentTab.id,
    {
      type: "COPY_TEXT_TO_CLIPBOARD",
      text,
    },
  );

  if (!response.success) {
    throw new Error(
      response.error || "Failed to copy to clipboard. Please ensure the page has focus and try again.",
    );
  }

  console.log(`[Clipboard] Successfully copied via content script`);
  // Small delay to ensure clipboard operation completes
  await new Promise((resolve) => setTimeout(resolve, 100));
}

export async function executeTool(tool: ToolItem): Promise<void> {
  switch (tool.id) {
    case "copy-relevant-info":
      await executeCopyRelevantInfo();
      break;
    case "open-propertyware-page":
      await executeOpenPropertyWarePage();
      break;
    case "meld-download-all-invoices":
      await executeMeldDownloadInvoices();
      break;
    default:
      throw new Error(`Unknown tool: ${tool.id}`);
  }
}

// Track if an operation is in progress to prevent race conditions
let copyOperationInProgress = false;

async function executeCopyRelevantInfo(): Promise<void> {
  // Prevent multiple simultaneous executions
  if (copyOperationInProgress) {
    throw new Error("Copy operation already in progress. Please wait for it to complete.");
  }

  copyOperationInProgress = true;
  const startTime = Date.now();

  try {
    console.log("[CopyTool] Starting copy operation...");
    
    // Always get the CURRENT active tab fresh (no caching)
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
    if (!currentTab) {
      throw new Error("No active tab found");
    }
    
    if (!currentTab.url) {
    throw new Error("Could not determine current tab URL");
  }

    console.log(`[CopyTool] Active tab URL: ${currentTab.url}`);

  // Basic domain check - detailed page validation happens in content scripts
    if (!matchesUrlPattern(currentTab.url, "propertymeld.com")) {
    throw new Error(
      "This tool only works on Meld Create or Meld Edit pages.\n" +
      "Please go to those pages first."
    );
  }

    if (!currentTab.id) {
    throw new Error("Could not access tab");
  }

    // Send message to the specific current tab (not using cached reference)
    const response = await sendMessageToContentScript<{ text?: string }>(
      currentTab.id,
      {
      type: "COPY_RELEVANT_INFO",
      },
    );

    if (!response.success) {
      throw new Error(response.error || "Failed to copy relevant info");
    }

    // Copy to clipboard - try multiple methods for reliability
    if (response.data?.text) {
      const textPreview = response.data.text.substring(0, 100);
      console.log(`[CopyTool] Received text (${response.data.text.length} chars)`);
      console.log(`[CopyTool] Text preview: "${textPreview}..."`);
      console.log(`[CopyTool] Text hash (first 50): "${response.data.text.substring(0, 50)}"`);
      await copyToClipboardRobust(response.data.text);
      const elapsed = Date.now() - startTime;
      console.log(`[CopyTool] Copy operation completed in ${elapsed}ms`);
    } else {
      throw new Error("No text received to copy");
    }
  } catch (error) {
    const err = error as Error;
    console.error("[CopyTool] Error:", err);
    if (err.message.includes("Content script not loaded")) {
      throw new Error(
        "Content script not loaded. Please refresh the page and try again."
      );
    }
    throw error;
  } finally {
    copyOperationInProgress = false;
  } 
}

// Store reference to current loading container for progress updates
let currentLoadingContainer: HTMLElement | null = null;

export function setCurrentLoadingContainer(container: HTMLElement | null): void {
  currentLoadingContainer = container;
}

async function executeOpenPropertyWarePage(): Promise<void> {
  const tab = await getActiveTab();
  
  if (!tab.url) {
    throw new Error("Could not determine current tab URL");
  }

  // Basic domain check - detailed page validation happens in content script
  if (!matchesUrlPattern(tab.url, "propertymeld.com")) {
    throw new Error(
      "This tool only works on PropertyMeld.\n" +
      "Please navigate to PropertyMeld first."
    );
  }

  if (!tab.id) {
    throw new Error("Could not access tab");
  }

  const response = await sendMessageToContentScript<{ url?: string }>(
    tab.id,
    {
      type: "OPEN_PROPERTYWARE_PAGE",
    },
  );

  if (!response.success) {
    throw new Error(response.error || "Failed to open PropertyWare page");
  }

  if (response.data?.url) {
    // Open the PropertyWare URL in a new tab right after the current one (but don't switch to it)
    const tabIndex = tab.index !== undefined ? tab.index + 1 : undefined;
    await chrome.tabs.create({ 
      url: response.data.url, 
      active: false,
      index: tabIndex,
    });
  } else {
    throw new Error("No PropertyWare URL returned");
  }
}

async function executeMeldDownloadInvoices(): Promise<void> {
  const tab = await getActiveTab();
  
  if (!tab.url) {
    throw new Error("Could not determine current tab URL");
  }

  // Basic domain check - detailed page validation happens in content script
  if (!matchesUrlPattern(tab.url, "propertymeld.com")) {
    throw new Error(
      "This tool only works on PropertyMeld.\n" +
      "Please navigate to PropertyMeld first."
    );
  }

  if (!tab.id) {
    throw new Error("Could not access tab");
  }

  // Set up progress listener before starting download
  const progressListener = (message: any) => {
    if (message.type === "INVOICE_DOWNLOAD_PROGRESS" && currentLoadingContainer) {
      const loadingContainer = currentLoadingContainer.querySelector(".loading-sequence") as HTMLElement;
      if (loadingContainer && (loadingContainer as any).updateProgress) {
        (loadingContainer as any).updateProgress(
          message.current || 0,
          message.total || 0,
          message.detail || "Downloading invoices...",
        );
      }
    }
  };

  chrome.runtime.onMessage.addListener(progressListener);

  try {
    const response = await sendMessageToActiveTab({
      type: "DOWNLOAD_MELD_INVOICES",
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to download invoices");
    }
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("Content script not loaded")) {
      throw new Error(
        "PropertyMeld content script not loaded. Please refresh the page and try again."
      );
    }
    throw error;
  } finally {
    // Clean up progress listener
    chrome.runtime.onMessage.removeListener(progressListener);
  }
}


