import sitesConfig from "../../../sites_config.json";

export async function isLoggedInToPW(): Promise<boolean> {
  const url = "https://app.propertyware.com/pw/home/home.do";

  const resp = await fetch(url, {
    credentials: "include", // send cookies
    redirect: "follow", // default, but explicit is clear
  });

  // If we got redirected to a login page, we are not logged in.
  const finalUrl = new URL(resp.url);

  const isLoginPath =
    finalUrl.pathname.toLowerCase().includes("/login") ||
    finalUrl.pathname.toLowerCase().includes("signin");

  if (resp.redirected && isLoginPath) {
    return false;
  }

  // If we ended up on the home path, good sign
  if (finalUrl.pathname === "/pw/home/home.do") {
    return true;
  }

  // Fallback: parse HTML for login markers (extra safety)
  const text = await resp.text();
  if (/login/i.test(text) && /username/i.test(text)) {
    return false;
  }

  return false;
}

export async function isLoggedInToPM(): Promise<boolean> {
  const url = "https://app.propertymeld.com/2611/m/2611/dashboard/";

  const resp = await fetch(url, {
    credentials: "include", // send cookies
    redirect: "follow", // default, but explicit is clear
  });

  // If we got redirected to a login page, we are not logged in.
  const finalUrl = new URL(resp.url);

  const isLoginPath =
    finalUrl.pathname.toLowerCase().includes("/login") ||
    finalUrl.pathname.toLowerCase().includes("signin");

  if (resp.redirected && isLoginPath) {
    return false;
  }

  // If we ended up on the home path, good sign
  if (finalUrl.pathname === "/2611/m/2611/dashboard/") {
    return true;
  }

  // Fallback: parse HTML for login markers (extra safety)
  const text = await resp.text();
  if (/login/i.test(text) && /username/i.test(text)) {
    return false;
  }

  return false;
}

type SiteConfig = {
  domain: string;
  cookieName: string;
};

type SitesConfig = Record<string, SiteConfig>;
//
// function getCookieDomainFromSite(site: SiteConfig): string {
//   const url = site.domain.replace("*", "");
//   const { hostname } = new URL(url);
//   return hostname;
// }
//
// function checkCookieExists(siteKey: keyof SitesConfig): Promise<boolean> {
//   const site = (sitesConfig as SitesConfig)[siteKey];
//
//   const domain = getCookieDomainFromSite(site);
//
//   return new Promise<boolean>((resolve) => {
//     chrome.cookies.getAll({ domain }, (cookies) => {
//       const found = cookies.some((cookie) => cookie.name === site.cookieName);
//       resolve(found);
//     });
//   });
// }
//
function getOriginsFromSitesConfig(config: SitesConfig): string[] {
  return Object.values(config).map((site) => {
    if (site.domain.endsWith("*")) {
      return site.domain;
    }
    const withoutTrailingSlash = site.domain.replace(/\/$/, "");
    return `${withoutTrailingSlash}/*`;
  });
}

/**
 * Checks that the extension currently has:
 *  - host permissions for ALL sites in sitesConfig
 *  - the "cookies" API permission
 */

export function hasHostPermissions(): Promise<boolean> {
  const origins = getOriginsFromSitesConfig(sitesConfig as SitesConfig);

  return new Promise((resolve) => {
    chrome.permissions.contains(
      { origins, permissions: ["cookies"] },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error(
            "permissions.contains error:",
            chrome.runtime.lastError,
          );
          resolve(false);
          return;
        }
        resolve(result);
      },
    );
  });
}
//
// // export function isLoggedInToPW(): Promise<boolean> {
// //   const site = (sitesConfig as SitesConfig)["PropertyWare"];
// //   if (!site) {
// //     console.log("site not found");
// //   } else {
// //     console.log(`[cookie tracker]: site found as ${site}`);
// //   }
// //
// //   const domain = getCookieDomainFromSite(site);
// //   if (!domain) {
// //     console.log("domain not found");
// //   } else {
// //     console.log(`[cookie tracker]: domain found as ${domain}`);
// //   }
// //
// //   return new Promise<boolean>((resolve) => {
// //     chrome.cookies.getAll({ domain }, (cookies) => {
// //       cookies.forEach((c) => console.log(c));
// //       const found = cookies.some((cookie) => cookie.name === site.cookieName);
// //       console.log(`cookie found: ${found}`);
// //       // the cookie should not be found among the available options
// //       resolve(!found);
// //     });
// //   });
// // }
//
// export function isLoggedInToPM(): Promise<boolean> {
//   return checkCookieExists("PropertyMeld");
// }
