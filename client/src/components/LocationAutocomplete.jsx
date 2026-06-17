import { useState, useRef, useEffect } from 'react'
import '../styles/location-autocomplete.css'

export default function LocationAutocomplete({ value, onChange, placeholder, disabled }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    setQuery(value || '')
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
    setLoading(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=7&addressdetails=1&accept-language=he`
      )
      const data = await res.json()
      setResults(
        data.map((item) => ({
          id: item.place_id,
          name: item.display_name.split(',').slice(0, 2).join(','),
          fullName: item.display_name,
        }))
      )
      setShowDropdown(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    onChange(val)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => searchPlaces(val), 400)
  }

  const handleSelect = (place) => {
    setQuery(place.name)
    onChange(place.name)
    setShowDropdown(false)
    setResults([])
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
          placeholder={placeholder}
          className="loc-autocomplete-input"
          disabled={disabled}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); onChange(''); setResults([]); setShowDropdown(false) }}
            className="loc-autocomplete-clear"
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      {showDropdown && (results.length > 0 || loading) && (
        <ul className="loc-autocomplete-dropdown">
          {loading && <li className="loc-autocomplete-loading">מחפש...</li>}
          {results.map((place) => (
            <li key={place.id} onClick={() => handleSelect(place)} className="loc-autocomplete-item">
              <span className="loc-autocomplete-item-icon">📍</span>
              <div className="loc-autocomplete-item-text">
                <span className="loc-autocomplete-item-name">{place.name}</span>
                <span className="loc-autocomplete-item-detail">{place.fullName}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
