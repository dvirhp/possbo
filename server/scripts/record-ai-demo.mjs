import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import prisma from '../src/config/prisma.js'
import { generateAccessToken } from '../src/utils/jwt.js'
import { formatUserResponse } from '../src/utils/auth-service.js'

const root = path.resolve(process.cwd(), '..')
const outputDir = path.join(root, 'client', 'public', 'landing', 'video')
await fs.mkdir(outputDir, { recursive: true })

const user = await prisma.user.findUnique({
  where: { id: '151fa87c-455b-41fc-93b6-b00ad6313355' },
})
if (!user) throw new Error('Demo user was not found')

const subscription = await prisma.subscription.findFirst({
  where: { userId: user.id, status: { in: ['ACTIVE', 'CANCELLED'] } },
  include: { plan: true },
  orderBy: { createdAt: 'desc' },
})
const responseUser = formatUserResponse(user, {
  subscription: subscription
    ? { status: subscription.status, planName: subscription.plan?.name, endsAt: subscription.endsAt }
    : null,
  instagramConnected: true,
})
const token = generateAccessToken(user.id)
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  recordVideo: { dir: outputDir, size: { width: 1440, height: 1080 } },
  locale: 'he-IL',
})
const page = await context.newPage()
const video = page.video()

await page.addInitScript(() => localStorage.setItem('possbo-theme', 'light'))
await page.route('**/api/auth/refresh', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ success: true, accessToken: token, user: responseUser }),
}))
await page.route('**/api/ai/generate-post', async route => {
  await new Promise(resolve => setTimeout(resolve, 1800))
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      post: `הגיע הזמן לנהל את השיווק בצורה חכמה יותר ✨

עם Possbo יוצרים תוכן, מתזמנים ומפרסמים בכל הערוצים ממקום אחד:

📘 Facebook — קבוצות ופרופיל
📸 Instagram — פוסט, סטורי ורילס
💬 WhatsApp — קבוצות ורשימות תפוצה

הכול עם AI שמכיר את המטרה, הקהל והסגנון של העסק שלכם.

רוצים לחסוך שעות בכל שבוע ולהגיע ליותר לקוחות?
שלחו לנו הודעה והתחילו לפרסם חכם 🚀`,
    }),
  })
})

const pause = ms => page.waitForTimeout(ms)
async function addCursor() {
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = `
      #ai-demo-cursor{position:fixed;z-index:2147483647;width:25px;height:25px;border:3px solid #6842f4;
      border-radius:50%;box-shadow:0 0 0 7px rgba(104,66,244,.16);pointer-events:none;
      transform:translate(-50%,-50%);transition:left .3s ease,top .3s ease}
      .uwy,.accessibility-widget,[class*="accessibility"]{display:none!important}
    `
    document.head.appendChild(style)
    const cursor = document.createElement('div')
    cursor.id = 'ai-demo-cursor'
    cursor.style.left = '720px'
    cursor.style.top = '450px'
    document.body.appendChild(cursor)
  })
}
async function point(locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) return
  await page.evaluate(({ x, y }) => {
    const el = document.querySelector('#ai-demo-cursor')
    if (el) {
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    }
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await pause(360)
}
async function click(locator, after = 650) {
  await point(locator)
  await locator.click()
  await pause(after)
}
async function type(locator, text) {
  await point(locator)
  await locator.fill('')
  await locator.pressSequentially(text, { delay: 24 })
  await pause(350)
}

try {
  await page.goto('http://localhost:4200/generate-post', { waitUntil: 'networkidle', timeout: 30000 })
  await page.evaluate(() => {
    const removeOuterUi = () => {
      document.querySelectorAll(
        '.sidebar,.bottom-nav,.a11y-fab,.chatbot-fab,.chatbot-panel,.lcb-fab,.lcb-panel,.landing-chatbot'
      ).forEach(element => element.remove())
    }
    removeOuterUi()
    new MutationObserver(removeOuterUi).observe(document.body, { childList: true, subtree: true })
  })
  await page.addStyleTag({ content: `
    .sidebar,.bottom-nav,.a11y-fab,.chatbot-fab,.chatbot-panel,.lcb-fab,.lcb-panel,.landing-chatbot,
    .pull-refresh-indicator,.ptr-indicator{display:none!important}
    html,body,#root{width:100%!important;min-width:0!important;height:100%!important;margin:0!important;overflow:hidden!important;background:#f7f9fd!important}
    .app-layout{display:block!important;width:100%!important;min-height:100vh!important}
    .app-main{width:100%!important;max-width:none!important;height:100vh!important;margin:0!important;padding:0!important;overflow:auto!important}
    .generate-post-page{box-sizing:border-box!important;width:100%!important;min-height:100vh!important;padding:10px 24px 20px!important;align-items:flex-start!important}
    .generate-post-container{width:min(1120px,100%)!important;max-width:1120px!important;margin:0 auto!important;zoom:.72}
    .generate-post-header{margin-bottom:10px!important}
    .generate-post-header h1{font-size:25px!important}
    .header-tip{margin:5px 0 8px!important;padding:7px 10px!important}
    .generate-steps{margin:8px 0 12px!important}
    .generate-form,.generate-result{padding:18px!important}
    .generate-form{gap:.62rem!important}
    .generate-form .form-group label{margin-bottom:.2rem!important}
    .generate-form input,.generate-form textarea{padding:.48rem .72rem!important}
    .generate-form textarea{min-height:52px!important;max-height:58px!important}
    .field-hint{margin:0 0 .15rem!important}
    .generate-btn.centered-btn{margin-top:.1rem!important}
  ` })
  await addCursor()
  await pause(1600)

  await click(page.locator('.post-type-btn').filter({ hasText: 'חשיפת מותג' }))
  await type(page.locator('input[placeholder^="לדוגמה: עיצוב אופנה"]'), 'שיווק דיגיטלי ואוטומציה')
  await type(page.locator('textarea[placeholder^="לדוגמה: שמלות ערב"]'), 'Possbo, מערכת ליצירת תוכן ולפרסום בכל הרשתות ממקום אחד')
  await type(page.locator('input[placeholder^="לדוגמה: נשים 25"]'), 'בעלי עסקים ומנהלי שיווק בישראל')
  await click(page.locator('.centered-btn'), 850)

  await type(page.locator('input[placeholder^="לדוגמה: 10 שנות ניסיון"]'), 'AI, תזמון חכם ופרסום ל-Facebook, Instagram ו-WhatsApp')
  await click(page.locator('.tone-btn').filter({ hasText: 'מעורר השראה' }))
  await type(page.locator('input[placeholder^="לדוגמה: לשלוח הודעה"]'), 'לשלוח הודעה ולהתחיל לפרסם חכם')
  await click(page.locator('.contact-method-btn').first())
  await type(page.locator('textarea[placeholder^="כל דבר נוסף"]'), 'להדגיש חיסכון בזמן, ממשק פשוט ותוצאות טובות יותר')
  await pause(850)

  await click(page.getByRole('button', { name: 'צור פוסט' }), 300)
  await page.locator('.result-text').waitFor({ timeout: 10000 })
  await pause(5200)
} finally {
  await context.close()
  await browser.close()
  await prisma.$disconnect()
}

const recordedPath = await video.path()
const finalPath = path.join(outputDir, 'possbo-ai-post-demo.webm')
await fs.copyFile(recordedPath, finalPath)
if (recordedPath !== finalPath) await fs.rm(recordedPath)
console.log(finalPath)
