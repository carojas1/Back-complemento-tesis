import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { CreateVoiceUseCase } from '../../application/create-voice.use-case';
import { DeleteVoiceUseCase } from '../../application/delete-voice.use-case';
import { GenerateVoiceClipsUseCase } from '../../application/generate-voice-clips.use-case';
import { GetVoiceUseCase } from '../../application/get-voice.use-case';
import { CreateVoiceDto } from './voices.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// The patient's cloned voice (spec 010): only the assigned therapist, from the panel.
@ApiTags('voices')
@Controller('patients/:patientId/voice')
export class VoicesController {
  constructor(
    private readonly createVoice: CreateVoiceUseCase,
    private readonly getVoice: GetVoiceUseCase,
    private readonly deleteVoice: DeleteVoiceUseCase,
    private readonly generateClips: GenerateVoiceClipsUseCase,
  ) {}

  @Auth(Role.THERAPIST)
  @Get()
  @ApiOperation({ summary: 'Status of the cloned voice and how many words already have audio' })
  get(@Param('patientId', uuid) patientId: string, @GetUser('id') therapistId: string) {
    return this.getVoice.execute({ patientId, therapistId });
  }

  @Auth(Role.THERAPIST)
  @Post()
  @UseInterceptors(FileInterceptor('sample', { limits: { fileSize: 10_000_000 } })) // 10 MB
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ownerName: { type: 'string' },
        relationship: { type: 'string' },
        consentDate: { type: 'string', format: 'date' },
        consentConfirmed: { type: 'boolean' },
        transcript: { type: 'string' },
        sample: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: "Creates the base voice from a 5 to 15 s sample (recorded or uploaded) and its owner's consent (spec 010 FR-004)",
  })
  create(
    @Param('patientId', uuid) patientId: string,
    @Body() dto: CreateVoiceDto,
    @UploadedFile() sample: { buffer: Buffer } | undefined,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.createVoice.execute({ ...dto, patientId, therapistId, sample: sample?.buffer, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Post('generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Generates with the base voice the audio of the board pictograms that do not have it yet' })
  generate(@Param('patientId', uuid) patientId: string, @GetUser('id') therapistId: string) {
    return this.generateClips.execute({ patientId, therapistId });
  }

  @Auth(Role.THERAPIST)
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletes the voice, its sample and its audios; the board goes back to the system voice' })
  remove(@Param('patientId', uuid) patientId: string, @GetUser('id') therapistId: string, @Req() req: Request) {
    return this.deleteVoice.execute({ patientId, therapistId, ip: req.ip });
  }
}
