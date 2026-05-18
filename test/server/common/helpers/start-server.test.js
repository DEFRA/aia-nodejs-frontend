import { vi } from 'vitest'

import hapi from '@hapi/hapi'

describe('#startServer', () => {
  let createServerSpy
  let startServerImport
  let createServerImport

  beforeAll(async () => {
    vi.stubEnv('PORT', '3097')

    createServerImport = await import('../../../../src/server/server.js')
    startServerImport =
      await import('../../../../src/server/common/helpers/start-server.js')

    createServerSpy = vi.spyOn(createServerImport, 'createServer')
    vi.spyOn(hapi, 'server')
  }, 30000)

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  describe('When server starts', () => {
    let server

    test('Should start the server and return a hapi server instance', async () => {
      server = await startServerImport.startServer()
      expect(server).toBeDefined()
      expect(typeof server.stop).toBe('function')
    })

    afterAll(async () => {
      await server?.stop({ timeout: 0 })
    })
  })

  describe('When server start fails', () => {
    test('Should log failed startup message', async () => {
      createServerSpy.mockRejectedValue(new Error('Server failed to start'))

      await expect(startServerImport.startServer()).rejects.toThrow(
        'Server failed to start'
      )
    })
  })
})
