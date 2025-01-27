import { InstanceDto } from '@api/dto/instance.dto';
import { ChatwootDto } from '@api/integrations/chatbot/chatwoot/dto/chatwoot.dto';
import { ChatwootService } from '@api/integrations/chatbot/chatwoot/services/chatwoot.service';
import { PrismaRepository } from '@api/repository/repository.service';
import { waMonitor } from '@api/server.module';
import { CacheService } from '@api/services/cache.service';
import { CacheEngine } from '@cache/cacheengine';
import { Chatwoot, ConfigService, HttpServer } from '@config/env.config';
import { BadRequestException } from '@exceptions';
import { isURL } from 'class-validator';

export class ChatwootController {
  private audioMessageCache = new Map<string, { messageId: number; sourceId: string; timestamp: number }>();

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

    // Safely check for audio attachment
    const attachment = data?.attachments?.[0];
    if (attachment?.file_type === 'audio') {
      const messageId = attachment?.message_id;
      const sourceId = data?.source_id;

      if (messageId && sourceId) {
        // Store the audio message info
        this.audioMessageCache.set(String(messageId), {
          messageId,
          sourceId,
          timestamp: Date.now(),
        });

        // Clean up old entries (older than 10 seconds)
        this.cleanupAudioCache();

        // Check if this is a duplicate message
        const previousMessageKey = String(messageId - 1);
        const previousMessage = this.audioMessageCache.get(previousMessageKey);

        if (
          previousMessage &&
          Date.now() - previousMessage.timestamp <= 10000 && // Within 10 seconds
          previousMessage.sourceId !== sourceId
        ) {
          return; // Early return for duplicate audio message
        }
      }
    }

    const chatwootCache = new CacheService(new CacheEngine(this.configService, ChatwootService.name).getEngine());
    const chatwootService = new ChatwootService(waMonitor, this.configService, this.prismaRepository, chatwootCache);

    return chatwootService.receiveWebhook(instance, data);
  }

  private cleanupAudioCache() {
    const tenSecondsAgo = Date.now() - 10000;
    for (const [key, value] of this.audioMessageCache.entries()) {
      if (value.timestamp < tenSecondsAgo) {
        this.audioMessageCache.delete(key);
      }
    }
  }
}
