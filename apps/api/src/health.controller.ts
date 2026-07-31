import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

@Controller()
@SkipThrottle()
export class HealthController {
  @Get("health")
  health(): { status: string } {
    return { status: "ok" };
  }
}
