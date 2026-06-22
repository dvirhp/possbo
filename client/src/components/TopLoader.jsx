import { useAppData } from '../context/DataProvider'

export default function TopLoader() {
  const { refreshing } = useAppData()

  if (!refreshing) return null

  return (
    <div className="top-loader">
      <div className="top-loader-bar" />
    </div>
  )
}
