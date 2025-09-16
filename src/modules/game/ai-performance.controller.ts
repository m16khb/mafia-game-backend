import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  AIPerformanceService,
  AlertConfig,
} from '@libs/ai/ai-performance.service';

class AlertConfigDto {
  name: string;
  type: 'threshold' | 'trend' | 'error';
  enabled: boolean;
  threshold?: number;
  metric: string;
  condition: 'greater_than' | 'less_than' | 'equals' | 'not_equals';
  timeWindow: number;
  cooldown: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  webhook?: string;
  email?: string[];
}

@ApiTags('AI Performance Monitoring')
@Controller('ai/performance')
export class AIPerformanceController {
  constructor(private readonly performanceService: AIPerformanceService) {}

  @Get('metrics')
  @ApiOperation({
    summary: 'Get aggregated AI performance metrics',
    description:
      'Retrieve performance metrics for AI decisions over specified time windows',
  })
  @ApiQuery({
    name: 'timeWindow',
    enum: ['hour', 'day', 'week', 'month'],
    required: false,
    description: 'Time window for aggregation',
  })
  @ApiQuery({
    name: 'startTime',
    type: 'number',
    required: false,
    description: 'Start timestamp for custom time range',
  })
  @ApiQuery({
    name: 'endTime',
    type: 'number',
    required: false,
    description: 'End timestamp for custom time range',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregated performance metrics returned successfully',
  })
  async getMetrics(
    @Query('timeWindow') timeWindow: 'hour' | 'day' | 'week' | 'month' = 'day',
    @Query('startTime') startTime?: number,
    @Query('endTime') endTime?: number,
  ) {
    return this.performanceService.getAggregatedMetrics(
      timeWindow,
      startTime,
      endTime,
    );
  }

  @Get('personas')
  @ApiOperation({
    summary: 'Get AI persona performance analysis',
    description: 'Retrieve detailed performance metrics for each AI persona',
  })
  @ApiQuery({
    name: 'personaId',
    type: 'number',
    required: false,
    description: 'Specific persona ID to analyze (optional)',
  })
  @ApiResponse({
    status: 200,
    description: 'Persona performance metrics returned successfully',
  })
  async getPersonaPerformance(@Query('personaId') personaId?: number) {
    return this.performanceService.getPersonaPerformance(personaId);
  }

  @Get('costs')
  @ApiOperation({
    summary: 'Get detailed cost breakdown and analysis',
    description: 'Retrieve comprehensive cost analysis for AI operations',
  })
  @ApiResponse({
    status: 200,
    description: 'Cost breakdown returned successfully',
  })
  async getCostBreakdown() {
    return this.performanceService.getCostBreakdown();
  }

  @Get('health')
  @ApiOperation({
    summary: 'Get AI system health status',
    description:
      'Retrieve current health status of AI services and infrastructure',
  })
  @ApiResponse({
    status: 200,
    description: 'System health status returned successfully',
  })
  async getSystemHealth() {
    return this.performanceService.getSystemHealth();
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get real-time dashboard data',
    description:
      'Retrieve real-time metrics and status for performance dashboard',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data returned successfully',
  })
  async getDashboardData() {
    return this.performanceService.getDashboardData();
  }

  @Get('report')
  @ApiOperation({
    summary: 'Generate comprehensive performance report',
    description:
      'Generate detailed performance report with insights and recommendations',
  })
  @ApiQuery({
    name: 'timeWindow',
    enum: ['day', 'week', 'month'],
    required: false,
    description: 'Time window for report generation',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance report generated successfully',
  })
  async getPerformanceReport(
    @Query('timeWindow') timeWindow: 'day' | 'week' | 'month' = 'day',
  ) {
    return this.performanceService.generatePerformanceReport(timeWindow);
  }

  @Get('alerts')
  @ApiOperation({
    summary: 'Get active performance alerts',
    description: 'Retrieve list of active performance alerts and warnings',
  })
  @ApiResponse({
    status: 200,
    description: 'Active alerts returned successfully',
  })
  async getActiveAlerts() {
    return this.performanceService.getActiveAlerts();
  }

  @Post('alerts')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Configure performance alert',
    description: 'Create or update a performance alert configuration',
  })
  @ApiResponse({
    status: 201,
    description: 'Alert configuration created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid alert configuration',
  })
  async configureAlert(@Body() alertConfig: AlertConfigDto) {
    await this.performanceService.configureAlert(alertConfig as AlertConfig);
    return {
      message: 'Alert configured successfully',
      alertName: alertConfig.name,
    };
  }

  @Post('alerts/:alertId/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resolve performance alert',
    description: 'Mark a specific alert as resolved',
  })
  @ApiParam({
    name: 'alertId',
    description: 'ID of the alert to resolve',
  })
  @ApiResponse({
    status: 200,
    description: 'Alert resolved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Alert not found',
  })
  async resolveAlert(@Param('alertId') alertId: string) {
    const resolved = await this.performanceService.resolveAlert(alertId);

    if (!resolved) {
      return { message: 'Alert not found', alertId };
    }

    return { message: 'Alert resolved successfully', alertId };
  }

  @Get('metrics/realtime')
  @ApiOperation({
    summary: 'Get real-time performance metrics',
    description:
      'Retrieve current real-time performance metrics for monitoring',
  })
  @ApiResponse({
    status: 200,
    description: 'Real-time metrics returned successfully',
  })
  async getRealtimeMetrics() {
    const dashboardData = await this.performanceService.getDashboardData();
    return {
      realTimeMetrics: dashboardData.realTimeMetrics,
      systemStatus: dashboardData.systemStatus,
      activeAlerts: dashboardData.activeAlerts.length,
      recentMetricsCount: dashboardData.recentMetrics.length,
    };
  }

  @Get('trends/:metric')
  @ApiOperation({
    summary: 'Get performance trend analysis',
    description: 'Analyze trends for specific performance metrics over time',
  })
  @ApiParam({
    name: 'metric',
    enum: ['responseTime', 'successRate', 'costs', 'confidence'],
    description: 'Metric to analyze for trends',
  })
  @ApiQuery({
    name: 'timeWindow',
    enum: ['day', 'week', 'month'],
    required: false,
    description: 'Time window for trend analysis',
  })
  @ApiResponse({
    status: 200,
    description: 'Trend analysis returned successfully',
  })
  async getMetricTrends(
    @Param('metric') metric: string,
    @Query('timeWindow') timeWindow: 'day' | 'week' | 'month' = 'week',
  ) {
    const report =
      await this.performanceService.generatePerformanceReport(timeWindow);

    return {
      metric,
      timeWindow,
      trend: report.trends[metric as keyof typeof report.trends],
      currentValue: this.getCurrentValueForMetric(metric, report.summary),
      insights: report.insights.filter((insight) =>
        insight.toLowerCase().includes(metric.toLowerCase()),
      ),
      recommendations: report.recommendations.filter((rec) =>
        rec.toLowerCase().includes(metric.toLowerCase()),
      ),
    };
  }

  @Get('export/:format')
  @ApiOperation({
    summary: 'Export performance data',
    description: 'Export performance data in specified format for analysis',
  })
  @ApiParam({
    name: 'format',
    enum: ['json', 'csv'],
    description: 'Export format',
  })
  @ApiQuery({
    name: 'timeWindow',
    enum: ['day', 'week', 'month'],
    required: false,
    description: 'Time window for data export',
  })
  @ApiResponse({
    status: 200,
    description: 'Performance data exported successfully',
  })
  async exportPerformanceData(
    @Param('format') format: 'json' | 'csv',
    @Query('timeWindow') timeWindow: 'day' | 'week' | 'month' = 'day',
  ) {
    const report =
      await this.performanceService.generatePerformanceReport(timeWindow);

    if (format === 'csv') {
      // Convert to CSV format
      return this.convertReportToCSV(report);
    }

    return report;
  }

  private getCurrentValueForMetric(metric: string, summary: any): number {
    switch (metric) {
      case 'responseTime':
        return summary.averageResponseTime;
      case 'successRate':
        return summary.successRate;
      case 'costs':
        return summary.totalCost;
      case 'confidence':
        return summary.averageConfidence;
      default:
        return 0;
    }
  }

  private convertReportToCSV(report: any): string {
    const headers = [
      'Metric',
      'Value',
      'Time Window',
      'Total Decisions',
      'Success Rate',
      'Average Response Time',
      'Total Cost',
      'Cache Hit Rate',
    ];

    const rows = [
      [
        'Summary',
        '',
        report.summary.timeWindow,
        report.summary.totalDecisions,
        report.summary.successRate,
        report.summary.averageResponseTime,
        report.summary.totalCost,
        report.summary.cacheHitRate,
      ],
    ];

    // Add persona performance rows
    report.personaPerformance.forEach((persona: any) => {
      rows.push([
        `Persona ${persona.personaName}`,
        persona.efficiency,
        '',
        persona.totalDecisions,
        persona.successRate,
        persona.averageResponseTime,
        persona.totalCost,
        '',
      ]);
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((field) => `"${field}"`).join(','))
      .join('\n');

    return csvContent;
  }
}
