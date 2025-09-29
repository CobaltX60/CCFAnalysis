import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function POST(request: NextRequest) {
  try {
    const database = getDatabase();
    
    // Truncate non-Cardinal Health records
    const result = database.truncateNonCardinalHealthRecords();
    
    console.log(`Truncated ${result.deletedRecords} non-Cardinal Health records. ${result.remainingRecords} Cardinal Health records remain.`);
    
    return NextResponse.json({
      success: true,
      message: `Successfully truncated ${result.deletedRecords} non-Cardinal Health records. ${result.remainingRecords} Cardinal Health records remain.`,
      deletedRecords: result.deletedRecords,
      remainingRecords: result.remainingRecords
    });
  } catch (error) {
    console.error('Truncation API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
