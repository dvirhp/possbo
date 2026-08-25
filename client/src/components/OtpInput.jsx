import { useRef, useEffect } from 'react'
import '../styles/otp-input.css'

export default function OtpInput({ length = 6, value = '', onChange }) {
  const inputsRef = useRef([])

  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  const handleChange = (e, index) => {
    const val = e.target.value.replace(/\D/g, '')
    if (!val) return

    const digits = value.split('')
    digits[index] = val[val.length - 1] // take last digit (handles paste of 1 char)
    const newValue = digits.join('').slice(0, length)
    onChange(newValue)

    // Move to next input
    if (index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const digits = value.split('')
      if (digits[index]) {
        digits[index] = ''
        onChange(digits.join(''))
      } else if (index > 0) {
        digits[index - 1] = ''
        onChange(digits.join(''))
        inputsRef.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (pasted) {
      onChange(pasted)
      const focusIndex = Math.min(pasted.length, length - 1)
      inputsRef.current[focusIndex]?.focus()
    }
  }

  return (
    <div className="otp-container" dir="ltr">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={el => inputsRef.current[i] = el}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          className={`otp-circle ${value[i] ? 'filled' : ''}`}
          value={value[i] || ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          onPaste={handlePaste}
          maxLength={1}
        />
      ))}
    </div>
  )
}
