import crypto from 'node:crypto'
import { config } from '../../config/config.js'

function isValidAccessCode(code) {
  const validCode = config.get('accessCode')
  const validHash = config.get('accessCodeHash')
  if (code !== validCode) return false
  const hash = crypto.createHash('sha256').update(code).digest('hex')
  return hash === validHash
}

export const accessCodeGetController = {
  options: {
    auth: false
  },
  handler(_request, h) {
    return h.view('access-code/index', {
      pageTitle: 'Enter access code',
      isAuthenticationRequired: false
    })
  }
}

export const accessCodePostController = {
  options: {
    auth: false
  },
  handler(request, h) {
    const { accessCode } = request.payload || {}

    if (!accessCode || accessCode.trim() === '') {
      const errorMessage = 'Enter your access code'
      request.logger.warn(
        { errorMessage },
        'Access code submission rejected: empty value'
      )
      return h.view('access-code/index', {
        pageTitle: 'Enter access code',
        isAuthenticationRequired: false,
        errorMessage
      })
    }

    if (accessCode.length > 36) {
      const errorMessage = 'Access code must be 36 characters or fewer'
      request.logger.warn(
        { length: accessCode.length, errorMessage },
        'Access code submission rejected: exceeds maximum length'
      )
      return h.view('access-code/index', {
        pageTitle: 'Enter access code',
        isAuthenticationRequired: false,
        errorMessage
      })
    }

    if (isValidAccessCode(accessCode)) {
      request.logger.info('Access code accepted')
      request.yar.set('accessGranted', true)
      request.yar.set('lastActivity', Date.now())
      return h.redirect('/home')
    }

    const errorMessage = 'Enter your valid access code'
    request.logger.warn(
      { errorMessage, submittedCode: accessCode },
      'Access code submission rejected: invalid code'
    )
    return h.view('access-code/index', {
      pageTitle: 'Enter access code',
      isAuthenticationRequired: false,
      errorMessage
    })
  }
}
