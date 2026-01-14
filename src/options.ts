// Options page script for configuring API keys

import { getPropertywareApiKeys, savePropertywareApiKeys, clearPropertywareApiKeys } from "./utils/api-keys";

// Load saved keys when page loads
async function loadSavedKeys(): Promise<void> {
  const keys = await getPropertywareApiKeys();
  if (keys) {
    (document.getElementById("clientId") as HTMLInputElement).value = keys.clientId;
    (document.getElementById("clientSecret") as HTMLInputElement).value = keys.clientSecret;
    (document.getElementById("systemId") as HTMLInputElement).value = keys.systemId;
  }
}

// Show status message
function showStatus(message: string, isError: boolean = false): void {
  const statusEl = document.getElementById("status");
  if (!statusEl) return;
  
  statusEl.textContent = message;
  statusEl.className = `status ${isError ? "error" : "success"} show`;
  
  setTimeout(() => {
    statusEl.classList.remove("show");
  }, 3000);
}

// Handle form submission
async function handleSubmit(e: Event): Promise<void> {
  e.preventDefault();
  
  const clientId = (document.getElementById("clientId") as HTMLInputElement).value.trim();
  const clientSecret = (document.getElementById("clientSecret") as HTMLInputElement).value.trim();
  const systemId = (document.getElementById("systemId") as HTMLInputElement).value.trim();
  
  if (!clientId || !clientSecret || !systemId) {
    showStatus("Please fill in all fields", true);
    return;
  }
  
  try {
    await savePropertywareApiKeys({
      clientId,
      clientSecret,
      systemId,
    });
    showStatus("API keys saved successfully!");
  } catch (error) {
    console.error("Error saving API keys:", error);
    showStatus("Error saving API keys. Please try again.", true);
  }
}

// Handle clear button
async function handleClear(): Promise<void> {
  if (!confirm("Are you sure you want to clear the API keys? The extension will not work until you configure them again.")) {
    return;
  }
  
  try {
    await clearPropertywareApiKeys();
    (document.getElementById("clientId") as HTMLInputElement).value = "";
    (document.getElementById("clientSecret") as HTMLInputElement).value = "";
    (document.getElementById("systemId") as HTMLInputElement).value = "";
    showStatus("API keys cleared");
  } catch (error) {
    console.error("Error clearing API keys:", error);
    showStatus("Error clearing API keys. Please try again.", true);
  }
}

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
  loadSavedKeys();
  
  const form = document.getElementById("apiKeysForm");
  if (form) {
    form.addEventListener("submit", handleSubmit);
  }
  
  const clearBtn = document.getElementById("clearBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", handleClear);
  }
});
