import { describe, test, expect, vi } from 'vitest'

import { errorController } from '../../../src/server/error/controller.js'

describe('#errorController', () => {
  const mockView = vi.fn()
  const mockCode = vi.fn()
  const mockToolkit = {
    view: mockView.mockReturnThis(),
    code: mockCode.mockReturnThis()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('Should render 401 unauthorized page', () => {
    const request = { query: { status: '401' } }

    errorController(request, mockToolkit)

    expect(mockView).toHaveBeenCalledWith('error/index', {
      pageTitle: 'You are not authorised to view this page',
      heading: 'You are not authorised to view this page',
      message:
        'If you think you should have access to this service, contact the DEFRA helpdesk.',
      linkText: 'Go to the start page',
      linkHref: '/'
    })
    expect(mockCode).toHaveBeenCalledWith(401)
  })

  test('Should render 500 service problem page', () => {
    const request = { query: { status: '500' } }

    errorController(request, mockToolkit)

    expect(mockView).toHaveBeenCalledWith('error/index', {
      pageTitle: 'Sorry, there is a problem with the service',
      heading: 'Sorry, there is a problem with the service',
      message: 'Try again later.',
      linkText: 'Go back to the home page',
      linkHref: '/home'
    })
    expect(mockCode).toHaveBeenCalledWith(500)
  })

  test('Should default to 500 when no status provided', () => {
    const request = { query: {} }

    errorController(request, mockToolkit)

    expect(mockView).toHaveBeenCalledWith('error/index', {
      pageTitle: 'Sorry, there is a problem with the service',
      heading: 'Sorry, there is a problem with the service',
      message: 'Try again later.',
      linkText: 'Go back to the home page',
      linkHref: '/home'
    })
    expect(mockCode).toHaveBeenCalledWith(500)
  })

  test('Should render 403 access denied page', () => {
    const request = { query: { status: '403' } }

    errorController(request, mockToolkit)

    expect(mockView).toHaveBeenCalledWith('error/index', {
      pageTitle: 'Access denied',
      heading: 'Access denied',
      message:
        'You do not have permission to access this page. Contact the DEFRA helpdesk if you think this is wrong.',
      linkText: 'Go to the start page',
      linkHref: '/'
    })
    expect(mockCode).toHaveBeenCalledWith(403)
  })
})
