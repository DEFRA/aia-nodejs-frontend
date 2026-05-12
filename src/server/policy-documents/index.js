import {
  policyDocumentsController,
  policyDocumentEditController,
  policyDocumentEditSubmitController,
  policyDocumentNewController,
  policyDocumentNewSubmitController,
  policyDocumentDeleteController,
  policyDocumentsRedirectController
} from './controller.js'

export const policyDocuments = {
  plugin: {
    name: 'policy-documents',
    register(server) {
      server.route([
        {
          method: 'GET',
          path: '/policy-documents',
          ...policyDocumentsController
        },
        {
          method: 'GET',
          path: '/policy-documents/edit',
          ...policyDocumentEditController
        },
        {
          method: 'POST',
          path: '/policy-documents/edit',
          ...policyDocumentEditSubmitController
        },
        {
          method: 'GET',
          path: '/policy-documents/new',
          ...policyDocumentNewController
        },
        {
          method: 'POST',
          path: '/policy-documents/new',
          ...policyDocumentNewSubmitController
        },
        {
          method: 'POST',
          path: '/policy-documents/delete',
          ...policyDocumentDeleteController
        },
        {
          method: 'GET',
          path: '/PolicyDocuments',
          ...policyDocumentsRedirectController
        }
      ])
    }
  }
}
