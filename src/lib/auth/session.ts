/**
 * Pure session-validity decision, extracted from the NextAuth jwt callback so it
 * can be unit-tested. A live JWT is invalidated when the account is disabled or
 * its token_version has moved past the value the token was minted with (a
 * password reset, forced sign-out, or admin action bumps it).
 */
export function isSessionStillValid(params: {
  status: string | null | undefined;
  dbTokenVersion: number | null | undefined;
  tokenTokenVersion: number | null | undefined;
}): boolean {
  if (!params.status || params.status === "disabled") return false;
  return (params.dbTokenVersion ?? 0) === (params.tokenTokenVersion ?? 0);
}
