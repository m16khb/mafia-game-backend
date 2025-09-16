// AI Strategy exports - placeholder for future implementation
export interface AIStrategy {
  roleType: string;
  executeStrategy(context: any): Promise<any>;
}

// This will be expanded when we implement role-specific strategies
