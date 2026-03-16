const PREFIX = "/phosphor";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith(PREFIX)) {
      return new Response("Not found", { status: 404 });
    }

    // Ensure relative asset paths in index.html resolve under /phosphor/
    if (url.pathname === PREFIX) {
      url.pathname = `${PREFIX}/`;
      return Response.redirect(url.toString(), 301);
    }

    url.pathname = url.pathname.slice(PREFIX.length) || "/";

    let res = await env.ASSETS.fetch(new Request(url.toString(), request));

    // SPA fallback for deep links without file extensions
    if (res.status === 404 && !url.pathname.includes(".")) {
      url.pathname = "/index.html";
      res = await env.ASSETS.fetch(new Request(url.toString(), request));
    }

    const securedRes = new Response(res.body, res);
    securedRes.headers.set("X-Frame-Options", "DENY");
    securedRes.headers.set("X-Content-Type-Options", "nosniff");
    securedRes.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    securedRes.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return securedRes;
  },
};
