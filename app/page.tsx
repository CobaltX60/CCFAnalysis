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
  const [currentStep, setCurrentStep] = useState<'upload' | 'loading' | 'analysis-variables' | 'analysis' | 'supplier-details' | 'shipto-details' | 'item-details' | 'transaction-volumes'>('upload');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  
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
  
  // Ship To Analysis state
  const [shipToAnalysisSupplierFilter, setShipToAnalysisSupplierFilter] = useState<string>('');
  const [shipToAnalysisShipToFilter, setShipToAnalysisShipToFilter] = useState<string>('');
  const [filteredShipToData, setFilteredShipToData] = useState<any[]>([]);
  
  // Transaction Volumes Analysis state
  const [transactionVolumesData, setTransactionVolumesData] = useState<any[]>([]);
  const [transactionVolumesSummary, setTransactionVolumesSummary] = useState<any>(null);
  const [isLoadingTransactionVolumes, setIsLoadingTransactionVolumes] = useState(false);
  const [isProcessingSimulation, setIsProcessingSimulation] = useState(false);
  
  // System Variables state
  const [limitToCardinalHealth, setLimitToCardinalHealth] = useState<boolean>(false);
  
  // Productivity Variables state
  const [productivityVariables, setProductivityVariables] = useState({
    targetStaffProductivityPerHour: 600,
    lumPicksPerHour: 80,
    bulkPicksPerHour: 40,
    receiptLinesProcessedPerHour: 15,
    putAwayLinesPerHour: 20,
    letDownLinesPerHour: 20,
    rfidLinesPerHour: 60,
    rfidLinesPerDay: 7400,
    ratioOfBulkPicksToLumPicks: 25,
    ratioOfReceiptLinesToPicks: 5,
    ratioOfPutLinesToPicks: 5,
    ratioOfReplenishLinesToPicks: 2,
    linesPerSupportResource: 1500
  });

  // Labor Variables state
  const [laborVariables, setLaborVariables] = useState({
    utilizationPercentage: 80,
    leadershipAndAdministrationStaff: 6,
    staffToSupervisorRatio: 10,
    laborHoursPerDay: 8
  });
  
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

  // Handle productivity variable updates
  const updateProductivityVariable = (key: string, value: number) => {
    setProductivityVariables(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updateLaborVariable = (key: string, value: number) => {
    setLaborVariables(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Calculate points per transaction
  const calculatePointsPerTransaction = () => {
    const { targetStaffProductivityPerHour } = productivityVariables;
    
    return {
      lumPoints: Math.round((targetStaffProductivityPerHour / productivityVariables.lumPicksPerHour) * 100) / 100,
      bulkPoints: Math.round((targetStaffProductivityPerHour / productivityVariables.bulkPicksPerHour) * 100) / 100,
      receiptPoints: Math.round((targetStaffProductivityPerHour / productivityVariables.receiptLinesProcessedPerHour) * 100) / 100,
      putAwayPoints: Math.round((targetStaffProductivityPerHour / productivityVariables.putAwayLinesPerHour) * 100) / 100,
      letDownPoints: Math.round((targetStaffProductivityPerHour / productivityVariables.letDownLinesPerHour) * 100) / 100,
      rfidPoints: Math.round((productivityVariables.targetStaffProductivityPerHour / productivityVariables.rfidLinesPerHour) * 100) / 100
    };
  };

  // Process simulation to generate labor statistics
  const processSimulation = async () => {
    setIsProcessingSimulation(true);
    
    // Debug: Log the variables being sent
    console.log('DEBUG: UI Variables being sent:');
    console.log('  productivityVariables:', productivityVariables);
    console.log('  laborVariables:', laborVariables);
    
    try {
      const response = await fetch('/api/process-simulation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productivityVariables: {
            ratioOfBulkPicksToLumPicks: productivityVariables.ratioOfBulkPicksToLumPicks,
            targetStaffProductivityPerHour: productivityVariables.targetStaffProductivityPerHour,
            bulkPicksPerHour: productivityVariables.bulkPicksPerHour,
            lumPicksPerHour: productivityVariables.lumPicksPerHour,
            ratioOfReplenishLinesToPicks: productivityVariables.ratioOfReplenishLinesToPicks,
            letDownLinesPerHour: productivityVariables.letDownLinesPerHour,
            ratioOfReceiptLinesToPicks: productivityVariables.ratioOfReceiptLinesToPicks,
            receiptLinesProcessedPerHour: productivityVariables.receiptLinesProcessedPerHour,
            ratioOfPutLinesToPicks: productivityVariables.ratioOfPutLinesToPicks,
            putAwayLinesPerHour: productivityVariables.putAwayLinesPerHour,
            laborHoursPerDay: laborVariables.laborHoursPerDay,
            utilizationPercentage: laborVariables.utilizationPercentage,
            linesPerSupportResource: productivityVariables.linesPerSupportResource,
            rfidLinesPerDay: productivityVariables.rfidLinesPerDay,
            rfidLinesPerHour: productivityVariables.rfidLinesPerHour
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert(`Process simulation completed successfully!\n\nProcessed ${result.data.processedDays} days with ${result.data.totalRecords} total records.`);
        // Reload transaction volumes data after simulation
        await loadTransactionVolumesData();
      } else {
        console.error('Process simulation failed:', result.error);
        alert(`Process simulation failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Error processing simulation:', error);
      alert(`Error processing simulation: ${error}`);
    } finally {
      setIsProcessingSimulation(false);
    }
  };

  // Load transaction volumes data
  const loadTransactionVolumesData = async () => {
    try {
      setIsLoadingTransactionVolumes(true);
      console.log('Loading transaction volumes data...');
      
      // Fetch transaction volumes data (no filters needed)
      const response = await fetch('/api/transaction-volumes');
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('Transaction volumes data received:', result.data.transactionData.length, 'records');
          setTransactionVolumesData(result.data.transactionData);
          setTransactionVolumesSummary(result.data.summary);
        } else {
          console.error('Error fetching transaction volumes data:', result.error);
          setTransactionVolumesData([]);
          setTransactionVolumesSummary(null);
        }
      } else {
        console.error('Failed to fetch transaction volumes data');
        setTransactionVolumesData([]);
        setTransactionVolumesSummary(null);
      }
    } catch (error) {
      console.error('Error loading transaction volumes data:', error);
      setTransactionVolumesData([]);
      setTransactionVolumesSummary(null);
    } finally {
      setIsLoadingTransactionVolumes(false);
    }
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
  const filterSupplierData = async (supplierFilter: string, shipToFilter: string) => {
    try {
      console.log('Filtering supplier data:', { supplierFilter, shipToFilter });
      
      // If no filters are applied, use the original data
      if (!supplierFilter && !shipToFilter) {
        console.log('No filters applied, using original data');
        if (analysisData && analysisData.analysis.supplierAnalysis) {
          setFilteredSupplierData(analysisData.analysis.supplierAnalysis);
        }
        return;
      }
      
      // Build query parameters
      const params = new URLSearchParams();
      if (supplierFilter) params.append('supplier', supplierFilter);
      if (shipToFilter) params.append('shipTo', shipToFilter);
      
      console.log('Fetching filtered data with params:', params.toString());
      
      // Fetch filtered data from the new API endpoint
      const response = await fetch(`/api/supplier-analysis-filtered?${params.toString()}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log('Filtered supplier data received:', result.data.length, 'records');
          setFilteredSupplierData(result.data);
        } else {
          console.error('Error fetching filtered supplier data:', result.error);
          setFilteredSupplierData([]);
        }
      } else {
        console.error('Failed to fetch filtered supplier data');
        setFilteredSupplierData([]);
      }
    } catch (error) {
      console.error('Error filtering supplier data:', error);
      setFilteredSupplierData([]);
    }
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
      filterSupplierData(supplierAnalysisSupplierFilter, supplierAnalysisShipToFilter);
    }
  }, [analysisData, supplierAnalysisSupplierFilter, supplierAnalysisShipToFilter]);

  // Initialize filtered supplier data when analysis data is first loaded
  useEffect(() => {
    if (analysisData && analysisData.analysis.supplierAnalysis && filteredSupplierData.length === 0) {
      setFilteredSupplierData(analysisData.analysis.supplierAnalysis);
    }
  }, [analysisData]);

  // Load transaction volumes data when analysis data is available
  useEffect(() => {
    if (analysisData && analysisData.analysis.supplierAnalysis) {
      loadTransactionVolumesData();
    }
  }, [analysisData]);

  // Filter ship to data based on supplier and ship-to filters
  const filterShipToData = (shipToData: any[], supplierFilter: string, shipToFilter: string) => {
    if (!shipToData || shipToData.length === 0) return [];
    
    return shipToData.filter(shipTo => {
      let matchesSupplier = true;
      let matchesShipTo = true;
      
      // Check ship-to filter - use exact match
      if (shipToFilter) {
        matchesShipTo = shipTo.shipToName.trim() === shipToFilter.trim();
      }
      
      // For supplier filter, we need to check if this ship-to has any records with the selected supplier
      // This would require a database query, but for now we'll implement a simple approach
      // TODO: Implement proper supplier filtering for ship-to locations
      if (supplierFilter) {
        // For now, we'll skip supplier filtering for ship-to analysis
        // This would require additional data structure or database queries
        matchesSupplier = true;
      }
      
      return matchesSupplier && matchesShipTo;
    });
  };

  // Update filtered ship to data when filters change
  useEffect(() => {
    if (analysisData && analysisData.analysis.shipToAnalysis) {
      const filtered = filterShipToData(analysisData.analysis.shipToAnalysis, shipToAnalysisSupplierFilter, shipToAnalysisShipToFilter);
      setFilteredShipToData(filtered);
    }
  }, [analysisData, shipToAnalysisSupplierFilter, shipToAnalysisShipToFilter]);

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
    console.log('useEffect triggered - currentStep:', currentStep, 'analysisData:', analysisData);
    if (currentStep === 'analysis') {
      console.log('Loading analysis data...');
      loadAnalysisData();
    }
  }, [currentStep]);

  // Debug effect to monitor state changes
  useEffect(() => {
    console.log('ExcelFiles state updated:', excelFiles);
    const tablesWithFiles = Object.entries(excelFiles).filter(([key, files]) => files.length > 0);
    console.log('Tables with files:', tablesWithFiles.map(([key, files]) => `${key}: ${files.length} files`));
  }, [excelFiles]);

  // Debug effect to monitor analysis data changes
  useEffect(() => {
    console.log('Analysis data state changed:', {
      hasAnalysisData: !!analysisData,
      hasAnalysis: !!analysisData?.analysis,
      hasUniqueCounts: !!analysisData?.analysis?.uniqueCounts,
      currentStep
    });
  }, [analysisData, currentStep]);

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
      console.log('Loading analysis data...');
      setIsLoadingAnalysis(true);
      setError(null); // Clear any previous errors
      
      const response = await fetch('/api/analysis', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Increase timeout for large datasets
        signal: AbortSignal.timeout(300000) // 5 minute timeout
      });
      
      console.log('Analysis API response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Analysis API response:', data);
        console.log('Analysis data structure:', {
          hasAnalysis: !!data.analysis,
          hasUniqueCounts: !!data.analysis?.uniqueCounts,
          keys: Object.keys(data),
          analysisKeys: data.analysis ? Object.keys(data.analysis) : null
        });
        console.log('Setting analysis data:', data);
        setAnalysisData(data);
        setSuccessMessage('Analysis data loaded successfully');
      } else {
        console.error('Analysis API error:', response.status, response.statusText);
        const errorData = await response.text();
        console.error('Error response:', errorData);
        setError(`Failed to load analysis data: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error loading analysis data:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message, error.stack);
        if (error.message.includes('signal timed out')) {
          setError('Analysis timed out. The dataset is very large (3.8M+ records). Please try again or contact support.');
        } else {
          setError(`Error loading analysis data: ${error.message}`);
        }
      }
    } finally {
      setIsLoadingAnalysis(false);
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
                
                {/* Productivity Variables */}
                <div className="bg-green-50 rounded-lg p-6 mb-6">
                  <h4 className="text-xl font-semibold text-green-900 mb-6">Productivity Variables</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Target Staff Productivity Per Hour */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Target Staff Productivity Per Hour
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.targetStaffProductivityPerHour}
                        onChange={(e) => updateProductivityVariable('targetStaffProductivityPerHour', parseInt(e.target.value) || 600)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        Enter the number of universal productivity points which represent a fully engaged staff member per hour - default = 600 points
                      </p>
                    </div>

                    {/* LUM Picks Per Hour */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        LUM Picks Per Hour
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.lumPicksPerHour}
                        onChange={(e) => updateProductivityVariable('lumPicksPerHour', parseInt(e.target.value) || 80)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        Enter the number of each lines picked per hour target - default = 80 lines
                      </p>
                    </div>

                    {/* BULK Picks Per Hour */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        BULK Picks Per Hour
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.bulkPicksPerHour}
                        onChange={(e) => updateProductivityVariable('bulkPicksPerHour', parseInt(e.target.value) || 40)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        Enter the number of bulk lines picked per hour target - default = 40 lines
                      </p>
                    </div>

                    {/* Receipt Lines Processed Per Hour */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Receipt Lines Processed Per Hour
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.receiptLinesProcessedPerHour}
                        onChange={(e) => updateProductivityVariable('receiptLinesProcessedPerHour', parseInt(e.target.value) || 15)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        Enter the number of Receipt Lines unpackaged, counted, received, and staged per hour - default = 15 lines
                      </p>
                    </div>

                    {/* Put Away Lines Per Hour */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Put Away Lines Per Hour
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.putAwayLinesPerHour}
                        onChange={(e) => updateProductivityVariable('putAwayLinesPerHour', parseInt(e.target.value) || 20)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        Enter the number of line target for put away per hour, default value = 20
                      </p>
                    </div>

                    {/* Let Down Lines Per Hour */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Let Down Lines Per Hour
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.letDownLinesPerHour}
                        onChange={(e) => updateProductivityVariable('letDownLinesPerHour', parseInt(e.target.value) || 20)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        Enter the number of replenishment lines completed per hour, default value = 20
                      </p>
                    </div>

                    {/* RFID Capture Lines Per Hour */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        RFID Lines Per Hour
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.rfidLinesPerHour}
                        onChange={(e) => updateProductivityVariable('rfidLinesPerHour', parseInt(e.target.value) || 60)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        Number of RFID tags which can be registered per hour, default value = 60
                      </p>
                    </div>


                    {/* RFID Lines Per Day */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        RFID Lines Per Day
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.rfidLinesPerDay}
                        onChange={(e) => updateProductivityVariable('rfidLinesPerDay', parseInt(e.target.value) || 7400)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        Enter the number of RFID Lines expected for Scan and Capture per day - estimate = 7400
                      </p>
                    </div>

                    {/* Ratio of Bulk Picks to LUM Picks */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Ratio of Bulk Picks to LUM Picks - %
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.ratioOfBulkPicksToLumPicks}
                        onChange={(e) => updateProductivityVariable('ratioOfBulkPicksToLumPicks', parseInt(e.target.value) || 25)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="0"
                        max="100"
                      />
                      <p className="text-xs text-gray-600">
                        Enter percentage of picks bulk picked from pallets vs each LUM pick - default value = 25%
                      </p>
                    </div>

                    {/* Ratio of Receipt Lines to Picks */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Ratio of Receipt Lines to Picks - %
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.ratioOfReceiptLinesToPicks}
                        onChange={(e) => updateProductivityVariable('ratioOfReceiptLinesToPicks', parseInt(e.target.value) || 5)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="0"
                        max="100"
                      />
                      <p className="text-xs text-gray-600">
                        Enter percentage of receipt lines to pick lines - default value = 5%
                      </p>
                    </div>

                    {/* Ratio of Put Lines to Picks */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Ratio of Put Lines to Picks - %
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.ratioOfPutLinesToPicks}
                        onChange={(e) => updateProductivityVariable('ratioOfPutLinesToPicks', parseInt(e.target.value) || 5)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="0"
                        max="100"
                      />
                      <p className="text-xs text-gray-600">
                        Enter percentage of Put lines to pick lines - default value = 5%
                      </p>
                    </div>

                    {/* Ratio of Replenish Lines to Picks */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Ratio of Replenish Lines to Picks - %
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.ratioOfReplenishLinesToPicks}
                        onChange={(e) => updateProductivityVariable('ratioOfReplenishLinesToPicks', parseInt(e.target.value) || 2)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="0"
                        max="100"
                      />
                      <p className="text-xs text-gray-600">
                        Enter percentage letdown lines to pick lines - default value = 2%
                      </p>
                    </div>

                    {/* Lines Per Support Resource */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Lines Per Support Resource
                      </label>
                      <input
                        type="number"
                        value={productivityVariables.linesPerSupportResource}
                        onChange={(e) => updateProductivityVariable('linesPerSupportResource', parseInt(e.target.value) || 1500)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                        min="1"
                      />
                      <p className="text-xs text-gray-600">
                        One Consolidator, Loader, Inductor support resource per identified number of lines - default = 1500
                      </p>
                    </div>
                  </div>
                </div>

                {/* Labor Variables */}
                <div className="bg-blue-50 rounded-lg p-6 mb-6">
                  <h4 className="text-xl font-semibold text-blue-900 mb-6">Labor Variables</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Utilization Percentage */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Utilization Percentage - %
                      </label>
                      <input
                        type="number"
                        value={laborVariables.utilizationPercentage}
                        onChange={(e) => updateLaborVariable('utilizationPercentage', parseInt(e.target.value) || 80)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                        max="100"
                      />
                      <p className="text-xs text-gray-600">
                        Enter percentage of productive target time per FTE (Huddles, Breaks, Lunch) - default = 80%
                      </p>
                    </div>

                    {/* Leadership and Administration Staff */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Leadership and Administration Staff
                      </label>
                      <input
                        type="number"
                        value={laborVariables.leadershipAndAdministrationStaff}
                        onChange={(e) => updateLaborVariable('leadershipAndAdministrationStaff', parseInt(e.target.value) || 6)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        min="0"
                      />
                      <p className="text-xs text-gray-600">
                        Enter Number of leadership, Directors, Managers, Inventory Analysis, Educators - Default = 6
                      </p>
                    </div>

        {/* Staff to Supervisor Ratio */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Staff to Supervisor Ratio
          </label>
          <input
            type="number"
            value={laborVariables.staffToSupervisorRatio}
            onChange={(e) => updateLaborVariable('staffToSupervisorRatio', parseInt(e.target.value) || 10)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
          />
          <p className="text-xs text-gray-600">
            Enter number of staff per supervisor - default = 10
          </p>
        </div>

        {/* Labor Hours Per Day */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Labor Hours Per Day
          </label>
          <input
            type="number"
            value={laborVariables.laborHoursPerDay}
            onChange={(e) => updateLaborVariable('laborHoursPerDay', parseInt(e.target.value) || 8)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            min="1"
            max="24"
          />
          <p className="text-xs text-gray-600">
            Number of hours staff work per day - default = 8
          </p>
        </div>
      </div>
    </div>

                {/* Points Per Transaction Table */}
                <div className="bg-yellow-50 rounded-lg p-6 mb-6">
                  <h4 className="text-xl font-semibold text-yellow-900 mb-6">Points Per Transaction</h4>
                  <p className="text-sm text-yellow-700 mb-4">
                    Calculated points for each transaction type based on your productivity variables.
                  </p>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-yellow-200 rounded-lg">
                      <thead className="bg-yellow-100">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-yellow-900 border-b border-yellow-200">
                            Transaction Type
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-yellow-900 border-b border-yellow-200">
                            Points Per Transaction
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-yellow-900 border-b border-yellow-200">
                            Calculation
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-yellow-200">
                        <tr className="hover:bg-yellow-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            LUM Picks
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                            {calculatePointsPerTransaction().lumPoints}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {productivityVariables.targetStaffProductivityPerHour} ÷ {productivityVariables.lumPicksPerHour}
                          </td>
                        </tr>
                        <tr className="hover:bg-yellow-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            BULK Picks
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                            {calculatePointsPerTransaction().bulkPoints}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {productivityVariables.targetStaffProductivityPerHour} ÷ {productivityVariables.bulkPicksPerHour}
                          </td>
                        </tr>
                        <tr className="hover:bg-yellow-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            Receipt Lines
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                            {calculatePointsPerTransaction().receiptPoints}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {productivityVariables.targetStaffProductivityPerHour} ÷ {productivityVariables.receiptLinesProcessedPerHour}
                          </td>
                        </tr>
                        <tr className="hover:bg-yellow-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            Put Away Lines
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                            {calculatePointsPerTransaction().putAwayPoints}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {productivityVariables.targetStaffProductivityPerHour} ÷ {productivityVariables.putAwayLinesPerHour}
                          </td>
                        </tr>
                        <tr className="hover:bg-yellow-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            Let Down Lines
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                            {calculatePointsPerTransaction().letDownPoints}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {productivityVariables.targetStaffProductivityPerHour} ÷ {productivityVariables.letDownLinesPerHour}
                          </td>
                        </tr>
                        <tr className="hover:bg-yellow-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            RFID Capture
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 font-mono">
                            {calculatePointsPerTransaction().rfidPoints}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {productivityVariables.targetStaffProductivityPerHour} ÷ {productivityVariables.rfidLinesPerHour}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-4 p-3 bg-yellow-100 rounded-md">
                    <p className="text-sm text-yellow-800">
                      <strong>Formula:</strong> Points per transaction = Target Staff Productivity Per Hour ÷ Transaction Rate Per Hour
                    </p>
                    <p className="text-xs text-yellow-700 mt-1">
                      These values represent the productivity points earned for each transaction type based on your configured rates.
                    </p>
                  </div>
                </div>
                
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
                <div className="mt-2 text-sm text-gray-500">
                  Current Step: {currentStep} | Analysis Data: {analysisData ? 'Loaded' : 'Not Loaded'}
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={loadAnalysisData}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Load Analysis Data
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        setAnalysisData(null);
                        setError(null);
                        setSuccessMessage(null);
                        await loadAnalysisData();
                      } catch (error) {
                        console.error('Error reloading data:', error);
                      }
                    }}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Clear & Reload
                  </button>
                </div>
              </div>


              {/* Error State */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">Error loading analysis data</h3>
                      <div className="mt-2 text-sm text-red-700">
                        <p>{error}</p>
                      </div>
                      <div className="mt-4">
                        <button
                          onClick={loadAnalysisData}
                          className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
                        >
                          Try Again
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}


              {/* Analysis Results - Simple Display */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Analysis Results</h3>
                  <button
                    onClick={loadAnalysisData}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    Reload Data
                  </button>
                </div>
                
                {/* Simple status display */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">
                    Status: {analysisData ? 'Data Loaded' : 'No Data'} | 
                    Step: {currentStep}
                  </p>
                </div>

                {/* Analysis Results Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {analysisData?.analysis?.uniqueCounts?.totalRecords?.toLocaleString() || 
                       analysisData?.analysis?.databaseStats?.totalRecords?.toLocaleString() || 
                       '0'}
                    </div>
                    <div className="text-sm text-gray-600">Total Records</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {analysisData?.analysis?.uniqueCounts?.uniqueEntities?.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-gray-600">Unique Entities</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">
                      {analysisData?.analysis?.uniqueCounts?.uniqueSuppliers?.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-gray-600">Unique Suppliers</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">
                      {analysisData?.analysis?.uniqueCounts?.uniqueItems?.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-gray-600">Unique Items</div>
                  </div>
                  <div className="text-center p-4 bg-indigo-50 rounded-lg">
                    <div className="text-2xl font-bold text-indigo-600">
                      {analysisData?.analysis?.uniqueCounts?.uniquePONumbers?.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-gray-600">Unique PO Numbers</div>
                  </div>
                  <div className="text-center p-4 bg-teal-50 rounded-lg">
                    <div className="text-2xl font-bold text-teal-600">
                      {analysisData?.analysis?.uniqueCounts?.uniqueUNSPSC?.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-gray-600">Unique UNSPSC Codes</div>
                  </div>
                  <div className="text-center p-4 bg-cyan-50 rounded-lg">
                    <div className="text-2xl font-bold text-cyan-600">
                      {analysisData?.analysis?.uniqueCounts?.uniqueShipToLocations?.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-gray-600">Ship To Locations</div>
                  </div>
                  <div className="text-center p-4 bg-pink-50 rounded-lg">
                    <div className="text-2xl font-bold text-pink-600">
                      {analysisData?.analysis?.uniqueCounts?.uniqueDestinationLocations?.toLocaleString() || '0'}
                    </div>
                    <div className="text-sm text-gray-600">Destination Locations</div>
                  </div>
                </div>

                {/* Show data if available */}
                {analysisData && (
                  <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-semibold text-green-800 mb-2">Data Successfully Loaded</h4>
                    <p className="text-sm text-green-700">
                      Analysis data is available with {analysisData.analysis?.uniqueCounts?.totalRecords || 0} total records.
                    </p>
                  </div>
                )}
              </div>



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
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    >
                      View Item Analysis
                    </button>
                    <button
                      onClick={() => window.open('/database-stats', '_blank')}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 inline-flex items-center"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                      </svg>
                      View Database Statistics
                    </button>
                    <button
                      onClick={() => setCurrentStep('transaction-volumes')}
                      className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 inline-flex items-center"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      View Transaction Volumes
                    </button>
                    <button
                      onClick={() => setCurrentStep('labor-analysis')}
                      className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 inline-flex items-center"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                      </svg>
                      View Labor Analysis
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
                        value={shipToAnalysisSupplierFilter}
                        onChange={(e) => setShipToAnalysisSupplierFilter(e.target.value)}
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
                        value={shipToAnalysisShipToFilter}
                        onChange={(e) => setShipToAnalysisShipToFilter(e.target.value)}
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
                              {calculateSubtotals(filteredShipToData).totalUniqueItems.toLocaleString()}
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {calculateSubtotals(filteredShipToData).totalRecords.toLocaleString()}
                            </td>
                            <td className="px-6 py-2 text-sm font-semibold text-blue-800">
                              {(calculateSubtotals(filteredShipToData).totalAverageDaily || 0).toLocaleString()}
                            </td>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                          {filteredShipToData
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
                    Showing {filteredShipToData.length} ship to locations sorted by unique item count (descending)
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

          {/* Transaction Volumes Analysis Details */}
          {currentStep === 'transaction-volumes' && (
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
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Transaction Volumes Analysis</h2>
                <p className="text-gray-600">
                  Analyze transaction volumes by date with detailed filtering and comprehensive summary statistics.
                </p>
              </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Volumes Analysis</h3>
          
          {/* Process Simulation Button */}
          <div className="mb-6">
            <button
              onClick={processSimulation}
              disabled={isProcessingSimulation}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
            >
              {isProcessingSimulation ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Process Simulation
                </>
              )}
            </button>
            <p className="text-sm text-gray-600 mt-2">
              Generate daily labor statistics from the purchase orders data. This creates a summary table for faster analysis.
            </p>
          </div>

                {/* Summary Statistics */}
                {transactionVolumesSummary && (
                  <div className="bg-blue-50 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-blue-900 mb-4">Summary Statistics</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">{transactionVolumesSummary.totalDays}</div>
                        <div className="text-sm text-gray-600">Total Days</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">{(transactionVolumesSummary.totalTransactionLines || 0).toLocaleString()}</div>
                        <div className="text-sm text-gray-600">Total Transaction Lines</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">{transactionVolumesSummary.averageLinesPerDay}</div>
                        <div className="text-sm text-gray-600">Avg Lines Per Day</div>
                      </div>
                <div className="bg-white rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">{(transactionVolumesSummary.totalQuantityPicked || 0).toLocaleString()}</div>
                  <div className="text-sm text-gray-600">Total Quantity Picked</div>
                </div>
                    </div>
                    
                    {/* Weekday/Weekend Averages */}
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-xl font-bold text-green-600">{transactionVolumesSummary.averageLinesPerWeekday}</div>
                        <div className="text-sm text-gray-600">Avg Lines Per Weekday</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-xl font-bold text-orange-600">{transactionVolumesSummary.averageLinesPerWeekend}</div>
                        <div className="text-sm text-gray-600">Avg Lines Per Weekend</div>
                      </div>
                    </div>

                    {/* Average Points per Weekday/Weekend */}
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-xl font-bold text-green-600">{Math.round(transactionVolumesSummary.averagePointsPerWeekday || 0).toLocaleString()}</div>
                        <div className="text-sm text-gray-600">Avg Points Per Weekday</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-xl font-bold text-orange-600">{Math.round(transactionVolumesSummary.averagePointsPerWeekend || 0).toLocaleString()}</div>
                        <div className="text-sm text-gray-600">Avg Points Per Weekend</div>
                      </div>
                    </div>

                    {/* Day of Week Averages */}
                    <div className="mt-4">
                      <h5 className="text-md font-semibold text-blue-900 mb-3">Average Lines by Day of Week</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(transactionVolumesSummary.dayOfWeekAverages).map(([day, average]) => (
                          <div key={day} className="bg-white rounded-lg p-3 text-center">
                            <div className="text-lg font-bold text-blue-600">{average}</div>
                            <div className="text-xs text-gray-600">{day}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Transaction Volumes Table */}
                {isLoadingTransactionVolumes ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading transaction volumes...</p>
                  </div>
                ) : transactionVolumesData.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                            Transaction Lines
                          </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      Quantity Picked
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      Bulk Points
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      LUM Points
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      Replen Points
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      Receive Points
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      Put Points
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      Total Points
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactionVolumesData.map((row, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(row.date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(row.transactionLines || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(row.quantityPicked || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Math.round(row.bulkPoints || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Math.round(row.lumPoints || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Math.round(row.replenPoints || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Math.round(row.receivePoints || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {Math.round(row.putPoints || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                        {Math.round(row.totalPoints || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No transaction volumes data available. Please apply filters or ensure data is loaded.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Labor Analysis Details */}
          {currentStep === 'labor-analysis' && (
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
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Labor Analysis</h2>
                <p className="text-gray-600">
                  Analyze labor productivity and workforce requirements based on transaction volumes and productivity variables.
                </p>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Labor Analysis</h3>
                
                {/* Process Simulation Button */}
                <div className="mb-6">
                  <button
                    onClick={processSimulation}
                    disabled={isProcessingSimulation}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                  >
                    {isProcessingSimulation ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Process Simulation
                      </>
                    )}
                  </button>
                  <p className="text-sm text-gray-600 mt-2">
                    Generate daily labor statistics from the purchase orders data. This creates a summary table for faster analysis.
                  </p>
                </div>

                {/* Summary Statistics */}
                {transactionVolumesSummary && (
                  <div className="bg-blue-50 rounded-lg p-6 mb-6">
                    <h4 className="text-lg font-semibold text-blue-900 mb-4">Summary Statistics</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">{transactionVolumesSummary.totalDays}</div>
                        <div className="text-sm text-gray-600">Total Days</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">{(transactionVolumesSummary.totalTransactionLines || 0).toLocaleString()}</div>
                        <div className="text-sm text-gray-600">Total Transaction Lines</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">{transactionVolumesSummary.averageLinesPerDay}</div>
                        <div className="text-sm text-gray-600">Avg Lines Per Day</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-2xl font-bold text-blue-600">{(transactionVolumesSummary.totalQuantityPicked || 0).toLocaleString()}</div>
                        <div className="text-sm text-gray-600">Total Quantity Picked</div>
                      </div>
                    </div>
                    
                    {/* Weekday/Weekend Averages */}
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-xl font-bold text-green-600">{transactionVolumesSummary.averageLinesPerWeekday}</div>
                        <div className="text-sm text-gray-600">Avg Lines Per Weekday</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-xl font-bold text-orange-600">{transactionVolumesSummary.averageLinesPerWeekend}</div>
                        <div className="text-sm text-gray-600">Avg Lines Per Weekend</div>
                      </div>
                    </div>

                    {/* Average Points per Weekday/Weekend */}
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-xl font-bold text-green-600">{Math.round(transactionVolumesSummary.averagePointsPerWeekday || 0).toLocaleString()}</div>
                        <div className="text-sm text-gray-600">Avg Points Per Weekday</div>
                      </div>
                      <div className="bg-white rounded-lg p-4">
                        <div className="text-xl font-bold text-orange-600">{Math.round(transactionVolumesSummary.averagePointsPerWeekend || 0).toLocaleString()}</div>
                        <div className="text-sm text-gray-600">Avg Points Per Weekend</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Labor Analysis Table - Placeholder for now */}
                {isLoadingTransactionVolumes ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-gray-600">Loading labor analysis...</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg p-6">
                    <h4 className="text-lg font-semibold text-gray-900 mb-4">Labor Analysis Table</h4>
                    <p className="text-gray-600">Labor analysis table will be implemented here with different columns than the Transaction Volumes table.</p>
                  </div>
                )}
              </div>
            </div>
          )}

    </div>
  );
}
