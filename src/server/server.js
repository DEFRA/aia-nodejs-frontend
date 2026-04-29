import path from 'path'
import hapi from '@hapi/hapi'
import Scooter from '@hapi/scooter'

import { router } from './router.js'
import { config } from '../config/config.js'
import { pulse } from './common/helpers/pulse.js'
import { catchAll } from './common/helpers/errors.js'
import { nunjucksConfig } from '../config/nunjucks/nunjucks.js'
import { setupProxy } from './common/helpers/proxy/setup-proxy.js'
import { requestLogger } from './common/helpers/logging/request-logger.js'
import { sessionCache } from './common/helpers/session-cache/session-cache.js'
import { getCacheEngine } from './common/helpers/session-cache/cache-engine.js'
import { secureContext } from '@defra/hapi-secure-context'
import { contentSecurityPolicy } from './common/helpers/content-security-policy.js'
import { resolveUser } from './common/helpers/user-resolver.js'

export async function createServer() {
  setupProxy()

  const publicPaths = ['/', '/health', '/public', '/favicon.ico']
  const isPublicPath = (path) =>
    publicPaths.some(
      (p) => path === p || (p !== '/' && path.startsWith(p + '/'))
    )
  const server = hapi.server({
    host: config.get('host'),
    port: config.get('port'),
    routes: {
      validate: {
        options: {
          abortEarly: false
        }
      },
      files: {
        relativeTo: path.resolve(config.get('root'), '.public')
      },
      security: {
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: false
        },
        xss: 'enabled',
        noSniff: true,
        xframe: true
      }
    },
    router: {
      stripTrailingSlash: true
    },
    cache: [
      {
        name: config.get('session.cache.name'),
        engine: getCacheEngine(config.get('session.cache.engine'))
      }
    ],
    state: {
      strictHeader: false
    }
  })
  await server.register([
    requestLogger,
    secureContext,
    pulse,
    sessionCache,
    nunjucksConfig,
    Scooter,
    contentSecurityPolicy,
    router // Register all the controllers/routes defined in src/server/router.js
  ])

  // Guard: redirect to access-code page if not authenticated or inactive
  const inactivityTimeoutMs = config.get('inactivityTimeoutMs')

  server.ext('onPreAuth', (request, h) => {
    const path = request.path
    if (isPublicPath(path)) {
      return h.continue
    }

    const accessGranted = request.yar?.get('accessGranted')
    if (!accessGranted) {
      return h.redirect('/').takeover()
    }

    // Check inactivity timeout
    const lastActivity = request.yar.get('lastActivity')
    const now = Date.now()
    if (lastActivity && now - lastActivity > inactivityTimeoutMs) {
      request.yar.reset()
      return h.redirect('/').takeover()
    }
    request.yar.set('lastActivity', now)

    return h.continue
  })

  // Resolve user identity once per session for all authenticated routes.
  // Guest mode: fetches and caches the profile from GET /users/me.
  // SSO mode (future): session already has userId/token — returns cached user.
  server.ext('onPreHandler', async (request, h) => {
    if (isPublicPath(request.path)) return h.continue
    try {
      await resolveUser(request)
    } catch (err) {
      request.logger.error({ err }, 'Unexpected error resolving user identity')
    }
    return h.continue
  })

  server.ext('onPreResponse', catchAll)

  return server
}
