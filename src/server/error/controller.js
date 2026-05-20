import { statusCodes } from '../common/constants/status-codes.js'

function getErrorContent(statusCode) {
  switch (statusCode) {
    case statusCodes.unauthorized:
      return {
        pageTitle: 'You are not authorised to view this page',
        heading: 'You are not authorised to view this page',
        message:
          'If you think you should have access to this service, contact the DEFRA helpdesk.',
        linkText: 'Go to the start page',
        linkHref: '/'
      }
    case statusCodes.forbidden:
      return {
        pageTitle: 'Access denied',
        heading: 'Access denied',
        message:
          'You do not have permission to access this page. Contact the DEFRA helpdesk if you think this is wrong.',
        linkText: 'Go to the start page',
        linkHref: '/'
      }
    default:
      return {
        pageTitle: 'Sorry, there is a problem with the service',
        heading: 'Sorry, there is a problem with the service',
        message: 'Try again later.',
        linkText: 'Go back to the home page',
        linkHref: '/home'
      }
  }
}

export function errorController(request, h) {
  const status =
    parseInt(request.query.status, 10) || statusCodes.internalServerError
  const content = getErrorContent(status)

  return h
    .view('error/index', {
      pageTitle: content.pageTitle,
      heading: content.heading,
      message: content.message,
      linkText: content.linkText,
      linkHref: content.linkHref
    })
    .code(status)
}
