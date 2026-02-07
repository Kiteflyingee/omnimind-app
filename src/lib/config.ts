import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface ModelConfig {
  name: string;
  base_url: string;
  api_key: string;
}

export interface Config {
  models: {
    fast: ModelConfig;
    advanced: ModelConfig;
  };
  memory: {
    mem0: {
      api_key: string;
      project_id: string;
    };
  };
  storage: {
    sqlite_path: string;
  };
}

export function loadConfig(): Config {
  const configPath = path.join(process.cwd(), 'config.yaml');
  const fileContents = fs.readFileSync(configPath, 'utf8');

  // Replace environment variables
  const processedContents = fileContents.replace(/\${(\w+)}/g, (_, envVar) => {
    return process.env[envVar] || '';
  });

  return yaml.load(processedContents) as Config;
}
