import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import locale from '../assets/i18n'
import '../styles/generic-list.css'

/**
 * GenericList - A reusable list component with search/autocomplete.
 *
 * Props:
 * - items: Array of { id, name, image?, url?, subtitle? }
 * - basePath: The base route path for internal navigation (e.g. "/group")
 * - linkMode: "internal" (navigate to basePath/id) | "external" (open item.url in new tab)
 * - buttonLabel: Custom label for the action button
 * - title: Optional title above the list
 * - emptyMessage: Message when no items
 * - searchable: Enable search/autocomplete (default true)
 */
export default function GenericList({
  items,
  basePath,
  linkMode = 'internal',
  buttonLabel,
  title,
  emptyMessage,
  searchable = true,
}) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const empty = emptyMessage || locale.list.noItems
  const label = buttonLabel || (linkMode === 'external' ? locale.list.openLink : locale.list.details)

  if (!items || items.length === 0) {
    return <p className="generic-list-empty">{empty}</p>
  }

  const filtered = search.trim()
    ? items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
    : items

  const handleClick = (item) => {
    if (linkMode === 'external' && item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer')
    } else if (basePath) {
      navigate(`${basePath}/${item.id}`, { state: item })
    }
  }

  return (
    <div className="generic-list">
      {title && <h4 className="generic-list-title">{title}</h4>}

      {searchable && (
        <div className="generic-list-search">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={locale.dashboard.searchPlaceholder}
            className="generic-list-search-input"
          />
          {search && (
            <button onClick={() => setSearch('')} className="generic-list-search-clear">✕</button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="generic-list-empty">{locale.list.noItems}</p>
      ) : (
        <ul className="generic-list-items">
          {filtered.map((item) => (
            <li key={item.id} className="generic-list-item">
              <div className="generic-list-item-info">
                {item.image && (
                  <img src={item.image} alt="" className="generic-list-item-thumb" />
                )}
                <div className="generic-list-item-text">
                  <span className="generic-list-item-name">{item.name}</span>
                  {item.subtitle && <span className="generic-list-item-subtitle">{item.subtitle}</span>}
                </div>
              </div>
              {(linkMode !== 'external' || item.url) && (
                <button
                  onClick={() => handleClick(item)}
                  className="generic-list-item-btn"
                >
                  {label} {linkMode === 'external' ? '🔗' : '←'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
