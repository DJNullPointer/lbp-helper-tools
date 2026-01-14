import "./style.css";
import lbpLogo from "/lbp-logo.svg";
import { renderStatuses, createToolsMenu } from "./utils/index";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="popup">
    <header class="popup-header">
      <div class="brand">
        <img src="${lbpLogo}" class="logo" alt="LBP logo" />
        <div class="brand-text">
          <h1>LBP Helper Tools</h1>
          <p class="subtitle">Internal productivity shortcuts</p>
        </div>
      </div>

      <div class="login-status-row">
        <span class="status-context">PropertyWare</span>
        <span
          id="pware-login-status"
          class="status-indicator status-indicator--checking"
        >
          Checking…
        </span>
        <span class="status-context">PropertyMeld</span>
        <span
          id="pmeld-login-status"
          class="status-indicator status-indicator--checking"
        >
          Checking…
        </span>
      </div>

      <div class="settings-link-row">
        <a href="#" id="settings-link" class="settings-link">⚙️ Settings</a>
      </div>



    </header>

    <section class="tools">
      <div id="tools-container" class="tools-container"></div>
    </section>
  </div>
`;

renderStatuses();

const toolsContainer = document.querySelector<HTMLDivElement>("#tools-container");
if (toolsContainer) {
  createToolsMenu({ container: toolsContainer });
}

// Add settings link handler
const settingsLink = document.querySelector<HTMLAnchorElement>("#settings-link");
if (settingsLink) {
  settingsLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}
