import { statusCodes } from '../constants/status-codes.js'

function statusCodeMessage(statusCode) {
  switch (statusCode) {
    case statusCodes.notFound:
      return 'Page not found'
    case statusCodes.forbidden:
      return 'Forbidden'
    case statusCodes.unauthorized:
      return 'Unauthorized'
    case statusCodes.badRequest:
      return 'Bad Request'
    default:
      return 'Something went wrong'
  }
}

export function catchAll(request, h) {
  const { response } = request

  if (!('isBoom' in response)) {
    return h.continue
  }

  const statusCode = response.output.statusCode
  const errorMessage = statusCodeMessage(statusCode)

  if (statusCode >= statusCodes.internalServerError) {
    request.logger.error(response?.stack)
  }

  // Redirect 401 and 500+ errors to the dedicated error page
  if (
    statusCode === statusCodes.unauthorized ||
    statusCode >= statusCodes.internalServerError
  ) {
    if (request.path !== '/error') {
      return h.redirect(`/error?status=${statusCode}`).takeover()
    }
  }

  return h
    .view('error/index', {
      pageTitle: errorMessage,
      heading: errorMessage,
      message: errorMessage
    })
    .code(statusCode)
}
