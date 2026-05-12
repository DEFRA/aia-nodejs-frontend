import inert from '@hapi/inert'

import { home } from './home/index.js'
import { result } from './result/index.js'
import { health } from './health/index.js'
import { signout } from './signout/index.js'
import { notAuthorized } from './not-authorized/index.js'
import { accessCode } from './access-code/index.js'
import { cost } from './cost/index.js'
import { policyDocuments } from './policy-documents/index.js'
import { serveStaticFiles } from './common/helpers/serve-static-files.js'

export const router = {
  plugin: {
    name: 'router',
    async register(server) {
      await server.register([inert])

      // Health-check route. Used by platform to check if service is running, do not remove!
      await server.register([health])

      // Application specific routes, add your own routes here
      await server.register([
        home,
        result,
        signout,
        notAuthorized,
        accessCode,
        cost,
        policyDocuments
      ])

      // Static assets
      await server.register([serveStaticFiles])
    }
  }
}
