import { vi } from 'vitest'

describe('resolveUser', () => {
  let configGetMock
  let originalFetch

  beforeEach(() => {
    vi.resetModules()
    configGetMock = vi.fn()
    vi.doMock('../../../config/config.js', () => ({
      config: { get: configGetMock }
    }))
    vi.doMock('./backend-headers.js', () => ({
      buildBackendHeaders: vi
        .fn()
        .mockReturnValue({ Authorization: 'Bearer test' })
    }))
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.doUnmock('../../../config/config.js')
    vi.doUnmock('./backend-headers.js')
  })

  function mockConfig({ guestUser = true } = {}) {
    configGetMock.mockImplementation((key) => {
      if (key === 'guestUser') return guestUser
      if (key === 'backendApiUrl') return 'http://api.example.com/api/v1'
      return null
    })
  }

  function buildRequest(sessionData = {}) {
    const session = { ...sessionData }
    return {
      yar: {
        get: vi.fn((key) => session[key] ?? null),
        set: vi.fn((key, val) => {
          session[key] = val
        })
      },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    }
  }

  async function getResolveUser() {
    const mod = await import('./user-resolver.js')
    return mod.resolveUser
  }

  test('returns cached user without calling backend', async () => {
    mockConfig()
    const cachedUser = {
      userId: 'cached-id',
      email: 'cached@test.com',
      name: 'Cached'
    }
    const request = buildRequest({ user: cachedUser })
    global.fetch = vi.fn()

    const resolveUser = await getResolveUser()
    const result = await resolveUser(request)

    expect(result).toEqual(cachedUser)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('returns null when guestUser=false and no session user', async () => {
    mockConfig({ guestUser: false })
    const request = buildRequest()
    global.fetch = vi.fn()

    const resolveUser = await getResolveUser()
    const result = await resolveUser(request)

    expect(result).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('fetches user from backend and caches in session on success', async () => {
    mockConfig()
    const apiUser = {
      userId: '00000000-0000-0000-0000-000000000001',
      email: 'guest@aia.local',
      name: 'Guest User'
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => apiUser
    })

    const request = buildRequest()
    const resolveUser = await getResolveUser()
    const result = await resolveUser(request)

    expect(result).toEqual(apiUser)
    expect(request.yar.set).toHaveBeenCalledWith('user', apiUser)
    expect(request.yar.set).toHaveBeenCalledWith('userId', apiUser.userId)
  })

  test('calls GET /users/me with the correct URL', async () => {
    mockConfig()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ userId: 'u1', email: 'u@u.com', name: 'U' })
    })

    const request = buildRequest()
    const resolveUser = await getResolveUser()
    await resolveUser(request)

    expect(global.fetch).toHaveBeenCalledWith(
      'http://api.example.com/api/v1/users/me',
      expect.objectContaining({ headers: expect.any(Object) })
    )
  })

  test('falls back to guest identity when backend returns non-OK', async () => {
    mockConfig()
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    const request = buildRequest()
    const resolveUser = await getResolveUser()
    const result = await resolveUser(request)

    expect(result.userId).toBe('00000000-0000-0000-0000-000000000001')
    expect(result.name).toBe('Guest User')
    expect(request.logger.warn).toHaveBeenCalled()
    expect(request.yar.set).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ name: 'Guest User' })
    )
  })

  test('falls back to guest identity when fetch throws', async () => {
    mockConfig()
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const request = buildRequest()
    const resolveUser = await getResolveUser()
    const result = await resolveUser(request)

    expect(result.userId).toBe('00000000-0000-0000-0000-000000000001')
    expect(request.logger.warn).toHaveBeenCalled()
    expect(request.yar.set).toHaveBeenCalledWith(
      'userId',
      '00000000-0000-0000-0000-000000000001'
    )
  })

  test('does not call backend again when user is already in session', async () => {
    mockConfig()
    const apiUser = { userId: 'u1', email: 'u@u.com', name: 'User' }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => apiUser
    })

    const resolveUser = await getResolveUser()
    const session = {}

    // First request — populates session
    const req1 = {
      yar: {
        get: vi.fn((key) => session[key] ?? null),
        set: vi.fn((key, val) => {
          session[key] = val
        })
      },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    }
    await resolveUser(req1)

    // Second request — same session already has user
    const req2 = {
      yar: {
        get: vi.fn((key) => session[key] ?? null),
        set: vi.fn((key, val) => {
          session[key] = val
        })
      },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
    }
    const result = await resolveUser(req2)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result).toEqual(apiUser)
  })
})
