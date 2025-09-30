import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function POST(request: NextRequest) {
  try {
    const database = getDatabase();
    
    console.log('Force recreating database...');
    
    // Drop and recreate the labor_statistics table
    database.exec('DROP TABLE IF EXISTS labor_statistics');
    database.exec(`
      CREATE TABLE labor_statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        day_of_week TEXT NOT NULL,
        transaction_lines INTEGER NOT NULL,
        quantity_picked INTEGER NOT NULL,
        bulk_points REAL NOT NULL DEFAULT 0,
        lum_points REAL NOT NULL DEFAULT 0,
        replen_points REAL NOT NULL DEFAULT 0,
        receive_points REAL NOT NULL DEFAULT 0,
        put_points REAL NOT NULL DEFAULT 0,
        bulkFTE REAL NOT NULL DEFAULT 0,
        lumFTE REAL NOT NULL DEFAULT 0,
        receiveFTE REAL NOT NULL DEFAULT 0,
        inventoryFTE REAL NOT NULL DEFAULT 0,
        supportFTE REAL NOT NULL DEFAULT 0,
        rfidFTE REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date)
      )
    `);
    
    console.log('Database recreated successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Database recreated successfully'
    });
  } catch (error) {
    console.error('Recreate Database API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}