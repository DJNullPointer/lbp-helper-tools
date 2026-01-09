// Propertyware HTML fetching utilities

export async function fetchPropertyWarePage(url: string): Promise<string> {
  try {
    // Add cache-busting timestamp to URL
    const urlWithCacheBust = new URL(url);
    urlWithCacheBust.searchParams.set("_t", Date.now().toString());

    const response = await fetch(urlWithCacheBust.toString(), {
      method: "GET",
      credentials: "include",
      cache: "no-store", // Disable caching
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch PropertyWare page: ${response.status} ${response.statusText}`,
      );
    }

    return await response.text();
  } catch (error) {
    const err = error as Error;
    throw new Error(`Error fetching PropertyWare page: ${err.message}`);
  }
}

export async function fetchPwHtml(url: string): Promise<string> {
  // Add aggressive cache-busting: timestamp + random number
  const urlWithCacheBust = new URL(url);
  const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  urlWithCacheBust.searchParams.set("_nocache", cacheBuster);

  console.log(
    `[Propertyware] Fetching ${url} with cache buster: ${cacheBuster}`,
  );

  const resp = await fetch(urlWithCacheBust.toString(), {
    credentials: "include",
    cache: "reload", // More aggressive than no-store - forces reload from server
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
  if (!resp.ok) {
    throw new Error(`PW fetch failed: ${resp.status} ${url}`);
  }

  const html = await resp.text();
  console.log(`[Propertyware] Fetched ${html.length} bytes from ${url}`);
  return html;
}
