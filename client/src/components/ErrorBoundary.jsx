import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      const mailto = 'mailto:support@possbo.co.il?subject=שגיאה באפליקציה&body=שלום, נתקלתי בשגיאה באפליקציה. אשמח לעזרה.'
      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <div className="error-boundary-icon">⚠️</div>
            <h2>משהו השתבש</h2>
            <p>אירעה שגיאה בלתי צפויה. נסה לרענן את הדף.</p>
            <div className="error-boundary-actions">
              <button className="error-boundary-btn primary" onClick={() => window.location.reload()}>
                רענן את הדף
              </button>
              <a className="error-boundary-btn secondary" href={mailto}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                שלח מייל לעזרה
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
