import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { EditBoardUseCase } from '../../application/edit-board.use-case';
import { GetProfileUseCase } from '../../application/get-profile.use-case';
import { SetRecordingUseCase } from '../../application/set-recording.use-case';
import { UpdateProfileUseCase } from '../../application/update-profile.use-case';
import { AddCategoryDto, AddPictogramDto, OrderDto, SetPictogramHiddenDto, UpdateProfileDto } from './profiles.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

// Communication profile of a patient (spec 105): assigned therapist only.
@ApiTags('profiles')
@Controller('patients/:patientId/profile')
export class ProfilesController {
  constructor(
    private readonly getProfile: GetProfileUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly editBoard: EditBoardUseCase,
    private readonly setRecording: SetRecordingUseCase,
  ) {}

  @Auth(Role.THERAPIST)
  @Get()
  @ApiOperation({ summary: 'Settings, categories and pictograms of the patient board (signed URLs 1 h)' })
  get(@Param('patientId', uuid) patientId: string, @GetUser('id') therapistId: string) {
    return this.getProfile.execute({ patientId, therapistId });
  }

  @Auth(Role.THERAPIST)
  @Patch()
  @ApiOperation({ summary: 'Grid, level, voice, phrase bar or activities; bumps the version' })
  update(
    @Param('patientId', uuid) patientId: string,
    @Body() dto: UpdateProfileDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.updateProfile.execute({ ...dto, patientId, therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Patch('pictograms/:pictogramId')
  @ApiOperation({ summary: 'Hides or shows a pictogram on the patient board' })
  hide(
    @Param('patientId', uuid) patientId: string,
    @Param('pictogramId', uuid) id: string,
    @Body() dto: SetPictogramHiddenDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.updateProfile.execute({ patientId, therapistId, hidden: { id, hidden: dto.hidden }, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Post('categories')
  @ApiOperation({ summary: 'Adds a catalog category to the board, with its active pictograms (spec 105 FR-009)' })
  addCategory(
    @Param('patientId', uuid) patientId: string,
    @Body() dto: AddCategoryDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.editBoard.execute({ action: 'addCategory', categoryId: dto.categoryId, patientId, therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Delete('categories/:profileCategoryId')
  @ApiOperation({ summary: 'Removes a category from the patient board (the catalog does not change)' })
  removeCategory(
    @Param('patientId', uuid) patientId: string,
    @Param('profileCategoryId', uuid) profileCategoryId: string,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.editBoard.execute({ action: 'removeCategory', profileCategoryId, patientId, therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Post('categories/:profileCategoryId/pictograms')
  @ApiOperation({ summary: 'Adds a catalog pictogram at the end of a board category' })
  addPictogram(
    @Param('patientId', uuid) patientId: string,
    @Param('profileCategoryId', uuid) profileCategoryId: string,
    @Body() dto: AddPictogramDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.editBoard.execute({
      action: 'addPictogram',
      profileCategoryId,
      pictogramId: dto.pictogramId,
      patientId,
      therapistId,
      ip: req.ip,
    });
  }

  @Auth(Role.THERAPIST)
  @Delete('pictograms/:pictogramId')
  @ApiOperation({ summary: 'Removes a pictogram from the patient board (and its recording)' })
  removePictogram(
    @Param('patientId', uuid) patientId: string,
    @Param('pictogramId', uuid) boardPictogramId: string,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.editBoard.execute({ action: 'removePictogram', boardPictogramId, patientId, therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Put('pictograms/:pictogramId/recording')
  // 1 MB input: an uncompressed 3 s wav or webm weighs more; the stored m4a does not exceed 200 KB (spec 105 FR-004).
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 1_000_000 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { audio: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary:
      'Uploads the therapist recording for a pictogram (m4a from the app, or webm/ogg from the browser converted to m4a; max. 3 s and 200 KB)',
  })
  record(
    @Param('patientId', uuid) patientId: string,
    @Param('pictogramId', uuid) boardPictogramId: string,
    @UploadedFile() audio: { buffer: Buffer } | undefined,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.setRecording.execute({ patientId, therapistId, boardPictogramId, audio: audio?.buffer ?? Buffer.alloc(0), ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Delete('pictograms/:pictogramId/recording')
  @ApiOperation({ summary: 'Removes the recording: the cloned voice or the system one returns' })
  removeRecording(
    @Param('patientId', uuid) patientId: string,
    @Param('pictogramId', uuid) boardPictogramId: string,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.setRecording.execute({ patientId, therapistId, boardPictogramId, audio: null, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Put('categories/order')
  @ApiOperation({ summary: 'Reorders the board categories (drag in the editor): all ids, in the new order' })
  orderCategories(
    @Param('patientId', uuid) patientId: string,
    @Body() dto: OrderDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.editBoard.execute({ action: 'orderCategories', profileCategoryIds: dto.ids, patientId, therapistId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Put('categories/:profileCategoryId/pictograms/order')
  @ApiOperation({ summary: 'Reorders the pictograms of a board category: all ids, in the new order' })
  orderPictograms(
    @Param('patientId', uuid) patientId: string,
    @Param('profileCategoryId', uuid) profileCategoryId: string,
    @Body() dto: OrderDto,
    @GetUser('id') therapistId: string,
    @Req() req: Request,
  ) {
    return this.editBoard.execute({
      action: 'orderPictograms',
      profileCategoryId,
      boardPictogramIds: dto.ids,
      patientId,
      therapistId,
      ip: req.ip,
    });
  }
}
