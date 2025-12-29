import { NextRequest, NextResponse } from 'next/server';
import { promptExecutionService } from '@/app/lib/services/prompt-execution.service';

// Execute prompts for a business
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, promptId 
   } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    if (promptId) {
      // Execute single prompt - don't await, let it run in background
      promptExecutionService.executeSinglePrompt(businessId, promptId).catch(error => {
        console.error('Error executing single prompt:', error);
      });

      return NextResponse.json({
        success: true,
        message: `Started execution for prompt ${promptId}`
      });
    } else {
      // Execute all prompts - don't await, let it run in background
      promptExecutionService.executeAllPrompts(businessId).catch(error => {
        console.error('Error executing all prompts:', error);
      });

      return NextResponse.json({
        success: true,
        message: 'Started execution for all prompts'
      });
    }
  } catch (error: any) {
    console.error('Error executing prompts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute prompts' },
      { status: 500 }
    );
  }
}

// Get latest execution results
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const businessId = searchParams.get('businessId');
    const modelId = searchParams.get('modelId');

    if (!businessId) {
      return NextResponse.json(
        { error: 'Business ID is required' },
        { status: 400 }
      );
    }

    const executions = promptExecutionService.getLatestExecutions(
      parseInt(businessId),
      modelId ? parseInt(modelId) : undefined
    );

    return NextResponse.json({
      success: true,
      executions
    });
  } catch (error) {
    console.error('Error fetching prompt executions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prompt executions' },
      { status: 500 }
    );
  }
}