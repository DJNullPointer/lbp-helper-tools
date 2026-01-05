import {
  hasHostPermissions,
  isLoggedInToPW,
  isLoggedInToPM,
} from "../cookies/cookies";

export async function renderStatuses() {
  const pwareEl = document.querySelector<HTMLSpanElement>(
    "#pware-login-status",
  );
  const pmeldEl = document.querySelector<HTMLSpanElement>(
    "#pmeld-login-status",
  );

  if (!pwareEl || !pmeldEl) return;

  try {
    const hasPerms = await hasHostPermissions();

    if (!hasPerms) {
      for (const el of [pwareEl, pmeldEl]) {
        el.textContent = "Missing site permissions 🤔";
        el.classList.remove(
          "status-indicator--checking",
          "status-indicator--ok",
        );
        el.classList.add("status-indicator--error");
      }
      return;
    }

    const [pwareLoggedIn, pmeldLoggedIn] = await Promise.all([
      isLoggedInToPW(),
      isLoggedInToPM(),
    ]);

    const updateEl = (el: HTMLSpanElement, loggedIn: boolean) => {
      if (loggedIn) {
        el.textContent = "Logged in 😎";
        el.classList.remove(
          "status-indicator--checking",
          "status-indicator--error",
        );
        el.classList.add("status-indicator--ok");
      } else {
        el.textContent = "Not logged in 😟";
        el.classList.remove(
          "status-indicator--checking",
          "status-indicator--ok",
        );
        el.classList.add("status-indicator--error");
      }
    };

    updateEl(pwareEl, pwareLoggedIn);
    updateEl(pmeldEl, pmeldLoggedIn);
  } catch (err) {
    console.error(err);
    for (const el of [pwareEl, pmeldEl]) {
      el.textContent = "Error";
      el.classList.remove("status-indicator--checking", "status-indicator--ok");
      el.classList.add("status-indicator--error");
    }
  }
}
