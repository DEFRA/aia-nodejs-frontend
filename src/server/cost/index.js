import { costController } from './controller.js'

export const cost = {
  plugin: {
    name: 'cost',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/cost',
          ...costController
        }
      ])
    }
  }
}
