export abstract class LlmAbstractService {
  abstract readonly provider: string;
  abstract generate(request: {
    prompt: string;
    message: string;
  }): Promise<string>;
}
