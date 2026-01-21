import { createToolItem, ToolItem } from "./tool-item";
import { showLoadingSequence } from "./loading-sequence";
import { executeTool, setCurrentLoadingContainer } from "../tools/handlers";
import { showSnackbar } from "./snackbar";

export interface ToolsMenuOptions {
  container: HTMLElement;
  onToolClick?: (tool: ToolItem) => void;
}

// Load last run times from storage
async function loadToolLastRunTimes(): Promise<Map<string, number | null>> {
  const lastRunTimes = new Map<string, number | null>();
  
  try {
    // For Gmail invoice downloader, get from Redis
    const { getGmailInvoiceDownloaderLastRunTime } = await import("../storage/gmail-invoice-downloader");
    const lastRun = await getGmailInvoiceDownloaderLastRunTime();
    lastRunTimes.set("gmail-download-invoices", lastRun);
  } catch (error) {
    console.error("[ToolsMenu] Error loading last run times:", error);
  }
  
  return lastRunTimes;
}

async function getToolsWithLastRunTimes(): Promise<ToolItem[]> {
  const lastRunTimes = await loadToolLastRunTimes();
  
  const tools: ToolItem[] = [
    {
      id: "copy-relevant-info",
      name: "Copy Relevant Info",
      description:
        "copies relevant information from this property's PW page to the clipboard. \n\n" +
        "Currently only works on meld edit and create pages. \n\n",
      category: "property-mgmt",
    },
    {
      id: "open-propertyware-page",
      name: "Open PropertyWare Page",
      description:
        "From Meld, Opens the corresponding PropertyWare page in a new tab. \n\n" +
        "meld unit pages -> ware unit detail page. \n\n" +
        "meld summary pages -> ware work order page for that meld.",
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
    {
      id: "gmail-download-invoices",
      name: "Download Gmail Invoice Attachments",
      description:
        "Downloads all attachments from emails with the 'invoices' label since the last time this tool was used. \n\n" +
        "If this is the first time, downloads attachments from the last 24 hours. \n\n" +
        "Requires Gmail OAuth authentication.",
      category: "accounting",
      lastRunTime: lastRunTimes.get("gmail-download-invoices") ?? null,
    },
  ];
  
  return tools;
}

export async function createToolsMenu(options: ToolsMenuOptions): Promise<void> {
  const { container, onToolClick } = options;

  const menu = document.createElement("div");
  menu.className = "tools-menu";

  // Load tools with last run times
  const tools = await getToolsWithLastRunTimes();

  const propertyMgmtSection = createCategorySection(
    "Property MGMT",
    tools.filter((t) => t.category === "property-mgmt"),
    container,
    onToolClick,
  );

  const accountingSection = createCategorySection(
    "Accounting",
    tools.filter((t) => t.category === "accounting"),
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
            // Set the container reference for progress updates
            setCurrentLoadingContainer(menuContainer);
            await showLoadingSequence({
              container: menuContainer,
              message: `Running ${clickedTool.name}...`,
              workPromise: workPromise,
            });
            // Clear the container reference when done
            setCurrentLoadingContainer(null);
            // Checkmark animation is sufficient for success - no snackbar needed
          } catch (error) {
            setCurrentLoadingContainer(null);
            // If error occurs, restore the menu and show error snackbar
            await createToolsMenu({ container: menuContainer });
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

