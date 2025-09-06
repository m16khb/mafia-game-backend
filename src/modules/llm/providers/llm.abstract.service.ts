export abstract class LlmAbstractService {
  abstract readonly provider: string;
  abstract generate(request: {
    prompt: string;
    message: string;
  }): Promise<string>;
  abstract voteStatement(request: {
    prompt: string;
    message: string;
  }): Promise<string>;
}
