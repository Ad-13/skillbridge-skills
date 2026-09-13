import 'dotenv/config'
import { createRemoteJWKSet } from 'jose'

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const PORT = Number(process.env.PORT ?? 3002)
export const IS_PRODUCTION = process.env.NODE_ENV === 'production'

export const BASE_URL = required('BASE_URL')
export const CLIENT_ID = required('OIDC_CLIENT_ID')
export const CLIENT_SECRET = required('OIDC_CLIENT_SECRET')
export const API_AUDIENCE = required('API_AUDIENCE')
export const SESSION_SECRET = required('SESSION_SECRET')
export const JOBS_APP_URL = process.env.JOBS_APP_URL ?? '#'

export const REDIRECT_URI = `${BASE_URL}/auth/callback`

// Providers disagree about the trailing slash on the issuer, so
// normalise before building the discovery URL.
const issuerInput = required('OIDC_ISSUER')
const issuerBase = issuerInput.endsWith('/') ? issuerInput : `${issuerInput}/`
const discoveryUrl = new URL('.well-known/openid-configuration', issuerBase)

const response = await fetch(discoveryUrl)

if (!response.ok) {
  throw new Error(
    `OIDC discovery failed with ${response.status} at ${discoveryUrl}. ` +
      'Check OIDC_ISSUER and that the provider is reachable.',
  )
}

// Every provider endpoint comes from here, so swapping providers
// (Auth0, Keycloak, Logto, ...) is a change of environment variables
// and nothing else.
export const oidc = await response.json()

// Verify tokens against the issuer the PROVIDER declares, not against
// our own env var: the two can differ by a trailing slash, and the
// comparison is character by character.
export const ISSUER = oidc.issuer

// Fetches and caches the provider's public keys, and refetches them
// when the provider rotates. Created once per process.
export const JWKS = createRemoteJWKSet(new URL(oidc.jwks_uri))
