import { useState, useRef, useEffect } from 'react'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { useTheme } from '../context/ThemeProvider'
import '../styles/emoji-picker.css'

const hebrewI18n = {
  search: 'חיפוש אימוג׳י...',
  search_no_results_1: 'אוי לא!',
  search_no_results_2: 'לא נמצא אימוג׳י',
  pick: 'בחר/י אימוג׳י...',
  add_custom: 'הוסף אימוג׳י מותאם',
  categories: {
    activity: 'פעילויות',
    custom: 'מותאם אישית',
    flags: 'דגלים',
    foods: 'אוכל ושתייה',
    frequent: 'נפוצים',
    nature: 'טבע ובעלי חיים',
    objects: 'חפצים',
    people: 'אנשים וגוף',
    places: 'נסיעות ומקומות',
    search: 'תוצאות חיפוש',
    symbols: 'סמלים',
  },
  skins: {
    choose: 'בחר/י גוון עור',
    '1': 'ברירת מחדל',
    '2': 'בהיר',
    '3': 'בהיר-בינוני',
    '4': 'בינוני',
    '5': 'כהה-בינוני',
    '6': 'כהה',
  },
}

// Hebrew search keywords mapping
const hebrewSearchCustom = [
  { id: 'heart', keywords: 'לב,לבבות,אהבה,love' },
  { id: 'sparkling_heart', keywords: 'לב,לבבות,אהבה' },
  { id: 'heart_on_fire', keywords: 'לב,אש,אהבה' },
  { id: 'broken_heart', keywords: 'לב,שבור,עצוב' },
  { id: 'two_hearts', keywords: 'לב,לבבות,אהבה' },
  { id: 'revolving_hearts', keywords: 'לב,לבבות,אהבה' },
  { id: 'heartbeat', keywords: 'לב,פועם' },
  { id: 'heartpulse', keywords: 'לב,גדל' },
  { id: 'orange_heart', keywords: 'לב,כתום' },
  { id: 'yellow_heart', keywords: 'לב,צהוב' },
  { id: 'green_heart', keywords: 'לב,ירוק' },
  { id: 'blue_heart', keywords: 'לב,כחול' },
  { id: 'purple_heart', keywords: 'לב,סגול' },
  { id: 'black_heart', keywords: 'לב,שחור' },
  { id: 'white_heart', keywords: 'לב,לבן' },
  { id: 'brown_heart', keywords: 'לב,חום' },
  { id: 'cupid', keywords: 'לב,חץ,אהבה' },
  { id: 'gift_heart', keywords: 'לב,מתנה' },
  { id: 'heart_decoration', keywords: 'לב,קישוט' },
  { id: 'rocket', keywords: 'טיל,רקטה,חלל,שיגור' },
  { id: 'fire', keywords: 'אש,חם,לוהט,שריפה' },
  { id: 'star', keywords: 'כוכב,מזל' },
  { id: 'star2', keywords: 'כוכב,זוהר' },
  { id: 'sparkles', keywords: 'כוכבים,ניצוצות,קסם' },
  { id: 'thumbsup', keywords: 'לייק,אהבתי,מעולה,אגודל' },
  { id: 'thumbsdown', keywords: 'לא אהבתי,אגודל,למטה' },
  { id: 'clap', keywords: 'מחיאות,כפיים,יפה' },
  { id: 'raised_hands', keywords: 'ידיים,חגיגה,יש' },
  { id: 'pray', keywords: 'ידיים,תודה,בבקשה,תפילה' },
  { id: 'handshake', keywords: 'ידיים,לחיצת יד,עסקה' },
  { id: 'muscle', keywords: 'שריר,כוח,חזק,יד' },
  { id: 'wave', keywords: 'יד,שלום,היי,נפנוף' },
  { id: 'point_up', keywords: 'יד,אצבע,למעלה' },
  { id: 'v', keywords: 'יד,שלום,ניצחון' },
  { id: 'ok_hand', keywords: 'יד,אוקיי,מושלם' },
  { id: 'pinching_hand', keywords: 'יד,קטן,קצת' },
  { id: 'money_mouth_face', keywords: 'כסף,עשיר' },
  { id: 'moneybag', keywords: 'כסף,שק,עשיר' },
  { id: 'money_with_wings', keywords: 'כסף,בזבוז' },
  { id: 'dollar', keywords: 'כסף,דולר' },
  { id: 'gem', keywords: 'יהלום,יקר,מושלם' },
  { id: 'trophy', keywords: 'גביע,ניצחון,מקום ראשון' },
  { id: 'medal_sports', keywords: 'מדליה,ספורט,ניצחון' },
  { id: '1st_place_medal', keywords: 'מדליה,זהב,מקום ראשון' },
  { id: 'tada', keywords: 'חגיגה,מסיבה,יש' },
  { id: 'confetti_ball', keywords: 'חגיגה,מסיבה,קונפטי' },
  { id: 'balloon', keywords: 'בלון,מסיבה,חגיגה' },
  { id: 'gift', keywords: 'מתנה,הפתעה,יום הולדת' },
  { id: 'birthday', keywords: 'עוגה,יום הולדת,חגיגה' },
  { id: 'sun', keywords: 'שמש,חם,קיץ' },
  { id: 'rainbow', keywords: 'קשת,צבעוני' },
  { id: 'cloud', keywords: 'ענן,מעונן' },
  { id: 'umbrella', keywords: 'מטריה,גשם' },
  { id: 'snowflake', keywords: 'שלג,קר,חורף' },
  { id: 'dog', keywords: 'כלב,חיה' },
  { id: 'cat', keywords: 'חתול,חיה' },
  { id: 'rose', keywords: 'ורד,פרח,רומנטי' },
  { id: 'sunflower', keywords: 'חמנייה,פרח' },
  { id: 'seedling', keywords: 'צמח,טבע,גדילה' },
  { id: 'eyes', keywords: 'עיניים,מביט,רואה' },
  { id: 'brain', keywords: 'מוח,חכם,חשיבה' },
  { id: 'crown', keywords: 'כתר,מלך,מלכה' },
  { id: '100', keywords: 'מאה,מושלם,ציון' },
  { id: 'check_mark_button', keywords: 'וי,אישור,נכון' },
  { id: 'x', keywords: 'איקס,לא,שגוי' },
  { id: 'warning', keywords: 'אזהרה,זהירות' },
  { id: 'bulb', keywords: 'מנורה,רעיון,נורה' },
  { id: 'phone', keywords: 'טלפון,נייד,סלולרי' },
  { id: 'computer', keywords: 'מחשב,לפטופ' },
  { id: 'camera', keywords: 'מצלמה,צילום' },
  { id: 'house', keywords: 'בית,דירה' },
  { id: 'car', keywords: 'מכונית,רכב,נסיעה' },
  { id: 'airplane', keywords: 'מטוס,טיסה,נסיעה' },
  { id: 'clock', keywords: 'שעון,זמן' },
  { id: 'hourglass', keywords: 'שעון חול,זמן,המתנה' },
  { id: 'pizza', keywords: 'פיצה,אוכל' },
  { id: 'coffee', keywords: 'קפה,משקה,בוקר' },
  { id: 'beer', keywords: 'בירה,משקה,חגיגה' },
  { id: 'wine_glass', keywords: 'יין,משקה,חגיגה' },
]

// Inject Hebrew keywords into emoji data
function getEnhancedData() {
  const enhanced = { ...data }
  const emojis = { ...enhanced.emojis }
  for (const entry of hebrewSearchCustom) {
    if (emojis[entry.id]) {
      emojis[entry.id] = {
        ...emojis[entry.id],
        keywords: [...(emojis[entry.id].keywords || []), ...entry.keywords.split(',')]
      }
    }
  }
  enhanced.emojis = emojis
  return enhanced
}

const enhancedData = getEnhancedData()

export default function EmojiPicker({ onSelect, textareaRef }) {
  const [open, setOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState({})
  const pickerRef = useRef(null)
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const { theme } = useTheme()

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Inject RTL styles into emoji-mart Shadow DOM
  useEffect(() => {
    if (!open || !dropdownRef.current) return
    const interval = setInterval(() => {
      const emPicker = dropdownRef.current?.querySelector('em-emoji-picker')
      if (!emPicker?.shadowRoot) return
      clearInterval(interval)
      const shadow = emPicker.shadowRoot
      if (shadow.querySelector('#postit-rtl-fix')) return
      const style = document.createElement('style')
      style.id = 'postit-rtl-fix'
      style.textContent = `
        :host { direction: rtl; }
        #root { direction: rtl; }
        .search input { direction: rtl; text-align: right; }
        .category .sticky { direction: rtl; text-align: right; }
        .row { direction: ltr; }
        nav { direction: rtl; }
        nav .bar { right: auto !important; }
      `
      shadow.appendChild(style)
    }, 50)
    return () => clearInterval(interval)
  }, [open])

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      const isMobile = vw <= 600
      const pickerWidth = isMobile ? Math.min(vw - 20, 350) : 370
      const headerOffset = 60 // account for top header bar
      const padding = 10

      let top, maxH

      // Space above the trigger (minus header)
      const spaceAbove = rect.top - headerOffset - padding
      // Space below the trigger
      const spaceBelow = vh - rect.bottom - padding

      if (spaceAbove >= 280) {
        // Position above - use available space (max 400)
        maxH = Math.min(spaceAbove, 400)
        top = rect.top - maxH - 8
      } else if (spaceBelow >= 280) {
        // Position below
        maxH = Math.min(spaceBelow, 400)
        top = rect.bottom + 8
      } else {
        // Not enough space either way - fill available viewport
        top = headerOffset + padding
        maxH = vh - headerOffset - padding * 2
      }

      // RTL: align to right edge of trigger
      let left = rect.right - pickerWidth
      if (left < padding) left = padding
      if (left + pickerWidth > vw - padding) left = vw - pickerWidth - padding

      setDropdownStyle({
        top: `${top}px`,
        left: `${left}px`,
        height: `${maxH}px`
      })
    }
    setOpen(!open)
  }

  const handleEmojiSelect = (emojiData) => {
    const emoji = emojiData.native
    if (textareaRef?.current) {
      const ta = textareaRef.current
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const text = ta.value
      const newText = text.slice(0, start) + emoji + text.slice(end)
      onSelect(newText, start + emoji.length)
      setTimeout(() => {
        ta.focus()
        ta.setSelectionRange(start + emoji.length, start + emoji.length)
      }, 0)
    } else {
      onSelect(emoji)
    }
  }

  return (
    <div className="emoji-picker-wrap" ref={pickerRef}>
      <button
        type="button"
        className="emoji-picker-trigger"
        ref={triggerRef}
        onClick={handleOpen}
        title="הוסף אימוג'י"
      >
        😊
      </button>

      {open && (
        <div className="emoji-picker-dropdown" style={dropdownStyle} ref={dropdownRef}>
          <Picker
            data={enhancedData}
            onEmojiSelect={handleEmojiSelect}
            theme={theme === 'light' ? 'light' : 'dark'}
            i18n={hebrewI18n}
            previewPosition="none"
            skinTonePosition="search"
            searchPosition="sticky"
            navPosition="bottom"
            set="native"
            perLine={9}
            maxFrequentRows={2}
            dynamicWidth={false}
          />
        </div>
      )}
    </div>
  )
}
