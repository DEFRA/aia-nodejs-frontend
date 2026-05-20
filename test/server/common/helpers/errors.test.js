import { vi } from 'vitest'

import { catchAll } from '../../../../src/server/common/helpers/errors.js'
import { createServer } from '../../../../src/server/server.js'
import { statusCodes } from '../../../../src/server/common/constants/status-codes.js'

describe('#errors', () => {
  let server

  beforeAll(async () => {
    server = await createServer()
    await server.initialize()
  })

  afterAll(async () => {
    await server.stop({ timeout: 0 })
  })

  test('Should provide expected Not Found page', async () => {
    const { result, statusCode } = await server.inject({
      method: 'GET',
      url: '/non-existent-path'
    })

    expect(result).toEqual(
      expect.stringContaining(
        'Page not found | AI Assure Architecture Governance'
      )
    )
    expect(statusCode).toBe(statusCodes.notFound)
  })
})

describe('#catchAll', () => {
  const mockErrorLogger = vi.fn()
  const mockStack = 'Mock error stack'
  const errorPage = 'error/index'
  const mockRequest = (statusCode, path = '/some-path') => ({
    response: {
      isBoom: true,
      stack: mockStack,
      output: {
        statusCode
      }
    },
    path,
    logger: { error: mockErrorLogger }
  })
  const mockToolkitView = vi.fn()
  const mockToolkitCode = vi.fn()
  const mockToolkitRedirect = vi.fn()
  const mockToolkitTakeover = vi.fn()
  const mockToolkit = {
    view: mockToolkitView.mockReturnThis(),
    code: mockToolkitCode.mockReturnThis(),
    redirect: mockToolkitRedirect.mockReturnValue({
      takeover: mockToolkitTakeover
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('Should provide expected "Not Found" page', () => {
    catchAll(mockRequest(statusCodes.notFound), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Page not found',
      heading: 'Page not found',
      message: 'Page not found'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.notFound)
  })

  test('Should provide expected "Forbidden" page', () => {
    catchAll(mockRequest(statusCodes.forbidden), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Forbidden',
      heading: 'Forbidden',
      message: 'Forbidden'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.forbidden)
  })

  test('Should redirect to /error?status=401 for Unauthorized', () => {
    catchAll(mockRequest(statusCodes.unauthorized), mockToolkit)

    expect(mockToolkitRedirect).toHaveBeenCalledWith('/error?status=401')
    expect(mockToolkitTakeover).toHaveBeenCalled()
  })

  test('Should provide expected "Bad Request" page', () => {
    catchAll(mockRequest(statusCodes.badRequest), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Bad Request',
      heading: 'Bad Request',
      message: 'Bad Request'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(statusCodes.badRequest)
  })

  test('Should provide expected default page', () => {
    catchAll(mockRequest(418), mockToolkit)

    expect(mockErrorLogger).not.toHaveBeenCalledWith(mockStack)
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Something went wrong',
      heading: 'Something went wrong',
      message: 'Something went wrong'
    })
    expect(mockToolkitCode).toHaveBeenCalledWith(418)
  })

  test('Should redirect to /error?status=500 and log error for internalServerError', () => {
    catchAll(mockRequest(statusCodes.internalServerError), mockToolkit)

    expect(mockErrorLogger).toHaveBeenCalledWith(mockStack)
    expect(mockToolkitRedirect).toHaveBeenCalledWith('/error?status=500')
    expect(mockToolkitTakeover).toHaveBeenCalled()
  })

  test('Should not redirect if already on /error path', () => {
    catchAll(
      mockRequest(statusCodes.internalServerError, '/error'),
      mockToolkit
    )

    expect(mockErrorLogger).toHaveBeenCalledWith(mockStack)
    expect(mockToolkitRedirect).not.toHaveBeenCalled()
    expect(mockToolkitView).toHaveBeenCalledWith(errorPage, {
      pageTitle: 'Something went wrong',
      heading: 'Something went wrong',
      message: 'Something went wrong'
    })
  })
})
