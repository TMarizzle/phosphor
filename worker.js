const PREFIX = "/phosphor";
const LEGACY_MODULES_BROWSER_PATH = `${PREFIX}/modules`;
const MODULES_BROWSER_PATH = `${PREFIX}/library`;

const applySecurityHeaders = (response) => {
  const securedResponse = new Response(response.body, response);
  securedResponse.headers.set("X-Frame-Options", "DENY");
  securedResponse.headers.set("X-Content-Type-Options", "nosniff");
  securedResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  securedResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return securedResponse;
};

const addPrefixToPathname = (pathname) => {
  if (!pathname || pathname === "/") {
    return `${PREFIX}/`;
  }

  return `${PREFIX}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
};

const rewriteAssetRedirect = (response, requestUrl) => {
  if (response.status < 300 || response.status >= 400) {
    return response;
  }

  const location = response.headers.get("Location");
  if (!location) {
    return response;
  }

  const incomingUrl = new URL(requestUrl);
  const redirectedUrl = new URL(location, incomingUrl);

  if (redirectedUrl.origin !== incomingUrl.origin || redirectedUrl.pathname.startsWith(PREFIX)) {
    return response;
  }

  const headers = new Headers(response.headers);
  redirectedUrl.pathname = addPrefixToPathname(redirectedUrl.pathname);
  headers.set("Location", redirectedUrl.toString());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(PREFIX)) {
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === LEGACY_MODULES_BROWSER_PATH || url.pathname === `${LEGACY_MODULES_BROWSER_PATH}/`) {
      url.pathname = MODULES_BROWSER_PATH;
      return Response.redirect(url.toString(), 301);
    }

    // Ensure relative asset paths in index.html resolve under /phosphor/
    if (url.pathname === PREFIX) {
      url.pathname = `${PREFIX}/`;
      return Response.redirect(url.toString(), 301);
    }

    url.pathname = url.pathname.slice(PREFIX.length) || "/";

    let res = rewriteAssetRedirect(
      await env.ASSETS.fetch(new Request(url.toString(), request)),
      request.url
    );

    // SPA fallback for deep links without file extensions
    if (res.status === 404 && !url.pathname.includes(".")) {
      url.pathname = "/";
      res = rewriteAssetRedirect(
        await env.ASSETS.fetch(new Request(url.toString(), request)),
        request.url
      );
    }

    return applySecurityHeaders(res);
  },
};
