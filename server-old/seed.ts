import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Seed 4 users matching frontend mock IDs
  const users = [
    { id: 'user1', name: 'Alice', username: 'alice', email: 'alice@example.com', passwordHash: '$2b$10$placeholder', role: 'ADMIN', preferredLanguage: 'en' },
    { id: 'user2', name: 'Bob', username: 'bob', email: 'bob@example.com', passwordHash: '$2b$10$placeholder', role: 'USER', preferredLanguage: 'ja' },
    { id: 'user3', name: 'Charlie', username: 'charlie', email: 'charlie@example.com', passwordHash: '$2b$10$placeholder', role: 'USER', preferredLanguage: 'ja' },
    { id: 'me-id', name: 'You', username: 'me', email: 'me@example.com', passwordHash: '$2b$10$placeholder', role: 'USER', preferredLanguage: 'en' },
  ]

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: user,
    })
  }
  console.log('Seeded 4 users')

  // Seed 2 sample messages for the 'japanese' chat
  const msg1 = await prisma.message.upsert({
    where: { id: 'msg1' },
    update: {},
    create: {
      id: 'msg1',
      chatId: 'japanese',
      position: 0,
      originalText: 'こんにちは、世界！',
      translations: { en: 'Hello, world!' },
      senderId: 'user1',
      receiverId: 'me-id',
    },
  })
  console.log('Seeded message 1')

  const msg2 = await prisma.message.upsert({
    where: { id: 'msg2' },
    update: {},
    create: {
      id: 'msg2',
      chatId: 'japanese',
      position: 1,
      originalText: 'おはようございます',
      translations: { en: 'Good morning' },
      senderId: 'user2',
      receiverId: 'me-id',
    },
  })
  console.log('Seeded message 2')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => await prisma.$disconnect())
