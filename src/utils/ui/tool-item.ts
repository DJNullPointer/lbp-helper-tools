import { createTooltip } from "./tooltip";

export interface ToolItem {
  id: string;
  name: string;
  description: string;
  category: "property-mgmt" | "accounting";
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

  item.appendChild(itemContent);

  itemContent.addEventListener("click", (e) => {
    if (e.target === infoButton || infoButton.contains(e.target as Node)) {
      return;
    }
    onClick(tool);
  });

  return item;
}

