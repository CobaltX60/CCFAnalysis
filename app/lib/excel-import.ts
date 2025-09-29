import * as XLSX from 'xlsx';

export interface ExcelImportResult {
  success: boolean;
  tableName: string;
  recordsImported: number;
  errors: string[];
  duration: number;
  sheetNames?: string[];
}

export interface ExcelFileData {
  [tableName: string]: string; // CSV content for each table
}

export class ExcelImportService {
  
  /**
   * Read an Excel file and extract data from all sheets (optimized for import)
   */
  public async readExcelFile(file: File): Promise<ExcelFileData> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // OPTIMIZED: Use faster settings for data import
      const workbook = XLSX.read(arrayBuffer, { 
        type: 'array',
        cellDates: false,    // Skip date parsing - handle in DB
        cellNF: false,       // Skip number format parsing
        cellStyles: false,   // Skip style parsing
        sheetStubs: false,   // Don't create stub sheets
        bookDeps: false,     // Skip dependency tracking
        bookProps: false,    // Skip book properties
        bookVBA: false,      // Skip VBA parsing
        WTF: false           // Skip WTF mode for speed
      });
      
      const result: ExcelFileData = {};
      
      // Process each sheet in the workbook
      console.log(`Processing Excel workbook with sheets:`, workbook.SheetNames);
      for (const sheetName of workbook.SheetNames) {
        console.log(`Processing sheet: "${sheetName}"`);
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet to CSV format
        const csvContent = XLSX.utils.sheet_to_csv(worksheet, {
          FS: ',', // Use comma as delimiter for CCF data
          RS: '\n' // Use newline as row separator
        });
        
        // Map sheet name to table name
        const tableName = this.mapSheetNameToTableName(sheetName);
        console.log(`Excel Import: Mapped sheet "${sheetName}" to table "${tableName}"`);
        result[tableName] = csvContent;
      }
      
      console.log(`Excel processing complete. Final table mapping:`, Object.keys(result));
      return result;
    } catch (error) {
      throw new Error(`Failed to read Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Read multiple Excel files and combine their data
   */
  public async readMultipleExcelFiles(files: File[]): Promise<ExcelFileData> {
    const combinedData: ExcelFileData = {};
    
    for (const file of files) {
      const fileData = await this.readExcelFile(file);
      
      // Merge data from all files
      for (const [tableName, csvContent] of Object.entries(fileData)) {
        if (combinedData[tableName]) {
          // If table already exists, append the data (skip header for subsequent files)
          const lines = csvContent.split('\n');
          const dataLines = lines.slice(1); // Skip header
          combinedData[tableName] += '\n' + dataLines.join('\n');
        } else {
          combinedData[tableName] = csvContent;
        }
      }
    }
    
    return combinedData;
  }

  /**
   * Map Excel sheet names to database table names
   * For CCF analysis, we expect purchase order data
   */
  private mapSheetNameToTableName(sheetName: string): string {
    const normalizedName = sheetName.toLowerCase().replace(/[_\s]+/g, ' ');
    
    // Define keywords that identify purchase order data
    const tableKeywords = {
      'purchase_orders': ['purchase', 'order', 'po', 'data', 'ccf', 'analysis']
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
    
    // Default to purchase_orders for CCF data
    console.log(`Mapped sheet "${sheetName}" to table "${bestMatch}" (score: ${bestScore})`);
    return bestMatch;
  }

  /**
   * Validate Excel file structure (optimized for large files)
   */
  public async validateExcelFile(file: File): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    sheetNames: string[];
    tableMapping: { [sheetName: string]: string };
  }> {
    console.log('ExcelImportService.validateExcelFile called for:', file.name);
    try {
      console.log('Reading file as array buffer...');
      const arrayBuffer = await file.arrayBuffer();
      console.log('Array buffer size:', arrayBuffer.byteLength);
      
      console.log('Fast parsing Excel workbook with optimized settings...');
      // OPTIMIZED: Use fast parsing settings for validation only
      const workbook = XLSX.read(arrayBuffer, { 
        type: 'array',
        cellDates: false,    // Skip date parsing for speed
        cellNF: false,       // Skip number format parsing
        cellStyles: false,   // Skip style parsing
        sheetStubs: false,   // Don't create stub sheets
        bookDeps: false,     // Skip dependency tracking
        bookProps: false,    // Skip book properties
        bookSheets: false,   // Skip sheet count
        bookVBA: false,      // Skip VBA parsing
        password: '',        // No password protection
        WTF: false           // Skip WTF mode for speed
      });
      console.log('Workbook sheets:', workbook.SheetNames);
      
      const errors: string[] = [];
      const warnings: string[] = [];
      const tableMapping: { [sheetName: string]: string } = {};
      
      // Check if workbook has any sheets
      if (workbook.SheetNames.length === 0) {
        errors.push('Excel file contains no sheets');
        return { isValid: false, errors, warnings, sheetNames: [], tableMapping };
      }
      
      // OPTIMIZED: Fast validation - only check basic structure
      for (const sheetName of workbook.SheetNames) {
        console.log('Fast validating sheet:', sheetName);
        const worksheet = workbook.Sheets[sheetName];
        const tableName = this.mapSheetNameToTableName(sheetName);
        tableMapping[sheetName] = tableName;
        console.log('Mapped sheet', sheetName, 'to table', tableName);
        
        // OPTIMIZED: Quick check - only validate if sheet has basic structure
        if (worksheet['!ref']) {
          // Quick range check without full processing
          const range = XLSX.utils.decode_range(worksheet['!ref']);
          const rowCount = range.e.r + 1;
          const colCount = range.e.c + 1;
          console.log('Sheet dimensions (quick check):', rowCount, 'rows x', colCount, 'columns');
          
          if (rowCount < 2) {
            warnings.push(`Sheet "${sheetName}" has no data rows (only header)`);
          }
          
          if (colCount < 2) {
            warnings.push(`Sheet "${sheetName}" has very few columns (${colCount})`);
          }
        } else {
          warnings.push(`Sheet "${sheetName}" appears to be empty`);
        }
      }
      
      const result = {
        isValid: errors.length === 0,
        errors,
        warnings,
        sheetNames: workbook.SheetNames,
        tableMapping
      };
      
      console.log('Fast validation result:', result);
      return result;
    } catch (error) {
      console.error('Error in validateExcelFile:', error);
      return {
        isValid: false,
        errors: [`Failed to validate Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: [],
        sheetNames: [],
        tableMapping: {}
      };
    }
  }

  /**
   * Get sample Excel template structure for CCF data
   */
  public getSampleTemplate(): {
    [sheetName: string]: { headers: string[]; sampleRows: string[][] }
  } {
    return {
      'Purchase Orders': {
        headers: [
          'Entity', 'Site_Location', 'Entity_Level_2', 'Entity_Level_3', 'SCSS_Category_Team',
          'UNSPSC_Code', 'UNSPSC_Segment_Title', 'UNSPSC_Family_Title', 'UNSPSC_Class_Title', 'UNSPSC_Commodity_Title',
          'PO_Year', 'PO_Month', 'PO_Week', 'PO_Date', 'Destination_Location', 'Destination_Location_Name',
          'Ship_To', 'Ship_To_Name', 'Special_Handling', 'Rush_Flag', 'PO_Number', 'PO_Line_Number',
          'Oracle_Item_Number', 'Item_Description', 'Item_Type', 'PO_Quantity_Ordered', 'PO_Quantity_Ordered_LUOM',
          'Buy_UOM', 'Buy_UOM_Multiplier', 'Manufacturer_Name', 'Manufacturer_Number', 'Supplier_Number',
          'Supplier_Name', 'Supplier_Site', 'ValueLink_Flag', 'Cost_Center_Group', 'PPI_Flag'
        ],
        sampleRows: [
          [
            'CCF Hospital', 'CCF Main Campus', 'Ohio', 'CCF Main Campus', 'Commodity',
            '41104100', 'Laboratory and Measuring and Observing and Testing Equipment', 'Laboratory and scientific equipment',
            'Specimen collection and transport containers and supplies', 'Unavailable',
            '2024', '1', '1', '45292', '1J61T', 'Nurs St J61-102 2BK 1J61T',
            'MCHOSP Storeroom', 'MCHOSP Storeroom', 'NULL', 'No', 'CCF24243956', '2',
            '1012787', 'CONTAINER PRECISION CLEAR METAL PLASTIC 2X3.5IN SPECIMEN LEAK RESISTANT', 'N', '14', '14',
            'EA', '1', 'COVIDIEN HEALTHCARE KENDALL', '2200SA', '13718',
            'Cardinal Health Med/Surg', 'CardVLOh-01', 'ValueLink', 'NULL', 'Non PPI'
          ]
        ]
      }
    };
  }
}
