import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import authRouter from './auth.js'
import apiRouter from './api.js'
import { PORT, BASE_URL, IS_PRODUCTION } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Angular's application builder writes to dist/<project>/browser.
const clientDir = path.join(__dirname, '..', '..', 'frontend', 'dist', 'frontend', 'browser')

const app = express()

// Render terminates TLS in front of this process. Without trusting the
// proxy Express sees plain HTTP, and `secure` cookies quietly stop working.
app.set('trust proxy', 1)

app.use(cookieParser())
app.use('/auth', authRouter)
app.use('/api', apiRouter)

app.use(express.static(clientDir, { index: false }))

// Single-page-app fallback: any unmatched path returns index.html so the
// client router can handle it.
//
// Express 5 moved to path-to-regexp v8, where the familiar
// `app.get('*', ...)` throws at startup. A final middleware does the same
// job and is not tied to a matcher version.
app.use((req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'))
})

app.use((error, req, res, _next) => {
  console.error('[skills] unhandled error:', error)
  res.status(500).json({ error: 'internal_error' })
})

app.listen(PORT, () => {
  console.log(`[skills] listening on ${BASE_URL} (production: ${IS_PRODUCTION})`)
})
