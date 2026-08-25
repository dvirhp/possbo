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
  instagramUsername: 'possbo_demo',
})
responseUser.whatsappSessionConnected = true
const token = generateAccessToken(user.id)

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } },
  locale: 'he-IL',
})
const page = await context.newPage()
const video = page.video()

await page.addInitScript(() => localStorage.setItem('possbo-theme', 'dark'))
await page.route('**/api/auth/refresh', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ success: true, accessToken: token, user: responseUser }),
}))
await page.route('**/api/instagram/status', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ connected: true, account: { username: 'possbo_demo' } }),
}))
await page.route('**/api/ai/generate-post', async route => {
  await new Promise(resolve => setTimeout(resolve, 2200))
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      post: `הקיץ הזה העסק שלך עובד חכם יותר ☀️

עם Possbo יוצרים קמפיין אחד ומפרסמים אותו בדיוק בזמן בכל הערוצים:
📘 קבוצות ופרופיל Facebook
📸 פוסט, סטורי ורילס ב-Instagram
💬 קבוצות ורשימות תפוצה ב-WhatsApp

הכול ממקום אחד — עם תוכן שנוצר ב-AI, תזמון חכם ודוחות שמראים מה באמת עובד.

רוצים להפוך רעיון לקמפיין שלם בתוך דקות?
שלחו לנו הודעה והתחילו לנהל את השיווק בצורה חכמה יותר 🚀`,
    }),
  })
})

const pause = ms => page.waitForTimeout(ms)
async function addPresentationLayer() {
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = `
      #demo-chapter{position:fixed;z-index:2147483646;left:28px;bottom:28px;padding:13px 20px;
      border:1px solid rgba(148,163,184,.28);border-radius:15px;background:rgba(8,12,21,.88);
      box-shadow:0 12px 36px rgba(0,0,0,.38);backdrop-filter:blur(14px);color:#fff;font:700 18px Arial;
      direction:rtl;transition:opacity .25s,transform .25s}
      #demo-cursor{position:fixed;z-index:2147483647;width:28px;height:28px;border:3px solid #60a5fa;
      border-radius:50%;box-shadow:0 0 0 7px rgba(59,130,246,.18);pointer-events:none;
      transform:translate(-50%,-50%);transition:left .34s ease,top .34s ease}
      .uwy,.accessibility-widget,[class*="accessibility"]{display:none!important}
    `
    document.head.appendChild(style)
    const chapter = document.createElement('div')
    chapter.id = 'demo-chapter'
    chapter.textContent = 'יוצרים קמפיין חדש'
    document.body.appendChild(chapter)
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.style.left = '720px'
    cursor.style.top = '450px'
    document.body.appendChild(cursor)
  })
}
async function chapter(text) {
  await page.evaluate(value => {
    const el = document.querySelector('#demo-chapter')
    if (el) el.textContent = value
  }, text)
  await pause(900)
}
async function point(locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (box) {
    await page.evaluate(({ x, y }) => {
      const el = document.querySelector('#demo-cursor')
      if (el) {
        el.style.left = `${x}px`
        el.style.top = `${y}px`
      }
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    await pause(420)
  }
}
async function click(locator, after = 700) {
  await point(locator)
  await locator.click()
  await pause(after)
}
async function type(locator, text) {
  await point(locator)
  await locator.fill('')
  await locator.pressSequentially(text, { delay: 32 })
  await pause(450)
}

try {
  await page.goto('http://localhost:4200/create-post', { waitUntil: 'networkidle', timeout: 30000 })
  await addPresentationLayer()
  await pause(1600)

  await type(page.locator('.cp-title-input'), 'קמפיין קיץ חכם 2026')
  await chapter('יוצרים את התוכן בעזרת AI')
  await click(page.locator('.cp-ai-generate-btn'))
  await page.waitForURL('**/generate-post')
  await addPresentationLayer()

  await click(page.locator('.post-type-btn').first())
  await type(page.locator('input[placeholder^="לדוגמה: עיצוב אופנה"]'), 'שיווק דיגיטלי ואוטומציה לעסקים')
  await type(page.locator('textarea[placeholder^="לדוגמה: שמלות ערב"]'), 'מערכת Possbo לניהול ופרסום קמפיינים בכל הרשתות ממקום אחד')
  await type(page.locator('input[placeholder^="לדוגמה: נשים 25"]'), 'בעלי עסקים ומנהלי שיווק בישראל')
  await click(page.locator('.centered-btn'))

  await type(page.locator('input[placeholder^="לדוגמה: 10 שנות ניסיון"]'), 'קמפיין אחד לפייסבוק, אינסטגרם ווואטסאפ עם AI ותזמון חכם')
  await click(page.locator('.tone-btn').nth(2))
  await type(page.locator('input[placeholder^="לדוגמה: לשלוח הודעה"]'), 'לשלוח הודעה ולהתחיל לנהל את השיווק בצורה חכמה')
  await click(page.locator('.contact-method-btn').first())
  await type(page.locator('textarea[placeholder^="כל דבר נוסף"]'), 'השקה לקיץ, שפה שיווקית זורמת והדגשת החיבור החד-פעמי לכל הפלטפורמות')
  await chapter('Possbo כותב פוסט שלם תוך שניות')
  await click(page.getByRole('button', { name: 'צור פוסט' }), 300)
  await page.locator('.result-text').waitFor({ timeout: 10000 })
  await pause(2200)
  await click(page.getByRole('button', { name: /חזרה לפוסט עם התוכן/ }))
  await page.waitForURL('**/create-post')
  await addPresentationLayer()
  await pause(1200)

  await chapter('מוסיפים מדיה ומכינים את הקמפיין')
  const fileInput = page.locator('input[type=file]').first()
  await point(fileInput.locator('xpath=..'))
  await fileInput.setInputFiles(path.join(root, 'client', 'public', 'brand', 'possbo-hero-automation-v1.webp'))
  await pause(1400)

  await click(page.locator('.cp-nav-next'))
  await chapter('בוחרים ערוצי הפצה — Facebook')
  const profile = page.locator('.cp-facebook-profile-option input[type=checkbox]')
  if (await profile.count()) await click(profile)
  const fbGroup = page.locator('.cp-group-item input[type=checkbox]').first()
  if (await fbGroup.count()) await click(fbGroup)

  await chapter('Instagram — פוסט, סטורי ורילס')
  await click(page.locator('.cp-platform-tab').filter({ hasText: 'Instagram' }))
  await page.locator('.cp-ig-type-card').first().waitFor({ timeout: 5000 })
  for (const card of await page.locator('.cp-ig-type-card').all()) await click(card, 350)

  await chapter('WhatsApp — קבוצות ורשימות תפוצה')
  await click(page.locator('.cp-platform-tab').filter({ hasText: 'WhatsApp' }))
  await pause(1100)
  const waTarget = page.locator('.cp-platform-panel .cp-group-item input[type=checkbox]').first()
  if (await waTarget.count()) await click(waTarget)

  await click(page.locator('.cp-nav-next'))
  await chapter('תזמון נפרד לכל פלטפורמה')
  await pause(1200)
  const scheduled = page.locator('.schedule-tab').filter({ hasText: /חד|תזמון|פעמי/ }).first()
  if (await scheduled.count()) {
    await click(scheduled)
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    const dateInput = page.locator('input[type=date]:visible').first()
    const timeInput = page.locator('input[type=time]:visible').first()
    if (await dateInput.count()) await dateInput.fill(future)
    if (await timeInput.count()) await timeInput.fill('10:30')
    await pause(1000)
  }

  await click(page.locator('.cp-nav-next'))
  await chapter('הקמפיין מוכן — בודקים הכול לפני הפרסום')
  await pause(4200)
} finally {
  await context.close()
  await browser.close()
  await prisma.$disconnect()
}

const recordedPath = await video.path()
const finalPath = path.join(outputDir, 'possbo-full-campaign-demo.webm')
await fs.copyFile(recordedPath, finalPath)
if (recordedPath !== finalPath) await fs.rm(recordedPath)
console.log(finalPath)
