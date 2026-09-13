import crypto from 'node:crypto'
import { EncryptJWT, jwtDecrypt } from 'jose'
import { SESSION_SECRET, IS_PRODUCTION } from './config.js'

// A256GCM needs exactly 32 bytes. Hashing the secret guarantees the
// correct length whatever the operator typed into SESSION_SECRET.
const key = crypto.createHash('sha256').update(SESSION_SECRET).digest()

export const SESSION_COOKIE = 'sid'
export const TRANSACTION_COOKIE = 'auth_tx'

export const cookieOptions = {
  httpOnly: true, // invisible to JavaScript, so XSS cannot read it
  sameSite: 'lax', // the OAuth callback is a top-level GET, so lax is enough
  secure: IS_PRODUCTION, // HTTPS only outside local development
  path: '/',
}

// Encrypt an object into a compact, self-contained string (JWE).
// The payload is encrypted, not merely signed: it carries the user's
// access token, which must stay unreadable to the browser.
export const seal = (payload, expiresIn) =>
  new EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .encrypt(key)

// Decrypt it back. Returns null on anything suspicious: tampered
// ciphertext, wrong key, or an expired token.
export const unseal = async (value) => {
  if (!value) return null
  try {
    const { payload } = await jwtDecrypt(value, key)
    return payload
  } catch {
    return null
  }
}

export const readSession = (req) => unseal(req.cookies?.[SESSION_COOKIE])
