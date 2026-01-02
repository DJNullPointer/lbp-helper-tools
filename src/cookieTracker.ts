export function checkCookieExists(cookieName: string): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.cookies.getAll({ domain: "app.propertyware.com" }, (cookies) => {
      const found = cookies.some((cookie) => cookie.name === cookieName);
      resolve(found);
    });
  });
}
