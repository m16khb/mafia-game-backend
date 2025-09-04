import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import {
  DomainError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../errors";

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof DomainError) {
      const status = this.mapDomainErrorToStatus(exception);
      response.status(status).send({
        error: exception.name,
        message: exception.message,
        code: exception.code,
        details:
          "details" in exception ? (exception as any).details : undefined,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).send({
        error: exception.name,
        message: exception.message,
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      error: "InternalServerError",
      message: "An unexpected error occurred",
    });
  }

  private mapDomainErrorToStatus(error: DomainError): number {
    if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
    if (error instanceof ValidationError) return HttpStatus.BAD_REQUEST;
    if (error instanceof ConflictError) return HttpStatus.CONFLICT;
    return HttpStatus.UNPROCESSABLE_ENTITY;
  }
}
