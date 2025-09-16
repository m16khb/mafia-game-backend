import { Injectable, Scope } from '@nestjs/common';
import { Logger as NestLogger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

const COLOR_START = '\x1b[';
const COLOR_END = '\x1b[0m';
enum LOG_COLOR {
  RED = '31m',
  GREEN = '32m',
  YELLOW = '33m',
  BLUE = '34m',
  MAGENTA = '35m',
  CYAN = '36m',
  WHITE = '37m',
}

@Injectable({ scope: Scope.TRANSIENT })
export class Logger extends NestLogger {
  constructor(private readonly cls: ClsService) {
    super();
  }

  setContext(context: string): void {
    this.context = context;
  }

  wrapString(string: string, color: LOG_COLOR): string {
    return `${COLOR_START}${color}${string}${COLOR_END}`;
  }

  log(message: any = ''): void {
    const requestContext = this.cls.get('request-context');

    let contextPart = '';
    if (requestContext) {
      const coloredRequestContext = this.wrapString(
        `(${requestContext})`,
        LOG_COLOR.GREEN,
      );
      contextPart = `${coloredRequestContext} `;
    }

    const formattedMessage =
      typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
    super.log(`${contextPart}${formattedMessage}`);
  }

  debug(message: any = ''): void {
    const requestContext = this.cls.get('request-context');
    const coloredRequestContext = this.wrapString(
      `(${requestContext})`,
      LOG_COLOR.MAGENTA,
    );
    const formattedMessage =
      typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
    super.debug(`${coloredRequestContext} ${formattedMessage}`);
  }

  error(error: Error, message: any = ''): void {
    const requestContext = this.cls.get('request-context');
    const coloredRequestContext = this.wrapString(
      `(${requestContext})`,
      LOG_COLOR.RED,
    );
    const formattedMessage =
      typeof message === 'object' ? JSON.stringify(message, null, 2) : message;

    let stackTrace: string | undefined = undefined;
    if (error) {
      stackTrace = error.stack;
    }

    super.error(`${coloredRequestContext} ${formattedMessage}`, stackTrace);
  }
}
