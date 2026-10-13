// LinkedIn's reason for refusing a request, made plain where it is a known one.
// Shared by the LinkedIn steps' scripts in the publisher and in Post results
// (the build puts it before each).
function linkedinRefusal(res, doing) {
  const body = res && res.body && typeof res.body === 'object' ? res.body : {};
  const message = String(body.message || body.error_description || body.error || 'no reason given').slice(0, 300);
  const status = res && res.statusCode;
  if (status === 401) return 'The LinkedIn token has expired or was revoked: reconnect the “LinkedIn Community Management” credential in n8n.';
  if (status === 403) {
    return 'LinkedIn would not let the app ' + doing + ' (' + message + '). It needs LinkedIn’s approval for the Community Management API, and the person who connected it must be an admin of the Page.';
  }
  if (status === 429) return 'LinkedIn is limiting requests right now: try again later.';
  if (status === 426 || /version/i.test(message)) return 'LinkedIn no longer takes the API version this uses (' + message + '): move VERSION on in “Plan the LinkedIn post” (QGR · Publisher) and “Plan the read” (QGR · Post results).';
  return 'LinkedIn would not ' + doing + ' (' + (status || 'no answer') + '): ' + message;
}

/** What n8n said when it could not make a request. */
function linkedinSaid(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.description || JSON.stringify(error));
}
