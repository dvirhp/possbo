import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium } from 'playwright'
import prisma from '../src/config/prisma.js'
import { generateAccessToken } from '../src/utils/jwt.js'
import { formatUserResponse } from '../src/utils/auth-service.js'

const root = path.resolve(process.cwd(), '..')
const outputDir = path.join(root, 'client', 'public', 'landing', 'video')
const runFile = promisify(execFile)
await fs.mkdir(outputDir, { recursive: true })

const user = await prisma.user.findUnique({ where: { id: '151fa87c-455b-41fc-93b6-b00ad6313355' } })
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
})
responseUser.instagramConnected = true
responseUser.instagramUsername = 'possbo_demo'
responseUser.whatsappSessionConnected = true
const token = generateAccessToken(user.id)

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
})
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } },
  locale: 'he-IL',
})
let page = await context.newPage()
let video = null
let recordingStartedAt = 0
let contentStartedAt = 0

await context.addInitScript(() => {
  localStorage.setItem('possbo-theme', 'light')
})
const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
await context.route('**/api/auth/refresh', route => route.fulfill(json({ success: true, accessToken: token, user: responseUser })))
await context.route('**/api/instagram/status', route => route.fulfill(json({ connected: true, account: { username: 'possbo_demo' } })))
await context.route('**/groups/saved*', route => route.fulfill(json({
  success: true,
  groups: [{ id: 'demo-facebook-test', name: 'TEST', memberCount: 1280, url: 'https://facebook.com/groups/test' }],
})))
await context.route('**/whatsapp/groups*', route => route.fulfill(json({
  success: true,
  groups: [{ id: 'demo-wa-group', name: 'לקוחות VIP — Possbo', participants: 146 }],
})))
await context.route('**/whatsapp/broadcast-lists*', route => route.fulfill(json({ success: true, lists: [] })))

const pause = ms => page.waitForTimeout(ms)
async function addPresentationLayer() {
  await page.evaluate(() => {
    document.querySelector('#demo-chapter')?.remove()
    document.querySelector('#demo-cursor')?.remove()
    if (!document.querySelector('#demo-style')) {
      const style = document.createElement('style')
      style.id = 'demo-style'
      style.textContent = `
        #demo-chapter{position:fixed;z-index:2147483646;left:28px;bottom:28px;padding:13px 20px;
        border:1px solid rgba(99,102,241,.18);border-radius:15px;background:rgba(255,255,255,.94);
        box-shadow:0 12px 36px rgba(64,55,130,.15);backdrop-filter:blur(14px);color:#171329;
        font:700 18px Arial;direction:rtl;transition:opacity .25s,transform .25s}
        #demo-cursor{position:fixed;z-index:2147483647;width:28px;height:28px;border:3px solid #6045ef;
        border-radius:50%;box-shadow:0 0 0 7px rgba(96,69,239,.16);pointer-events:none;
        transform:translate(-50%,-50%);transition:left .34s ease,top .34s ease}
        #demo-robot{position:fixed;z-index:2147483645;left:22px;bottom:92px;width:118px;height:auto;
        pointer-events:none;filter:drop-shadow(0 14px 18px rgba(59,42,130,.2));transform-origin:50% 100%;
        animation:demoRobotFloat 3.2s ease-in-out infinite}
        #demo-robot.celebrate{animation:demoRobotCelebrate .62s ease-in-out 4}
        @keyframes demoRobotFloat{50%{transform:translateY(-7px) rotate(-2deg)}}
        @keyframes demoRobotCelebrate{0%,100%{transform:translateY(0) rotate(0)}45%{transform:translateY(-34px) rotate(-7deg)}70%{transform:translateY(-8px) rotate(7deg)}}
        .cp-wizard-layout{max-width:1450px!important;grid-template-columns:minmax(280px,340px) minmax(0,700px)!important;
        column-gap:110px!important;justify-content:center!important}
        .uwy,.accessibility-widget,[class*="accessibility"]{display:none!important}`
      document.head.appendChild(style)
    }
    const chapter = document.createElement('div')
    chapter.id = 'demo-chapter'
    chapter.textContent = 'יוצרים קמפיין חדש'
    document.body.appendChild(chapter)
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.style.left = '720px'
    cursor.style.top = '450px'
    document.body.appendChild(cursor)
    const robot = document.createElement('img')
    robot.id = 'demo-robot'
    robot.src = '/brand/possbo-robot-mascot-v1.png'
    document.body.appendChild(robot)
  })
}
async function chapter(text) {
  await page.evaluate(value => { const el = document.querySelector('#demo-chapter'); if (el) el.textContent = value }, text)
  await pause(750)
}
async function point(locator) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) return
  await page.evaluate(({ x, y }) => {
    const el = document.querySelector('#demo-cursor')
    if (el) { el.style.left = `${x}px`; el.style.top = `${y}px` }
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
  await locator.pressSequentially(text, { delay: 28 })
  await pause(400)
}

try {
  // Warm the application, templates, cached groups and image assets in a
  // disposable page. The recorded page is created only after this is ready.
  await page.goto('http://localhost:4200/create-post', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.cp-title-input').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.cp-restore-bar').waitFor({ state: 'visible', timeout: 15000 }).catch(() => {})
  await page.locator('.cp-restore-skeleton').first().waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
  await pause(1800)
  await page.close()

  page = await context.newPage()
  video = page.video()
  recordingStartedAt = Date.now()
  await page.goto('http://localhost:4200/create-post', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.locator('.cp-title-input').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('.cp-restore-bar').waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('.cp-restore-skeleton').first().waitFor({ state: 'detached', timeout: 15000 })
  await page.locator('.cp-restore-card:not(.cp-restore-skeleton)').first().waitFor({ state: 'visible', timeout: 15000 })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images]
        .filter(image => !image.complete)
        .map(image => new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true })
          image.addEventListener('error', resolve, { once: true })
        })),
    )
  })
  await addPresentationLayer()
  contentStartedAt = Date.now()
  await pause(350)
  await chapter('שלב 1 — תוכן הקמפיין')
  await type(page.locator('.cp-title-input'), 'קמפיין קיץ חכם עם Possbo')
  await type(page.locator('textarea[aria-label="תוכן הפוסט"]'), `הקיץ הזה העסק שלכם מגיע רחוק יותר ☀️

עם Possbo יוצרים תוכן, בוחרים את כל ערוצי הפרסום ומפרסמים בזמן הנכון — ממקום אחד.

מוכנים להתחיל?`)
  const fileInput = page.locator('input[type=file]').first()
  await point(fileInput.locator('xpath=..'))
  await fileInput.setInputFiles(path.join(root, 'client', 'public', 'brand', 'possbo-favicon-light-v5.png'))
  await pause(1100)

  await click(page.locator('.cp-nav-next'))
  await chapter('שלב 2 — בחירת יעדי פרסום')

  await chapter('Facebook — פרופיל אישי וקבוצת TEST')
  const profile = page.locator('.cp-facebook-profile-option input[type=checkbox]')
  if (await profile.count()) await click(profile)
  await page.locator('.cp-facebook-panel .cp-group-item').first().evaluate(el => {
    const name = el.querySelector('.cp-group-name')
    if (name) name.textContent = 'TEST'
  })
  const testGroup = page.locator('.cp-facebook-panel .cp-group-item input[type=checkbox]').first()
  await click(testGroup)

  await chapter('Instagram — פוסט וסטורי')
  await click(page.locator('.cp-platform-tab').filter({ hasText: 'Instagram' }))
  const story = page.locator('.cp-ig-type-card').filter({ hasText: 'סטורי' })
  if (!(await story.evaluate(el => el.classList.contains('active')))) await click(story)
  await pause(700)

  await chapter('WhatsApp — קבוצת לקוחות')
  await click(page.locator('.cp-platform-tab').filter({ hasText: 'WhatsApp' }))
  const waGroup = page.locator('.cp-platform-panel .cp-group-item input[type=checkbox]').first()
  await click(waGroup)

  await click(page.locator('.cp-nav-next'))
  await chapter('שלב 3 — הכול מתפרסם עכשיו')

  for (const platform of ['Facebook', 'Instagram', 'WhatsApp']) {
    const platformTab = page.locator('.cp-schedule-platform-tab').filter({ hasText: platform })
    if (await platformTab.count()) await click(platformTab, 420)
    const now = page.locator('.schedule-tab').filter({ hasText: 'עכשיו' }).first()
    if (await now.count()) await click(now, 420)
  }

  await click(page.locator('.cp-nav-next'))
  await chapter('הקמפיין מוכן — סיכום לפני פרסום')
  await page.evaluate(() => document.querySelector('#demo-robot')?.classList.add('celebrate'))
  await pause(5200)
} finally {
  await context.close()
  await browser.close()
  await prisma.$disconnect()
}

const recordedPath = await video.path()
const finalPath = path.join(outputDir, 'possbo-full-campaign-demo.webm')
const trimmedPath = path.join(outputDir, 'possbo-full-campaign-demo-trimmed.webm')
const trimSeconds = Math.max(0, (contentStartedAt - recordingStartedAt) / 1000)
const ffmpegPath = path.join(process.env.LOCALAPPDATA, 'ms-playwright', 'ffmpeg-1011', 'ffmpeg-win64.exe')
await runFile(ffmpegPath, [
  '-y',
  '-ss', trimSeconds.toFixed(3),
  '-i', recordedPath,
  '-c:v', 'libvpx',
  '-crf', '18',
  '-b:v', '1800k',
  '-an',
  trimmedPath,
])
await fs.copyFile(trimmedPath, finalPath)
await fs.rm(trimmedPath)
if (recordedPath !== finalPath) await fs.rm(recordedPath)
console.log(finalPath)
