import api from './http'

function upload(path, file) {
  const body = new FormData()
  body.append('file', file)
  return api.post(path, body, { headers: { 'Content-Type': 'multipart/form-data' } })
}

export const importsService = {
  previewCsv: file => upload('/imports/csv/preview', file),
  commitCsv: file => upload('/imports/csv/commit', file),
}
