import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shipTo = searchParams.get('shipTo');
    
    console.log('Ship To Details API called with shipTo:', shipTo);
    
    if (!shipTo) {
      console.log('No shipTo parameter provided');
      return NextResponse.json({
        success: false,
        error: 'Ship To parameter is required'
      });
    }

    const database = getDatabase();
    console.log('Database instance obtained');
    
    // First, get the total number of unique PO dates in the entire dataset for average calculation
    const totalUniqueDatesQuery = `
      SELECT COUNT(DISTINCT PO_Date) as totalUniqueDates
      FROM purchase_orders 
      WHERE PO_Date IS NOT NULL AND PO_Date != ''
    `;
    const totalUniqueDates = database.db.prepare(totalUniqueDatesQuery).get() as { totalUniqueDates: number };
    
    // Get detailed destination location data for the specified Ship To location
    const query = `
      SELECT 
        Destination_Location_Name as destinationLocationName,
        COUNT(*) as recordCount,
        COUNT(DISTINCT Oracle_Item_Number) as uniqueItemCount,
        MIN(PO_Date) as startDate,
        MAX(PO_Date) as endDate
      FROM purchase_orders 
      WHERE Ship_To = ? 
        AND Destination_Location_Name IS NOT NULL 
        AND Destination_Location_Name != ''
        AND PO_Date IS NOT NULL
        AND PO_Date != ''
      GROUP BY Destination_Location_Name
      ORDER BY recordCount DESC
    `;
    
    console.log('Executing query for shipTo:', shipTo);
    const result = database.db.prepare(query).all(shipTo) as Array<{
      destinationLocationName: string;
      recordCount: number;
      uniqueItemCount: number;
      startDate: string;
      endDate: string;
    }>;
    
    console.log('Query result:', result.length, 'records found');
    if (result.length > 0) {
      console.log('Sample result:', result[0]);
    } else {
      console.log('No destination locations found for shipTo:', shipTo);
    }
    
    // Calculate average daily values for each destination location
    const resultWithAverages = result.map(row => ({
      ...row,
      averageDailyValue: totalUniqueDates.totalUniqueDates > 0 
        ? Math.round((row.recordCount / totalUniqueDates.totalUniqueDates) * 100) / 100 
        : 0
    }));
    
    console.log('Final result with averages:', resultWithAverages.length, 'records');
    return NextResponse.json(resultWithAverages);
  } catch (error) {
    console.error('Ship To Details API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
