// prettier-ignore
import { Body, Controller, Get, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { ImportArasaacPictogramUseCase } from '../../application/import-arasaac-pictogram.use-case';
import { SearchArasaacUseCase } from '../../application/search-arasaac.use-case';
import { SearchPictogramsUseCase } from '../../application/search-pictograms.use-case';
import { UpdatePictogramUseCase } from '../../application/update-pictogram.use-case';
import { UploadPictogramUseCase } from '../../application/upload-pictogram.use-case';
import { ArasaacSearchQuery, ImportArasaacDto, PictogramSearchQuery, UpdatePictogramDto, UploadPictogramDto } from './pictograms.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Pictograms saved on the server (spec 105): ARASAAC copies or own images, in the bucket.
@ApiTags('pictograms')
@Controller('pictograms')
export class PictogramsController {
  constructor(
    private readonly searchPictograms: SearchPictogramsUseCase,
    private readonly searchArasaac: SearchArasaacUseCase,
    private readonly importArasaac: ImportArasaacPictogramUseCase,
    private readonly uploadPictogram: UploadPictogramUseCase,
    private readonly updatePictogram: UpdatePictogramUseCase,
  ) {}

  @Auth(Role.THERAPIST)
  @Get()
  @ApiOperation({ summary: 'Pictograms saved on the server, by label (paginated)' })
  list(@Query() { q, page, limit }: PictogramSearchQuery) {
    return this.searchPictograms.execute(q, { page, limit });
  }

  @Auth(Role.THERAPIST)
  @Get('arasaac')
  @ApiOperation({ summary: 'Searches ARASAAC (24 h cache); if it does not respond, returns the saved ones and arasaacAvailable=false' })
  arasaac(@Query() { q, page, limit }: ArasaacSearchQuery) {
    return this.searchArasaac.execute(q, { page, limit });
  }

  @Auth(Role.THERAPIST)
  @Post('arasaac')
  @ApiOperation({ summary: 'Copies an ARASAAC pictogram into the bucket and saves it (201 new, 200 if it already existed)' })
  async import(
    @Body() dto: ImportArasaacDto,
    @GetUser('id') actorId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, pictogram } = await this.importArasaac.execute({ ...dto, actorId, ip: req.ip });
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return pictogram;
  }

  @Auth(Role.THERAPIST)
  @Post()
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 1_000_000 } })) // 1 MB
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { label: { type: 'string' }, image: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Uploads an own image (PNG or JPEG, up to 1 MB)' })
  upload(
    @Body() dto: UploadPictogramDto,
    @UploadedFile() image: { buffer: Buffer } | undefined,
    @GetUser('id') actorId: string,
    @Req() req: Request,
  ) {
    return this.uploadPictogram.execute({ label: dto.label, wordType: dto.wordType, image: image?.buffer, actorId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Patch(':id')
  @ApiOperation({ summary: 'Label or active flag (deactivate = stops reaching the tablets)' })
  update(@Param('id', uuid) id: string, @Body() dto: UpdatePictogramDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return this.updatePictogram.execute({ ...dto, id, actorId, ip: req.ip });
  }
}
