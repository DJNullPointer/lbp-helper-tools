export interface LoadingSequenceOptions {
  container: HTMLElement;
  message?: string;
  onComplete?: () => void;
}

export function showLoadingSequence(
  options: LoadingSequenceOptions,
): Promise<void> {
  const { container, message = "Processing...", onComplete } = options;

  return new Promise((resolve) => {

    const loadingContainer = document.createElement("div");
    loadingContainer.className = "loading-sequence";

    const spinner = document.createElement("div");
    spinner.className = "loading-spinner";
    spinner.innerHTML = `
      <div class="spinner-ring"></div>
      <div class="spinner-ring"></div>
      <div class="spinner-ring"></div>
    `;


    const messageEl = document.createElement("div");
    messageEl.className = "loading-message";
    messageEl.textContent = message;

    loadingContainer.appendChild(spinner);
    loadingContainer.appendChild(messageEl);


    container.innerHTML = "";
    container.appendChild(loadingContainer);


    requestAnimationFrame(() => {
      loadingContainer.classList.add("loading-sequence--visible");
    });


    const loadingDuration = 2000 + Math.random() * 1000;

    setTimeout(() => {

      loadingContainer.innerHTML = "";

      const successContainer = document.createElement("div");
      successContainer.className = "success-checkmark";

      const checkmarkSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      checkmarkSvg.setAttribute("viewBox", "0 0 52 52");
      checkmarkSvg.setAttribute("class", "checkmark-svg");

      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("class", "checkmark-circle");
      circle.setAttribute("cx", "26");
      circle.setAttribute("cy", "26");
      circle.setAttribute("r", "25");
      circle.setAttribute("fill", "none");

      const checkmarkPath = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      checkmarkPath.setAttribute("class", "checkmark-check");
      checkmarkPath.setAttribute("fill", "none");
      checkmarkPath.setAttribute("d", "M14.1 27.2l7.1 7.2 16.7-16.8");

      checkmarkSvg.appendChild(circle);
      checkmarkSvg.appendChild(checkmarkPath);
      successContainer.appendChild(checkmarkSvg);

      const successMessage = document.createElement("div");
      successMessage.className = "success-message";
      successMessage.textContent = "Complete!";

      successContainer.appendChild(successMessage);
      loadingContainer.appendChild(successContainer);

      requestAnimationFrame(() => {
        successContainer.classList.add("success-checkmark--visible");
      });

      setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
        resolve();
      }, 1500);
    }, loadingDuration);
  });
}

