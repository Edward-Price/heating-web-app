function connectionErrorMessage(error) {
  const message = error?.message || String(error || 'Unexpected server error');
  if (message.includes('WS request timeout')) {
    return 'The heating provider took too long to respond. Please try again.';
  }
  if (message.startsWith('WS closed before response') || message.startsWith('WS error:')) {
    return 'The heating provider connection was interrupted before readings arrived. Please wait a moment and try again.';
  }
  return message;
}

function providerReadErrorMessage(operation, error) {
  // Observed across several read operations after a successful login. Its exact
  // provider meaning is undocumented; do not call it a password/session failure.
  if (error.code === 2 && error.serviceId === 203) {
    return 'The heating provider could not read this system. Please wait a moment and try again.';
  }
  return `Provider rejected ${operation} request (EC:${error.code ?? 'n/a'}, ES:${error.serviceId ?? 'n/a'})`;
}

module.exports = { connectionErrorMessage, providerReadErrorMessage };
