import os
import yaml
import re

def load_config(config_path: str = None):
    if config_path is None:
        # Resolve path relative to this file's location
        base_dir = os.path.dirname(os.path.abspath(__file__))
        config_path = os.path.join(base_dir, "..", "config.yaml")
        
    with open(config_path, 'r') as f:
        content = f.read()
        
    # Manual environment variable substitution to match Next.js behavior
    def replace_env(match):
        env_var = match.group(1)
        return os.getenv(env_var, f"${{{env_var}}}")
        
    processed_content = re.sub(r'\$\{([^}]+)\}', replace_env, content)
    return yaml.safe_load(processed_content)
