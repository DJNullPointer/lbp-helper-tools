// Tool execution handlers
// These connect the popup UI to content scripts and background workers

import { ToolItem } from "../ui/tool-item";
import { sendMessageToActiveTab, getActiveTab, matchesUrlPattern } from "../messaging";

export async function executeTool(tool: ToolItem): Promise<void> {
  switch (tool.id) {
    case "copy-relevant-info":
      await executeCopyRelevantInfo();
      break;
    case "meld-download-all-invoices":
      await executeMeldDownloadInvoices();
      break;
    default:
      throw new Error(`Unknown tool: ${tool.id}`);
  }
}

async function executeCopyRelevantInfo(): Promise<void> {
  const tab = await getActiveTab();
  
  if (!tab.url) {
    throw new Error("Could not determine current tab URL");
  }

  // Basic domain check - detailed page validation happens in content scripts
  if (!matchesUrlPattern(tab.url, "propertymeld.com")) {
    throw new Error(
      "This tool only works on Meld Unit View or Meld Creation pages.\n" +
      "Please navigate to those pages first."
    );
  }

  if (!tab.id) {
    throw new Error("Could not access tab");
  }

  try {
    const response = await sendMessageToActiveTab({
      type: "COPY_RELEVANT_INFO",
    });

    if (!response.success) {
      throw new Error(response.error || "Failed to copy relevant info");
    }
  } catch (error) {
    const err = error as Error;
    if (err.message.includes("Content script not loaded")) {
      throw new Error(
        "Content script not loaded. Please refresh the page and try again."
      );
    }
    throw error;
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
  }
}


