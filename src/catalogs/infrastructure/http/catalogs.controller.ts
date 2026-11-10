// prettier-ignore
import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../../auth';
import { Auth, GetUser, Role } from '../../../auth';
import { CreateCatalogItemUseCase } from '../../application/create-catalog-item.use-case';
import { DeleteCatalogItemUseCase } from '../../application/delete-catalog-item.use-case';
import { ListCatalogUseCase } from '../../application/list-catalog.use-case';
import { UpdateCatalogItemUseCase } from '../../application/update-catalog-item.use-case';
import { catalogKinds } from '../../domain/entities/catalog-item.entity';
import type { CatalogKind } from '../../domain/entities/catalog-item.entity';
import { CreateCatalogItemDto, ListCatalogQuery, UpdateCatalogItemDto } from './catalogs.dto';

const kind = new ParseEnumPipe(Object.fromEntries(catalogKinds.map((k) => [k, k])));
const uuid = new ParseUUIDPipe({ version: '4' });

// Patient catalogs (spec 104 FR-002). Both roles read; avatars are edited only by the admin (validated by the use case).
@ApiTags('catalogs')
@Controller('catalogs')
export class CatalogsController {
  constructor(
    private readonly listCatalog: ListCatalogUseCase,
    private readonly createItem: CreateCatalogItemUseCase,
    private readonly updateItem: UpdateCatalogItemUseCase,
    private readonly deleteItem: DeleteCatalogItemUseCase,
  ) {}

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Get(':kind')
  @ApiOperation({ summary: 'Avatars (with signed URL), diagnoses or conditions, paginated' })
  list(@Param('kind', kind) kindName: CatalogKind, @Query() { page, limit, active }: ListCatalogQuery) {
    return this.listCatalog.execute(kindName, { page, limit }, !!active);
  }

  @Auth(Role.ADMIN)
  @Post('avatars')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: 200_000 } })) // 200 KB
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { name: { type: 'string' }, image: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Agrega un avatar (SVG, PNG o JPEG, hasta 200 KB)' })
  createAvatar(
    @Body() dto: CreateCatalogItemDto,
    @UploadedFile() image: { buffer: Buffer } | undefined,
    @GetUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.createItem.execute({
      kind: 'avatars',
      name: dto.name,
      image: image?.buffer,
      actorId: user.id,
      actorRole: user.role,
      ip: req.ip,
    });
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Post(':kind')
  @ApiOperation({ summary: 'Adds a diagnosis or a condition' })
  create(
    @Param('kind', kind) kindName: CatalogKind,
    @Body() dto: CreateCatalogItemDto,
    @GetUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.createItem.execute({ kind: kindName, name: dto.name, actorId: user.id, actorRole: user.role, ip: req.ip });
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Patch(':kind/:id')
  @ApiOperation({ summary: 'Cambia nombre o activo' })
  update(
    @Param('kind', kind) kindName: CatalogKind,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateCatalogItemDto,
    @GetUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.updateItem.execute({ ...dto, kind: kindName, id, actorId: user.id, actorRole: user.role, ip: req.ip });
  }

  @Auth(Role.ADMIN, Role.THERAPIST)
  @Delete(':kind/:id')
  @ApiOperation({ summary: 'Deletes; if any patient uses it, deactivates it' })
  remove(
    @Param('kind', kind) kindName: CatalogKind,
    @Param('id', uuid) id: string,
    @GetUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.deleteItem.execute({ kind: kindName, id, actorId: user.id, actorRole: user.role, ip: req.ip });
  }
}
