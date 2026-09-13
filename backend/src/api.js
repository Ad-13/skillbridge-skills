import { Router } from 'express'
import { jwtVerify } from 'jose'
import { ISSUER, API_AUDIENCE, JWKS, JOBS_APP_URL } from './config.js'
import { readSession } from './session.js'

// Demo storage. In the real project this becomes a database table keyed
// by `sub` — the stable user identifier issued by the provider. Nothing
// else about the design changes when it does.
const skillsBySub = new Map()

const skillsFor = (sub) => {
  if (!skillsBySub.has(sub)) {
    skillsBySub.set(sub, [
      { id: 1, name: 'TypeScript', level: 'advanced' },
      { id: 2, name: 'Angular', level: 'intermediate' },
      { id: 3, name: 'Node.js', level: 'intermediate' },
      { id: 4, name: 'PostgreSQL', level: 'beginner' },
    ])
  }
  return skillsBySub.get(sub)
}

const router = Router()

// ---------------------------------------------------------------------------
// Routes for OUR OWN frontend. Authenticated by the session cookie, which
// the browser attaches automatically because the frontend is served from
// this same origin.
// ---------------------------------------------------------------------------

router.get('/me', async (req, res) => {
  const session = await readSession(req)
  if (!session) return res.status(401).json({ error: 'not_authenticated' })

  res.json({
    sub: session.sub,
    name: session.name,
    email: session.email,
    app: 'skills-app',
    jobsAppUrl: JOBS_APP_URL,
  })
})

router.get('/my/skills', async (req, res) => {
  const session = await readSession(req)
  if (!session) return res.status(401).json({ error: 'not_authenticated' })

  res.json({ sub: session.sub, skills: skillsFor(session.sub) })
})

// ---------------------------------------------------------------------------
// Public API for OTHER SERVICES. Bearer token only — no cookies.
//
// Keeping this separate from the cookie routes above is deliberate: it is
// the boundary between "my own browser" and "another service acting for a
// user". Accepting both on one route would erase that boundary.
// ---------------------------------------------------------------------------

router.get('/skills', async (req, res) => {
  const header = req.get('authorization') ?? ''

  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing_bearer_token' })
  }

  try {
    // The audience check is the point of this endpoint. A token issued
    // for a different API of the same tenant must be rejected here, even
    // though its signature is perfectly valid.
    const { payload } = await jwtVerify(header.slice(7), JWKS, {
      issuer: ISSUER,
      audience: API_AUDIENCE,
    })

    res.json({
      sub: payload.sub,
      skills: skillsFor(payload.sub),
      servedBy: 'skills-api',
    })
  } catch (error) {
    res.status(401).json({ error: 'invalid_token', detail: error.message })
  }
})

export default router
