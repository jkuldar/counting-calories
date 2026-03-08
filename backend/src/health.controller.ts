import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    @Get()
    getRoot() {
    return this.healthService.getStatus();
    }

    @Get('health')
    getHealth() {
    return this.healthService.getStatus();
    }
}
