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

export class FastExcelImportService {
  
  /**
   * INSTANT validation - skips ALL Excel parsing
   */
  public async validateExcelFile(file: File): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    sheetNames: string[];
    tableMapping: { [sheetName: string]: string };
  }> {
    console.log('FastExcelImportService.validateExcelFile called for:', file.name);
    
    const errors: string[] = [];
    const warnings: string[] = [];
    const tableMapping: { [sheetName: string]: string } = {};
    
    try {
      // STEP 1: Basic file validation (instant)
      console.log('Step 1: Basic file validation...');
      
      // Check file size
      const fileSizeMB = file.size / (1024 * 1024);
      console.log('File size:', fileSizeMB.toFixed(2), 'MB');
      
      if (fileSizeMB > 100) {
        warnings.push(`Large file detected (${fileSizeMB.toFixed(1)}MB). Processing may take longer.`);
      }
      
      // Check file extension
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xlsb')) {
        errors.push('File must be an Excel (.xlsx or .xlsb) file');
        return { isValid: false, errors, warnings, sheetNames: [], tableMapping };
      }
      
      // STEP 2: INSTANT validation - NO Excel parsing at all
      console.log('Step 2: INSTANT validation - skipping Excel parsing...');
      
      // For large files, we'll assume it's valid and defer all parsing to import time
      // This is the fastest possible validation
      const defaultSheetName = 'Sheet1'; // Default sheet name
      const tableName = this.mapSheetNameToTableName(defaultSheetName);
      tableMapping[defaultSheetName] = tableName;
      
      console.log('INSTANT validation completed - deferring Excel parsing to import time');
      
      const result = {
        isValid: errors.length === 0,
        errors,
        warnings: [...warnings, 'Excel parsing deferred to import time for performance'],
        sheetNames: [defaultSheetName],
        tableMapping
      };
      
      console.log('INSTANT validation result:', result);
      return result;
      
    } catch (error) {
      console.error('Error in instant validation:', error);
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
   * Map Excel sheet names to database table names
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
   * Read Excel file with optimized parsing for large files
   */
  public async readExcelFile(file: File): Promise<ExcelFileData> {
    console.log(`Starting optimized import for: ${file.name}`);
    const fileSizeMB = file.size / (1024 * 1024);
    console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      console.log('Reading Excel workbook with ultra-fast settings...');
      
      // Use ultra-fast parsing settings for large files
      const workbook = XLSX.read(arrayBuffer, { 
        type: 'array',
        cellDates: false,    // Skip date parsing - handle in DB
        cellNF: false,       // Skip number format parsing
        cellStyles: false,   // Skip style parsing
        raw: true,           // Raw values only for speed
        codepage: 65001,     // UTF-8 encoding
        dense: false,        // Don't create dense arrays
        sheetStubs: false,   // Don't create stub sheets
        bookDeps: false,     // Skip dependency tracking
        bookProps: false,    // Skip book properties
        bookVBA: false,      // Skip VBA parsing
        WTF: false           // Skip WTF mode for speed
      });
      
      console.log(`Processing Excel workbook with sheets:`, workbook.SheetNames);
      const result: ExcelFileData = {};
      
      for (const sheetName of workbook.SheetNames) {
        console.log(`Processing sheet: "${sheetName}"`);
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to CSV with optimized settings
        const csvContent = XLSX.utils.sheet_to_csv(worksheet, {
          FS: ',',           // Comma delimiter
          RS: '\n',         // Newline separator
          blankrows: false, // Skip blank rows for speed
          skipHidden: true, // Skip hidden rows/columns
          defval: ''        // Default value for empty cells
        });
        
        const tableName = this.mapSheetNameToTableName(sheetName);
        console.log(`Excel Import: Mapped sheet "${sheetName}" to table "${tableName}"`);
        result[tableName] = csvContent;
      }
      
      console.log(`Excel processing complete. Final table mapping:`, Object.keys(result));
      return result;
      
    } catch (error) {
      console.error('Error in optimized Excel import:', error);
      throw new Error(`Failed to read Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
