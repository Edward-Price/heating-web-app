function httpErrorMessage(status) {
  if (status === 504 || status === 408) {
    return 'The heating system took too long to respond. Please try again.';
  }
  if (status === 502 || status === 503) {
    return 'The heating service is temporarily unavailable. Please try again.';
  }
  return `Request failed (HTTP ${status}). Please try again.`;
}

export async function readApiResponse(response, onUnauthorized) {
  // A proxy can return HTML or an empty body, including for authentication errors.
  // Handle session expiry before parsing so it always returns to the sign-in screen.
  if (response.status === 401) {
    onUnauthorized?.();
    throw new Error('Unauthorized');
  }

  let data;
  try {
    data = await response.json();
  } catch (_err) {
    throw new Error(response.ok
      ? 'The server returned an unreadable response. Please try again.'
      : httpErrorMessage(response.status));
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(response.ok
      ? 'The server returned an unreadable response. Please try again.'
      : httpErrorMessage(response.status));
  }
  if (!response.ok || !data.ok) {
    throw new Error(typeof data.error === 'string' && data.error
      ? data.error
      : httpErrorMessage(response.status));
  }
  return data;
}
