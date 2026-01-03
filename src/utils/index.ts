import sitesConfig from "../../sites_config.json";
import manifest from "../../manifest.json";

function checkCookieExists(cookieName: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: "app.propertyware.com" }, (cookies) => {
      const found = cookies.some((cookie) => cookie.name === cookieName);
      resolve(found);
    });
  });
}

export async function renderStatuses() {
  // TODO: handle permissioned sites required by workflow

  const workflowSitesData = readSiteData();

  const el = document.querySelector<HTMLSpanElement>("#pware-login-status");

  if (!el) return;

  try {
    const exists = await checkCookieExists("JSESSIONID");

    if (exists) {
      el.textContent = "Signed in 😎";
      el.classList.remove(
        "status-indicator--checking",
        "status-indicator--error",
      );
      el.classList.add("status-indicator--ok");
    } else {
      el.textContent = "Not signed in";
      el.classList.remove("status-indicator--checking", "status-indicator--ok");
      el.classList.add("status-indicator--error");
    }
  } catch (err) {
    console.error(err);
    el.textContent = "Error";
    el.classList.remove("status-indicator--checking", "status-indicator--ok");
    el.classList.add("status-indicator--error");
  }
}

function hasHostPermissions();
