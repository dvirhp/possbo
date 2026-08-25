import { createContext, useContext, useCallback, useRef, useState } from 'react'
import ConfirmDialog from '../components/ConfirmDialog'

const NavigationGuardContext = createContext({
  setDirty: () => {},
  guardNavigate: () => {},
  isDirty: () => false,
})

export function NavigationGuardProvider({ children }) {
  const dirtyRef = useRef(false)
  const messageRef = useRef('יש שינויים שלא נשמרו. לצאת בלי לשמור?')
  const [pendingAction, setPendingAction] = useState(null)

  const setDirty = useCallback((dirty, message) => {
    dirtyRef.current = dirty
    if (message) messageRef.current = message
  }, [])

  const isDirty = useCallback(() => dirtyRef.current, [])

  const guardNavigate = useCallback((action) => {
    if (!dirtyRef.current) {
      action()
      return
    }
    setPendingAction(() => action)
  }, [])

  const handleConfirm = () => {
    dirtyRef.current = false
    const action = pendingAction
    setPendingAction(null)
    if (action) action()
  }

  const handleCancel = () => {
    setPendingAction(null)
  }

  return (
    <NavigationGuardContext.Provider value={{ setDirty, guardNavigate, isDirty }}>
      {children}
      <ConfirmDialog
        open={!!pendingAction}
        title="יציאה ללא שמירה"
        message={messageRef.current}
        confirmText="צא בלי לשמור"
        cancelText="הישאר"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        danger
      />
    </NavigationGuardContext.Provider>
  )
}

export function useNavigationGuard() {
  return useContext(NavigationGuardContext)
}
