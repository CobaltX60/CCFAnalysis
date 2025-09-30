import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import Papa from 'papaparse';

export interface DatabaseStats {
  totalRecords: number;
  tableCounts: { [table: string]: number };
  databaseSize: string;
  lastUpdated: Date;
}

export class CCFDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor() {
    // Create database in the CCFAnalysis folder
    this.dbPath = path.join(process.cwd(), 'ccf_analysis.db');
    
    // Ensure the directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    
    // Create tables
    this.createTables();
    
    // Migrate existing tables if needed
    this.migrateDatabase();
    
    // Create indexes for performance
    this.createIndexes();
  }

  private createTables(): void {
    // Purchase Orders table - main table for the 37 fields
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Entity TEXT,
        Site_Location TEXT,
        Entity_Level_2 TEXT,
        Entity_Level_3 TEXT,
        SCSS_Category_Team TEXT,
        UNSPSC_Code TEXT,
        UNSPSC_Segment_Title TEXT,
        UNSPSC_Family_Title TEXT,
        UNSPSC_Class_Title TEXT,
        UNSPSC_Commodity_Title TEXT,
        PO_Year INTEGER,
        PO_Month INTEGER,
        PO_Week INTEGER,
        PO_Date INTEGER,
        Destination_Location TEXT,
        Destination_Location_Name TEXT,
        Ship_To TEXT,
        Ship_To_Name TEXT,
        Special_Handling TEXT,
        Rush_Flag TEXT,
        PO_Number TEXT,
        PO_Line_Number TEXT,
        Oracle_Item_Number TEXT,
        Item_Description TEXT,
        Item_Type TEXT,
        PO_Quantity_Ordered INTEGER,
        PO_Quantity_Ordered_LUOM INTEGER,
        Buy_UOM TEXT,
        Buy_UOM_Multiplier INTEGER,
        Manufacturer_Name TEXT,
        Manufacturer_Number TEXT,
        Supplier_Number TEXT,
        Supplier_Name TEXT,
        Supplier_Site TEXT,
        ValueLink_Flag TEXT,
        Cost_Center_Group TEXT,
        PPI_Flag TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Labor Statistics table - daily summary data
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS labor_statistics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        day_of_week TEXT NOT NULL,
        transaction_lines INTEGER NOT NULL,
        quantity_picked INTEGER NOT NULL,
        bulk_points REAL NOT NULL DEFAULT 0,
        lum_points REAL NOT NULL DEFAULT 0,
        replen_points REAL NOT NULL DEFAULT 0,
        receive_points REAL NOT NULL DEFAULT 0,
        put_points REAL NOT NULL DEFAULT 0,
        bulkFTE REAL NOT NULL DEFAULT 0,
        lumFTE REAL NOT NULL DEFAULT 0,
        receiveFTE REAL NOT NULL DEFAULT 0,
        inventoryFTE REAL NOT NULL DEFAULT 0,
        supportFTE REAL NOT NULL DEFAULT 0,
        rfidFTE REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date)
      )
    `);

    // Labor Analysis Summary table - pre-calculated results
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS labor_analysis_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_type TEXT NOT NULL,
        day_count INTEGER NOT NULL,
        avg_bulkFTE REAL NOT NULL,
        avg_lumFTE REAL NOT NULL,
        avg_receiveFTE REAL NOT NULL,
        avg_inventoryFTE REAL NOT NULL,
        avg_supportFTE REAL NOT NULL,
        avg_rfidFTE REAL NOT NULL,
        avg_supervisorFTE REAL NOT NULL,
        avg_leaderFTE REAL NOT NULL,
        avg_totalFTE REAL NOT NULL,
        stdev_totalFTE REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private migrateDatabase(): void {
    console.log('Starting database migration...');
    
    // Check if labor_statistics table exists and get its structure
    const tableInfo = this.db.prepare("PRAGMA table_info(labor_statistics)").all() as Array<{
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: any;
      pk: number;
    }>;
    
    console.log('Labor statistics table info:', tableInfo);
    
    // If table doesn't exist, it will be created by createTables()
    if (tableInfo.length === 0) {
      console.log('Labor statistics table does not exist, will be created by createTables()');
      return;
    }
    
    const hasBulkPoints = tableInfo.some(col => col.name === 'bulk_points');
    const hasLumPoints = tableInfo.some(col => col.name === 'lum_points');
    const hasReplenPoints = tableInfo.some(col => col.name === 'replen_points');
    const hasReceivePoints = tableInfo.some(col => col.name === 'receive_points');
    const hasPutPoints = tableInfo.some(col => col.name === 'put_points');
    const hasBulkFTE = tableInfo.some(col => col.name === 'bulkFTE');
    const hasLumFTE = tableInfo.some(col => col.name === 'lumFTE');
    const hasReceiveFTE = tableInfo.some(col => col.name === 'receiveFTE');
    const hasInventoryFTE = tableInfo.some(col => col.name === 'inventoryFTE');
    const hasSupportFTE = tableInfo.some(col => col.name === 'supportFTE');
    const hasRfidFTE = tableInfo.some(col => col.name === 'rfidFTE');
    const dateColumn = tableInfo.find(col => col.name === 'date');
    const isDateType = dateColumn?.type === 'DATE';
    
    console.log('Migration check:', {
      hasBulkPoints,
      hasLumPoints,
      hasReplenPoints,
      hasReceivePoints,
      hasPutPoints,
      hasBulkFTE,
      hasLumFTE,
      hasReceiveFTE,
      hasInventoryFTE,
      hasSupportFTE,
      hasRfidFTE,
      isDateType,
      dateColumnType: dateColumn?.type
    });
    
    // If we need to add columns or change date type, simply drop and recreate the table
    if (!hasBulkPoints || !hasLumPoints || !hasReplenPoints || !hasReceivePoints || !hasPutPoints || !hasBulkFTE || !hasLumFTE || !hasReceiveFTE || !hasInventoryFTE || !hasSupportFTE || !hasRfidFTE || !isDateType) {
      console.log('Migrating labor_statistics table structure...');
      
      try {
        // Simply drop and recreate the table - no backup needed
        this.db.exec('DROP TABLE IF EXISTS labor_statistics');
        
        // Recreate with correct structure
        this.db.exec(`
          CREATE TABLE labor_statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date DATE NOT NULL,
            day_of_week TEXT NOT NULL,
            transaction_lines INTEGER NOT NULL,
            quantity_picked INTEGER NOT NULL,
            bulk_points REAL NOT NULL DEFAULT 0,
            lum_points REAL NOT NULL DEFAULT 0,
            replen_points REAL NOT NULL DEFAULT 0,
            receive_points REAL NOT NULL DEFAULT 0,
            put_points REAL NOT NULL DEFAULT 0,
            bulkFTE REAL NOT NULL DEFAULT 0,
            lumFTE REAL NOT NULL DEFAULT 0,
            receiveFTE REAL NOT NULL DEFAULT 0,
            inventoryFTE REAL NOT NULL DEFAULT 0,
            supportFTE REAL NOT NULL DEFAULT 0,
            rfidFTE REAL NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(date)
          )
        `);
        
        console.log('Labor statistics table migration completed');
      } catch (error) {
        console.error('Migration error:', error);
      }
    } else {
      console.log('No migration needed - all columns and types are correct');
    }
  }

  private createIndexes(): void {
    // Performance indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_po_number 
      ON purchase_orders(PO_Number)
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_po_date 
      ON purchase_orders(PO_Date)
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_supplier 
      ON purchase_orders(Supplier_Name)
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_entity 
      ON purchase_orders(Entity)
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_unspsc_code 
      ON purchase_orders(UNSPSC_Code)
    `);
    
    // Labor statistics indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_labor_date 
      ON labor_statistics(date)
    `);
    
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_labor_day_of_week 
      ON labor_statistics(day_of_week)
    `);
  }

  // Get database statistics
  public getDatabaseStats(): DatabaseStats {
    const tableCounts: { [table: string]: number } = {};
    let totalRecords = 0;

    const tables = ['purchase_orders'];

    tables.forEach(table => {
      const count = this.db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      tableCounts[table] = count.count;
      totalRecords += count.count;
    });

    const stats = fs.statSync(this.dbPath);
    const databaseSize = this.formatFileSize(stats.size);

    return {
      totalRecords,
      tableCounts,
      databaseSize,
      lastUpdated: new Date()
    };
  }

  private formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // Import data from CSV content (appends to existing data)
  public importCSVData(tableName: string, csvContent: string, onProgress?: (progress: number) => void, clearTable: boolean = false): void {
    console.log(`Database importCSVData called for table: ${tableName}`);
    
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      console.log(`No lines found for table: ${tableName}`);
      return;
    }

    console.log(`Processing ${lines.length} lines for table: ${tableName}`);

    // Only clear existing data if explicitly requested (for first file in batch)
    if (clearTable) {
      console.log(`Clearing existing data for table: ${tableName}`);
      this.db.exec(`DELETE FROM ${tableName}`);
      this.db.exec(`DELETE FROM sqlite_sequence WHERE name = '${tableName}'`);
    } else {
      console.log(`Appending data to existing table: ${tableName}`);
    }

    // Use PapaParse for robust CSV parsing
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => {
        // Clean and normalize headers
        return header.replace(/^["']|["']$/g, '').trim().replace(/\r/g, '').replace(/ /g, '_');
      }
      // Note: Removed transform function to let PapaParse handle values naturally
    });

    if (parseResult.errors.length > 0) {
      console.warn(`CSV parsing warnings for ${tableName}:`, parseResult.errors);
    }

    const csvHeaders = Object.keys(parseResult.data[0] || {});
    const dataRows = parseResult.data as Record<string, any>[];

    console.log(`CSV headers for ${tableName}:`, csvHeaders);
    console.log(`Data rows count for ${tableName}:`, dataRows.length);
    
    // Debug: Show first few data rows to verify parsing
    if (dataRows.length > 0) {
      console.log('Sample data row 1:', dataRows[0]);
      if (dataRows.length > 1) {
        console.log('Sample data row 2:', dataRows[1]);
      }
    }

    // Get table schema to exclude the 'id' column (auto-increment primary key)
    const tableInfo = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    const dbColumns = tableInfo.map(col => col.name).filter(col => col !== 'id');

    console.log(`Database columns for ${tableName}:`, dbColumns);

    // Filter CSV headers to only include columns that exist in the database (excluding 'id')
    const validHeaders = csvHeaders.filter(header => dbColumns.includes(header));

    console.log(`Valid headers for ${tableName}:`, validHeaders);
    
    if (validHeaders.length === 0) {
      throw new Error(`No valid columns found for table ${tableName}. CSV headers: [${csvHeaders.join(', ')}]. Database columns: [${dbColumns.join(', ')}]`);
    }

    // Prepare insert statement - only include valid database columns
    const placeholders = validHeaders.map(() => '?').join(',');
    const insertQuery = `INSERT INTO ${tableName} (${validHeaders.join(',')}) VALUES (${placeholders})`;
    const insertStmt = this.db.prepare(insertQuery);

    console.log(`Insert statement for ${tableName}: ${insertQuery}`);

    // Begin transaction for batch insert
    this.db.exec('BEGIN TRANSACTION');

    try {
      // Optimize batch size based on data size
      const estimatedRecords = dataRows.length;
      const batchSize = estimatedRecords > 100000 ? 5000 : 1000; // Larger batches for very large files
      console.log(`Using batch size: ${batchSize} for ${estimatedRecords} records`);
      
      let processed = 0;

      for (let i = 0; i < dataRows.length; i += batchSize) {
        const batch = dataRows.slice(i, i + batchSize);
        
        batch.forEach((row, rowIndex) => {
          // Extract values for valid columns only and clean them
          const validValues = validHeaders.map(header => {
            let value = row[header];
            // Clean values - remove quotes, trim whitespace, handle nulls
            if (!value || value === '' || value === 'null' || value === 'NULL') {
              return null;
            }
            return value.toString().trim().replace(/^["']|["']$/g, '');
          });
          
          try {
            // Only log occasionally to avoid console spam - more frequent for large files
            const logInterval = estimatedRecords > 100000 ? 5000 : 1000;
            if (processed + rowIndex === 0 || (processed + rowIndex) % logInterval === 0) {
              console.log(`Inserting batch for ${tableName}: record ${processed + rowIndex + 1} of ${estimatedRecords}`);
              // Debug: Show sample of parsed data for first few records
              if (processed + rowIndex < 3) {
                console.log(`Sample parsed row ${processed + rowIndex + 1}:`, JSON.stringify(row, null, 2));
                console.log(`Valid values for row ${processed + rowIndex + 1}:`, validValues);
              }
            }
            
            // Validate field count matches expected headers
            if (validValues.length !== validHeaders.length) {
              console.warn(`Warning: Field count mismatch in row ${processed + rowIndex + 1}. Expected ${validHeaders.length} fields, got ${validValues.length}`);
              console.warn(`Row data:`, JSON.stringify(row).substring(0, 200));
            }
            
            insertStmt.run(...validValues);
          } catch (error) {
            console.error(`Error inserting row ${processed + rowIndex + 1} for table ${tableName}:`, error);
            console.error(`Row data:`, JSON.stringify(row));
            console.error(`Valid values:`, validValues);
            console.error(`Valid headers:`, validHeaders);
            throw error;
          }
        });

        processed += batch.length;
        if (onProgress) {
          onProgress((processed / dataRows.length) * 100);
        }
      }

      this.db.exec('COMMIT');
      console.log(`Successfully imported ${processed} records for table: ${tableName}`);
    } catch (error) {
      this.db.exec('ROLLBACK');
      console.error(`Error importing data for table ${tableName}:`, error);
      throw error;
    }
  }

  // Get total record count for a table
  public getRecordCount(tableName: string): number {
    const result = this.db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
    return result.count;
  }

  // Get unique counts for analysis
  public getUniqueCounts(): {
    uniqueEntities: number;
    uniqueSuppliers: number;
    uniqueItems: number;
    uniquePONumbers: number;
    uniqueUNSPSC: number;
    uniqueShipToLocations: number;
    uniqueDestinationLocations: number;
    totalRecords: number;
  } {
    const uniqueEntities = this.db.prepare(`
      SELECT COUNT(DISTINCT Entity) as count FROM purchase_orders WHERE Entity IS NOT NULL
    `).get() as { count: number };

    const uniqueSuppliers = this.db.prepare(`
      SELECT COUNT(DISTINCT Supplier_Name) as count FROM purchase_orders WHERE Supplier_Name IS NOT NULL
    `).get() as { count: number };

    const uniqueItems = this.db.prepare(`
      SELECT COUNT(DISTINCT Oracle_Item_Number) as count FROM purchase_orders WHERE Oracle_Item_Number IS NOT NULL
    `).get() as { count: number };

    const uniquePONumbers = this.db.prepare(`
      SELECT COUNT(DISTINCT PO_Number) as count FROM purchase_orders WHERE PO_Number IS NOT NULL
    `).get() as { count: number };

    const uniqueUNSPSC = this.db.prepare(`
      SELECT COUNT(DISTINCT UNSPSC_Code) as count FROM purchase_orders WHERE UNSPSC_Code IS NOT NULL
    `).get() as { count: number };

    const uniqueShipToLocations = this.db.prepare(`
      SELECT COUNT(DISTINCT Ship_To) as count FROM purchase_orders WHERE Ship_To IS NOT NULL AND Ship_To != ''
    `).get() as { count: number };

    const uniqueDestinationLocations = this.db.prepare(`
      SELECT COUNT(DISTINCT Destination_Location_Name) as count FROM purchase_orders WHERE Destination_Location_Name IS NOT NULL AND Destination_Location_Name != ''
    `).get() as { count: number };

    const totalRecords = this.getRecordCount('purchase_orders');

    return {
      uniqueEntities: uniqueEntities.count,
      uniqueSuppliers: uniqueSuppliers.count,
      uniqueItems: uniqueItems.count,
      uniquePONumbers: uniquePONumbers.count,
      uniqueUNSPSC: uniqueUNSPSC.count,
      uniqueShipToLocations: uniqueShipToLocations.count,
      uniqueDestinationLocations: uniqueDestinationLocations.count,
      totalRecords
    };
  }

  // Get supplier analysis data
  public getSupplierAnalysis(): Array<{
    supplierName: string;
    uniqueItemCount: number;
    totalRecordCount: number;
    averageDailyValue: number;
    distinctDays: number;
    dateRange: { start: string; end: string; days: number };
  }> {
    // First, get the total number of unique PO dates in the entire dataset
    const totalUniqueDatesQuery = `
      SELECT COUNT(DISTINCT PO_Date) as totalUniqueDates
      FROM purchase_orders 
      WHERE PO_Date IS NOT NULL AND PO_Date != ''
    `;
    const totalUniqueDates = this.db.prepare(totalUniqueDatesQuery).get() as { totalUniqueDates: number };
    
    const query = `
      SELECT 
        Supplier_Name as supplierName,
        COUNT(DISTINCT Oracle_Item_Number) as uniqueItemCount,
        COUNT(*) as totalRecordCount,
        MIN(PO_Date) as startDate,
        MAX(PO_Date) as endDate
      FROM purchase_orders 
      WHERE Supplier_Name IS NOT NULL 
        AND Supplier_Name != ''
        AND PO_Date IS NOT NULL
        AND PO_Date != ''
      GROUP BY Supplier_Name
      ORDER BY uniqueItemCount DESC
      LIMIT 1000
    `;
    
    const result = this.db.prepare(query).all() as Array<{
      supplierName: string;
      uniqueItemCount: number;
      totalRecordCount: number;
      startDate: string;
      endDate: string;
    }>;
    
    // Calculate average daily values: supplier records / total unique dates in dataset
    return result.map(row => {
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
  }

  // Get ship to analysis data
  public getShipToAnalysis(): Array<{
    shipToName: string;
    uniqueItemCount: number;
    totalRecordCount: number;
    averageDailyValue: number;
    distinctDays: number;
    dateRange: { start: string; end: string; days: number };
  }> {
    // First, get the total number of unique PO dates in the entire dataset
    const totalUniqueDatesQuery = `
      SELECT COUNT(DISTINCT PO_Date) as totalUniqueDates
      FROM purchase_orders 
      WHERE PO_Date IS NOT NULL AND PO_Date != ''
    `;
    const totalUniqueDates = this.db.prepare(totalUniqueDatesQuery).get() as { totalUniqueDates: number };
    
    const query = `
      SELECT 
        Ship_To as shipToName,
        COUNT(DISTINCT Oracle_Item_Number) as uniqueItemCount,
        COUNT(*) as totalRecordCount,
        MIN(PO_Date) as startDate,
        MAX(PO_Date) as endDate
      FROM purchase_orders 
      WHERE Ship_To IS NOT NULL 
        AND Ship_To != ''
        AND PO_Date IS NOT NULL
        AND PO_Date != ''
      GROUP BY Ship_To
      ORDER BY uniqueItemCount DESC
      LIMIT 1000
    `;
    
    const result = this.db.prepare(query).all() as Array<{
      shipToName: string;
      uniqueItemCount: number;
      totalRecordCount: number;
      startDate: string;
      endDate: string;
    }>;
    
    // Calculate average daily values: ship-to records / total unique dates in dataset
    return result.map(row => {
      const startDate = new Date(row.startDate);
      const endDate = new Date(row.endDate);
      const dateRangeDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      const averageDailyValue = totalUniqueDates.totalUniqueDates > 0 
        ? Math.round((row.totalRecordCount / totalUniqueDates.totalUniqueDates) * 100) / 100 
        : 0;
      
      return {
        shipToName: row.shipToName,
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
  }

  // Get item analysis data (optimized for large datasets)
  public getItemAnalysis(): Array<{
    oracleItemNumber: string;
    itemDescription: string;
    totalRecordCount: number;
    averageDailyValue: number;
    distinctDays: number;
    dateRange: { start: string; end: string; days: number };
    suppliers: string[];
    shipToLocations: string[];
  }> {
    // First, get the total number of unique PO dates in the entire dataset for average calculation
    const totalUniqueDatesQuery = `
      SELECT COUNT(DISTINCT PO_Date) as totalUniqueDates
      FROM purchase_orders 
      WHERE PO_Date IS NOT NULL AND PO_Date != ''
    `;
    const totalUniqueDates = this.db.prepare(totalUniqueDatesQuery).get() as { totalUniqueDates: number };
    
    // Optimized query without GROUP_CONCAT to avoid timeout on large datasets
    const query = `
      SELECT 
        Oracle_Item_Number as oracleItemNumber,
        Item_Description as itemDescription,
        COUNT(*) as totalRecordCount,
        MIN(PO_Date) as startDate,
        MAX(PO_Date) as endDate,
        COUNT(DISTINCT Supplier_Name) as supplierCount,
        COUNT(DISTINCT Ship_To) as shipToCount
      FROM purchase_orders 
      WHERE Oracle_Item_Number IS NOT NULL 
        AND Oracle_Item_Number != ''
        AND Item_Description IS NOT NULL
        AND Item_Description != ''
        AND PO_Date IS NOT NULL
        AND PO_Date != ''
      GROUP BY Oracle_Item_Number, Item_Description
      ORDER BY totalRecordCount DESC
      LIMIT 1000
    `;
    
    const result = this.db.prepare(query).all() as Array<{
      oracleItemNumber: string;
      itemDescription: string;
      totalRecordCount: number;
      startDate: string;
      endDate: string;
      supplierCount: number;
      shipToCount: number;
    }>;
    
    // Calculate average daily values: item records / total unique dates in dataset
    return result.map(row => {
      const startDate = new Date(row.startDate);
      const endDate = new Date(row.endDate);
      const dateRangeDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      const averageDailyValue = totalUniqueDates.totalUniqueDates > 0 
        ? Math.round((row.totalRecordCount / totalUniqueDates.totalUniqueDates) * 100) / 100 
        : 0;
      
      // For large datasets, we'll show counts instead of full lists to avoid performance issues
      const suppliers = [`${row.supplierCount} suppliers`];
      const shipToLocations = [`${row.shipToCount} locations`];
      
      return {
        oracleItemNumber: row.oracleItemNumber,
        itemDescription: row.itemDescription,
        totalRecordCount: row.totalRecordCount,
        averageDailyValue,
        distinctDays: totalUniqueDates.totalUniqueDates,
        dateRange: {
          start: row.startDate,
          end: row.endDate,
          days: dateRangeDays
        },
        suppliers,
        shipToLocations
      };
    });
  }

  // Get data quality analysis
  public getDataQualityAnalysis(): {
    totalRecords: number;
    incompleteRecords: number;
    completeRecords: number;
    incompletePercentage: number;
    fieldCompleteness: { [field: string]: number };
  } {
    const totalRecords = this.getRecordCount('purchase_orders');
    
    // Count records with missing critical fields
    const incompleteRecords = this.db.prepare(`
      SELECT COUNT(*) as count FROM purchase_orders 
      WHERE Entity IS NULL OR Entity = '' 
         OR Supplier_Name IS NULL OR Supplier_Name = ''
         OR Oracle_Item_Number IS NULL OR Oracle_Item_Number = ''
         OR PO_Number IS NULL OR PO_Number = ''
    `).get() as { count: number };
    
    const completeRecords = totalRecords - incompleteRecords.count;
    const incompletePercentage = totalRecords > 0 ? (incompleteRecords.count / totalRecords * 100) : 0;
    
    // Check field completeness for key fields
    const fieldCompleteness: { [field: string]: number } = {};
    const keyFields = [
      'Entity', 'Supplier_Name', 'Oracle_Item_Number', 'PO_Number', 
      'Ship_To', 'Item_Description', 'PO_Quantity_Ordered'
    ];
    
    for (const field of keyFields) {
      const nonNullCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM purchase_orders 
        WHERE ${field} IS NOT NULL AND ${field} != ''
      `).get() as { count: number };
      
      fieldCompleteness[field] = totalRecords > 0 ? (nonNullCount.count / totalRecords * 100) : 0;
    }
    
    return {
      totalRecords,
      incompleteRecords: incompleteRecords.count,
      completeRecords,
      incompletePercentage: Math.round(incompletePercentage * 100) / 100,
      fieldCompleteness
    };
  }

  // Clear all data from database
  public clearDatabase(): void {
    this.db.exec('DELETE FROM purchase_orders');
    this.db.exec('DELETE FROM sqlite_sequence WHERE name = "purchase_orders"');
  }

  // Recreate database with corrected schema
  public recreateDatabase(): void {
    console.log('Recreating database with corrected schema...');
    this.db.exec('DROP TABLE IF EXISTS purchase_orders');
    this.createTables();
    this.migrateDatabase();
    this.createIndexes();
    console.log('Database recreated successfully');
  }

  // Public methods for database operations
  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public prepare(sql: string): Database.Statement {
    return this.db.prepare(sql);
  }

  public close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  // Truncate non-Cardinal Health records
  public truncateNonCardinalHealthRecords(): { deletedRecords: number; remainingRecords: number } {
    // Get count of records to be deleted
    const recordsToDelete = this.db.prepare(`
      SELECT COUNT(*) as count FROM purchase_orders 
      WHERE Supplier_Name IS NULL OR Supplier_Name = '' OR Supplier_Name NOT LIKE 'Cardinal%'
    `).get() as { count: number };

    // Delete non-Cardinal Health records
    const deleteResult = this.db.prepare(`
      DELETE FROM purchase_orders 
      WHERE Supplier_Name IS NULL OR Supplier_Name = '' OR Supplier_Name NOT LIKE 'Cardinal%'
    `).run();

    // Get remaining record count
    const remainingRecords = this.db.prepare('SELECT COUNT(*) as count FROM purchase_orders').get() as { count: number };

    return {
      deletedRecords: deleteResult.changes,
      remainingRecords: remainingRecords.count
    };
  }

  // Helper function to check if a date is a weekday
  private isWeekday(dateString: string): boolean {
    // Parse date string in MM/DD/YYYY format
    const dateParts = dateString.split('/');
    const parsedDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
    const dayOfWeek = parsedDate.getDay();
    
    // Monday = 1, Tuesday = 2, ..., Friday = 5
    // Saturday = 6, Sunday = 0
    return dayOfWeek >= 1 && dayOfWeek <= 5;
  }

  // Helper function to get day of week name
  private getDayOfWeekName(dateString: string): string {
    const dateParts = dateString.split('/');
    const parsedDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[parsedDate.getDay()];
  }

  // Process simulation - generate daily labor statistics from purchase orders
  public processSimulation(productivityVariables?: {
    ratioOfBulkPicksToLumPicks: number;
    targetStaffProductivityPerHour: number;
    bulkPicksPerHour: number;
    lumPicksPerHour: number;
    ratioOfReplenishLinesToPicks: number;
    letDownLinesPerHour: number;
    ratioOfReceiptLinesToPicks: number;
    receiptLinesProcessedPerHour: number;
    ratioOfPutLinesToPicks: number;
    putAwayLinesPerHour: number;
    laborHoursPerDay: number;
    utilizationPercentage: number;
    linesPerSupportResource: number;
    rfidLinesPerDay: number;
    rfidLinesPerHour: number;
    staffToSupervisorRatio: number;
    leadershipAndAdministrationStaff: number;
  }): { processedDays: number; totalRecords: number } {
    console.log('Starting process simulation...');
    
    // Clear existing labor statistics
    this.db.prepare('DELETE FROM labor_statistics').run();
    
    // Get daily summary from purchase orders
    const dailySummaryQuery = `
      SELECT 
        PO_Date as date,
        COUNT(*) as transaction_lines,
        COALESCE(SUM(CASE 
          WHEN PO_Quantity_Ordered IS NOT NULL 
            AND PO_Quantity_Ordered != '' 
            AND PO_Quantity_Ordered GLOB '[0-9]*'
          THEN CAST(PO_Quantity_Ordered AS INTEGER)
          ELSE 0
        END), 0) as quantity_picked
      FROM purchase_orders 
      WHERE PO_Date IS NOT NULL 
        AND PO_Date != ''
      GROUP BY PO_Date
      ORDER BY PO_Date
    `;
    
    const dailyData = this.db.prepare(dailySummaryQuery).all() as Array<{
      date: string;
      transaction_lines: number;
      quantity_picked: number;
    }>;
    
    console.log(`Found ${dailyData.length} days with transaction data`);
    
    // Debug: Check for null values
    const nullValues = dailyData.filter(day => day.quantity_picked === null);
    if (nullValues.length > 0) {
      console.log(`Warning: Found ${nullValues.length} days with null quantity_picked values`);
    }
    
    // Insert daily labor statistics
    const insertQuery = `
      INSERT INTO labor_statistics (date, day_of_week, transaction_lines, quantity_picked, bulk_points, lum_points, replen_points, receive_points, put_points, bulkFTE, lumFTE, receiveFTE, inventoryFTE, supportFTE, rfidFTE, supervisorFTE, leaderFTE)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const insertStmt = this.db.prepare(insertQuery);
    let processedDays = 0;
    
    // Default productivity variables if not provided (matching UI defaults)
    const defaultVars = {
      ratioOfBulkPicksToLumPicks: 25,
      targetStaffProductivityPerHour: 600,
      bulkPicksPerHour: 40,
      lumPicksPerHour: 80,
      ratioOfReplenishLinesToPicks: 2,
      letDownLinesPerHour: 20,
      ratioOfReceiptLinesToPicks: 5,
      receiptLinesProcessedPerHour: 15,
      ratioOfPutLinesToPicks: 5,
      putAwayLinesPerHour: 20,
      laborHoursPerDay: 8,
      utilizationPercentage: 80,
      linesPerSupportResource: 1500,
      rfidLinesPerDay: 7400,
      rfidLinesPerHour: 60,
      staffToSupervisorRatio: 12,
      leadershipAndAdministrationStaff: 6
    };
    
    const vars = productivityVariables || defaultVars;
    
    // Calculate points per transaction
    const bulkPointsPerTransaction = vars.targetStaffProductivityPerHour / vars.bulkPicksPerHour;
    const lumPointsPerTransaction = vars.targetStaffProductivityPerHour / vars.lumPicksPerHour;
    const replenPointsPerTransaction = vars.targetStaffProductivityPerHour / vars.letDownLinesPerHour;
    const receivePointsPerTransaction = vars.targetStaffProductivityPerHour / vars.receiptLinesProcessedPerHour;
    const putPointsPerTransaction = vars.targetStaffProductivityPerHour / vars.putAwayLinesPerHour;
    
    for (const day of dailyData) {
      // Use helper functions to determine weekday/weekend and day name
      const isWeekday = this.isWeekday(day.date);
      const dayOfWeek = this.getDayOfWeekName(day.date);
      
      // Calculate bulk, LUM, replenishment, receive, and put points
      const bulkRatio = vars.ratioOfBulkPicksToLumPicks / 100;
      const lumRatio = (100 - vars.ratioOfBulkPicksToLumPicks) / 100;
      const replenRatio = vars.ratioOfReplenishLinesToPicks / 100;
      const receiveRatio = vars.ratioOfReceiptLinesToPicks / 100;
      const putRatio = vars.ratioOfPutLinesToPicks / 100;
      
      // Calculate points for weekdays and weekends
      const weekdayBulkPoints = day.transaction_lines * bulkRatio * bulkPointsPerTransaction;
      const weekdayLumPoints = day.transaction_lines * lumRatio * lumPointsPerTransaction;
      const weekdayReplenPoints = day.transaction_lines * replenRatio * replenPointsPerTransaction;
      const weekdayReceivePoints = day.transaction_lines * receiveRatio * receivePointsPerTransaction;
      const weekdayPutPoints = day.transaction_lines * putRatio * putPointsPerTransaction;
      
      const weekendBulkPoints = day.transaction_lines * bulkRatio * bulkPointsPerTransaction;
      const weekendLumPoints = day.transaction_lines * lumRatio * lumPointsPerTransaction;
      const weekendReplenPoints = day.transaction_lines * replenRatio * replenPointsPerTransaction;
      const weekendReceivePoints = 0; // No receive points on weekends
      const weekendPutPoints = 0; // No put points on weekends
      
      // Apply appropriate logic based on weekday/weekend
      const bulkPoints = isWeekday ? weekdayBulkPoints : weekendBulkPoints;
      const lumPoints = isWeekday ? weekdayLumPoints : weekendLumPoints;
      const replenPoints = isWeekday ? weekdayReplenPoints : weekendReplenPoints;
      const receivePoints = isWeekday ? weekdayReceivePoints : weekendReceivePoints;
      const putPoints = isWeekday ? weekdayPutPoints : weekendPutPoints;
      
      // Calculate bulkFTE = (bulk_points) / (Target Staff Productivity per Hour Variable * Labor Hours Per Day Variable * (Utilization Percentage Variable / 100))
      // Note: targetStaffProductivityPerHour is the variable we want to use in the denominator
      const denominator = vars.targetStaffProductivityPerHour * vars.laborHoursPerDay * (vars.utilizationPercentage / 100);
      const bulkFTE = denominator > 0 ? bulkPoints / denominator : 0;
      
      // Calculate lumFTE = (lum_points) / (Target Staff Productivity per Hour Variable * Labor Hours Per Day Variable * (Utilization Percentage Variable / 100))
      const lumFTE = denominator > 0 ? lumPoints / denominator : 0;
      
      // Calculate receiveFTE = (receive_points) / (Target Staff Productivity per Hour Variable * Labor Hours Per Day Variable * (Utilization Percentage Variable / 100))
      const receiveFTE = denominator > 0 ? receivePoints / denominator : 0;
      
      // Calculate inventoryFTE = (replen_points + put_points) / (Target Staff Productivity per Hour Variable * Labor Hours Per Day Variable * (Utilization Percentage Variable / 100))
      const inventoryFTE = denominator > 0 ? (replenPoints + putPoints) / denominator : 0;
      
      // Calculate supportFTE = (transaction_lines) / Lines per Support Resource variable
      const supportFTE = vars.linesPerSupportResource > 0 ? day.transaction_lines / vars.linesPerSupportResource : 0;
      
      // Calculate RFID Capture Points Per Transaction = Total Staff Productivity Per Hour / RFID Lines Per Hour
      const rfidCapturePointsPerTransaction = vars.rfidLinesPerHour > 0 ? vars.targetStaffProductivityPerHour / vars.rfidLinesPerHour : 0;
      
      // Calculate rfidFTE = (rfidLinesPerDay * rfidCapturePointsPerTransaction) / (Target Staff Productivity Per Hour * laborHoursPerDay × (utilizationPercentage / 100))
      // For weekdays only, weekends = 0
      const rfidFTE = isWeekday && denominator > 0 ? (vars.rfidLinesPerDay * rfidCapturePointsPerTransaction) / denominator : 0;
      
      try {
        // Ensure all values are valid numbers
        const safeBulkFTE = isNaN(bulkFTE) || !isFinite(bulkFTE) || bulkFTE === null || bulkFTE === undefined ? 0 : bulkFTE;
        const safeLumFTE = isNaN(lumFTE) || !isFinite(lumFTE) || lumFTE === null || lumFTE === undefined ? 0 : lumFTE;
        const safeReceiveFTE = isNaN(receiveFTE) || !isFinite(receiveFTE) || receiveFTE === null || receiveFTE === undefined ? 0 : receiveFTE;
        const safeInventoryFTE = isNaN(inventoryFTE) || !isFinite(inventoryFTE) || inventoryFTE === null || inventoryFTE === undefined ? 0 : inventoryFTE;
        const safeSupportFTE = isNaN(supportFTE) || !isFinite(supportFTE) || supportFTE === null || supportFTE === undefined ? 0 : supportFTE;
        const safeRfidFTE = isNaN(rfidFTE) || !isFinite(rfidFTE) || rfidFTE === null || rfidFTE === undefined ? 0 : rfidFTE;
        
        // Calculate supervisorFTE = sum(safeBulkFTE + safeLumFTE + safeReceiveFTE + safeInventoryFTE + safeSupportFTE + safeRfidFTE) / Staff to Supervisor Ratio
        const totalStaffFTE = safeBulkFTE + safeLumFTE + safeReceiveFTE + safeInventoryFTE + safeSupportFTE + safeRfidFTE;
        const supervisorFTE = vars.staffToSupervisorRatio > 0 ? totalStaffFTE / vars.staffToSupervisorRatio : 0;
        const safeSupervisorFTE = isNaN(supervisorFTE) || !isFinite(supervisorFTE) || supervisorFTE === null || supervisorFTE === undefined ? 0 : supervisorFTE;
        
        // Calculate leaderFTE: For weekdays = Leadership and Administration Staff Variable, For weekends = 1
        const leaderFTE = isWeekday ? vars.leadershipAndAdministrationStaff : 1;
        const safeLeaderFTE = isNaN(leaderFTE) || !isFinite(leaderFTE) || leaderFTE === null || leaderFTE === undefined ? 0 : leaderFTE;
        
        // Ensure all points values are valid numbers
        const safeBulkPoints = isNaN(bulkPoints) || !isFinite(bulkPoints) || bulkPoints === null || bulkPoints === undefined ? 0 : bulkPoints;
        const safeLumPoints = isNaN(lumPoints) || !isFinite(lumPoints) || lumPoints === null || lumPoints === undefined ? 0 : lumPoints;
        const safeReplenPoints = isNaN(replenPoints) || !isFinite(replenPoints) || replenPoints === null || replenPoints === undefined ? 0 : replenPoints;
        const safeReceivePoints = isNaN(receivePoints) || !isFinite(receivePoints) || receivePoints === null || receivePoints === undefined ? 0 : receivePoints;
        const safePutPoints = isNaN(putPoints) || !isFinite(putPoints) || putPoints === null || putPoints === undefined ? 0 : putPoints;
        
        insertStmt.run(
          day.date, 
          dayOfWeek, 
          day.transaction_lines, 
          day.quantity_picked || 0,
          Math.round(safeBulkPoints * 100) / 100,
          Math.round(safeLumPoints * 100) / 100,
          Math.round(safeReplenPoints * 100) / 100,
          Math.round(safeReceivePoints * 100) / 100,
          Math.round(safePutPoints * 100) / 100,
          Math.round(safeBulkFTE * 100) / 100,
          Math.round(safeLumFTE * 100) / 100,
          Math.round(safeReceiveFTE * 100) / 100,
          Math.round(safeInventoryFTE * 100) / 100,
          Math.round(safeSupportFTE * 100) / 100,
          Math.round(safeRfidFTE * 100) / 100,
          Math.round(safeSupervisorFTE * 100) / 100,
          Math.round(safeLeaderFTE * 100) / 100
        );
        processedDays++;
      } catch (error) {
        console.error(`Error inserting data for date ${day.date}:`, error);
      }
    }
    
    const totalRecords = this.db.prepare('SELECT COUNT(*) as count FROM labor_statistics').get() as { count: number };
    
    
    console.log(`Process simulation completed: ${processedDays} days processed, ${totalRecords.count} total records`);
    
    // Update labor analysis summary
    this.updateLaborAnalysisSummary();
    
    return {
      processedDays,
      totalRecords: totalRecords.count
    };
  }

  // Update labor analysis summary table with pre-calculated results
  private updateLaborAnalysisSummary(): void {
    try {
      console.log('Updating labor analysis summary...');
      
      // Clear existing summary data
      this.db.exec('DELETE FROM labor_analysis_summary');
      
      // Calculate summary statistics with 1-sigma variation
      const summaryQuery = `
        SELECT 
          CASE 
            WHEN day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday') THEN 'Weekday'
            ELSE 'Weekend'
          END as day_type,
          COUNT(*) as day_count,
          AVG(bulkFTE) as avg_bulkFTE,
          AVG(lumFTE) as avg_lumFTE,
          AVG(receiveFTE) as avg_receiveFTE,
          AVG(inventoryFTE) as avg_inventoryFTE,
          AVG(supportFTE) as avg_supportFTE,
          AVG(rfidFTE) as avg_rfidFTE,
          AVG(supervisorFTE) as avg_supervisorFTE,
          AVG(leaderFTE) as avg_leaderFTE,
          AVG(bulkFTE + lumFTE + receiveFTE + inventoryFTE + supportFTE + rfidFTE + supervisorFTE + leaderFTE) as avg_totalFTE
        FROM labor_statistics
        GROUP BY day_type
      `;
      
      const summaryStats = this.db.prepare(summaryQuery).all();
      
      // Calculate standard deviation manually for each day type
      const stdevQuery = `
        SELECT 
          CASE 
            WHEN day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday') THEN 'Weekday'
            ELSE 'Weekend'
          END as day_type,
          (bulkFTE + lumFTE + receiveFTE + inventoryFTE + supportFTE + rfidFTE + supervisorFTE + leaderFTE) as totalFTE
        FROM labor_statistics
      `;
      
      const allData = this.db.prepare(stdevQuery).all();
      
      // Calculate standard deviation for each day type and insert into summary table
      const insertSummary = this.db.prepare(`
        INSERT INTO labor_analysis_summary (
          day_type, day_count, avg_bulkFTE, avg_lumFTE, avg_receiveFTE, 
          avg_inventoryFTE, avg_supportFTE, avg_rfidFTE, avg_supervisorFTE, 
          avg_leaderFTE, avg_totalFTE, stdev_totalFTE
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      summaryStats.forEach((summary: any) => {
        const dayTypeData = allData.filter((row: any) => row.day_type === summary.day_type);
        const totalFTEs = dayTypeData.map((row: any) => row.totalFTE);
        
        let stdev = 0;
        if (totalFTEs.length > 1) {
          // Calculate mean
          const mean = totalFTEs.reduce((sum, val) => sum + val, 0) / totalFTEs.length;
          
          // Calculate variance (using sample variance formula: divide by n-1)
          const variance = totalFTEs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (totalFTEs.length - 1);
          
          // Calculate standard deviation
          stdev = Math.sqrt(variance);
        }
        
        insertSummary.run(
          summary.day_type,
          summary.day_count,
          summary.avg_bulkFTE,
          summary.avg_lumFTE,
          summary.avg_receiveFTE,
          summary.avg_inventoryFTE,
          summary.avg_supportFTE,
          summary.avg_rfidFTE,
          summary.avg_supervisorFTE,
          summary.avg_leaderFTE,
          summary.avg_totalFTE,
          stdev
        );
      });
      
      console.log('Labor analysis summary updated successfully');
    } catch (error) {
      console.error('Error updating labor analysis summary:', error);
    }
  }

  // Get labor statistics for analysis
  public getLaborStatistics(): any[] {
    const query = `
      SELECT * FROM labor_statistics 
      ORDER BY date ASC
    `;
    
    return this.db.prepare(query).all();
  }

  // Get pre-calculated labor analysis summary
  public getLaborAnalysisSummary(): any[] {
    const query = `
      SELECT * FROM labor_analysis_summary 
      ORDER BY day_type ASC
    `;
    
    return this.db.prepare(query).all();
  }

  // Get labor statistics summary (for Transaction Volumes analysis)
  public getLaborStatisticsSummary(): {
    totalDays: number;
    totalTransactionLines: number;
    totalQuantityPicked: number;
    averageLinesPerDay: number;
    averageLinesPerWeekday: number;
    averageLinesPerWeekend: number;
    averagePointsPerWeekday: number;
    averagePointsPerWeekend: number;
    dayOfWeekAverages: { [key: string]: number };
    startDate: string;
    endDate: string;
  } {
    // Get basic summary
    const summaryQuery = `
      SELECT 
        COUNT(*) as totalDays,
        SUM(transaction_lines) as totalTransactionLines,
        COALESCE(SUM(quantity_picked), 0) as totalQuantityPicked,
        MIN(date) as startDate,
        MAX(date) as endDate
      FROM labor_statistics
    `;
    
    const summary = this.db.prepare(summaryQuery).get() as {
      totalDays: number;
      totalTransactionLines: number;
      totalQuantityPicked: number;
      startDate: string;
      endDate: string;
    };
    
    // Calculate averages
    const averageLinesPerDay = summary.totalDays > 0 ? 
      Math.round((summary.totalTransactionLines / summary.totalDays) * 100) / 100 : 0;
    
    // Get weekday vs weekend data
    const weekdayQuery = `
      SELECT AVG(transaction_lines) as avgLines
      FROM labor_statistics 
      WHERE day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
    `;
    
    const weekendQuery = `
      SELECT AVG(transaction_lines) as avgLines
      FROM labor_statistics 
      WHERE day_of_week IN ('Saturday', 'Sunday')
    `;
    
    const weekdayAvg = this.db.prepare(weekdayQuery).get() as { avgLines: number };
    const weekendAvg = this.db.prepare(weekendQuery).get() as { avgLines: number };
    
    const averageLinesPerWeekday = weekdayAvg.avgLines ? 
      Math.round(weekdayAvg.avgLines * 100) / 100 : 0;
    const averageLinesPerWeekend = weekendAvg.avgLines ? 
      Math.round(weekendAvg.avgLines * 100) / 100 : 0;
    
    // Calculate average points for weekdays and weekends
    const weekdayPointsQuery = `
      SELECT AVG(bulk_points + lum_points + replen_points + receive_points + put_points) as avgPoints
      FROM labor_statistics 
      WHERE day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
    `;
    
    const weekendPointsQuery = `
      SELECT AVG(bulk_points + lum_points + replen_points + receive_points + put_points) as avgPoints
      FROM labor_statistics 
      WHERE day_of_week IN ('Saturday', 'Sunday')
    `;
    
    const weekdayPointsAvg = this.db.prepare(weekdayPointsQuery).get() as { avgPoints: number };
    const weekendPointsAvg = this.db.prepare(weekendPointsQuery).get() as { avgPoints: number };
    
    const averagePointsPerWeekday = weekdayPointsAvg.avgPoints ? 
      Math.round(weekdayPointsAvg.avgPoints * 100) / 100 : 0;
    const averagePointsPerWeekend = weekendPointsAvg.avgPoints ? 
      Math.round(weekendPointsAvg.avgPoints * 100) / 100 : 0;
    
    // Get day of week averages
    const dayOfWeekQuery = `
      SELECT day_of_week, AVG(transaction_lines) as avgLines
      FROM labor_statistics 
      GROUP BY day_of_week
      ORDER BY 
        CASE day_of_week
          WHEN 'Sunday' THEN 0
          WHEN 'Monday' THEN 1
          WHEN 'Tuesday' THEN 2
          WHEN 'Wednesday' THEN 3
          WHEN 'Thursday' THEN 4
          WHEN 'Friday' THEN 5
          WHEN 'Saturday' THEN 6
        END
    `;
    
    const dayOfWeekData = this.db.prepare(dayOfWeekQuery).all() as Array<{
      day_of_week: string;
      avgLines: number;
    }>;
    
    const dayOfWeekAverages: { [key: string]: number } = {};
    dayOfWeekData.forEach(day => {
      dayOfWeekAverages[day.day_of_week] = Math.round(day.avgLines * 100) / 100;
    });
    
    return {
      totalDays: summary.totalDays,
      totalTransactionLines: summary.totalTransactionLines,
      totalQuantityPicked: summary.totalQuantityPicked,
      averageLinesPerDay,
      averageLinesPerWeekday,
      averageLinesPerWeekend,
      averagePointsPerWeekday,
      averagePointsPerWeekend,
      dayOfWeekAverages,
      startDate: summary.startDate,
      endDate: summary.endDate
    };
  }

  // Clear labor statistics
  public clearLaborStatistics(): number {
    const result = this.db.prepare('DELETE FROM labor_statistics').run();
    return result.changes;
  }

  // Force migration of labor statistics table
  public forceMigrateLaborStatistics(): { success: boolean; message: string } {
    try {
      console.log('Force migrating labor statistics table...');
      this.migrateDatabase();
      return { success: true, message: 'Migration completed successfully' };
    } catch (error) {
      console.error('Force migration error:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  // Force recreate labor statistics table
  public forceRecreateLaborStatistics(): { success: boolean; message: string } {
    try {
      console.log('Force recreating labor statistics table...');
      
      // Drop existing table
      this.db.exec('DROP TABLE IF EXISTS labor_statistics');
      
      // Recreate the table with correct structure
      this.db.exec(`
        CREATE TABLE labor_statistics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date DATE NOT NULL,
          day_of_week TEXT NOT NULL,
          transaction_lines INTEGER NOT NULL,
          quantity_picked INTEGER NOT NULL,
          bulk_points REAL NOT NULL DEFAULT 0,
          lum_points REAL NOT NULL DEFAULT 0,
          replen_points REAL NOT NULL DEFAULT 0,
          receive_points REAL NOT NULL DEFAULT 0,
          put_points REAL NOT NULL DEFAULT 0,
          bulkFTE REAL NOT NULL DEFAULT 0,
          lumFTE REAL NOT NULL DEFAULT 0,
          receiveFTE REAL NOT NULL DEFAULT 0,
          inventoryFTE REAL NOT NULL DEFAULT 0,
          supportFTE REAL NOT NULL DEFAULT 0,
          rfidFTE REAL NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date)
        )
      `);
      
      console.log('Labor statistics table recreated successfully');
      return { success: true, message: 'Labor statistics table recreated successfully' };
    } catch (error) {
      console.error('Force recreate error:', error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

}

// Global singleton that persists across Next.js API routes
declare global {
  var __ccfDatabaseInstance: CCFDatabase | undefined;
}

export function getDatabase(): CCFDatabase {
  if (!global.__ccfDatabaseInstance) {
    console.log('Creating new CCFDatabase instance');
    global.__ccfDatabaseInstance = new CCFDatabase();
  } else {
    console.log('Reusing existing CCFDatabase instance');
  }
  return global.__ccfDatabaseInstance;
}

export function closeDatabase(): void {
  if (global.__ccfDatabaseInstance) {
    console.log('Closing CCFDatabase instance');
    global.__ccfDatabaseInstance.close();
    global.__ccfDatabaseInstance = undefined;
  }
}

export function recreateDatabase(): CCFDatabase {
  console.log('Forcing recreation of CCFDatabase instance');
  closeDatabase();
  return getDatabase();
}
