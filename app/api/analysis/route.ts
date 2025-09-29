import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function GET(request: NextRequest) {
  try {
    const database = getDatabase();
    
    // Get database statistics
    const databaseStats = database.getDatabaseStats();
    
    // Get unique counts for analysis
    const uniqueCounts = database.getUniqueCounts();
    
    // Get supplier analysis data
    const supplierAnalysis = database.getSupplierAnalysis();
    
    // Get ship to analysis data
    const shipToAnalysis = database.getShipToAnalysis();
    
    // Get item analysis data
    const itemAnalysis = database.getItemAnalysis();
    
    // Get data quality analysis
    const dataQuality = database.getDataQualityAnalysis();
    
    return NextResponse.json({
      success: true,
      analysis: {
        databaseStats,
        uniqueCounts,
        supplierAnalysis,
        shipToAnalysis,
        itemAnalysis,
        dataQuality
      }
    });
  } catch (error) {
    console.error('Analysis API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
