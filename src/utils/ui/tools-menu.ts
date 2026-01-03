import { createToolItem, ToolItem } from "./tool-item";
import { showLoadingSequence } from "./loading-sequence";
import { executeTool } from "../tools/handlers";
import { showSnackbar } from "./snackbar";

export interface ToolsMenuOptions {
  container: HTMLElement;
  onToolClick?: (tool: ToolItem) => void;
}

const TOOLS: ToolItem[] = [
  {
    id: "copy-relevant-info",
    name: "Copy Relevant Info",
    description:
      "description",
    category: "property-mgmt",
  },
  {
    id: "meld-download-all-invoices",
    name: "Meld: Download All Invoices",
    description:
      "description",
    category: "accounting",
  },
];

export function createToolsMenu(options: ToolsMenuOptions): void {
  const { container, onToolClick } = options;

  const menu = document.createElement("div");
  menu.className = "tools-menu";

  const propertyMgmtSection = createCategorySection(
    "Property MGMT",
    TOOLS.filter((t) => t.category === "property-mgmt"),
    container,
    onToolClick,
  );

  const accountingSection = createCategorySection(
    "Accounting",
    TOOLS.filter((t) => t.category === "accounting"),
    container,
    onToolClick,
  );

  menu.appendChild(propertyMgmtSection);
  menu.appendChild(accountingSection);

  container.innerHTML = "";
  container.appendChild(menu);
}

function createCategorySection(
  title: string,
  tools: ToolItem[],
  menuContainer: HTMLElement,
  onToolClick?: (tool: ToolItem) => void,
): HTMLElement {
  const section = document.createElement("div");
  section.className = "tools-category";

  const header = document.createElement("div");
  header.className = "tools-category-header";

  const titleEl = document.createElement("h3");
  titleEl.className = "tools-category-title";
  titleEl.textContent = title;

  header.appendChild(titleEl);
  section.appendChild(header);

  const toolsList = document.createElement("div");
  toolsList.className = "tools-list";

  tools.forEach((tool) => {
    const toolElement = createToolItem({
      tool,
      onClick: async (clickedTool) => {
        if (onToolClick) {
          onToolClick(clickedTool);
        } else {
          // Show loading sequence
          const loadingPromise = showLoadingSequence({
            container: menuContainer,
            message: `Running ${clickedTool.name}...`,
          });

          // Execute the tool
          try {
            await executeTool(clickedTool);
            // Loading sequence will show success checkmark automatically
            await loadingPromise;
            showSnackbar(`${clickedTool.name} completed successfully!`, {
              type: "success",
            });
          } catch (error) {
            // If error occurs, we need to restore the menu
            createToolsMenu({ container: menuContainer });
            showSnackbar(
              error instanceof Error ? error.message : "Tool execution failed",
              { type: "error", durationMs: 4000 },
            );
          }
        }
      },
    });
    toolsList.appendChild(toolElement);
  });

  section.appendChild(toolsList);
  return section;
}

export function handleToolClick(
  tool: ToolItem,
  container: HTMLElement,
): void {
  showLoadingSequence({
    container,
    message: `Running ${tool.name}...`,
  });
}

