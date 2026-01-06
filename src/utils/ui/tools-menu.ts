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
      "copies relevant information from this property's PW page to the clipboard. \n\n" +
      "Currently only works on meld create page. \n\n" +
      "Currently does not work for a unit's first created meld.",
    category: "property-mgmt",
  },
  {
    id: "meld-download-all-invoices",
    name: "Download All Invoices",
    description:
      "Downloads all invoices from a SINGLE page from Meld's FINANCES > INVOICES view \n\n" +
      "Again, does not support multiple invoices pages. There are no current plans to change this.",
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
          // Create work promise that will be passed to loading sequence
          const workPromise = executeTool(clickedTool);

          // Show loading sequence with work promise - checkmark will show when work completes
          try {
            await showLoadingSequence({
              container: menuContainer,
              message: `Running ${clickedTool.name}...`,
              workPromise: workPromise,
            });
            // Checkmark animation is sufficient for success - no snackbar needed
          } catch (error) {
            // If error occurs, restore the menu and show error snackbar
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

