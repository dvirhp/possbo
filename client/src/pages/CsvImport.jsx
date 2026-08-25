import { useState } from 'react'
import { FileUp, Download, CheckCircle, AlertTriangle } from 'lucide-react'
import { importsService } from '../services/importsService'
import '../styles/csv-import.css'

const TEMPLATE = '\uFEFFtitle,content,location,isAnonymous,platform\r\nמבצע קיץ,"תוכן הפוסט כאן",תל אביב,false,FACEBOOK\r\nפוסט אינסטגרם,"תוכן נוסף",,false,INSTAGRAM'

export default function CsvImport() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const chooseFile = async event => {
    const selected = event.target.files?.[0]
    setFile(selected || null)
    setPreview(null)
    setMessage('')
    if (!selected) return
    setBusy('preview')
    try { setPreview((await importsService.previewCsv(selected)).data) }
    catch (error) { setMessage(error.response?.data?.error || 'לא הצלחנו לקרוא את הקובץ.') }
    finally { setBusy('') }
  }

  const commit = async () => {
    if (!file || preview?.errors?.length) return
    setBusy('commit')
    setMessage('')
    try {
      const response = await importsService.commitCsv(file)
      setMessage(`${response.data.imported} טיוטות יובאו בהצלחה. הן לא פורסמו ולא תוזמנו.`)
    } catch (error) {
      setMessage(error.response?.data?.error || 'הייבוא נכשל. לא נוצרו טיוטות.')
    } finally { setBusy('') }
  }

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new window.Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'possbo-import-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <main className="csv-import-page" dir="rtl">
    <header><FileUp size={26}/><div><h1>ייבוא פוסטים מ-CSV</h1><p>בדקו את הקובץ וצרו עד 500 טיוטות בפעולה אחת.</p></div></header>
    <section className="csv-import-card">
      <button type="button" className="csv-template-btn" onClick={downloadTemplate}><Download size={16}/> הורדת קובץ לדוגמה</button>
      <p className="csv-import-note">עמודת <b>content</b> היא חובה. העמודות הנתמכות: title, content, location, isAnonymous, platform.</p>
      <label className="csv-file-picker"><FileUp size={22}/><span>{file?.name || 'בחירת קובץ CSV'}</span><input type="file" accept=".csv,text/csv" onChange={chooseFile}/></label>
      {busy === 'preview' && <p>בודק את הקובץ…</p>}
    </section>
    {preview && <section className="csv-import-card">
      <div className="csv-summary"><span><CheckCircle/> {preview.validRows} שורות תקינות</span><span className={preview.invalidRows ? 'has-errors' : ''}><AlertTriangle/> {preview.invalidRows} שורות עם שגיאות</span></div>
      {preview.errors?.length > 0 && <div className="csv-errors">{preview.errors.slice(0, 100).map((error, index) => <div key={`${error.row}-${error.field}-${index}`}>שורה {error.row}, {error.field}: {error.message}</div>)}</div>}
      <div className="csv-preview-table"><table><thead><tr><th>שורה</th><th>כותרת</th><th>תוכן</th><th>פלטפורמה</th><th>מצב</th></tr></thead><tbody>{preview.rows.slice(0, 50).map(row => <tr key={row.row}><td>{row.row}</td><td>{row.title || '—'}</td><td>{row.content?.slice(0, 100)}</td><td>{row.platform}</td><td>{row.valid ? 'תקין' : 'דורש תיקון'}</td></tr>)}</tbody></table></div>
      <button type="button" className="csv-commit-btn" disabled={busy || preview.errors?.length > 0} onClick={commit}>{busy === 'commit' ? 'מייבא…' : `ייבוא ${preview.validRows} טיוטות`}</button>
    </section>}
    {message && <div className="csv-import-message" role="status">{message}</div>}
  </main>
}
