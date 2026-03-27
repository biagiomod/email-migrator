// src/ai/types.ts

/**
 * ClassifierAdapter — Phase 2 stub.
 * Not implemented in Phase 1.
 * GitHub Copilot or any LLM plugs in here when available in the work environment.
 * The pipeline runs fully without this — it is strictly optional.
 */
export interface ClassifierAdapter {
  name: string;
  /**
   * Given raw text and a list of candidate labels, returns the best
   * label and a confidence score between 0 and 1.
   */
  classify(raw: string, candidates: string[]): Promise<{ label: string; confidence: number }>;
}
