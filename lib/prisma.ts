// lib/prisma.ts
// Prisma Client Singleton Pattern

import { PrismaClient } from './generated/prisma/client'

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  // Prisma@7 requires passing an options object; even if empty
  new PrismaClient({})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

export async function connectToDatabase() {
  try {
    await prisma.$connect()
    console.log('✅ Connected to SQL Server')
    return prisma
  } catch (error) {
    console.error('❌ Failed to connect to SQL Server:', error)
    throw error
  }
}
