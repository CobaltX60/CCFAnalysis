'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Upload, X, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react';

interface ExcelFileUploadProps {
  onImportComplete?: (results: any[]) => void;
  onValidationComplete?: (validation: any) => void;
}

interface ExcelFileState {
  [tableName: string]: File[]; // Array to support multiple files per table
}

const EXCEL_SHEETS: { key: string; name: string; description: string; requiredFields: string[]; isOptional?: boolean }[] = [
  {
    key: 'purchase_orders',
    name: 'Purchase Orders',
    description: 'Purchase order data with 37 fields including entity, supplier, item details, and transaction information',
    requiredFields: [
      'Entity', 'Site_Location', 'Entity_Level_2', 'Entity_Level_3', 'SCSS_Category_Team',
      'UNSPSC_Code', 'UNSPSC_Segment_Title', 'UNSPSC_Family_Title', 'UNSPSC_Class_Title', 'UNSPSC_Commodity_Title',
      'PO_Year', 'PO_Month', 'PO_Week', 'PO_Date', 'Destination_Location', 'Destination_Location_Name',
      'Ship_To', 'Ship_To_Name', 'Special_Handling', 'Rush_Flag', 'PO_Number', 'PO_Line_Number',
      'Oracle_Item_Number', 'Item_Description', 'Item_Type', 'PO_Quantity_Ordered', 'PO_Quantity_Ordered_LUOM',
      'Buy_UOM', 'Buy_UOM_Multiplier', 'Manufacturer_Name', 'Manufacturer_Number', 'Supplier_Number',
      'Supplier_Name', 'Supplier_Site', 'ValueLink_Flag', 'Cost_Center_Group', 'PPI_Flag'
    ]
  }
];

export default function Home() {
  const [excelFiles, setExcelFiles] = useState<ExcelFileState>({
    purchase_orders: []
  });

  const [dragActive, setDragActive] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string[]>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [importResults, setImportResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<'upload' | 'loading' | 'analysis-variables' | 'analysis' | 'supplier-details' | 'shipto-details' | 'item-details'>('upload');
  const [analysisData, setAnalysisData] = useState<any>(null);
  
  // Modal state for Ship To Location details
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedShipToData, setSelectedShipToData] = useState<any>(null);
  const [modalDetails, setModalDetails] = useState<any[]>([]);
  
  // Item Analysis state
  const [itemSupplierFilter, setItemSupplierFilter] = useState<string>('');
  const [itemShipToFilter, setItemShipToFilter] = useState<string>('');
  const [filteredItemData, setFilteredItemData] = useState<any[]>([]);
  
  // Supplier Analysis state
  const [supplierAnalysisSupplierFilter, setSupplierAnalysisSupplierFilter] = useState<string>('');
  const [supplierAnalysisShipToFilter, setSupplierAnalysisShipToFilter] = useState<string>('');
  const [filteredSupplierData, setFilteredSupplierData] = useState<any[]>([]);
  
  // System Variables state
  const [limitToCardinalHealth, setLimitToCardinalHealth] = useState<boolean>(false);
  
  // Table sorting state
  const [supplierSortField, setSupplierSortField] = useState<string>('uniqueItemCount');
  const [supplierSortDirection, setSupplierSortDirection] = useState<'asc' | 'desc'>('desc');
  const [shipToSortField, setShipToSortField] = useState<string>('uniqueItemCount');
  const [shipToSortDirection, setShipToSortDirection] = useState<'asc' | 'desc'>('desc');
  const [itemSortField, setItemSortField] = useState<string>('totalRecordCount');
  const [itemSortDirection, setItemSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Calculate subtotals
  const calculateSubtotals = (data: any[]) => {
    if (!data || data.length === 0) return { totalUniqueItems: 0, totalRecords: 0, totalAverageDaily: 0 };
    
    const totalUniqueItems = data.reduce((sum, item) => sum + (item.uniqueItemCount || 0), 0);
    const totalRecords = data.reduce((sum, item) => sum + (item.totalRecordCount || 0), 0);
    const totalAverageDaily = data.reduce((sum, item) => sum + (item.averageDailyValue || 0), 0);
    
    return {
      totalUniqueItems,
      totalRecords,
      totalAverageDaily: Math.round(totalAverageDaily * 100) / 100
    };
  };

  // Handle Ship To Location modal
  const handleShipToRowClick = async (shipToData: any) => {
    setSelectedShipToData(shipToData);
    setIsModalOpen(true);
    
    // Fetch detailed destination location data for this Ship To location
    try {
      const response = await fetch(`/api/ship-to-details?shipTo=${encodeURIComponent(shipToData.shipToName)}`);
      if (response.ok) {
        const details = await response.json();
        setModalDetails(details);
      } else {
        console.error('Failed to fetch ship to details');
        setModalDetails([]);
      }
    } catch (error) {
      console.error('Error fetching ship to details:', error);
      setModalDetails([]);
    }
  };

  // Close modal
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedShipToData(null);
    setModalDetails([]);
  };

  // Filter item data based on supplier and ship-to filters
  const filterItemData = (items: any[], supplierFilter: string, shipToFilter: string) => {
    if (!items || items.length === 0) return [];
    
    return items.filter(item => {
      let matchesSupplier = true;
      let matchesShipTo = true;
      
      // Check supplier filter - use exact match
      if (supplierFilter && item.suppliers) {
        matchesSupplier = item.suppliers.some((supplier: string) => 
          supplier.trim() === supplierFilter.trim()
        );
      }
      
      // Check ship-to filter - use exact match
      if (shipToFilter && item.shipToLocations) {
        matchesShipTo = item.shipToLocations.some((shipTo: string) => 
          shipTo.trim() === shipToFilter.trim()
        );
      }
      
      return matchesSupplier && matchesShipTo;
    });
  };

  // Filter supplier data based on supplier and ship-to filters
  const filterSupplierData = (suppliers: any[], supplierFilter: string, shipToFilter: string) => {
    if (!suppliers || suppliers.length === 0) return [];
    
    return suppliers.filter(supplier => {
      let matchesSupplier = true;
      let matchesShipTo = true;
      
      // Check supplier filter - use exact match
      if (supplierFilter) {
        matchesSupplier = supplier.supplierName.trim() === supplierFilter.trim();
      }
      
      // For ship-to filter, we need to check if this supplier has any records with the selected ship-to
      // This would require a database query, but for now we'll implement a simple approach
      // TODO: Implement proper ship-to filtering for suppliers
      if (shipToFilter) {
        // For now, we'll show all suppliers when ship-to filter is applied
        // This could be enhanced with a proper database query
        matchesShipTo = true;
      }
      
      return matchesSupplier && matchesShipTo;
    });
  };

  // Update filtered data when filters change
  useEffect(() => {
    if (analysisData && analysisData.analysis.itemAnalysis) {
      const filtered = filterItemData(analysisData.analysis.itemAnalysis, itemSupplierFilter, itemShipToFilter);
      setFilteredItemData(filtered);
      
      // Debug logging
      if (itemShipToFilter) {
        console.log('Ship To Filter:', itemShipToFilter);
        console.log('Sample item shipToLocations:', analysisData.analysis.itemAnalysis[0]?.shipToLocations);
        console.log('Filtered results count:', filtered.length);
      }
    }
  }, [analysisData, itemSupplierFilter, itemShipToFilter]);

  // Update filtered supplier data when filters change
  useEffect(() => {
    if (analysisData && analysisData.analysis.supplierAnalysis) {
      const filtered = filterSupplierData(analysisData.analysis.supplierAnalysis, supplierAnalysisSupplierFilter, supplierAnalysisShipToFilter);
      setFilteredSupplierData(filtered);
    }
  }, [analysisData, supplierAnalysisSupplierFilter, supplierAnalysisShipToFilter]);


  // Handle truncation of non-Cardinal Health records
  const handleTruncateRecords = async () => {
    if (!confirm('Are you sure you want to permanently delete all non-Cardinal Health records? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/truncate-cardinal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        setSuccessMessage(result.message);
        // Reload analysis data after truncation
        await loadAnalysisData();
      } else {
        const error = await response.json();
        setError(error.error || 'Failed to truncate records');
      }
    } catch (error) {
      setError(`Truncation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Sorting functions
  const handleSupplierSort = (field: string) => {
    if (supplierSortField === field) {
      setSupplierSortDirection(supplierSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSupplierSortField(field);
      setSupplierSortDirection('asc');
    }
  };

  const handleShipToSort = (field: string) => {
    if (shipToSortField === field) {
      setShipToSortDirection(shipToSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setShipToSortField(field);
      setShipToSortDirection('asc');
    }
  };

  const handleItemSort = (field: string) => {
    if (itemSortField === field) {
      setItemSortDirection(itemSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setItemSortField(field);
      setItemSortDirection('asc');
    }
  };

  const getSortIcon = (field: string, currentField: string, direction: 'asc' | 'desc') => {
    if (currentField !== field) {
      return (
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return direction === 'asc' ? (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Check for existing data on page load
  useEffect(() => {
    const checkExistingData = async () => {
      try {
        const response = await fetch('/api/analysis');
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.analysis && data.analysis.uniqueCounts && data.analysis.uniqueCounts.totalRecords > 0) {
            console.log('Existing data found:', data.analysis.uniqueCounts.totalRecords, 'records');
            setAnalysisData(data);
            setCurrentStep('analysis-variables');
            setSuccessMessage(`Found existing data with ${data.analysis.uniqueCounts.totalRecords.toLocaleString()} records. Proceeding to analysis variables.`);
          }
        }
      } catch (error) {
        console.log('No existing data found or error checking:', error);
      }
    };
    
    checkExistingData();
  }, []);

  // Load analysis data when analysis step is shown
  useEffect(() => {
    if (currentStep === 'analysis' && !analysisData) {
      loadAnalysisData();
    }
  }, [currentStep, analysisData]);

  // Debug effect to monitor state changes
  useEffect(() => {
    console.log('ExcelFiles state updated:', excelFiles);
    const tablesWithFiles = Object.entries(excelFiles).filter(([key, files]) => files.length > 0);
    console.log('Tables with files:', tablesWithFiles.map(([key, files]) => `${key}: ${files.length} files`));
  }, [excelFiles]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const validateExcelFile = async (file: File): Promise<{ isValid: boolean; errors: string[]; warnings: string[]; sheetNames: string[]; tableMapping: { [sheetName: string]: string } }> => {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    console.log('Validating Excel file:', file.name, 'Size:', file.size, 'Type:', file.type);
    
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xlsb') && !file.name.toLowerCase().endsWith('.csv')) {
      errors.push('File must be an Excel (.xlsx or .xlsb) or CSV file');
      return { isValid: false, errors, warnings, sheetNames: [], tableMapping: {} };
    }

    try {
      const formData = new FormData();
      formData.append('action', 'validate_excel');
      formData.append('excelFile', file);

      console.log('Sending validation request for:', file.name);
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData
      });

      console.log('Validation response status:', response.status);
      const data = await response.json();
      console.log('Validation response data:', data);

      if (data.success) {
        return data.validationResult;
      } else {
        errors.push(data.error || 'Validation failed');
        return { isValid: false, errors, warnings, sheetNames: [], tableMapping: {} };
      }
    } catch (error) {
      console.error('Validation error:', error);
      errors.push(`Error validating file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { isValid: false, errors, warnings, sheetNames: [], tableMapping: {} };
    }
  };

  const handleFileSelect = async (file: File) => {
    console.log('handleFileSelect called for:', file.name);
    setError(null);
    setSuccessMessage(null);
    setIsValidating(true);

    try {
      const validation = await validateExcelFile(file);
      console.log('Validation result:', validation);
      
      if (validation.isValid) {
        console.log('File is valid, mapping tables:', validation.tableMapping);
        // Map the file to the appropriate table based on sheet names
        const tableMapping = validation.tableMapping;
        const mappedTables = Object.values(tableMapping);
        
        // Update the file state for all mapped tables using functional update
        let validTablesFound = 0;
        
        setExcelFiles(prevState => {
          console.log('Previous state:', prevState);
          const newFileState = { ...prevState };
          
          mappedTables.forEach(tableName => {
            // Check if this is a valid table name for our system
            const isValidTable = EXCEL_SHEETS.some(sheet => sheet.key === tableName);
            if (isValidTable) {
              // Add file to the array for this table (avoid duplicates)
              if (!newFileState[tableName].some(f => f.name === file.name)) {
                newFileState[tableName] = [...newFileState[tableName], file];
                validTablesFound++;
                console.log(`Added file ${file.name} to table ${tableName}`);
              } else {
                console.log(`File ${file.name} already exists in table ${tableName}`);
              }
            } else {
              console.log(`Table "${tableName}" is not a recognized table type`);
            }
          });
          
          console.log('New state:', newFileState);
          return newFileState;
        });
        // Clear validation errors for the mapped tables
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          mappedTables.forEach(tableName => {
            if (EXCEL_SHEETS.some(sheet => sheet.key === tableName)) {
              newErrors[tableName] = [];
            }
          });
          return newErrors;
        });

        // Show success message for valid tables
        if (validTablesFound > 0) {
          const message = `Successfully validated ${file.name} - mapped to ${validTablesFound} table(s)`;
          setSuccessMessage(message);
          console.log(`Successfully mapped ${validTablesFound} valid tables from file: ${file.name}`);
          // Clear success message after 5 seconds
          setTimeout(() => setSuccessMessage(null), 5000);
        }

        // Validation completed successfully
        console.log('Validation completed for file:', file.name);
      } else {
        console.log('File validation failed:', validation.errors);
        setValidationErrors(prev => ({
          ...prev,
          excel_file: validation.errors
        }));
        setError('Excel file validation failed');
      }
    } catch (error) {
      console.error('Error in handleFileSelect:', error);
      setError(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsValidating(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    console.log('Drop event triggered');
    const files = Array.from(e.dataTransfer.files);
    console.log('Files dropped:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
    
    const excelFiles = files.filter(file => 
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel.sheet.binary.macroEnabled.12' ||
      file.type === 'text/csv' ||
      file.name.endsWith('.xlsx') ||
      file.name.endsWith('.xlsb') ||
      file.name.endsWith('.csv')
    );
    
    console.log('Excel files filtered:', excelFiles.map(f => ({ name: f.name, type: f.type, size: f.size })));
    
    if (excelFiles.length !== files.length) {
      setError('Some files were not Excel (.xlsx or .xlsb) or CSV files and were ignored');
    } else {
      setError(null);
    }
    
    if (excelFiles.length === 0) {
      setError('No valid files found. Please ensure files are .xlsx, .xlsb, or .csv format.');
      return;
    }
    
    for (const file of excelFiles) {
      console.log('Processing file:', file.name);
      await handleFileSelect(file);
    }
  }, []);

  const removeFile = (tableName: string, fileName?: string) => {
    if (fileName) {
      // Remove specific file from the table
      setExcelFiles(prev => ({
        ...prev,
        [tableName]: prev[tableName].filter(f => f.name !== fileName)
      }));
    } else {
      // Remove all files from the table
      setExcelFiles(prev => ({ ...prev, [tableName]: [] }));
    }
    setValidationErrors(prev => ({ ...prev, [tableName]: [] }));
  };

  const handleUpload = async () => {
    // Check that all required files are present
    const requiredSheets = EXCEL_SHEETS.filter(sheet => !sheet.isOptional);
    const allRequiredFilesPresent = requiredSheets.every(sheet => excelFiles[sheet.key].length > 0);
    const noErrors = Object.values(validationErrors).every(errors => errors.length === 0);
    
    if (!allRequiredFilesPresent || !noErrors) {
      setError('Please ensure all required Excel files are uploaded and validated');
      return;
    }

    setIsUploading(true);
    setError(null);
    setCurrentStep('loading');

    try {
      // Get unique files from all tables
      const allFiles = Object.values(excelFiles).flat();
      const uniqueFiles = [...new Set(allFiles)];
      
      const formData = new FormData();
      formData.append('action', 'import_excel');
      
      if (uniqueFiles.length === 1) {
        formData.append('excelFile', uniqueFiles[0]);
      } else {
        formData.append('excelFiles_count', uniqueFiles.length.toString());
        uniqueFiles.forEach((file, index) => {
          formData.append(`excelFiles_${index}`, file);
        });
      }

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (data.success) {
        setImportResults(data.results);
        console.log('Import completed successfully:', data.results);
        setCurrentStep('analysis-variables');
        // Load analysis data
        await loadAnalysisData();
      } else {
        setError(data.error || 'Import failed');
      }
    } catch (error) {
      setError(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const loadAnalysisData = async () => {
    try {
      const response = await fetch('/api/analysis');
      if (response.ok) {
        const data = await response.json();
        console.log('Analysis API response:', data);
        setAnalysisData(data);
      }
    } catch (error) {
      console.error('Error loading analysis data:', error);
    }
  };

  const requiredSheets = EXCEL_SHEETS.filter(sheet => !sheet.isOptional);
  const allRequiredFilesPresent = requiredSheets.every(sheet => excelFiles[sheet.key].length > 0);
  const noErrors = Object.values(validationErrors).every(errors => errors.length === 0);
  const canUpload = allRequiredFilesPresent && noErrors;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">CCF Analysis</h1>
              <p className="text-gray-600 mt-1">Purchase Order Data Analysis System</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Navigation Steps */}
              <div className="flex items-center space-x-3">
                {/* Step 1: File Upload */}
                <button
                  onClick={() => setCurrentStep('upload')}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors text-sm ${
                    currentStep === 'upload'
                      ? 'bg-blue-100 text-blue-700 border border-blue-300'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    currentStep === 'upload'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    1
                  </div>
                  <span className="font-medium">Upload</span>
                </button>

                {/* Step 2: Data Loading */}
                <button
                  onClick={() => setCurrentStep('loading')}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors text-sm ${
                    currentStep === 'loading'
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    currentStep === 'loading'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    2
                  </div>
                  <span className="font-medium">Loading</span>
                </button>

                {/* Step 3: Analysis Variables */}
                <button
                  onClick={() => setCurrentStep('analysis-variables')}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors text-sm ${
                    currentStep === 'analysis-variables'
                      ? 'bg-cyan-100 text-cyan-700 border border-cyan-300'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    currentStep === 'analysis-variables'
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    3
                  </div>
                  <span className="font-medium">Analysis Variables</span>
                </button>

                {/* Step 4: Analysis */}
                <button
                  onClick={() => setCurrentStep('analysis')}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-lg transition-colors text-sm ${
                    currentStep === 'analysis'
                      ? 'bg-purple-100 text-purple-700 border border-purple-300'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    currentStep === 'analysis'
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}>
                    4
                  </div>
                  <span className="font-medium">Analysis</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Step 1: File Upload */}
          {currentStep === 'upload' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Step 1: Upload Excel Files</h2>
                <p className="text-gray-600">
                  Upload your Excel (.xlsx) files containing purchase order data. Multiple files can be uploaded and will be combined.
                </p>
              </div>

              {/* File Upload Area */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.multiple = true;
                  input.accept = '.xlsx,.xlsb,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.binary.macroEnabled.12,text/csv';
                  input.onchange = async (e) => {
                    const files = Array.from((e.target as HTMLInputElement).files || []);
                    const excelFiles = files.filter(file => 
                      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                      file.type === 'application/vnd.ms-excel.sheet.binary.macroEnabled.12' ||
                      file.type === 'text/csv' ||
                      file.name.endsWith('.xlsx') ||
                      file.name.endsWith('.xlsb') ||
                      file.name.endsWith('.csv')
                    );
                    
                    if (excelFiles.length !== files.length) {
                      setError('Some files were not Excel (.xlsx or .xlsb) or CSV files and were ignored');
                    } else {
                      setError(null);
                    }
                    
                    for (const file of excelFiles) {
                      await handleFileSelect(file);
                    }
                  };
                  input.click();
                }}
              >
                <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Upload Data Files
                </h3>
                <p className="text-gray-600 mb-4">
                  Drag and drop your Excel (.xlsx or .xlsb) or CSV files here, or click to select files
                </p>
                <p className="text-sm text-gray-500">
                  Each file should contain purchase order data with the required 37 fields
                </p>
              </div>

              {/* File Status */}
              <div className="space-y-4 mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Excel Files</h3>
                  <div className="text-sm text-gray-600">
                    {EXCEL_SHEETS.filter(sheet => excelFiles[sheet.key].length > 0).length} of {EXCEL_SHEETS.length} tables have files
                    {EXCEL_SHEETS.filter(sheet => excelFiles[sheet.key].length > 0).length > 0 && (
                      <span className="ml-2 text-green-600">
                        ({Object.values(excelFiles).flat().length} total files)
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  {EXCEL_SHEETS.map((sheetConfig) => {
                    const files = excelFiles[sheetConfig.key];
                    const errors = validationErrors[sheetConfig.key] || [];
                    const hasErrors = errors.length > 0;
                    const hasFiles = files.length > 0;

                    return (
                      <div
                        key={sheetConfig.key}
                        className={`p-4 rounded-lg border ${
                          hasErrors ? 'border-red-200 bg-red-50' :
                          hasFiles ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              {hasErrors ? (
                                <AlertCircle className="h-5 w-5 text-red-500" />
                              ) : hasFiles ? (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              ) : (
                                <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                              )}
                              <h4 className="font-medium text-gray-900">{sheetConfig.name}</h4>
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{sheetConfig.description}</p>
                            {hasFiles && (
                              <div className="text-sm text-gray-500 space-y-1">
                                {files.map((file, index) => (
                                  <div key={index} className="flex items-center justify-between">
                                    <span>{file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                                    <button
                                      onClick={() => removeFile(sheetConfig.key, file.name)}
                                      className="p-1 text-gray-400 hover:text-red-500 ml-2"
                                      title="Remove this file"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {hasErrors && (
                              <div className="mt-2">
                                {errors.map((error, index) => (
                                  <p key={index} className="text-sm text-red-600">• {error}</p>
                                ))}
                              </div>
                            )}
                          </div>
                          {hasFiles && (
                            <button
                              onClick={() => removeFile(sheetConfig.key)}
                              className="p-1 text-gray-400 hover:text-red-500"
                              title="Remove all files for this table"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Upload Button */}
              <div className="flex justify-center mt-6">
                <button
                  onClick={handleUpload}
                  disabled={!canUpload || isUploading || isValidating}
                  className={`px-6 py-3 rounded-md font-medium ${
                    canUpload && !isUploading && !isValidating
                      ? 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {isUploading ? 'Importing...' : isValidating ? 'Validating...' : 
                   allRequiredFilesPresent ? 'Import Excel Data' : 'Upload All Required Excel Files'}
                </button>
              </div>

              {/* Success Message Display */}
              {successMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg mt-4">
                  <div className="flex items-center text-green-800">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    <span className="text-sm">{successMessage}</span>
                  </div>
                </div>
              )}

              {/* Error Display */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg mt-4">
                  <div className="flex items-center text-red-800">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    <span className="text-sm">{error}</span>
                  </div>
                </div>
              )}

              {/* File Format Information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <h4 className="font-medium text-blue-900 mb-2">File Requirements</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Files must be in Excel (.xlsx or .xlsb) or CSV format</li>
                  <li>• Each file should contain purchase order data with 37 fields</li>
                  <li>• First row must contain column headers</li>
                  <li>• Multiple files can be uploaded and combined</li>
                  <li>• CSV files are recommended for large datasets (faster processing)</li>
                  <li>• Supports very large CSV files (150MB+) with optimized processing</li>
                  <li>• Data will be loaded into SQLite database for analysis</li>
                </ul>
              </div>
              
              {/* Go to Analysis Button */}
              <div className="flex justify-center mt-6">
                <button
        onClick={async () => {
          try {
            const response = await fetch('/api/analysis');
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.analysis && data.analysis.uniqueCounts && data.analysis.uniqueCounts.totalRecords > 0) {
                setAnalysisData(data);
                setCurrentStep('analysis');
                setSuccessMessage(`Found existing data with ${data.analysis.uniqueCounts.totalRecords.toLocaleString()} records.`);
              } else {
                setError('No existing data found. Please upload files first.');
              }
            } else {
              setError('Failed to check for existing data.');
            }
          } catch (error) {
            setError('Error checking for existing data.');
          }
        }}
                  className="px-6 py-3 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Go to Analysis (View Existing Data)
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Data Loading */}
          {currentStep === 'loading' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Step 2: Data Loading</h2>
                <p className="text-gray-600">
                  Loading your Excel data into the SQLite database for analysis.
                </p>
              </div>

              {/* Import Results */}
              {importResults.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Import Results:</h4>
                  <div className="space-y-1">
                    {importResults.map((result, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">{result.tableName}</span>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 text-xs rounded ${
                            result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {result.success ? 'Success' : 'Failed'}
                          </span>
                          {result.success && result.recordsImported > 0 && (
                            <span className="text-xs text-gray-500">
                              {result.recordsImported} records
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading Progress */}
              <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
                <div className="flex items-center justify-center space-x-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">Loading Data</h3>
                    <p className="text-sm text-gray-500">Processing your Excel files...</p>
                  </div>
                </div>
              </div>
              
              {/* Start Over Button for Loading Step */}
              <div className="flex justify-center mt-6">
                <button
                  onClick={async () => {
                    try {
                      // Clear the database
                      const response = await fetch('/api/import', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: 'action=clear_all'
                      });
                      
                      if (!response.ok) {
                        throw new Error('Failed to clear database');
                      }
                      
                      // Reset UI state
                      setCurrentStep('upload');
                      setExcelFiles({ purchase_orders: [] });
                      setImportResults([]);
                      setAnalysisData(null);
                      setError(null);
                      setSuccessMessage(null);
                      setValidationErrors({});
                      setIsValidating(false);
                      setIsUploading(false);
                      
                      console.log('Database cleared and application reset');
                      setSuccessMessage('Database cleared successfully. Ready to upload new files.');
                    } catch (error) {
                      console.error('Error clearing database:', error);
                      setError('Failed to clear database. Please try again.');
                    }
                  }}
                  className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {/* Analysis Variables Step */}
          {currentStep === 'analysis-variables' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Step 3: Analysis Variables</h2>
                <p className="text-gray-600">
                  Configure analysis parameters and filtering options.
                </p>
              </div>

              {/* Analysis Variables Content */}
              <div className="bg-white rounded-lg shadow-lg p-8">
                <h3 className="text-2xl font-semibold text-gray-900 mb-8">Analysis Variables</h3>
                
                {/* Cardinal Health Filter */}
                <div className="bg-blue-50 rounded-lg p-6 mb-6">
                  <div className="flex items-center">
                    <input 
                      type="checkbox" 
                      id="limit-cardinal-health-large" 
                      className="w-6 h-6 mr-4" 
                      checked={limitToCardinalHealth}
                      onChange={(e) => setLimitToCardinalHealth(e.target.checked)}
                    />
                    <label htmlFor="limit-cardinal-health-large" className="text-xl font-semibold text-blue-900">
                      Limit results to Cardinal Health
                    </label>
                  </div>
                  <p className="text-lg text-blue-700 mt-3 ml-10">
                    When enabled, all non-Cardinal Health records will be permanently removed from the database, keeping only suppliers with names starting with "Cardinal"
                  </p>
                  
                  {limitToCardinalHealth && (
                    <div className="mt-4 ml-10">
                      <button
                        onClick={handleTruncateRecords}
                        className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors inline-flex items-center text-lg font-medium"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        Truncate Non-Cardinal Health Records
                      </button>
                      <p className="text-sm text-red-600 mt-2">
                        ⚠️ This action will permanently delete all non-Cardinal Health records from the database.
                      </p>
                    </div>
                  )}
                </div>

                {/* Process Simulation Button */}
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => setCurrentStep('analysis')}
                    className="px-12 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors inline-flex items-center text-xl font-medium"
                  >
                    <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Process Simulation
                  </button>
                </div>

                <div className="mt-6 text-center">
                  <p className="text-lg text-gray-500">
                    Click "Process Simulation" to proceed to the analysis view with the current analysis variables.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Analysis */}
          {currentStep === 'analysis' && (
            <div>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Step 4: Analysis Results</h2>
                <p className="text-gray-600">
                  View analysis results and unique record counts for your purchase order data.
                </p>
              </div>

              {/* Analysis Results */}
              {analysisData && analysisData.analysis && (
                <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-gray-900">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Analysis Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{analysisData.analysis.uniqueCounts?.totalRecords?.toLocaleString() || '0'}</div>
                      <div className="text-sm text-gray-600">Total Records</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{analysisData.analysis.uniqueCounts?.uniqueEntities?.toLocaleString() || '0'}</div>
                      <div className="text-sm text-gray-600">Unique Entities</div>
                    </div>
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{analysisData.analysis.uniqueCounts?.uniqueSuppliers?.toLocaleString() || '0'}</div>
                      <div className="text-sm text-gray-600">Unique Suppliers</div>
                    </div>
                    <div className="text-center p-4 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{analysisData.analysis.uniqueCounts?.uniqueItems?.toLocaleString() || '0'}</div>
                      <div className="text-sm text-gray-600">Unique Items</div>
                    </div>
                    <div className="text-center p-4 bg-indigo-50 rounded-lg">
                      <div className="text-2xl font-bold text-indigo-600">{analysisData.analysis.uniqueCounts?.uniquePONumbers?.toLocaleString() || '0'}</div>
                      <div className="text-sm text-gray-600">Unique PO Numbers</div>
                    </div>
                    <div className="text-center p-4 bg-teal-50 rounded-lg">
                      <div className="text-2xl font-bold text-teal-600">{analysisData.analysis.uniqueCounts?.uniqueUNSPSC?.toLocaleString() || '0'}</div>
                      <div className="text-sm text-gray-600">Unique UNSPSC Codes</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Database Stats */}
              {analysisData && analysisData.analysis && analysisData.analysis.databaseStats && (
                <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Database Statistics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Database Size</div>
                      <div className="text-lg font-semibold">{analysisData.analysis.databaseStats.databaseSize}</div>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">Last Updated</div>
                      <div className="text-lg font-semibold">{new Date(analysisData.analysis.databaseStats.lastUpdated).toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Quality Analysis */}
              {analysisData && analysisData.analysis && analysisData.analysis.dataQuality && (
                <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Quality Analysis</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{analysisData.analysis.dataQuality.totalRecords.toLocaleString()}</div>
                      <div className="text-sm text-gray-600">Total Records</div>
                    </div>
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{analysisData.analysis.dataQuality.completeRecords.toLocaleString()}</div>
                      <div className="text-sm text-gray-600">Complete Records</div>
                    </div>
                    <div className="text-center p-4 bg-red-50 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{analysisData.analysis.dataQuality.incompleteRecords.toLocaleString()}</div>
                      <div className="text-sm text-gray-600">Incomplete Records</div>
                    </div>
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">{analysisData.analysis.dataQuality.incompletePercentage.toFixed(1)}%</div>
                      <div className="text-sm text-gray-600">Incomplete %</div>
                    </div>
                  </div>
                  
                  {/* Field Completeness */}
                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-gray-800 mb-3">Field Completeness</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(analysisData.analysis.dataQuality.fieldCompleteness).map(([field, percentage]) => (
                        <div key={field} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <span className="text-sm font-medium text-gray-700">{field.replace(/_/g, ' ')}</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${percentage >= 90 ? 'bg-green-500' : percentage >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                style={{ width: `${percentage}%` }}
                              ></div>
                            </div>
                            <span className="text-sm font-medium text-gray-600 w-12 text-right">{percentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed Analysis Buttons */}
              {analysisData && analysisData.analysis && (
                <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed Analysis</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    View detailed analysis with unique item counts and total records.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <button
                      onClick={() => setCurrentStep('supplier-details')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      View Supplier Analysis Details
                    </button>
                    <button
                      onClick={() => setCurrentStep('shipto-details')}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    >
                      View Ship To Analysis Details
                    </button>
                    <button
                      onClick={() => setCurrentStep('item-details')}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 inline-flex items-center"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      View Item Analysis
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mt-2">
                    Item Analysis: Analyze Oracle Item Numbers with Item Descriptions, showing total records and average daily values
                  </p>
                </div>
              )}


              {/* Reset Button */}
              <div className="flex justify-center mt-6">
                <button
                  onClick={async () => {
                    try {
                      // Clear the database
                      const response = await fetch('/api/import', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: 'action=clear_all'
                      });
                      
                      if (!response.ok) {
                        throw new Error('Failed to clear database');
                      }
                      
                      // Reset UI state
                      setCurrentStep('upload');
                      setExcelFiles({ purchase_orders: [] });
                      setImportResults([]);
                      setAnalysisData(null);
                      setError(null);
                      setSuccessMessage(null);
                      setValidationErrors({});
                      setIsValidating(false);
                      setIsUploading(false);
                      
                      console.log('Database cleared and application reset');
                      setSuccessMessage('Database cleared successfully. Ready to upload new files.');
                    } catch (error) {
                      console.error('Error clearing database:', error);
                      setError('Failed to clear database. Please try again.');
                    }
                  }}
                  className="px-6 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Supplier Details */}
          {currentStep === 'supplier-details' && (
            <div>
              {/* Back to Results Button */}
              <div className="mb-6 flex justify-start">
                <button
                  onClick={() => setCurrentStep('analysis')}
                  className="flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Results
                </button>
              </div>
              
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Supplier Analysis Details</h2>
                <p className="text-gray-600">
                  Detailed analysis of suppliers showing unique item counts and total records per supplier, sorted by unique items (descending).
                </p>
              </div>

              {/* Supplier Analysis Table */}
              {analysisData && analysisData.analysis && analysisData.analysis.supplierAnalysis && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Supplier Analysis</h3>
                  
                  {/* Filters */}
                  <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="supplier-filter" className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Supplier
                      </label>
                      <select
                        id="supplier-filter"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={supplierAnalysisSupplierFilter}
                        onChange={(e) => setSupplierAnalysisSupplierFilter(e.target.value)}
                      >
                        <option value="">All Suppliers</option>
                        {analysisData.analysis.supplierAnalysis
                          .sort((a: any, b: any) => a.supplierName.localeCompare(b.supplierName))
                          .map((supplier: any, index: number) => (
                            <option key={index} value={supplier.supplierName}>
                              {supplier.supplierName}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="shipto-filter" className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Ship To Location
                      </label>
                      <select
                        id="shipto-filter"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={supplierAnalysisShipToFilter}
                        onChange={(e) => setSupplierAnalysisShipToFilter(e.target.value)}
                      >
                        <option value="">All Ship To Locations</option>
                        {analysisData.analysis.shipToAnalysis
                          ?.sort((a: any, b: any) => a.shipToName.localeCompare(b.shipToName))
                          .map((shipTo: any, index: number) => (
                            <option key={index} value={shipTo.shipToName}>
                              {shipTo.shipToName}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleSupplierSort('supplierName')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Supplier Name</span>
                                {getSortIcon('supplierName', supplierSortField, supplierSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleSupplierSort('uniqueItemCount')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Unique Items</span>
                                {getSortIcon('uniqueItemCount', supplierSortField, supplierSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleSupplierSort('totalRecordCount')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Total Records</span>
                                {getSortIcon('totalRecordCount', supplierSortField, supplierSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleSupplierSort('averageDailyValue')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Avg Daily Value</span>
                                {getSortIcon('averageDailyValue', supplierSortField, supplierSortDirection)}
                              </div>
                            </th>
                          </tr>
                          {/* Subtotals Row */}
                          <tr className="bg-blue-50 border-t border-blue-200">
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              SUBTOTALS
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {calculateSubtotals(filteredSupplierData).totalUniqueItems.toLocaleString()}
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {calculateSubtotals(filteredSupplierData).totalRecords.toLocaleString()}
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {(calculateSubtotals(filteredSupplierData).totalAverageDaily || 0).toLocaleString()}
                            </td>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredSupplierData
                            .sort((a: any, b: any) => {
                              const field = supplierSortField;
                              const direction = supplierSortDirection;
                              let aVal = a[field] || 0;
                              let bVal = b[field] || 0;

                              // Handle string comparison
                              if (typeof aVal === 'string') {
                                aVal = aVal.toLowerCase();
                                bVal = bVal.toLowerCase();
                              }

                              if (direction === 'asc') {
                                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                              } else {
                                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                              }
                            })
                            .map((supplier: any, index: number) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {supplier.supplierName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {supplier.uniqueItemCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  {supplier.totalRecordCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {(supplier.averageDailyValue || 0).toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-gray-500">
                    Showing {filteredSupplierData.length} suppliers sorted by {supplierSortField} ({supplierSortDirection})
                    {supplierAnalysisSupplierFilter && (
                      <span className="ml-2 text-blue-600">• Filtered by Supplier: {supplierAnalysisSupplierFilter}</span>
                    )}
                    {supplierAnalysisShipToFilter && (
                      <span className="ml-2 text-green-600">• Filtered by Ship To: {supplierAnalysisShipToFilter}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Ship To Details */}
          {currentStep === 'shipto-details' && (
            <div>
              {/* Back to Results Button */}
              <div className="mb-6 flex justify-start">
                <button
                  onClick={() => setCurrentStep('analysis')}
                  className="flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Results
                </button>
              </div>
              
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Ship To Analysis Details</h2>
                <p className="text-gray-600">
                  Detailed analysis of ship to locations showing unique item counts and total records per ship to location, sorted by unique items (descending).
                </p>
              </div>

              {/* Ship To Analysis Table */}
              {analysisData && analysisData.analysis && analysisData.analysis.shipToAnalysis && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Ship To Analysis</h3>
                  
                  {/* Filters */}
                  <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="supplier-filter-shipto" className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Supplier
                      </label>
                      <select
                        id="supplier-filter-shipto"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        onChange={(e) => {
                          const selectedSupplier = e.target.value;
                          // Filter logic will be implemented
                        }}
                      >
                        <option value="">All Suppliers</option>
                        {analysisData.analysis.supplierAnalysis
                          ?.sort((a: any, b: any) => a.supplierName.localeCompare(b.supplierName))
                          .map((supplier: any, index: number) => (
                            <option key={index} value={supplier.supplierName}>
                              {supplier.supplierName}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="shipto-filter-shipto" className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Ship To Location
                      </label>
                      <select
                        id="shipto-filter-shipto"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        onChange={(e) => {
                          const selectedShipTo = e.target.value;
                          // Filter logic will be implemented
                        }}
                      >
                        <option value="">All Ship To Locations</option>
                        {analysisData.analysis.shipToAnalysis
                          .sort((a: any, b: any) => a.shipToName.localeCompare(b.shipToName))
                          .map((shipTo: any, index: number) => (
                            <option key={index} value={shipTo.shipToName}>
                              {shipTo.shipToName}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleShipToSort('shipToName')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Ship To Location</span>
                                {getSortIcon('shipToName', shipToSortField, shipToSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleShipToSort('uniqueItemCount')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Unique Items</span>
                                {getSortIcon('uniqueItemCount', shipToSortField, shipToSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleShipToSort('totalRecordCount')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Total Records</span>
                                {getSortIcon('totalRecordCount', shipToSortField, shipToSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleShipToSort('averageDailyValue')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Avg Daily Value</span>
                                {getSortIcon('averageDailyValue', shipToSortField, shipToSortDirection)}
                              </div>
                            </th>
                          </tr>
                          {/* Subtotals Row */}
                          <tr className="bg-blue-50 border-t border-blue-200">
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              SUBTOTALS
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {calculateSubtotals(analysisData.analysis.shipToAnalysis).totalUniqueItems.toLocaleString()}
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {calculateSubtotals(analysisData.analysis.shipToAnalysis).totalRecords.toLocaleString()}
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {(calculateSubtotals(analysisData.analysis.shipToAnalysis).totalAverageDaily || 0).toLocaleString()}
                            </td>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {analysisData.analysis.shipToAnalysis
                            .sort((a: any, b: any) => {
                              const field = shipToSortField;
                              const direction = shipToSortDirection;
                              let aVal = a[field] || 0;
                              let bVal = b[field] || 0;

                              // Handle string comparison
                              if (typeof aVal === 'string') {
                                aVal = aVal.toLowerCase();
                                bVal = bVal.toLowerCase();
                              }

                              if (direction === 'asc') {
                                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                              } else {
                                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                              }
                            })
                            .map((shipTo: any, index: number) => (
                            <tr 
                              key={index} 
                              className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} cursor-pointer hover:bg-blue-50 transition-colors`}
                              onClick={() => handleShipToRowClick(shipTo)}
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {shipTo.shipToName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {shipTo.uniqueItemCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  {shipTo.totalRecordCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {(shipTo.averageDailyValue || 0).toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-gray-500">
                    Showing {analysisData.analysis.shipToAnalysis.length} ship to locations sorted by unique item count (descending)
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Item Analysis Details */}
          {currentStep === 'item-details' && (
            <div>
              {/* Back to Results Button */}
              <div className="mb-6 flex justify-start">
                <button
                  onClick={() => setCurrentStep('analysis')}
                  className="flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to Results
                </button>
              </div>
              
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Item Analysis Details</h2>
                <p className="text-gray-600">
                  Detailed analysis of Oracle Item Numbers with Item Descriptions, showing total records and average daily values.
                </p>
              </div>

              {/* Item Analysis Table */}
              {analysisData && analysisData.analysis && analysisData.analysis.itemAnalysis && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Item Analysis</h3>
                  
                  {/* Filters */}
                  <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="item-supplier-filter" className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Supplier
                      </label>
                      <select
                        id="item-supplier-filter"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={itemSupplierFilter}
                        onChange={(e) => setItemSupplierFilter(e.target.value)}
                      >
                        <option value="">All Suppliers</option>
                        {analysisData.analysis.supplierAnalysis
                          .sort((a: any, b: any) => a.supplierName.localeCompare(b.supplierName))
                          .map((supplier: any, index: number) => (
                            <option key={index} value={supplier.supplierName}>
                              {supplier.supplierName}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="item-shipto-filter" className="block text-sm font-medium text-gray-700 mb-2">
                        Filter by Ship To Location
                      </label>
                      <select
                        id="item-shipto-filter"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        value={itemShipToFilter}
                        onChange={(e) => setItemShipToFilter(e.target.value)}
                      >
                        <option value="">All Ship To Locations</option>
                        {analysisData.analysis.shipToAnalysis
                          ?.sort((a: any, b: any) => a.shipToName.localeCompare(b.shipToName))
                          .map((shipTo: any, index: number) => (
                            <option key={index} value={shipTo.shipToName}>
                              {shipTo.shipToName}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-96 overflow-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleItemSort('oracleItemNumber')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Oracle Item Number</span>
                                {getSortIcon('oracleItemNumber', itemSortField, itemSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleItemSort('itemDescription')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Item Description</span>
                                {getSortIcon('itemDescription', itemSortField, itemSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleItemSort('totalRecordCount')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Total Records</span>
                                {getSortIcon('totalRecordCount', itemSortField, itemSortDirection)}
                              </div>
                            </th>
                            <th 
                              className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                              onClick={() => handleItemSort('averageDailyValue')}
                            >
                              <div className="flex items-center space-x-1">
                                <span>Avg Daily Value</span>
                                {getSortIcon('averageDailyValue', itemSortField, itemSortDirection)}
                              </div>
                            </th>
                          </tr>
                          {/* Subtotals Row */}
                          <tr className="bg-blue-50 border-t border-blue-200">
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              SUBTOTALS
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {filteredItemData.length} Items
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {calculateSubtotals(filteredItemData).totalRecords.toLocaleString()}
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {(calculateSubtotals(filteredItemData).totalAverageDaily || 0).toLocaleString()}
                            </td>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredItemData
                            .sort((a: any, b: any) => {
                              const field = itemSortField;
                              const direction = itemSortDirection;
                              let aVal = a[field] || 0;
                              let bVal = b[field] || 0;

                              // Handle string comparison
                              if (typeof aVal === 'string') {
                                aVal = aVal.toLowerCase();
                                bVal = bVal.toLowerCase();
                              }

                              if (direction === 'asc') {
                                return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                              } else {
                                return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
                              }
                            })
                            .map((item: any, index: number) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                  {item.oracleItemNumber}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={item.itemDescription}>
                                {item.itemDescription}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  {item.totalRecordCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {(item.averageDailyValue || 0).toLocaleString()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-gray-500">
                    Showing {filteredItemData.length} items sorted by {itemSortField} ({itemSortDirection})
                    {itemSupplierFilter && (
                      <span className="ml-2 text-blue-600">• Filtered by Supplier: {itemSupplierFilter}</span>
                    )}
                    {itemShipToFilter && (
                      <span className="ml-2 text-green-600">• Filtered by Ship To: {itemShipToFilter}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Ship To Location Details Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Ship To Location Details
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedShipToData?.shipToName}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="px-6 py-4 max-h-[calc(90vh-120px)] overflow-auto">
              {modalDetails.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-blue-900">Total Records</h4>
                      <p className="text-2xl font-bold text-blue-700">{selectedShipToData?.totalRecordCount?.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-green-900">Unique Items</h4>
                      <p className="text-2xl font-bold text-green-700">{selectedShipToData?.uniqueItemCount?.toLocaleString()}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-semibold text-purple-900">Avg Daily Value</h4>
                      <p className="text-2xl font-bold text-purple-700">{selectedShipToData?.averageDailyValue?.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                      <h4 className="font-semibold text-gray-900">Destination Locations</h4>
                      <p className="text-sm text-gray-600">Click on a row to see more details</p>
                    </div>
                    <div className="max-h-96 overflow-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Destination Location
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Records
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Unique Items
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Avg Daily Value
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Date Range
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {modalDetails.map((detail: any, index: number) => (
                            <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {detail.destinationLocationName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  {detail.recordCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {detail.uniqueItemCount.toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                  {(detail.averageDailyValue || 0).toLocaleString()}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {detail.startDate} to {detail.endDate}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-500">Loading destination location details...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
