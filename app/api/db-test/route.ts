import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Test basic endpoint response
    return NextResponse.json({
      success: true,
      message: 'API endpoint hoạt động!',
      timestamp: new Date().toISOString(),
      environment: {
        database: 'LAP_LICH_TU_DONG',
        server: 'LAPTOP-5VTLAM86\\SQLEXPRESS',
        nodeVersion: process.version
      }
    })
  } catch (error: any) {
    console.error('Error:', error)
    return NextResponse.json({
      success: false,
      error: error?.message || 'Lỗi máy chủ'
    }, { status: 500 })
  }
}
