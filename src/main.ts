import "./style.css";
import lbpLogo from "/lbp-logo.svg";
import { renderStatuses } from "./utils/index";

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



    </header>

    <section class="tools">
      <div class="tools-section">
        <h2 class="section-title">Tools</h2>
        <div class="section-body">
          <p class="placeholder">
            Tools menu coming soon.
          </p>
        </div>
      </div>
    </section>
  </div>
`;

renderStatuses();
