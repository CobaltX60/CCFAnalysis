import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../lib/database';

export async function POST(request: NextRequest) {
  try {
    const database = getDatabase();
    database.recreateDatabase();
    
    return NextResponse.json({
      success: true,
      message: 'Database recreated with corrected schema'
    });
  } catch (error) {
    console.error('Database recreation error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
