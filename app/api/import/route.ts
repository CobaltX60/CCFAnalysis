import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';
import { ExcelImportService } from '@/app/lib/excel-import';
import { FastExcelImportService } from '@/app/lib/excel-import-fast';
import { CSVImportService } from '@/app/lib/csv-import';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const action = formData.get('action') as string;

    if (action === 'validate_excel') {
      const excelFile = formData.get('excelFile') as File;
      
      if (!excelFile) {
        return NextResponse.json({ success: false, error: 'No file provided' });
      }

      // Check if it's a CSV file
      if (excelFile.name.toLowerCase().endsWith('.csv')) {
        const csvImportService = new CSVImportService();
        const validationResult = await csvImportService.validateCSVFile(excelFile);
        
        return NextResponse.json({
          success: true,
          validationResult
        });
      } else {
        // Handle Excel files
        const fastImportService = new FastExcelImportService();
        const validationResult = await fastImportService.validateExcelFile(excelFile);

        return NextResponse.json({
          success: true,
          validationResult
        });
      }
    }

    if (action === 'import_excel') {
      const database = getDatabase();
      const fastImportService = new FastExcelImportService();
      const results: any[] = [];

      // Get files to import
      const files: File[] = [];
      const fileCount = formData.get('excelFiles_count');
      
      if (fileCount) {
        const count = parseInt(fileCount as string);
        for (let i = 0; i < count; i++) {
          const file = formData.get(`excelFiles_${i}`) as File;
          if (file) {
            files.push(file);
          }
        }
      } else {
        const excelFile = formData.get('excelFile') as File;
        if (excelFile) {
          files.push(excelFile);
        }
      }

      if (files.length === 0) {
        return NextResponse.json({ success: false, error: 'No files provided' });
      }

      // Process each file
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        try {
          const startTime = Date.now();
          console.log(`Processing file ${fileIndex + 1}/${files.length}: ${file.name}`);

          let fileData;
          
          // Check if it's a CSV file
          if (file.name.toLowerCase().endsWith('.csv')) {
            console.log(`Starting CSV import for: ${file.name}`);
            const csvImportService = new CSVImportService();
            fileData = await csvImportService.readCSVFile(file);
          } else {
            // Handle Excel files
            console.log(`Starting optimized Excel import for: ${file.name}`);
            fileData = await fastImportService.readExcelFile(file);
          }
          
          // Import data to database
          for (const [tableName, csvContent] of Object.entries(fileData)) {
            try {
              // Clear table only for the first file, append for subsequent files
              const shouldClearTable = fileIndex === 0;
              console.log(`Importing data to table: ${tableName} (${shouldClearTable ? 'clearing and importing' : 'appending'})`);
              database.importCSVData(tableName, csvContent, undefined, shouldClearTable);
              
              const recordCount = database.getRecordCount(tableName);
              const duration = Date.now() - startTime;
              
              results.push({
                success: true,
                tableName,
                recordsImported: recordCount,
                errors: [],
                duration
              });
              
              console.log(`Successfully imported ${recordCount} records to ${tableName}`);
            } catch (error) {
              console.error(`Error importing to ${tableName}:`, error);
              results.push({
                success: false,
                tableName,
                recordsImported: 0,
                errors: [error instanceof Error ? error.message : 'Unknown error'],
                duration: Date.now() - startTime
              });
            }
          }
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
          results.push({
            success: false,
            tableName: file.name,
            recordsImported: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            duration: 0
          });
        }
      }

      return NextResponse.json({
        success: true,
        results
      });
    }

    if (action === 'clear_all') {
      const database = getDatabase();
      database.clearDatabase();
      
      return NextResponse.json({
        success: true,
        message: 'Database cleared successfully'
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' });
  } catch (error) {
    console.error('Import API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
