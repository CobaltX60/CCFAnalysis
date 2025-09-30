import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function GET(request: NextRequest) {
  try {
    const database = getDatabase();
    
    // Use labor statistics table for analysis
    const laborStats = database.getLaborStatistics();
    const summary = database.getLaborStatisticsSummary();
    
    return NextResponse.json({
      success: true,
        data: {
          transactionData: laborStats.map(stat => ({
            date: stat.date,
            transactionLines: stat.transaction_lines,
            quantityPicked: stat.quantity_picked,
            bulkPoints: stat.bulk_points,
            lumPoints: stat.lum_points,
            replenPoints: stat.replen_points,
            receivePoints: stat.receive_points,
            putPoints: stat.put_points,
            totalPoints: (stat.bulk_points || 0) + (stat.lum_points || 0) + (stat.replen_points || 0) + (stat.receive_points || 0) + (stat.put_points || 0)
          })),
        summary: {
          totalDays: summary.totalDays,
          totalTransactionLines: summary.totalTransactionLines,
          totalQuantityPicked: summary.totalQuantityPicked,
          startDate: summary.startDate,
          endDate: summary.endDate,
          averageLinesPerDay: summary.averageLinesPerDay,
          averageLinesPerWeekday: summary.averageLinesPerWeekday,
          averageLinesPerWeekend: summary.averageLinesPerWeekend,
          averagePointsPerWeekday: summary.averagePointsPerWeekday,
          averagePointsPerWeekend: summary.averagePointsPerWeekend,
          dayOfWeekAverages: summary.dayOfWeekAverages
        },
        source: 'labor_statistics'
      }
    });
  } catch (error) {
    console.error('Transaction Volumes API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
