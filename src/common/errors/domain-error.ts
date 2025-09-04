export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, criteria: Record<string, unknown>) {
    super(`${entity} not found`, 'NOT_FOUND');
    this.details = criteria;
  }
  public readonly details: Record<string, unknown>;
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR');
    this.details = details;
  }
  public readonly details?: unknown;
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT');
  }
}
