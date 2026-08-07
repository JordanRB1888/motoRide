import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ [PrismaService] PostgreSQL Database Connected Successfully');
    } catch (err) {
      console.warn('⚠️ [PrismaService] PostgreSQL Connection Note:', err.message);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
