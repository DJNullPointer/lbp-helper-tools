/**
 * Gmail API integration for downloading invoice attachments
 * Uses Chrome identity API for OAuth authentication
 */

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: GmailMessagePart[];
  };
  internalDate?: string;
}

interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  body?: {
    attachmentId?: string;
    size?: number;
  };
  parts?: GmailMessagePart[];
}

interface GmailAttachment {
  size: number;
  data: string;
}

/**
 * Get OAuth token using Chrome identity API
 */
async function getAuthToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(
      {
        interactive: true,
        scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      },
      (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!token) {
          reject(new Error("Failed to get auth token"));
          return;
        }
        resolve(token);
      },
    );
  });
}

/**
 * Make an authenticated request to Gmail API
 */
async function gmailApiRequest(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const token = await getAuthToken();

  const url = `https://gmail.googleapis.com/gmail/v1/${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail API error: ${response.status} ${errorText}`);
  }

  return response;
}

/**
 * Search for messages with a specific label and date range
 */
export async function searchMessages(
  label: string,
  afterTimestamp?: number,
): Promise<string[]> {
  let query = `label:${label}`;

  if (afterTimestamp) {
    // Gmail search uses seconds since epoch
    const afterSeconds = Math.floor(afterTimestamp / 1000);
    query += ` after:${afterSeconds}`;
  } else {
    // Default to last 24 hours if no timestamp
    const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    query += ` after:${oneDayAgo}`;
  }

  const allMessageIds: string[] = [];
  let pageToken: string | undefined = undefined;
  const maxResults = 500; // Gmail API max per page

  do {
    let url = `users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const response = await gmailApiRequest(url);
    const data = await response.json();

    if (data.messages && data.messages.length > 0) {
      const messageIds = data.messages.map((msg: { id: string }) => msg.id);
      allMessageIds.push(...messageIds);
    }

    // Get next page token if there are more results
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allMessageIds;
}

/**
 * Get full message details
 */
export async function getMessage(messageId: string): Promise<GmailMessage> {
  const response = await gmailApiRequest(
    `users/me/messages/${messageId}?format=full`,
  );
  return response.json();
}

/**
 * Get attachment data
 */
export async function getAttachment(
  messageId: string,
  attachmentId: string,
): Promise<GmailAttachment> {
  const response = await gmailApiRequest(
    `users/me/messages/${messageId}/attachments/${attachmentId}`,
  );
  return response.json();
}

/**
 * Extract all attachments from a message
 */
export function extractAttachments(message: GmailMessage): Array<{
  attachmentId: string;
  filename: string;
  messageId: string;
}> {
  const attachments: Array<{
    attachmentId: string;
    filename: string;
    messageId: string;
  }> = [];

  function extractFromParts(parts: GmailMessagePart[] | undefined): void {
    if (!parts) return;

    for (const part of parts) {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          attachmentId: part.body.attachmentId,
          filename: part.filename,
          messageId: message.id,
        });
      }

      if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  }

  if (message.payload?.parts) {
    extractFromParts(message.payload.parts);
  }

  return attachments;
}

/**
 * Get message date from headers or internal date
 */
export function getMessageDate(message: GmailMessage): Date {
  if (message.payload?.headers) {
    const dateHeader = message.payload.headers.find(
      (h) => h.name.toLowerCase() === "date",
    );
    if (dateHeader?.value) {
      const parsed = new Date(dateHeader.value);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  // Fallback to internal date
  if (message.internalDate) {
    return new Date(parseInt(message.internalDate, 10));
  }

  return new Date();
}

/**
 * Download all invoice attachments from Gmail
 */
export async function downloadInvoiceAttachments(
  afterTimestamp?: number,
  onProgress?: (current: number, total: number, detail?: string) => void,
): Promise<{ count: number; lastMessageDate: number | null }> {
  const messageIds = await searchMessages("invoices", afterTimestamp);

  if (messageIds.length === 0) {
    return { count: 0, lastMessageDate: null };
  }

  onProgress?.(
    0,
    0,
    `Found ${messageIds.length} messages, scanning for attachments...`,
  );

  // First pass: count total attachments
  let totalAttachmentCount = 0;
  const messageAttachmentCounts = new Map<string, number>();

  const batchSize = 10;
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (messageId) => {
        try {
          const message = await getMessage(messageId);
          const attachments = extractAttachments(message);
          const count = attachments.length;
          messageAttachmentCounts.set(messageId, count);
          totalAttachmentCount += count;
        } catch (error) {
          console.error(`[Gmail] Error scanning message ${messageId}:`, error);
          messageAttachmentCounts.set(messageId, 0);
        }
      }),
    );
  }

  if (totalAttachmentCount === 0) {
    return { count: 0, lastMessageDate: null };
  }

  // Track unique filenames to deduplicate (same filename = same content)
  const seenFilenames = new Set<string>();
  let uniqueAttachmentCount = 0;

  // Count unique attachments
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (messageId) => {
        try {
          const message = await getMessage(messageId);
          const attachments = extractAttachments(message);

          for (const attachment of attachments) {
            // Normalize filename for comparison (lowercase, no path separators)
            const normalizedFilename = attachment.filename
              .toLowerCase()
              .replace(/\//g, "_")
              .replace(/\\/g, "_")
              .trim();

            if (!seenFilenames.has(normalizedFilename)) {
              seenFilenames.add(normalizedFilename);
              uniqueAttachmentCount++;
            }
          }
        } catch (error) {
          console.error(
            `[Gmail] Error counting attachments in message ${messageId}:`,
            error,
          );
        }
      }),
    );
  }

  if (uniqueAttachmentCount === 0) {
    return { count: 0, lastMessageDate: null };
  }

  onProgress?.(
    0,
    uniqueAttachmentCount,
    `Found ${uniqueAttachmentCount} attachment(s) in ${messageIds.length} message(s) (${totalAttachmentCount} total), downloading...`,
  );

  let downloadedCount = 0;
  let lastMessageDate: number | null = null;
  const downloadedFilenames = new Set<string>();

  // Second pass: download attachments (skip duplicates)
  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (messageId) => {
        try {
          const message = await getMessage(messageId);
          const messageDate = getMessageDate(message);
          const messageTimestamp = messageDate.getTime();

          if (!lastMessageDate || messageTimestamp > lastMessageDate) {
            lastMessageDate = messageTimestamp;
          }

          const attachments = extractAttachments(message);

          if (attachments.length === 0) {
            return;
          }

          for (const attachment of attachments) {
            // Normalize filename for comparison
            const normalizedFilename = attachment.filename
              .toLowerCase()
              .replace(/\//g, "_")
              .replace(/\\/g, "_")
              .trim();

            // Skip if we've already downloaded this filename
            if (downloadedFilenames.has(normalizedFilename)) {
              onProgress?.(
                downloadedCount,
                uniqueAttachmentCount,
                `Downloaded ${downloadedCount}/${uniqueAttachmentCount} attachment(s)`,
              );
              continue;
            }

            try {
              const attachmentData = await getAttachment(
                messageId,
                attachment.attachmentId,
              );

              // Decode base64url to base64
              let base64Data = attachmentData.data
                .replace(/-/g, "+")
                .replace(/_/g, "/");
              // Add padding if needed
              while (base64Data.length % 4) {
                base64Data += "=";
              }

              // Determine MIME type from filename extension
              const getMimeType = (filename: string): string => {
                const ext = filename.split(".").pop()?.toLowerCase();
                const mimeTypes: Record<string, string> = {
                  pdf: "application/pdf",
                  jpg: "image/jpeg",
                  jpeg: "image/jpeg",
                  png: "image/png",
                  gif: "image/gif",
                  txt: "text/plain",
                  csv: "text/csv",
                  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  xls: "application/vnd.ms-excel",
                  doc: "application/msword",
                  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                };
                return mimeTypes[ext || ""] || "application/octet-stream";
              };

              const mimeType = getMimeType(attachment.filename);

              // Create data URL (service workers don't support URL.createObjectURL)
              const dataUrl = `data:${mimeType};base64,${base64Data}`;

              // Sanitize filename for filesystem
              let filename = attachment.filename
                .replace(/\//g, "_")
                .replace(/\\/g, "_")
                .replace(/\.\./g, "_");

              // Add message ID prefix to avoid conflicts (even though we deduplicate, keep prefix for clarity)
              const safeMsgId = messageId.replace(/\//g, "_");
              filename = `${safeMsgId.substring(0, 8)}_${filename}`;

              await chrome.downloads.download({
                url: dataUrl,
                filename: `gmail-invoices/${filename}`,
                saveAs: false,
              });

              // Mark this filename as downloaded
              downloadedFilenames.add(normalizedFilename);
              downloadedCount++;

              onProgress?.(
                downloadedCount,
                uniqueAttachmentCount,
                `Downloaded ${downloadedCount}/${uniqueAttachmentCount} attachment(s)`,
              );
            } catch (error) {
              console.error(
                `[Gmail] Error downloading attachment ${attachment.filename}:`,
                error,
              );
              // Still mark as processed for progress
              onProgress?.(
                downloadedCount,
                uniqueAttachmentCount,
                `Downloaded ${downloadedCount}/${uniqueAttachmentCount} attachment(s)`,
              );
            }
          }
        } catch (error) {
          console.error(
            `[Gmail] Error processing message ${messageId}:`,
            error,
          );
        }
      }),
    );
  }

  return { count: downloadedCount, lastMessageDate };
}
