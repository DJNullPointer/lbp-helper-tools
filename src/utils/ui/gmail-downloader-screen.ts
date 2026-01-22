/**
 * Gmail Invoice Downloader - Directory Selection Screen
 */

import { getGmailInvoiceDownloaderLastRunTime } from "../storage/gmail-invoice-downloader";

export interface GmailDownloaderScreenOptions {
  container: HTMLElement;
  onStartDownload: () => Promise<void>;
  onCancel: () => void;
}

/**
 * Format last run time for display
 */
function formatLastRunTime(timestamp: number | null): string {
  if (!timestamp) {
    return "Never";
  }

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "Just now";
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Show the Gmail downloader directory selection screen
 */
export async function showGmailDownloaderScreen(
  options: GmailDownloaderScreenOptions,
): Promise<void> {
  const { container, onStartDownload, onCancel } = options;

  // Get last run time
  const lastRunTime = await getGmailInvoiceDownloaderLastRunTime();

  const screen = document.createElement("div");
  screen.className = "gmail-downloader-screen";
  screen.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  `;

  // Title
  const title = document.createElement("h2");
  title.textContent = "Download Gmail Invoices";
  title.style.cssText = `
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: #111827;
  `;

  // Last download info
  const lastDownloadContainer = document.createElement("div");
  lastDownloadContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    background: #f3f4f6;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  `;

  const lastDownloadLabel = document.createElement("span");
  lastDownloadLabel.textContent = "Last download:";
  lastDownloadLabel.style.cssText = `
    font-size: 0.75rem;
    color: #6b7280;
  `;

  const lastDownloadTime = document.createElement("span");
  lastDownloadTime.textContent = formatLastRunTime(lastRunTime);
  lastDownloadTime.style.cssText = `
    font-size: 0.875rem;
    color: #111827;
    font-weight: 500;
  `;

  lastDownloadContainer.appendChild(lastDownloadLabel);
  lastDownloadContainer.appendChild(lastDownloadTime);

  // Buttons
  const buttonsContainer = document.createElement("div");
  buttonsContainer.style.cssText = `
    display: flex;
    gap: 8px;
    margin-top: 8px;
  `;

  const cancelButton = document.createElement("button");
  cancelButton.textContent = "Cancel";
  cancelButton.type = "button";
  cancelButton.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    color: #374151;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  `;

  cancelButton.addEventListener("click", () => {
    onCancel();
  });

  const startButton = document.createElement("button");
  startButton.textContent = "Start Download";
  startButton.type = "button";
  startButton.style.cssText = `
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    background: #3b82f6;
    color: #ffffff;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  `;

  startButton.addEventListener("mouseenter", () => {
    startButton.style.backgroundColor = "#2563eb";
  });

  startButton.addEventListener("mouseleave", () => {
    startButton.style.backgroundColor = "#3b82f6";
  });

  startButton.addEventListener("click", async () => {
    startButton.disabled = true;
    startButton.textContent = "Starting...";
    try {
      await onStartDownload();
    } catch (error) {
      startButton.disabled = false;
      startButton.textContent = "Start Download";
      throw error;
    }
  });

  buttonsContainer.appendChild(cancelButton);
  buttonsContainer.appendChild(startButton);

  // Assemble screen
  screen.appendChild(title);
  screen.appendChild(lastDownloadContainer);
  screen.appendChild(buttonsContainer);

  container.innerHTML = "";
  container.appendChild(screen);
}
