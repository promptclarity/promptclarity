# Onboarding Prompt Configuration

This directory contains customizable prompt templates for AI generation during the onboarding process.

## Files

- `prompts/onboarding-topics.yaml` - Prompt for generating business topics during onboarding step 2
- `prompts/onboarding-prompts.yaml` - Prompt for generating search prompts during onboarding step 3  
- `prompts/onboarding-competitors.yaml` - Prompt for generating competitors during onboarding step 4
- `prompts/mention-analysis.yaml` - Prompt for analyzing AI responses for brand mentions

## Configuration Format

Each YAML file contains:

```yaml
systemPrompt: Optional system prompt for the AI

userPromptTemplate: |
  Multi-line prompt template
  with {{variables}} that will be replaced
  
  Formatted nicely for readability
  
temperature: 0.7
maxOutputTokens: 15000
```

Note: The system also supports JSON format if you prefer, just use `.json` extension instead of `.yaml`.

## Template Variables

Variables in templates use `{{variableName}}` format and are replaced at runtime:

### onboarding-topics.yaml
- `{{businessName}}` - The business/brand name
- `{{website}}` - The business website URL

### onboarding-prompts.yaml
- `{{businessName}}` - The business/brand name
- `{{website}}` - The business website URL
- `{{topics}}` - Comma-separated list of topics
- `{{minPrompts}}` - Minimum number of prompts to generate
- `{{maxPrompts}}` - Maximum number of prompts to generate

### onboarding-competitors.yaml
- `{{businessName}}` - The business/brand name
- `{{website}}` - The business website URL
- `{{topics}}` - Comma-separated list of topics

### mention-analysis.yaml
- `{{brandName}}` - The business/brand name
- `{{brandNameNoSpaces}}` - Brand name with spaces removed
- `{{brandNameLowercase}}` - Brand name in lowercase
- `{{competitors}}` - Comma-separated list of competitor names
- `{{response}}` - The AI response text to analyze for mentions

## Customization

1. Edit any YAML file to customize prompt behavior
2. Modify the `userPromptTemplate` to change how the AI generates content
3. Adjust `temperature` (0.0-1.0) to control creativity vs consistency
4. Set `maxOutputTokens` to control response length
5. Restart the server for changes to take effect

## Example Customization

To make topic generation more specific to your industry, edit `prompts/onboarding-topics.yaml`:

```yaml
userPromptTemplate: |
  For the {{businessName}} SaaS company,
  generate 5-7 technical categories...
```