import { useTheme } from '../context/ThemeProvider'

export const BRAND_LOGOS = {
  light: '/brand/possbo-mark-black.png',
  dark: '/brand/possbo-mark-white.png',
}

export default function BrandLogo({
  className = '',
  alt = 'Possbo',
  decorative = false,
  ...props
}) {
  const { theme = 'light' } = useTheme() || {}

  return (
    <img
      src={BRAND_LOGOS[theme === 'dark' ? 'dark' : 'light']}
      className={`brand-logo ${className}`.trim()}
      alt={decorative ? '' : alt}
      aria-hidden={decorative ? 'true' : undefined}
      {...props}
    />
  )
}
