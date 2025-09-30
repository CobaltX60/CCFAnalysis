import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function POST(request: NextRequest) {
  try {
    const database = getDatabase();
    
    console.log('Force migrating labor statistics table...');
    const result = database.forceMigrateLaborStatistics();
    
    return NextResponse.json({
      success: result.success,
      message: result.message
    });
  } catch (error) {
    console.error('Migration API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
