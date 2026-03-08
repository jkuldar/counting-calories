import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
    getStatus() {
    return { message: 'OK', uptime: process.uptime() };
    }
}
