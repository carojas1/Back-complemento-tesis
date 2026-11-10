// prettier-ignore
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Auth, GetUser, Role } from '../../../auth';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';
import { AddPictogramToCategoryUseCase } from '../../application/add-pictogram-to-category.use-case';
import { CreateCategoryUseCase } from '../../application/create-category.use-case';
import { ListCategoriesUseCase } from '../../application/list-categories.use-case';
import { ListCategoryPictogramsUseCase } from '../../application/list-category-pictograms.use-case';
import { RemovePictogramFromCategoryUseCase } from '../../application/remove-pictogram-from-category.use-case';
import { ReplaceCategoryPictogramsUseCase } from '../../application/replace-category-pictograms.use-case';
import { UpdateCategoryUseCase } from '../../application/update-category.use-case';
import { Category } from '../../domain/entities/category.entity';
import { AddCategoryPictogramDto, CreateCategoryDto, ReplaceCategoryPictogramsDto, UpdateCategoryDto } from './categories.dto';

const toCategoryResponse = ({ id, name, color, sortOrder, active }: Category) => ({ id, name, color, sortOrder, active });
const uuid = new ParseUUIDPipe({ version: '4' });

// Vocabulary catalog categories (spec 105) and their pictograms in order. Edited by the therapists.
@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly listCategories: ListCategoriesUseCase,
    private readonly createCategory: CreateCategoryUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
    private readonly listCategoryPictograms: ListCategoryPictogramsUseCase,
    private readonly replaceCategoryPictograms: ReplaceCategoryPictogramsUseCase,
    private readonly addPictogramToCategory: AddPictogramToCategoryUseCase,
    private readonly removePictogramFromCategory: RemovePictogramFromCategoryUseCase,
  ) {}

  @Auth(Role.THERAPIST)
  @Get()
  @ApiOperation({ summary: 'Catalog categories (paginated), with how many pictograms each has' })
  list(@Query() { page, limit }: PaginationQuery) {
    return this.listCategories.execute({ page, limit });
  }

  @Auth(Role.THERAPIST)
  @Post()
  @ApiOperation({ summary: 'Creates a catalog category' })
  async create(@Body() dto: CreateCategoryDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return toCategoryResponse(await this.createCategory.execute({ ...dto, actorId, ip: req.ip }));
  }

  @Auth(Role.THERAPIST)
  @Patch(':id')
  @ApiOperation({ summary: 'Name, color, order or active flag (deactivate = not deleted)' })
  async update(@Param('id', uuid) id: string, @Body() dto: UpdateCategoryDto, @GetUser('id') actorId: string, @Req() req: Request) {
    return toCategoryResponse(await this.updateCategory.execute({ ...dto, id, actorId, ip: req.ip }));
  }

  @Auth(Role.THERAPIST)
  @Get(':id/pictograms')
  @ApiOperation({ summary: 'Pictograms of the category in order (paginated, signed URLs 1 h)' })
  pictograms(@Param('id', uuid) id: string, @Query() { page, limit }: PaginationQuery) {
    return this.listCategoryPictograms.execute(id, { page, limit });
  }

  @Auth(Role.THERAPIST)
  @Post(':id/pictograms')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Appends a pictogram to the end of the category (if already there, no change)' })
  async addPictogram(
    @Param('id', uuid) id: string,
    @Body() dto: AddCategoryPictogramDto,
    @GetUser('id') actorId: string,
    @Req() req: Request,
  ) {
    await this.addPictogramToCategory.execute({ categoryId: id, pictogramId: dto.pictogramId, actorId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Delete(':id/pictograms/:pictogramId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Removes the pictogram from the category (the pictogram is not deleted)' })
  async removePictogram(
    @Param('id', uuid) id: string,
    @Param('pictogramId', uuid) pictogramId: string,
    @GetUser('id') actorId: string,
    @Req() req: Request,
  ) {
    await this.removePictogramFromCategory.execute({ categoryId: id, pictogramId, actorId, ip: req.ip });
  }

  @Auth(Role.THERAPIST)
  @Put(':id/pictograms')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorders: replaces the category pictograms; the array order is the order' })
  async setPictograms(
    @Param('id', uuid) id: string,
    @Body() dto: ReplaceCategoryPictogramsDto,
    @GetUser('id') actorId: string,
    @Req() req: Request,
  ) {
    await this.replaceCategoryPictograms.execute({ id, pictogramIds: dto.pictogramIds, actorId, ip: req.ip });
  }
}
