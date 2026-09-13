import { Router } from 'express'
import crypto from 'node:crypto'
import { jwtVerify } from 'jose'
import {
  BASE_URL,
  ISSUER,
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  API_AUDIENCE,
  oidc,
  JWKS,
} from './config.js'
import {
  seal,
  unseal,
  cookieOptions,
  SESSION_COOKIE,
  TRANSACTION_COOKIE,
} from './session.js'

const randomString = () => crypto.randomBytes(32).toString('base64url')

const challengeFrom = (verifier) =>
  crypto.createHash('sha256').update(verifier).digest('base64url')

const SESSION_TTL_SECONDS = 8 * 60 * 60
const TRANSACTION_TTL_SECONDS = 5 * 60

const router = Router()

// ---------------------------------------------------------------------------
// 1. Start of login. We redirect the browser to the provider and remember
//    three secrets for the few seconds the user spends there.
// ---------------------------------------------------------------------------
router.get('/login', async (req, res, next) => {
  try {
    const state = randomString() // blocks CSRF on the callback
    const nonce = randomString() // blocks replay of an id_token
    const codeVerifier = randomString() // blocks use of an intercepted code

    // The secrets live in a short-lived encrypted cookie rather than in
    // server memory, so the login still completes after a restart or on
    // a different instance.
    const transaction = await seal(
      { state, nonce, codeVerifier },
      `${TRANSACTION_TTL_SECONDS}s`,
    )

    res.cookie(TRANSACTION_COOKIE, transaction, {
      ...cookieOptions,
      maxAge: TRANSACTION_TTL_SECONDS * 1000,
    })

    const url = new URL(oidc.authorization_endpoint)
    url.searchParams.set('client_id', CLIENT_ID)
    url.searchParams.set('redirect_uri', REDIRECT_URI)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', 'openid profile email')
    url.searchParams.set('state', state)
    url.searchParams.set('nonce', nonce)
    url.searchParams.set('code_challenge', challengeFrom(codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')

    // Ask for a token addressed to a specific API. Without this Auth0
    // returns an opaque token that no service can verify on its own.
    url.searchParams.set('audience', API_AUDIENCE)

    res.redirect(url.toString())
  } catch (error) {
    next(error)
  }
})

// ---------------------------------------------------------------------------
// 2. Return from the provider, carrying a single-use authorization code.
// ---------------------------------------------------------------------------
router.get('/callback', async (req, res, next) => {
  try {
    const { code, state, error, error_description: description } = req.query

    if (error) {
      return res.status(400).send(`Provider returned an error: ${error} — ${description ?? ''}`)
    }

    const transaction = await unseal(req.cookies?.[TRANSACTION_COOKIE])
    res.clearCookie(TRANSACTION_COOKIE, cookieOptions)

    if (!transaction || transaction.state !== state) {
      return res.status(400).send('State mismatch — the login did not start here.')
    }

    // Exchange the code for tokens. This request goes server to server:
    // the browser never sees a token, and the client secret never leaves
    // this process.
    const tokenResponse = await fetch(oidc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: transaction.codeVerifier,
      }),
    })

    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text()
      return res.status(502).send(`Token exchange failed: ${detail}`)
    }

    const tokens = await tokenResponse.json()

    // Verify the identity token: signature against the provider's public
    // keys, issuer, audience and expiry. `audience` here is our client id,
    // because an id_token is addressed to the application, not to an API.
    let claims
    try {
      const verified = await jwtVerify(tokens.id_token, JWKS, {
        issuer: ISSUER,
        audience: CLIENT_ID,
      })
      claims = verified.payload
    } catch (verifyError) {
      return res.status(401).send(`Invalid id_token: ${verifyError.message}`)
    }

    // jwtVerify knows nothing about nonce — that check is ours.
    if (claims.nonce !== transaction.nonce) {
      return res.status(401).send('Nonce mismatch.')
    }

    const session = await seal(
      {
        sub: claims.sub,
        name: claims.name ?? claims.nickname ?? claims.email ?? 'Unknown user',
        email: claims.email ?? null,
        accessToken: tokens.access_token,
      },
      `${SESSION_TTL_SECONDS}s`,
    )

    res.cookie(SESSION_COOKIE, session, {
      ...cookieOptions,
      maxAge: SESSION_TTL_SECONDS * 1000,
    })

    res.redirect(BASE_URL)
  } catch (error) {
    next(error)
  }
})

// ---------------------------------------------------------------------------
// 3. Logout. Dropping our own cookie is not enough: the session at the
//    provider would stay alive and the next login would pass silently.
// ---------------------------------------------------------------------------
router.get('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions)

  // Auth0 uses its own logout path instead of the standard
  // `end_session_endpoint`. This is the only provider-specific line in
  // the whole application.
  const url = new URL('/v2/logout', ISSUER)
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('returnTo', BASE_URL)

  res.redirect(url.toString())
})

export default router
