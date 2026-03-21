import type { RiskAssessmentProvider } from './types.js';

interface KimiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

export class KimiProvider implements RiskAssessmentProvider {
  readonly name = 'kimi';

  constructor(private readonly config: KimiConfig) {}

  async assess(): Promise<never> {
    void this.config;
    throw new Error(
      'Kimi provider is not wired in this repository yet. Configure KIMI_ENDPOINT/KIMI_API_KEY and implement request mapping in src/providers/kimi.ts.',
    );
  }
}
