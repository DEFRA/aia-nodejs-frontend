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
      return h.view('access-code/index', {
        pageTitle: 'Enter access code',
        isAuthenticationRequired: false,
        errorMessage: 'Enter your access code'
      })
    }

    if (isValidAccessCode(accessCode)) {
      request.yar.set('accessGranted', true)
      request.yar.set('lastActivity', Date.now())
      return h.redirect('/home')
    }

    return h.view('access-code/index', {
      pageTitle: 'Enter access code',
      isAuthenticationRequired: false,
      errorMessage: 'Enter your valid access code'
    })
  }
}
