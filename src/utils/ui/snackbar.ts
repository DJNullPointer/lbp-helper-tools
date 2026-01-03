export function showSnackbar(
  message: string,
  options?: { type?: "success" | "error"; durationMs?: number },
) {
  const { type = "success", durationMs = 2500 } = options || {};

  let container = document.querySelector<HTMLDivElement>(".snackbar-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "snackbar-container";
    document.body.appendChild(container);
  }

  const el = document.createElement("div");
  el.className = `snackbar snackbar--${type}`;

  const iconSpan = document.createElement("span");
  iconSpan.className = "snackbar-icon";
  iconSpan.textContent = type === "success" ? "✅" : "⚠️";

  const textSpan = document.createElement("span");
  textSpan.textContent = message;

  el.appendChild(iconSpan);
  el.appendChild(textSpan);
  container.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add("snackbar--visible");
  });

  setTimeout(() => {
    el.classList.remove("snackbar--visible");
    setTimeout(() => {
      el.remove();
      if (container && container.childElementCount === 0) {
        container.remove();
      }
    }, 200);
  }, durationMs);
}
