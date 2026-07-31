import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  // Data here is public/read-only, so CORS is open by default; the real guard
  // against key-quota abuse is the per-IP rate limit (see ThrottlerModule in
  // AppModule). Set CORS_ORIGIN (comma-separated) to lock this down further.
  const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim());
  app.enableCors(corsOrigin ? { origin: corsOrigin } : undefined);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  new Logger("Bootstrap").log(`OpenWallet API on :${String(port)}`);
}

void bootstrap();
