import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InstanceDto } from '@/core/dto/instance.dto';
import { ChatwootDto } from '../dto/chatwoot.dto';
import { ChatwootService } from '../services/chatwoot.service';
import { Chatwoot, HttpServer } from '@/config/env.config';
import { isURL } from 'class-validator';
import { waMonitor } from '@/whatsapp/whatsapp.module';
import { CacheService } from '@/cache/cache.service';
import { CacheEngine } from '@/cache/engine/cache.engine';
import { PrismaRepository } from '@/repository/prisma.repository';

export class ChatwootController {
  constructor(
    private readonly chatwootService: ChatwootService,
    private readonly configService: ConfigService,
    private readonly prismaRepository: PrismaRepository,
  ) {}

  public async createChatwoot(instance: InstanceDto, data: ChatwootDto) {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) throw new BadRequestException('Chatwoot is disabled');

    if (data?.enabled) {
      if (!isURL(data.url, { require_tld: false })) {
        throw new BadRequestException('url is not valid');
      }

      if (!data.accountId) {
        throw new BadRequestException('accountId is required');
      }

      if (!data.token) {
        throw new BadRequestException('token is required');
      }

      if (data.signMsg !== true && data.signMsg !== false) {
        throw new BadRequestException('signMsg is required');
      }
      if (data.signMsg === false) data.signDelimiter = null;
    }

    if (!data.nameInbox || data.nameInbox === '') {
      data.nameInbox = instance.instanceName;
    }

    const result = await this.chatwootService.create(instance, data);

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;

    const response = {
      ...result,
      webhook_url: `${urlServer}/chatwoot/webhook/${encodeURIComponent(instance.instanceName)}`,
    };

    return response;
  }

  public async findChatwoot(instance: InstanceDto): Promise<ChatwootDto & { webhook_url: string }> {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) throw new BadRequestException('Chatwoot is disabled');

    const result = await this.chatwootService.find(instance);

    const urlServer = this.configService.get<HttpServer>('SERVER').URL;

    if (Object.keys(result || {}).length === 0) {
      return {
        enabled: false,
        url: '',
        accountId: '',
        token: '',
        signMsg: false,
        nameInbox: '',
        webhook_url: '',
      };
    }

    const response = {
      ...result,
      webhook_url: `${urlServer}/chatwoot/webhook/${encodeURIComponent(instance.instanceName)}`,
    };

    return response;
  }

  public async receiveWebhook(instance: InstanceDto, data: any) {
    if (!this.configService.get<Chatwoot>('CHATWOOT').ENABLED) throw new BadRequestException('Chatwoot is disabled');

    const chatwootCache = new CacheService(new CacheEngine(this.configService, ChatwootService.name).getEngine());
    const chatwootService = new ChatwootService(waMonitor, this.configService, this.prismaRepository, chatwootCache);

    // Process webhook in the background
    process.nextTick(() => {
      chatwootService.receiveWebhook(instance, data).catch((error) => {
        console.error('Error processing Chatwoot webhook:', error);
      });
    });

    // Return immediately
    return { success: true, message: 'bot' };
  }
}
