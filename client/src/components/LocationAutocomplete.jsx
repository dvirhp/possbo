import { useState, useRef, useEffect } from 'react'
import http from '../services/http'
import '../styles/location-autocomplete.css'

export default function LocationAutocomplete({ value, onChange, placeholder, disabled }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(value || '')
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    setSelected(value || '')
    if (!value) setQuery('')
  }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const searchPlaces = async (text) => {
    if (!text || text.length < 2) {
      setResults([])
      return
    }

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const res = await http.get('/groups/places', {
        params: { q: text },
        signal: controller.signal,
      })
      const data = res.data
      setResults(
        data.map((place) => ({
          id: place.id,
          name: place.name,
          detail: [place.city, place.country].filter(Boolean).join(', '),
        }))
      )
      setShowDropdown(true)
    } catch (err) {
      if (err?.name !== 'CanceledError') setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchPlaces(val), 250)
  }

  const handleSelect = (place) => {
    const fullName = place.detail ? `${place.name}, ${place.detail}` : place.name
    setSelected(fullName)
    setQuery('')
    onChange(fullName)
    setShowDropdown(false)
    setResults([])
  }

  const handleClear = () => {
    setSelected('')
    setQuery('')
    onChange('')
    setResults([])
    setShowDropdown(false)
  }

  // Show selected chip when a location is chosen
  if (selected) {
    return (
      <div className="loc-autocomplete" ref={containerRef}>
        <div className="loc-autocomplete-selected">
          <span className="loc-autocomplete-selected-icon">📍</span>
          <span className="loc-autocomplete-selected-name">{selected}</span>
          {!disabled && (
            <button
              onMouseDown={(e) => { e.preventDefault(); handleClear() }}
              className="loc-autocomplete-clear"
              type="button"
              aria-label="נקה מיקום"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="loc-autocomplete" ref={containerRef}>
      <div className="loc-autocomplete-input-row">
        <span className="loc-autocomplete-icon">📍</span>
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder || 'חפש מיקום...'}
          className="loc-autocomplete-input"
          disabled={disabled}
          aria-label={placeholder || 'חפש מיקום'}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
        />
        {query && (
          <button
            onMouseDown={(e) => { e.preventDefault(); handleClear() }}
            className="loc-autocomplete-clear"
            type="button"
            aria-label="נקה מיקום"
          >
            ✕
          </button>
        )}
      </div>

      {showDropdown && (results.length > 0 || loading) && (
        <ul className="loc-autocomplete-dropdown" role="listbox" aria-label="תוצאות מיקום">
          {loading && <li className="loc-autocomplete-loading">מחפש...</li>}
          {results.map((place) => (
            <li
              key={place.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(place) }}
              className="loc-autocomplete-item"
              role="option"
            >
              <span className="loc-autocomplete-item-icon">📍</span>
              <div className="loc-autocomplete-item-text">
                <span className="loc-autocomplete-item-name">{place.name}</span>
                <span className="loc-autocomplete-item-detail">{place.detail}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
