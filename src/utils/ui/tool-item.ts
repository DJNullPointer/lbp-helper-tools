import { createTooltip } from "./tooltip";

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  category: "property-mgmt" | "accounting";
  lastRunTime?: number | null;
}

export interface ToolItemOptions {
  tool: ToolItem;
  onClick: (tool: ToolItem) => void;
}

export function createToolItem(options: ToolItemOptions): HTMLElement {
  const { tool, onClick } = options;

  const item = document.createElement("div");
  item.className = "tool-item";

  const itemContent = document.createElement("div");
  itemContent.className = "tool-item-content";

  const name = document.createElement("span");
  name.className = "tool-item-name";
  name.textContent = tool.name;

  const infoButton = document.createElement("button");
  infoButton.className = "tool-item-info";
  infoButton.setAttribute("aria-label", "Show tool information");
  infoButton.innerHTML = "ℹ️";

  createTooltip(infoButton, {
    content: tool.description,
    position: "top",
  });

  itemContent.appendChild(name);
  itemContent.appendChild(infoButton);

  // Add last run time display if available
  if (tool.lastRunTime !== undefined && tool.lastRunTime !== null) {
    const lastRun = document.createElement("span");
    lastRun.className = "tool-item-last-run";
    lastRun.style.cssText = `
      font-size: 0.7rem;
      color: #6b7280;
      margin-left: auto;
      padding-left: 8px;
    `;
    
    const date = new Date(tool.lastRunTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    let timeText: string;
    if (diffMins < 1) {
      timeText = "Just now";
    } else if (diffMins < 60) {
      timeText = `${diffMins}m ago`;
    } else if (diffHours < 24) {
      timeText = `${diffHours}h ago`;
    } else if (diffDays < 7) {
      timeText = `${diffDays}d ago`;
    } else {
      timeText = date.toLocaleDateString();
    }
    
    lastRun.textContent = `Last: ${timeText}`;
    itemContent.appendChild(lastRun);
  }

  item.appendChild(itemContent);

  itemContent.addEventListener("click", (e) => {
    if (e.target === infoButton || infoButton.contains(e.target as Node)) {
      return;
    }
    onClick(tool);
  });

  return item;
}

