import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function GET(request: NextRequest) {
  try {
    console.log('Starting analysis API request...');
    const database = getDatabase();
    
    // Get database statistics
    console.log('Getting database statistics...');
    const databaseStats = database.getDatabaseStats();
    
    // Get unique counts for analysis
    console.log('Getting unique counts...');
    const uniqueCounts = database.getUniqueCounts();
    
    // Get supplier analysis data
    console.log('Getting supplier analysis...');
    const supplierAnalysis = database.getSupplierAnalysis();
    
    // Get ship to analysis data
    console.log('Getting ship to analysis...');
    const shipToAnalysis = database.getShipToAnalysis();
    
    // Get item analysis data
    console.log('Getting item analysis...');
    const itemAnalysis = database.getItemAnalysis();
    
    // Get data quality analysis
    console.log('Getting data quality analysis...');
    const dataQuality = database.getDataQualityAnalysis();
    
    console.log('Analysis API completed successfully');
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
    }, { status: 500 });
  }
}
