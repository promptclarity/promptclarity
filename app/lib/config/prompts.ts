import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface PromptConfig {
  systemPrompt?: string;
  userPromptTemplate: string;
  temperature: number;
  maxOutputTokens: number;
}

class PromptConfigLoader {
  private configs: Map<string, PromptConfig> = new Map();
  private configDir: string;

  constructor() {
    this.configDir = path.join(process.cwd(), 'config', 'prompts');
    this.loadConfigs();
  }

  private loadConfigs() {
    const files = [
      { name: 'onboarding-topics', key: 'topics' },
      { name: 'onboarding-prompts', key: 'prompts' },
      { name: 'onboarding-competitors', key: 'competitors' },
      { name: 'mention-analysis', key: 'mentionAnalysis' }
    ];
    
    for (const { name, key } of files) {
      try {
        // Try YAML first, then JSON
        const yamlPath = path.join(this.configDir, `${name}.yaml`);
        const jsonPath = path.join(this.configDir, `${name}.json`);
        
        if (fs.existsSync(yamlPath)) {
          const content = fs.readFileSync(yamlPath, 'utf-8');
          const config = yaml.load(content) as PromptConfig;
          this.configs.set(key, config);
          console.log(`Loaded onboarding prompt config from YAML: ${key}`);
        } else if (fs.existsSync(jsonPath)) {
          const content = fs.readFileSync(jsonPath, 'utf-8');
          this.configs.set(key, JSON.parse(content));
          console.log(`Loaded onboarding prompt config from JSON: ${key}`);
        } else {
          console.warn(`Onboarding prompt config file not found: ${name}.yaml or ${name}.json`);
        }
      } catch (error) {
        console.error(`Error loading prompt config ${name}:`, error);
      }
    }
  }

  getConfig(name: string): PromptConfig | undefined {
    return this.configs.get(name);
  }

  formatPrompt(template: string, variables: Record<string, any>): string {
    let formatted = template;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`{{${key}}}`, 'g');
      formatted = formatted.replace(placeholder, String(value));
    }
    
    return formatted;
  }
}

// Export singleton instance
export const promptConfig = new PromptConfigLoader();