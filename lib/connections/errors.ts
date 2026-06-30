export function connectionErrorMessage(error: string): string {
  if (error.startsWith("missing_oauth_env:")) {
    const names = error.slice("missing_oauth_env:".length);
    return `OAuth is not configured on this deployment. Set ${names} and retry.`;
  }
  return error;
}
