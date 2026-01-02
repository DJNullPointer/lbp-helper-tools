import "./style.css";
import lbpLogo from "/lbp-logo.svg";
import { setupCounter } from "./counter";
import { checkCookieExists } from "./cookieTracker";

const pwLoginCookieName = "JSESSIONID";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <a href="https://vitejs.dev" target="_blank">
      <img src="${lbpLogo}" class="logo" alt="lbp-logo" />
    </a>
    <h1>LBP Helper Tools</h1>
    <div class="card">
      <button id="counter" type="button"></button>
	<p id="pw-login-status"></p>
    </div>
    <p class="read-the-docs">Helper tool menu to go here</p>
  </div>
`;

setupCounter(document.querySelector<HTMLButtonElement>("#counter")!);

checkCookieExists(pwLoginCookieName).then((exists) => {
  if (exists) {
    console.log(`${pwLoginCookieName} exists.`);
    document.querySelector<HTMLParagraphElement>("pw-login-status")!.innerHTML =
      `cookie is present: ${pwLoginCookieName}`;
  } else {
    console.log(`${pwLoginCookieName} does not exist.`);
    document.querySelector<HTMLParagraphElement>("pw-login-status")!.innerHTML =
      `cookie is not present: ${pwLoginCookieName}`;
  }
});
