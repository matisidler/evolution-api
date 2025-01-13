import { InstanceDto } from '@api/dto/instance.dto';
import { MediaDto } from '@api/integrations/storage/s3/dto/media.dto';
import { getObjectUrl } from '@api/integrations/storage/s3/libs/minio.server';
import { PrismaRepository } from '@api/repository/repository.service';
import { Logger } from '@config/logger.config';
import { BadRequestException } from '@exceptions';

export class S3Service {
  constructor(private readonly prismaRepository: PrismaRepository) {}

  private readonly logger = new Logger('S3Service');
  private readonly maxRetries = 10;
  private readonly retryDelay = 1000; // 1 second in milliseconds

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public async getMedia(instance: InstanceDto, query?: MediaDto) {
    let lastError: any;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const where: any = {
          instanceId: instance.instanceId,
          ...query,
        };

        const media = await this.prismaRepository.media.findMany({
          where,
          select: {
            id: true,
            fileName: true,
            type: true,
            mimetype: true,
            createdAt: true,
            Message: true,
          },
        });

        if (!media || media.length === 0) {
          throw 'Media not found';
        }

        return media;
      } catch (error) {
        lastError = error;
        this.logger.error(`Attempt ${attempt} failed: ${error.message || error}`);
        
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay);
          continue;
        }
      }
    }

    throw new BadRequestException(lastError);
  }

  public async getMediaUrl(instance: InstanceDto, data: MediaDto) {
    let lastError: any;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const media = (await this.getMedia(instance, { id: data.id }))[0];
        const mediaUrl = await getObjectUrl(media.fileName, data.expiry);
        return {
          mediaUrl,
          ...media,
        };
      } catch (error) {
        lastError = error;
        this.logger.error(`Attempt ${attempt} failed to get media URL: ${error.message || error}`);
        
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay);
          continue;
        }
      }
    }

    throw new BadRequestException(lastError);
  }
}
