import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/app/lib/database';

export async function GET() {
  try {
    const db = getDatabase();
    const variables = db.getAnalysisVariables();
    
    return NextResponse.json({ 
      success: true, 
      variables 
    });
  } catch (error) {
    console.error('Error getting variables:', error);
    return NextResponse.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { variables } = body;
    
    if (!variables || typeof variables !== 'object') {
      return NextResponse.json({ 
        success: false, 
        message: 'Invalid variables data' 
      }, { status: 400 });
    }
    
    const db = getDatabase();
    const result = db.saveAnalysisVariables(variables);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error saving variables:', error);
    return NextResponse.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
