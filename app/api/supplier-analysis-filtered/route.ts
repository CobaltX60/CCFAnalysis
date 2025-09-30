import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const supplierFilter = searchParams.get('supplier');
    const shipToFilter = searchParams.get('shipTo');
    
    const database = getDatabase();
    
    // Build the WHERE clause based on filters
    let whereConditions = [
      'Supplier_Name IS NOT NULL',
      'Supplier_Name != \'\'',
      'PO_Date IS NOT NULL',
      'PO_Date != \'\''
    ];
    
    const queryParams: string[] = [];
    
    if (supplierFilter) {
      whereConditions.push('Supplier_Name = ?');
      queryParams.push(supplierFilter);
    }
    
    if (shipToFilter) {
      whereConditions.push('Ship_To = ?');
      queryParams.push(shipToFilter);
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // First, get the total number of unique PO dates in the entire dataset for average calculation
    const totalUniqueDatesQuery = `
      SELECT COUNT(DISTINCT PO_Date) as totalUniqueDates
      FROM purchase_orders 
      WHERE PO_Date IS NOT NULL AND PO_Date != ''
    `;
    const totalUniqueDates = database.prepare(totalUniqueDatesQuery).get() as { totalUniqueDates: number };
    
    const query = `
      SELECT 
        Supplier_Name as supplierName,
        COUNT(DISTINCT Oracle_Item_Number) as uniqueItemCount,
        COUNT(*) as totalRecordCount,
        MIN(PO_Date) as startDate,
        MAX(PO_Date) as endDate
      FROM purchase_orders 
      WHERE ${whereClause}
      GROUP BY Supplier_Name
      ORDER BY uniqueItemCount DESC
      LIMIT 1000
    `;
    
    const result = database.prepare(query).all(...queryParams) as Array<{
      supplierName: string;
      uniqueItemCount: number;
      totalRecordCount: number;
      startDate: string;
      endDate: string;
    }>;
    
    // Calculate average daily values: supplier records / total unique dates in dataset
    const resultWithAverages = result.map(row => {
      const startDate = new Date(row.startDate);
      const endDate = new Date(row.endDate);
      const dateRangeDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      const averageDailyValue = totalUniqueDates.totalUniqueDates > 0 
        ? Math.round((row.totalRecordCount / totalUniqueDates.totalUniqueDates) * 100) / 100 
        : 0;
      
      return {
        supplierName: row.supplierName,
        uniqueItemCount: row.uniqueItemCount,
        totalRecordCount: row.totalRecordCount,
        averageDailyValue,
        distinctDays: totalUniqueDates.totalUniqueDates,
        dateRange: {
          start: row.startDate,
          end: row.endDate,
          days: dateRangeDays
        }
      };
    });
    
    return NextResponse.json({
      success: true,
      data: resultWithAverages,
      filters: {
        supplier: supplierFilter,
        shipTo: shipToFilter
      }
    });
  } catch (error) {
    console.error('Filtered Supplier Analysis API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
