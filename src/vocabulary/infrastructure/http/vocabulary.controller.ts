import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { DeviceAuth } from '../../../devices/infrastructure/http/device-auth';
import { GetVocabularyUseCase } from '../../application/get-vocabulary.use-case';

// Tablet read (spec 105/003). Replaced by /sync/profiles once spec 106 exists.
@ApiTags('vocabulary')
@Controller('vocabulary')
export class VocabularyController {
  constructor(private readonly getVocabulary: GetVocabularyUseCase) {}

  @DeviceAuth()
  @Get()
  @ApiOperation({ summary: 'Tablet: active categories with their pictograms (paginated; the tablet walks through all the pages)' })
  vocabulary(@Query() { page, limit }: PaginationQuery) {
    return this.getVocabulary.execute({ page, limit });
  }
}
