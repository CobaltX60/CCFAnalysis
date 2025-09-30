'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Database, AlertCircle, CheckCircle, BarChart3 } from 'lucide-react';

export default function DatabaseStatsPage() {
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalysisData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/analysis', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(60000) // 60 second timeout
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.analysis) {
            setAnalysisData(data);
          } else {
            setError('Failed to load analysis data');
          }
        } else {
          setError('Failed to load analysis data');
        }
      } catch (error) {
        console.error('Error loading analysis data:', error);
        setError('Error loading analysis data');
      } finally {
        setLoading(false);
      }
    };

    loadAnalysisData();
  }, []);

  const handleBackToAnalysis = () => {
    window.history.back();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading database statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600">{error}</p>
          <button
            onClick={handleBackToAnalysis}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Back to Analysis
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <button
                onClick={handleBackToAnalysis}
                className="flex items-center text-gray-600 hover:text-gray-900 mr-4"
              >
                <ArrowLeft className="h-5 w-5 mr-2" />
                Back to Analysis
              </button>
              <div className="flex items-center">
                <Database className="h-8 w-8 text-blue-600 mr-3" />
                <h1 className="text-2xl font-bold text-gray-900">Database Statistics</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {analysisData && analysisData.analysis && (
          <>
            {/* Database Statistics */}
            {analysisData.analysis.databaseStats && (
              <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                <div className="flex items-center mb-4">
                  <Database className="h-6 w-6 text-blue-600 mr-2" />
                  <h2 className="text-xl font-semibold text-gray-900">Database Statistics</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-sm text-gray-600">Total Records</div>
                    <div className="text-2xl font-bold text-blue-600">
                      {analysisData.analysis.databaseStats.totalRecords.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="text-sm text-gray-600">Database Size</div>
                    <div className="text-lg font-semibold text-green-600">
                      {analysisData.analysis.databaseStats.databaseSize}
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="text-sm text-gray-600">Last Updated</div>
                    <div className="text-lg font-semibold text-purple-600">
                      {new Date(analysisData.analysis.databaseStats.lastUpdated).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg">
                    <div className="text-sm text-gray-600">Tables</div>
                    <div className="text-lg font-semibold text-orange-600">
                      {Object.keys(analysisData.analysis.databaseStats.tableCounts).length}
                    </div>
                  </div>
                </div>
                
                {/* Table Counts */}
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Table Record Counts</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(analysisData.analysis.databaseStats.tableCounts).map(([table, count]) => (
                      <div key={table} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-sm font-medium text-gray-700">{table.replace(/_/g, ' ')}</span>
                        <span className="text-lg font-semibold text-gray-900">{count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Data Quality Analysis */}
            {analysisData.analysis.dataQuality && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-center mb-4">
                  <BarChart3 className="h-6 w-6 text-green-600 mr-2" />
                  <h2 className="text-xl font-semibold text-gray-900">Data Quality Analysis</h2>
                </div>
                
                {/* Quality Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {analysisData.analysis.dataQuality.totalRecords.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Total Records</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {analysisData.analysis.dataQuality.completeRecords.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Complete Records</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {analysisData.analysis.dataQuality.incompleteRecords.toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-600">Incomplete Records</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">
                      {analysisData.analysis.dataQuality.incompletePercentage.toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-600">Incomplete %</div>
                  </div>
                </div>
                
                {/* Field Completeness */}
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Field Completeness</h3>
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

                {/* Quality Summary */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Quality Summary</h3>
                  <div className="flex items-center">
                    {analysisData.analysis.dataQuality.incompletePercentage < 10 ? (
                      <CheckCircle className="h-6 w-6 text-green-500 mr-2" />
                    ) : (
                      <AlertCircle className="h-6 w-6 text-yellow-500 mr-2" />
                    )}
                    <span className="text-sm text-gray-700">
                      {analysisData.analysis.dataQuality.incompletePercentage < 10 
                        ? 'Data quality is excellent with less than 10% incomplete records.'
                        : `Data quality needs attention with ${analysisData.analysis.dataQuality.incompletePercentage.toFixed(1)}% incomplete records.`
                      }
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
