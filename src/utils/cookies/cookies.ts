import sitesConfig from "../../../sites_config.json";

type SiteConfig = {
  domain: string;
  cookieName: string;
};

type SitesConfig = Record<string, SiteConfig>;

function getCookieDomainFromSite(site: SiteConfig): string {
  const url = site.domain.replace("*", "");
  const { hostname } = new URL(url);
  return hostname;
}

export function checkCookieExists(
  siteKey: keyof SitesConfig,
): Promise<boolean> {
  const site = (sitesConfig as SitesConfig)[siteKey];

  const domain = getCookieDomainFromSite(site);

  return new Promise<boolean>((resolve) => {
    chrome.cookies.getAll({ domain }, (cookies) => {
      const found = cookies.some((cookie) => cookie.name === site.cookieName);
      resolve(found);
    });
  });
}

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
