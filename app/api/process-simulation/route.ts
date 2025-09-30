import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function POST(request: NextRequest) {
  try {
    const database = getDatabase();
    
    // Get productivity variables from request body
    const body = await request.json();
    const productivityVariables = body.productivityVariables;
    
    console.log('Starting process simulation...');
    const result = database.processSimulation(productivityVariables);
    
    return NextResponse.json({
      success: true,
      data: {
        processedDays: result.processedDays,
        totalRecords: result.totalRecords,
        message: `Process simulation completed successfully. Processed ${result.processedDays} days with ${result.totalRecords} total records.`
      }
    });
  } catch (error) {
    console.error('Process Simulation API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const database = getDatabase();
    const laborStats = database.getLaborStatistics();
    const summary = database.getLaborStatisticsSummary();
    
    return NextResponse.json({
      success: true,
      data: {
        laborStatistics: laborStats,
        summary: summary
      }
    });
  } catch (error) {
    console.error('Get Labor Statistics API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const database = getDatabase();
    const deletedCount = database.clearLaborStatistics();
    
    return NextResponse.json({
      success: true,
      data: {
        deletedCount,
        message: `Cleared ${deletedCount} labor statistics records.`
      }
    });
  } catch (error) {
    console.error('Clear Labor Statistics API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
