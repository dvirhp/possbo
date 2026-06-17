import he from './he'

const locales = { he }
const currentLocale = 'he'

export function t(path) {
  const keys = path.split('.')
  let value = locales[currentLocale]
  for (const key of keys) {
    if (value == null) return path
    value = value[key]
  }
  return value ?? path
}

export default locales[currentLocale]
