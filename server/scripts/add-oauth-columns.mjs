import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

try {
  // First find the table name
  const tables = await prisma.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public'")
  console.log('Tables:', tables.map(t => t.tablename).join(', '))
  
  // Try common table names
  const tableName = tables.find(t => t.tablename === 'User' || t.tablename === 'users' || t.tablename === 'user')?.tablename
  if (!tableName) {
    console.log('No user table found!')
    process.exit(1)
  }
  console.log('Using table:', tableName)
  
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "${tableName}" 
      ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS github_id TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS linkedin_id TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS facebook_oauth_id TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS avatar_url TEXT
  `)
  console.log('Done - added OAuth columns')
} catch (e) {
  console.error('Error:', e.message)
} finally {
  await prisma.$disconnect()
}
