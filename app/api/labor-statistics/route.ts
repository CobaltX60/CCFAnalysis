import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function GET(request: NextRequest) {
  try {
    const database = getDatabase();
    
    console.log('Starting labor statistics API request...');
    
    // Get all labor statistics data
    const laborStats = database.getLaborStatistics();
    
    // Get pre-calculated summary statistics
    const summaryStats = database.getLaborAnalysisSummary();
    
    // Calculate overall averages
    const overallQuery = `
      SELECT 
        AVG(bulkFTE) as avg_bulkFTE,
        AVG(lumFTE) as avg_lumFTE,
        AVG(receiveFTE) as avg_receiveFTE,
        AVG(inventoryFTE) as avg_inventoryFTE,
        AVG(supportFTE) as avg_supportFTE,
        AVG(rfidFTE) as avg_rfidFTE,
        AVG(supervisorFTE) as avg_supervisorFTE,
        AVG(leaderFTE) as avg_leaderFTE,
        AVG(bulkFTE + lumFTE + receiveFTE + inventoryFTE + supportFTE + rfidFTE + supervisorFTE + leaderFTE) as avg_totalFTE
      FROM labor_statistics
    `;
    
    const overallStats = database.prepare(overallQuery).get();
    
    console.log('Labor statistics API completed successfully');
    
    return NextResponse.json({
      success: true,
      data: {
        laborStats,
        summaryStats,
        overallStats
      }
    });
  } catch (error) {
    console.error('Labor Statistics API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
