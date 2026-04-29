import { config } from '../../../config/config.js'
import { buildBackendHeaders } from './backend-headers.js'

const GUEST_FALLBACK = {
  userId: '00000000-0000-0000-0000-000000000001',
  email: 'guest@aia.local',
  name: 'Guest User'
}

/**
 * Resolves the current user for the request lifecycle.
 *
 * Fast path: returns immediately when the user is already cached in session.
 *
 * Guest mode (GUEST_USER=true): calls GET /users/me using the guest UUID
 * headers, caches the DB-verified profile in session, and sets userId so
 * all subsequent buildBackendHeaders calls use the confirmed identity.
 * Falls back to GUEST_FALLBACK if the backend is unreachable so the app
 * remains functional.
 *
 * SSO mode (future, GUEST_USER=false): the SSO flow will have already
 * written userId/token to the session before this runs, so the cached
 * user is returned directly.
 *
 * Never throws — errors are logged and the fallback identity is used.
 */
export async function resolveUser(request) {
  const cached = request.yar.get('user')
  if (cached) return cached

  if (!config.get('guestUser')) return null

  let user = GUEST_FALLBACK

  try {
    const res = await fetch(`${config.get('backendApiUrl')}/users/me`, {
      headers: buildBackendHeaders(request)
    })

    if (res.ok) {
      user = await res.json()
    } else {
      request.logger.warn(
        { status: res.status },
        'GET /users/me returned non-OK — using guest fallback'
      )
    }
  } catch (err) {
    request.logger.warn({ err }, 'GET /users/me failed — using guest fallback')
  }

  request.yar.set('user', user)
  request.yar.set('userId', user.userId)
  return user
}
