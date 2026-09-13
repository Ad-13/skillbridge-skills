# Skillbridge — Skills App

Angular frontend and an Express backend that serves it, deployed as **one**
Render service. Authentication is OpenID Connect against Auth0, using the
Backend-for-Frontend pattern: tokens never reach the browser.

Companion repository: **skillbridge-jobs** (Next.js + Express).

---

## Why one service and not two

The browser talks to exactly one origin. The Express process serves the
built Angular app as static files and handles `/auth/*` and `/api/*` on the
same host.

That makes the session cookie a **first-party** cookie, so `SameSite=Lax`
is enough and no CORS configuration exists anywhere in this repository.
Splitting the frontend onto a different domain would turn the cookie into a
third-party cookie, which Safari blocks by default.

```
browser ──> Express (this service)
              ├── /              Angular build
              ├── /auth/*        OIDC login, callback, logout
              ├── /api/me        session cookie
              ├── /api/my/skills session cookie
              └── /api/skills    Bearer token + audience check
                                 (called by the Jobs App, not by a browser)
```

## Layout

```
backend/src/config.js    environment, OIDC discovery, JWKS
backend/src/session.js   encrypted (JWE) session cookies
backend/src/auth.js      /auth/login, /auth/callback, /auth/logout
backend/src/api.js       cookie routes and the bearer-protected API
backend/src/server.js    wiring, static files, SPA fallback
frontend/                Angular application
```

## Auth0 setup

1. **Applications → Create Application → Regular Web Applications**, name it
   `Skills App`. Regular Web Application means a confidential client: it has
   a secret, and the secret lives on the server.
2. In **Settings**, fill in (comma-separated lists):
   - Allowed Callback URLs: `http://skills.localhost:3002/auth/callback`,
     `https://YOUR-SERVICE.onrender.com/auth/callback`
   - Allowed Logout URLs: `http://skills.localhost:3002`,
     `https://YOUR-SERVICE.onrender.com`
   - Allowed Web Origins: the same two origins
3. **Applications → APIs → Create API**, name `Skillbridge API`, identifier
   `https://skillbridge-api`, signing algorithm RS256. The identifier is just
   a string — nothing is hosted there. It becomes the `aud` claim, and both
   Express services check it.

## Running locally

Cookies are **not** isolated by port: `localhost:3001` and `localhost:3002`
share one cookie jar. The two applications therefore need different host
names, or the single-sign-on test silently passes for the wrong reason.

```bash
echo "127.0.0.1 skills.localhost jobs.localhost" | sudo tee -a /etc/hosts
```

```bash
cp backend/.env.example backend/.env      # then fill in the Auth0 values
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

npm --prefix frontend install
npm --prefix backend install

npm --prefix frontend run build           # writes frontend/dist/frontend/browser
npm --prefix backend run dev              # http://skills.localhost:3002
```

For UI work with hot reload, run `npm --prefix frontend start` in a second
terminal — it serves on `http://skills.localhost:4200` and proxies `/api`
and `/auth` to the backend, so the browser still sees one origin.

## Deploying to Render

**New → Web Service**, connect this repository, region Frankfurt.

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build Command | `npm --prefix frontend ci && npm --prefix frontend run build && npm --prefix backend ci` |
| Start Command | `node backend/src/server.js` |
| Instance Type | Free |

Environment variables: everything from `backend/.env.example` **except
`PORT`** (Render provides it), plus `NODE_ENV=production`. Set `BASE_URL` to
the public URL of the service.

Then go back to Auth0 and add that URL to the callback, logout and origin
lists.

## Notes

- Sessions are encrypted cookies, not server memory, so a restart or a
  second instance does not sign anyone out.
- `app.set('trust proxy', 1)` is required behind Render's TLS termination;
  without it `secure` cookies quietly stop working.
- Skill data lives in a `Map` in memory. This is the one deliberate
  simplification in the demo and becomes a database table keyed by `sub`.
- Free Render services sleep after 15 minutes; the first request afterwards
  takes about a minute.
