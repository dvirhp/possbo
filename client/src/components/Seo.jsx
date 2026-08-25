import { useEffect } from 'react'

const SITE_URL = 'https://possbo.com'

function upsertMeta(selector, attributes) {
  let node = document.head.querySelector(selector)
  if (!node) {
    node = document.createElement('meta')
    document.head.appendChild(node)
  }
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value))
}

export default function Seo({
  title,
  description,
  path = '/',
  image = '/brand/possbo-hero-automation-v1.webp',
  type = 'website',
  schema,
}) {
  useEffect(() => {
    const canonicalUrl = new URL(path, SITE_URL).href
    const imageUrl = new URL(image, SITE_URL).href
    document.title = title
    document.documentElement.lang = 'he'
    document.documentElement.dir = 'rtl'

    upsertMeta('meta[name="description"]', { name: 'description', content: description })
    upsertMeta('meta[name="robots"]', { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl })
    upsertMeta('meta[property="og:locale"]', { property: 'og:locale', content: 'he_IL' })
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl })

    let canonical = document.head.querySelector('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = canonicalUrl

    const schemaNode = document.createElement('script')
    schemaNode.type = 'application/ld+json'
    schemaNode.dataset.possboSeo = 'true'
    schemaNode.textContent = JSON.stringify(schema)
    document.head.querySelectorAll('script[data-possbo-seo]').forEach(node => node.remove())
    if (schema) document.head.appendChild(schemaNode)

    return () => schemaNode.remove()
  }, [title, description, path, image, type, schema])

  return null
}

export { SITE_URL }
