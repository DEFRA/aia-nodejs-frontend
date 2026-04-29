import {
  createAll,
  Button,
  Checkboxes,
  ErrorSummary,
  Radios,
  SkipLink
} from 'govuk-frontend'

import { initUploadHandler } from './upload-handler.js'

createAll(Button)
createAll(Checkboxes)
createAll(ErrorSummary)
createAll(Radios)
createAll(SkipLink)

if (document.getElementById('uploadForm')) {
  initUploadHandler()
}
