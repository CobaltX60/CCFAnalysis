export interface CSVImportResult {
  success: boolean;
  tableName: string;
  recordsImported: number;
  errors: string[];
  duration: number;
}

export interface CSVFileData {
  [tableName: string]: string; // CSV content for each table
}

export class CSVImportService {
  
  /**
   * Validate CSV file
   */
  public async validateCSVFile(file: File): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    sheetNames: string[];
    tableMapping: { [sheetName: string]: string };
  }> {
    console.log('CSVImportService.validateCSVFile called for:', file.name);
    
    const errors: string[] = [];
    const warnings: string[] = [];
    const tableMapping: { [sheetName: string]: string } = {};
    
    try {
      // Basic file validation
      console.log('Step 1: Basic CSV file validation...');
      
      const fileSizeMB = file.size / (1024 * 1024);
      console.log('File size:', fileSizeMB.toFixed(2), 'MB');
      
      if (fileSizeMB > 200) {
        warnings.push(`Very large file detected (${fileSizeMB.toFixed(1)}MB). Processing may take longer.`);
      } else if (fileSizeMB > 100) {
        warnings.push(`Large file detected (${fileSizeMB.toFixed(1)}MB). Processing may take longer.`);
      }
      
      // Check file extension
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.csv')) {
        errors.push('File must be a CSV file');
        return { isValid: false, errors, warnings, sheetNames: [], tableMapping };
      }
      
      // For CSV files, we can do instant validation
      console.log('Step 2: INSTANT CSV validation - reading headers and sampling data...');
      
      // Read the file content
      const text = await file.text();
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      console.log('CSV headers found:', headers);
      
      // Check if we have the expected 37 fields
      const expectedFields = [
        'Entity', 'Site_Location', 'Entity_Level_2', 'Entity_Level_3', 'SCSS_Category_Team',
        'UNSPSC_Code', 'UNSPSC_Segment_Title', 'UNSPSC_Family_Title', 'UNSPSC_Class_Title', 'UNSPSC_Commodity_Title',
        'PO_Year', 'PO_Month', 'PO_Week', 'PO_Date', 'Destination_Location', 'Destination_Location_Name',
        'Ship_To', 'Ship_To_Name', 'Special_Handling', 'Rush_Flag', 'PO_Number', 'PO_Line_Number',
        'Oracle_Item_Number', 'Item_Description', 'Item_Type', 'PO_Quantity_Ordered', 'PO_Quantity_Ordered_LUOM',
        'Buy_UOM', 'Buy_UOM_Multiplier', 'Manufacturer_Name', 'Manufacturer_Number', 'Supplier_Number',
        'Supplier_Name', 'Supplier_Site', 'ValueLink_Flag', 'Cost_Center_Group', 'PPI_Flag'
      ];
      
      if (headers.length < 30) {
        warnings.push(`CSV has ${headers.length} columns, expected around 37. Some data may be missing.`);
      }
      
      // Sample data quality check - check first 1000 rows for incomplete records
      console.log('Step 3: Data quality validation - checking for incomplete records...');
      const sampleSize = Math.min(1000, lines.length - 1); // Sample up to 1000 rows
      let incompleteRecords = 0;
      let totalSampledRecords = 0;
      
      for (let i = 1; i <= sampleSize && i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length > 0) { // Skip empty lines
          const fields = line.split(',');
          totalSampledRecords++;
          
          // Check if record has fewer fields than expected
          if (fields.length < headers.length) {
            incompleteRecords++;
          }
        }
      }
      
      const incompletePercentage = totalSampledRecords > 0 ? (incompleteRecords / totalSampledRecords * 100).toFixed(1) : 0;
      
      if (incompleteRecords > 0) {
        warnings.push(`Data quality check: ${incompleteRecords} of ${totalSampledRecords} sampled records (${incompletePercentage}%) have incomplete data (fewer than ${headers.length} fields).`);
      } else {
        console.log(`Data quality check: All ${totalSampledRecords} sampled records have complete data.`);
      }
      
      const defaultSheetName = 'Sheet1';
      const tableName = this.mapSheetNameToTableName(defaultSheetName);
      tableMapping[defaultSheetName] = tableName;
      
      console.log('INSTANT CSV validation completed');
      
      const result = {
        isValid: errors.length === 0,
        errors,
        warnings: [...warnings, 'CSV validation completed - ready for import'],
        sheetNames: [defaultSheetName],
        tableMapping
      };
      
      console.log('CSV validation result:', result);
      return result;
      
    } catch (error) {
      console.error('Error in CSV validation:', error);
      return {
        isValid: false,
        errors: [`Failed to validate CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        sheetNames: [],
        tableMapping: {}
      };
    }
  }

  /**
   * Map sheet names to database table names
   */
  private mapSheetNameToTableName(sheetName: string): string {
    const normalizedName = sheetName.toLowerCase().replace(/[_\s]+/g, ' ');
    
    // Define keywords that identify purchase order data
    const tableKeywords = {
      'purchase_orders': ['purchase', 'order', 'po', 'data', 'ccf', 'analysis', 'history']
    };
    
    // Score each table based on keyword matches
    const scores: { [table: string]: number } = {};
    
    for (const [tableName, keywords] of Object.entries(tableKeywords)) {
      let score = 0;
      for (const keyword of keywords) {
        if (normalizedName.includes(keyword)) {
          score += 1;
        }
      }
      scores[tableName] = score;
    }
    
    // Find the table with the highest score
    let bestMatch = 'purchase_orders';
    let bestScore = 0;
    
    for (const [tableName, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestMatch = tableName;
      }
    }
    
    return bestMatch;
  }

  /**
   * Read CSV file with optimized processing for large files
   */
  public async readCSVFile(file: File): Promise<CSVFileData> {
    console.log(`Starting optimized CSV import for: ${file.name}`);
    const fileSizeMB = file.size / (1024 * 1024);
    console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
    
    try {
      if (fileSizeMB > 150) {
        console.log('Very large CSV file detected - using optimized processing...');
        return await this.readLargeCSVFile(file);
      } else {
        console.log('Standard CSV processing...');
        return await this.readStandardCSVFile(file);
      }
    } catch (error) {
      console.error('Error in CSV import:', error);
      throw new Error(`Failed to read CSV file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Standard CSV reading for smaller files
   */
  private async readStandardCSVFile(file: File): Promise<CSVFileData> {
    const csvContent = await file.text();
    console.log('CSV content loaded, length:', csvContent.length);
    
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
    console.log(`CSV has ${lines.length} lines (including header)`);
    
    return {
      'purchase_orders': csvContent
    };
  }

  /**
   * Optimized CSV reading for very large files (150MB+)
   */
  private async readLargeCSVFile(file: File): Promise<CSVFileData> {
    console.log('Using optimized processing for very large CSV file...');
    
    // For very large files, we'll read the entire content but with memory optimization
    const csvContent = await file.text();
    console.log('Large CSV content loaded, length:', csvContent.length);
    
    // Quick line count without splitting the entire content
    const lineCount = (csvContent.match(/\n/g) || []).length + 1;
    console.log(`Large CSV has approximately ${lineCount} lines`);
    
    // Return the CSV content as-is without adding comments
    return {
      'purchase_orders': csvContent
    };
  }
}
