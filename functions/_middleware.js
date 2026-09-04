export function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'www.fortheboards.com') {
    url.hostname = 'fortheboards.com';
    return Response.redirect(url.toString(), 301);
  }
  // Deny former internal asset paths before the static cache is consulted.
  // This also retires copies cached before the public build allowlist existed.
  let path;
  try { path = decodeURIComponent(url.pathname); }
  catch { return new Response('Invalid address', { status: 400 }); }
  const internalDirectory = /^\/(worker|output|tmp|audio-session|video|functions|\.git|\.wrangler)(\/|$)/;
  const internalFile = /^\/(\.env[^/]*|recorder\.(js|css)|build-site\.mjs|Start Recorder\.command)$/;
  if (internalDirectory.test(path) || internalFile.test(path)) {
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' },
    });
  }
  return context.next();
}
