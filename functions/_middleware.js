export function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'www.fortheboards.com') {
    url.hostname = 'fortheboards.com';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
