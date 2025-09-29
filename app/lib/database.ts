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

    const totalRecords = this.getRecordCount('purchase_orders');

    return {
      uniqueEntities: uniqueEntities.count,
      uniqueSuppliers: uniqueSuppliers.count,
      uniqueItems: uniqueItems.count,
      uniquePONumbers: uniquePONumbers.count,
      uniqueUNSPSC: uniqueUNSPSC.count,
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

  // Get item analysis data
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
    
    const query = `
      SELECT 
        Oracle_Item_Number as oracleItemNumber,
        Item_Description as itemDescription,
        COUNT(*) as totalRecordCount,
        MIN(PO_Date) as startDate,
        MAX(PO_Date) as endDate,
        GROUP_CONCAT(DISTINCT Supplier_Name) as suppliers,
        GROUP_CONCAT(DISTINCT Ship_To) as shipToLocations
      FROM purchase_orders 
      WHERE Oracle_Item_Number IS NOT NULL 
        AND Oracle_Item_Number != ''
        AND Item_Description IS NOT NULL
        AND Item_Description != ''
        AND PO_Date IS NOT NULL
        AND PO_Date != ''
      GROUP BY Oracle_Item_Number, Item_Description
      ORDER BY totalRecordCount DESC
    `;
    
    const result = this.db.prepare(query).all() as Array<{
      oracleItemNumber: string;
      itemDescription: string;
      totalRecordCount: number;
      startDate: string;
      endDate: string;
      suppliers: string;
      shipToLocations: string;
    }>;
    
    // Calculate average daily values: item records / total unique dates in dataset
    return result.map(row => {
      const startDate = new Date(row.startDate);
      const endDate = new Date(row.endDate);
      const dateRangeDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      const averageDailyValue = totalUniqueDates.totalUniqueDates > 0 
        ? Math.round((row.totalRecordCount / totalUniqueDates.totalUniqueDates) * 100) / 100 
        : 0;
      
      const suppliers = row.suppliers ? row.suppliers.split(',') : [];
      const shipToLocations = row.shipToLocations ? row.shipToLocations.split(',') : [];
      
      // Debug logging for first few items
      if (result.indexOf(row) < 3) {
        console.log('Item Analysis Debug:', {
          oracleItemNumber: row.oracleItemNumber,
          suppliers: suppliers,
          shipToLocations: shipToLocations,
          rawSuppliers: row.suppliers,
          rawShipToLocations: row.shipToLocations
        });
      }
      
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
